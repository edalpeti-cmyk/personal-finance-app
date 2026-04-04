import { NextRequest, NextResponse } from "next/server";

type AssetMarket = "AUTO" | "US" | "ES" | "DE" | "FR" | "NL" | "IT" | "UK" | "DK" | "CH" | "SE" | "FI" | "NO";
type AssetCurrency = "EUR" | "USD" | "GBP" | "DKK";
type SyncRequestAsset = {
  investmentId: string;
  assetName: string;
  assetSymbol: string | null;
  assetType: string;
  assetMarket: AssetMarket | null;
  assetCurrency: AssetCurrency;
  quantity: number;
};

type SyncedDividend = {
  investmentId: string;
  paymentDate: string;
  exDividendDate: string | null;
  recordDate: string | null;
  grossAmountLocal: number;
  netAmountLocal: number;
  grossAmountEur: number | null;
  netAmountEur: number | null;
  dividendPerShareLocal: number | null;
  sharesPaid: number;
  assetCurrency: AssetCurrency;
  fxRateToEur: number | null;
  source: string;
  notes: string | null;
};

const MARKET_SUFFIX: Partial<Record<AssetMarket, string>> = {
  ES: ".MC",
  DE: ".DE",
  FR: ".PA",
  NL: ".AS",
  IT: ".MI",
  UK: ".L",
  DK: ".CO",
  CH: ".SW",
  SE: ".ST",
  FI: ".HE",
  NO: ".OL"
};

function getDividendCandidates(symbol: string, market?: AssetMarket | null) {
  const clean = symbol.trim().toUpperCase().replace(/\s+/g, "");
  if (!clean) return [];
  if (clean.includes(".")) return [clean];

  const candidates: string[] = [];
  const push = (value: string | undefined) => {
    if (value && !candidates.includes(value)) {
      candidates.push(value);
    }
  };

  if (market && market !== "AUTO") {
    const suffix = MARKET_SUFFIX[market];
    push(suffix ? `${clean}${suffix}` : clean);
  }

  push(clean);
  return candidates;
}

async function fetchRatesToEur() {
  const response = await fetch("https://api.frankfurter.app/latest?from=EUR&to=USD,GBP,DKK", { cache: "no-store" });
  if (!response.ok) {
    return { EUR: 1, USD: 1 / 1.08, GBP: 1 / 0.86, DKK: 1 / 7.46 } as Record<AssetCurrency, number>;
  }

  const data = (await response.json()) as { rates?: Record<string, number> };
  const usd = data.rates?.USD ? 1 / Number(data.rates.USD) : 1 / 1.08;
  const gbp = data.rates?.GBP ? 1 / Number(data.rates.GBP) : 1 / 0.86;
  const dkk = data.rates?.DKK ? 1 / Number(data.rates.DKK) : 1 / 7.46;
  return { EUR: 1, USD: usd, GBP: gbp, DKK: dkk } as Record<AssetCurrency, number>;
}

