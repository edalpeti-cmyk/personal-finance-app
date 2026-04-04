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

type SyncDiagnostic = {
  investmentId: string;
  assetName: string;
  attemptedSymbols: string[];
  source: string | null;
  status: "synced" | "no_data" | "unsupported" | "missing_symbol";
  reason: string;
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

function extractRawNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === "object" && "raw" in value) {
    const raw = (value as { raw?: unknown }).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw;
    }
  }

  return null;
}

function unixToDate(value: unknown) {
  const raw = extractRawNumber(value);
  if (!raw) {
    return null;
  }

  const date = new Date(raw * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

async function fetchYahooDividendCalendar(symbol: string) {
  const response = await fetch(
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents,summaryDetail,price`,
    {
      cache: "no-store",
      headers: {
        "User-Agent": "personal-finance-app/1.0"
      }
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    quoteSummary?: {
      result?: Array<{
        calendarEvents?: {
          dividendDate?: { raw?: number } | number;
          exDividendDate?: { raw?: number } | number;
        };
        summaryDetail?: {
          exDividendDate?: { raw?: number } | number;
          lastDividendValue?: { raw?: number } | number;
          dividendRate?: { raw?: number } | number;
        };
        price?: {
          currency?: string;
          symbol?: string;
        };
      }>;
      error?: unknown;
    };
  };

  const result = data.quoteSummary?.result?.[0];
  if (!result) {
    return null;
  }

  const paymentDate = unixToDate(result.calendarEvents?.dividendDate);
  const exDividendDate = unixToDate(result.calendarEvents?.exDividendDate) ?? unixToDate(result.summaryDetail?.exDividendDate);
  const lastDividendValue = extractRawNumber(result.summaryDetail?.lastDividendValue);
  const dividendRate = extractRawNumber(result.summaryDetail?.dividendRate);

  return {
    paymentDate,
    exDividendDate,
    dividendPerShareLocal: lastDividendValue ?? dividendRate ?? null,
    assetCurrency: (result.price?.currency?.toUpperCase() || null) as AssetCurrency | null,
    resolvedSymbol: result.price?.symbol?.toUpperCase() ?? symbol
  };
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
    const assets = body.assets ?? [];
    const supportedAssets = assets.filter(
      (asset) =>
        asset.assetSymbol &&
        ["stock", "etf", "fund"].includes(asset.assetType) &&
        Number(asset.quantity || 0) > 0
    );

    if (supportedAssets.length === 0) {
      const diagnostics: SyncDiagnostic[] = assets.map((asset) => ({
        investmentId: asset.investmentId,
        assetName: asset.assetName,
        attemptedSymbols: asset.assetSymbol ? getDividendCandidates(asset.assetSymbol, asset.assetMarket) : [],
        source: null,
        status: asset.assetSymbol ? "unsupported" : "missing_symbol",
        reason: asset.assetSymbol
          ? "La posicion no es compatible con sincronizacion automatica de dividendos."
          : "La posicion no tiene ticker configurado."
      }));

      return NextResponse.json({ dividends: [] satisfies SyncedDividend[], diagnostics });
    }

    const ratesToEur = await fetchRatesToEur();
    const today = new Date().toISOString().slice(0, 10);
    const oneYearAhead = new Date();
    oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);
    const futureLimit = oneYearAhead.toISOString().slice(0, 10);
    const dividends: SyncedDividend[] = [];
    const diagnostics: SyncDiagnostic[] = [];

    for (const asset of supportedAssets) {
      const candidates = getDividendCandidates(asset.assetSymbol ?? "", asset.assetMarket);
      const providerAttempts: string[] = [];
      let usedSource: "yahoo" | "alphavantage" | "finnhub" | null = null;
      let yahooResult: Awaited<ReturnType<typeof fetchYahooDividendCalendar>> = null;
      let resolved: Awaited<ReturnType<typeof fetchAlphaVantageDividends>> = null;
      let finnhubRows: Awaited<ReturnType<typeof fetchFinnhubDividends>> = null;

      for (const candidate of candidates) {
        yahooResult = await fetchYahooDividendCalendar(candidate);
        if (yahooResult?.paymentDate && yahooResult.paymentDate >= today) {
          usedSource = "yahoo";
          providerAttempts.push(`Yahoo: ${candidate}`);
          break;
        }
      }

      if (!usedSource) {
        providerAttempts.push("Yahoo sin calendario futuro");
      }

      if (!usedSource) {
        for (const candidate of candidates) {
          resolved = await fetchAlphaVantageDividends(candidate);
          if (resolved?.dividend_history?.length) {
            usedSource = "alphavantage";
            providerAttempts.push(`Alpha Vantage: ${candidate}`);
            break;
          }
        }
      }

      if (!usedSource) {
        providerAttempts.push("Alpha Vantage sin eventos");
        for (const candidate of candidates) {
          finnhubRows = await fetchFinnhubDividends(candidate, today, futureLimit);
          if (finnhubRows?.length) {
            usedSource = "finnhub";
            providerAttempts.push(`Finnhub: ${candidate}`);
            break;
          }
        }
      }

      if (!usedSource) {
        providerAttempts.push("Finnhub sin eventos");
      }

      if (usedSource === "yahoo" && yahooResult?.paymentDate && yahooResult.paymentDate >= today) {
        const providerCurrency = yahooResult.assetCurrency ?? asset.assetCurrency;
        const fxRateToEur = ratesToEur[providerCurrency] ?? 1;
        const sharesPaid = Number(asset.quantity || 0);
        const dividendPerShareLocal = yahooResult.dividendPerShareLocal;
        const grossAmountLocal = dividendPerShareLocal !== null ? dividendPerShareLocal * sharesPaid : 0;
        const grossAmountEur = grossAmountLocal * fxRateToEur;

        dividends.push({
          investmentId: asset.investmentId,
          paymentDate: yahooResult.paymentDate,
          exDividendDate: yahooResult.exDividendDate,
          recordDate: null,
          grossAmountLocal: Number(grossAmountLocal.toFixed(4)),
          netAmountLocal: Number(grossAmountLocal.toFixed(4)),
          grossAmountEur: Number(grossAmountEur.toFixed(4)),
          netAmountEur: Number(grossAmountEur.toFixed(4)),
          dividendPerShareLocal: dividendPerShareLocal !== null ? Number(dividendPerShareLocal.toFixed(6)) : null,
          sharesPaid,
          assetCurrency: providerCurrency,
          fxRateToEur: Number(fxRateToEur.toFixed(8)),
          source: "yahoo",
          notes:
            dividendPerShareLocal !== null
              ? `Sincronizado automaticamente desde ${yahooResult.resolvedSymbol}.`
              : `Yahoo devolvio calendario para ${yahooResult.resolvedSymbol}, pero no importe por accion.`
        });

        diagnostics.push({
          investmentId: asset.investmentId,
          assetName: asset.assetName,
          attemptedSymbols: candidates,
          source: "yahoo",
          status: "synced",
          reason:
            dividendPerShareLocal !== null
              ? `Calendario encontrado con Yahoo para ${yahooResult.resolvedSymbol}.`
              : `Calendario encontrado con Yahoo para ${yahooResult.resolvedSymbol}, sin importe por accion.`
        });
        continue;
      }

      if (usedSource === "alphavantage" && resolved?.dividend_history?.length) {
        const providerCurrency = (resolved.currency?.toUpperCase() || asset.assetCurrency) as AssetCurrency;
        const fxRateToEur = ratesToEur[providerCurrency] ?? 1;
        let insertedRows = 0;

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
          insertedRows += 1;
        }

        diagnostics.push({
          investmentId: asset.investmentId,
          assetName: asset.assetName,
          attemptedSymbols: candidates,
          source: "alphavantage",
          status: insertedRows > 0 ? "synced" : "no_data",
          reason: insertedRows > 0 ? "Eventos futuros encontrados con Alpha Vantage." : "Alpha Vantage no devolvio pagos futuros utilizables."
        });
        continue;
      }

      if (usedSource === "finnhub" && finnhubRows?.length) {
        const providerCurrency = asset.assetCurrency;
        const fxRateToEur = ratesToEur[providerCurrency] ?? 1;
        let insertedRows = 0;

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
          insertedRows += 1;
        }

        diagnostics.push({
          investmentId: asset.investmentId,
          assetName: asset.assetName,
          attemptedSymbols: candidates,
          source: "finnhub",
          status: insertedRows > 0 ? "synced" : "no_data",
          reason: insertedRows > 0 ? "Eventos futuros encontrados con Finnhub." : "Finnhub no devolvio pagos futuros utilizables."
        });
        continue;
      }

      diagnostics.push({
        investmentId: asset.investmentId,
        assetName: asset.assetName,
        attemptedSymbols: candidates,
        source: null,
        status: "no_data",
        reason: providerAttempts.join(" · ") || "Ningun proveedor devolvio un calendario futuro para este activo."
      });
    }

    for (const asset of assets.filter((asset) => !supportedAssets.some((candidate) => candidate.investmentId === asset.investmentId))) {
      diagnostics.push({
        investmentId: asset.investmentId,
        assetName: asset.assetName,
        attemptedSymbols: asset.assetSymbol ? getDividendCandidates(asset.assetSymbol, asset.assetMarket) : [],
        source: null,
        status: asset.assetSymbol ? "unsupported" : "missing_symbol",
        reason: asset.assetSymbol
          ? "El tipo de activo no tiene sincronizacion automatica de dividendos en esta version."
          : "Falta ticker para consultar proveedores externos."
      });
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

    return NextResponse.json({ dividends: uniqueDividends, diagnostics });
  } catch {
    return NextResponse.json({ error: "No se pudieron sincronizar los proximos dividendos." }, { status: 500 });
  }
}