async function fetchAlphaVantageDividends(symbol: string) {
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) {
    return null;
  }

  const response = await fetch(
    `https://www.alphavantage.co/query?function=DIVIDENDS&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    symbol?: string;
    name?: string;
    currency?: string;
    dividend_history?: Array<{
      ex_dividend_date?: string;
      payment_date?: string;
      record_date?: string;
      declaration_date?: string;
      dividend_amount?: string;
    }>;
    Note?: string;
    Information?: string;
    ErrorMessage?: string;
  };

  if (data.Note || data.Information || data.ErrorMessage) {
    return null;
  }

  return data;
}

async function fetchFinnhubDividends(symbol: string, from: string, to: string) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return null;
  }

  const response = await fetch(
    `https://finnhub.io/api/v1/stock/dividend?symbol=${encodeURIComponent(symbol)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&token=${encodeURIComponent(apiKey)}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Array<{
    date?: string;
    paymentDate?: string;
    recordDate?: string;
    amount?: number;
    dividend?: number;
    currency?: string;
  }> | { error?: string };

  if (!Array.isArray(data)) {
    return null;
  }

  return data;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { assets?: SyncRequestAsset[] };
    const assets = (body.assets ?? []).filter(
      (asset) =>
        asset.assetSymbol &&
        ["stock", "etf", "fund"].includes(asset.assetType) &&
        Number(asset.quantity || 0) > 0
    );

    if (assets.length === 0) {
      return NextResponse.json({ dividends: [] satisfies SyncedDividend[] });
    }

    const ratesToEur = await fetchRatesToEur();
    const today = new Date().toISOString().slice(0, 10);
    const oneYearAhead = new Date();
    oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);
    const futureLimit = oneYearAhead.toISOString().slice(0, 10);
    const dividends: SyncedDividend[] = [];

    for (const asset of assets) {
      const candidates = getDividendCandidates(asset.assetSymbol ?? "", asset.assetMarket);
      let resolved: Awaited<ReturnType<typeof fetchAlphaVantageDividends>> = null;
      let finnhubRows: Awaited<ReturnType<typeof fetchFinnhubDividends>> = null;
      let usedSource: "alphavantage" | "finnhub" | null = null;

      for (const candidate of candidates) {
        resolved = await fetchAlphaVantageDividends(candidate);
        if (resolved?.dividend_history?.length) {
          usedSource = "alphavantage";
          break;
        }
      }

      if (!resolved?.dividend_history?.length) {
        for (const candidate of candidates) {
          finnhubRows = await fetchFinnhubDividends(candidate, today, futureLimit);
          if (finnhubRows?.length) {
            usedSource = "finnhub";
            break;
          }
        }
      }

      if (usedSource === "alphavantage" && resolved?.dividend_history?.length) {
        const providerCurrency = (resolved.currency?.toUpperCase() || asset.assetCurrency) as AssetCurrency;
        const fxRateToEur = ratesToEur[providerCurrency] ?? 1;

        for (const row of resolved.dividend_history) {
          const paymentDate = row.payment_date?.slice(0, 10);
          if (!paymentDate || paymentDate < today) {
            continue;
          }

          const dividendPerShareLocal = Number(row.dividend_amount ?? 0);
          if (!Number.isFinite(dividendPerShareLocal) || dividendPerShareLocal <= 0) {
            continue;
          }

          const sharesPaid = Number(asset.quantity || 0);
          const grossAmountLocal = dividendPerShareLocal * sharesPaid;
          const grossAmountEur = grossAmountLocal * fxRateToEur;

          dividends.push({
            investmentId: asset.investmentId,
            paymentDate,
            exDividendDate: row.ex_dividend_date?.slice(0, 10) ?? null,
            recordDate: row.record_date?.slice(0, 10) ?? null,
            grossAmountLocal: Number(grossAmountLocal.toFixed(4)),
            netAmountLocal: Number(grossAmountLocal.toFixed(4)),
            grossAmountEur: Number(grossAmountEur.toFixed(4)),
            netAmountEur: Number(grossAmountEur.toFixed(4)),
            dividendPerShareLocal: Number(dividendPerShareLocal.toFixed(6)),
            sharesPaid,
            assetCurrency: providerCurrency,
            fxRateToEur: Number(fxRateToEur.toFixed(8)),
            source: "alphavantage",
            notes: resolved.symbol ? `Sincronizado automaticamente desde ${resolved.symbol}.` : "Sincronizado automaticamente."
          });
        }
        continue;
      }

      if (usedSource === "finnhub" && finnhubRows?.length) {
        const providerCurrency = asset.assetCurrency;
        const fxRateToEur = ratesToEur[providerCurrency] ?? 1;

        for (const row of finnhubRows) {
          const paymentDate = (row.paymentDate ?? row.date)?.slice(0, 10);
          if (!paymentDate || paymentDate < today) {
            continue;
          }

          const dividendPerShareLocal = Number(row.amount ?? row.dividend ?? 0);
          if (!Number.isFinite(dividendPerShareLocal) || dividendPerShareLocal <= 0) {
            continue;
          }

          const sharesPaid = Number(asset.quantity || 0);
          const grossAmountLocal = dividendPerShareLocal * sharesPaid;
          const grossAmountEur = grossAmountLocal * fxRateToEur;

          dividends.push({
            investmentId: asset.investmentId,
            paymentDate,
            exDividendDate: row.date?.slice(0, 10) ?? null,
            recordDate: row.recordDate?.slice(0, 10) ?? null,
            grossAmountLocal: Number(grossAmountLocal.toFixed(4)),
            netAmountLocal: Number(grossAmountLocal.toFixed(4)),
            grossAmountEur: Number(grossAmountEur.toFixed(4)),
            netAmountEur: Number(grossAmountEur.toFixed(4)),
            dividendPerShareLocal: Number(dividendPerShareLocal.toFixed(6)),
            sharesPaid,
            assetCurrency: providerCurrency,
            fxRateToEur: Number(fxRateToEur.toFixed(8)),
            source: "finnhub",
            notes: "Sincronizado automaticamente con fallback de Finnhub."
          });
        }
      }
    }

    const uniqueDividends = dividends.filter(
      (row, index, array) =>
        array.findIndex(
          (candidate) =>
            candidate.investmentId === row.investmentId &&
            candidate.paymentDate === row.paymentDate &&
            candidate.dividendPerShareLocal === row.dividendPerShareLocal
        ) === index
    );

    return NextResponse.json({ dividends: uniqueDividends });
  } catch {
    return NextResponse.json({ error: "No se pudieron sincronizar los proximos dividendos." }, { status: 500 });
  }
}
