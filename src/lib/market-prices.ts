import type { AssetCurrency } from "@/lib/currency-rates";

export type SupportedAssetType = "stock" | "etf" | "crypto" | "fund" | "commodity";
export type AssetMarket = "AUTO" | "US" | "ES" | "DE" | "FR" | "NL" | "IT" | "UK" | "DK" | "CH" | "SE" | "FI" | "NO";
export type PriceProvider = "yahoo" | "coingecko" | "stooq" | "alphavantage" | "twelvedata";
export type MarketQuote = {
  price: number;
  provider: PriceProvider;
  resolvedSymbol: string;
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

const STOOQ_SUFFIX: Partial<Record<AssetMarket, string>> = {
  US: ".us",
  ES: ".es",
  DE: ".de",
  FR: ".fr",
  NL: ".nl",
  IT: ".it",
  UK: ".uk",
  DK: ".dk",
  CH: ".ch",
  SE: ".se",
  FI: ".fi",
  NO: ".no"
};

const AUTO_SUFFIXES = [".MC", ".DE", ".PA", ".AS", ".MI", ".L", ".CO", ".SW", ".ST", ".HE", ".OL"];

async function fetchYahooQuote(providerSymbol: string): Promise<MarketQuote | null> {
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(providerSymbol)}?range=1d&interval=1d`,
    {
      method: "GET",
      headers: {
        "User-Agent": "personal-finance-app/1.0"
      },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    chart?: {
      result?: Array<{
        meta?: {
          regularMarketPrice?: number;
          previousClose?: number;
        };
      }>;
    };
  };

  const meta = data.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice ?? meta?.previousClose;
  return typeof price === "number" && Number.isFinite(price) ? { price, provider: "yahoo", resolvedSymbol: providerSymbol } : null;
}

async function fetchCoinGeckoQuote(symbol: string, currency: AssetCurrency): Promise<MarketQuote | null> {
  const searchResponse = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`, {
    cache: "no-store"
  });

  if (!searchResponse.ok) {
    return null;
  }

  const searchData = (await searchResponse.json()) as { coins?: Array<{ id: string; symbol: string }> };
  const match = (searchData.coins ?? []).find((coin) => coin.symbol.toUpperCase() === symbol.toUpperCase()) ?? searchData.coins?.[0];
  if (!match) {
    return null;
  }

  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(match.id)}&vs_currencies=${currency.toLowerCase()}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Record<string, Record<string, number>>;
  const price = data[match.id]?.[currency.toLowerCase()];
  return typeof price === "number" && Number.isFinite(price) ? { price, provider: "coingecko", resolvedSymbol: match.id } : null;
}

async function fetchStooqQuote(providerSymbol: string): Promise<MarketQuote | null> {
  const response = await fetch(`https://stooq.com/q/l/?s=${encodeURIComponent(providerSymbol.toLowerCase())}&f=sd2t2ohlcvn&e=json`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    symbols?: Array<{
      close?: string;
      last?: string;
    }>;
  };

  const row = data.symbols?.[0];
  const price = Number(row?.close ?? row?.last);
  return Number.isFinite(price) && price > 0 ? { price, provider: "stooq", resolvedSymbol: providerSymbol } : null;
}

async function fetchAlphaVantageQuote(providerSymbol: string): Promise<MarketQuote | null> {
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) {
    return null;
  }

  const response = await fetch(
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(providerSymbol)}&apikey=${encodeURIComponent(apiKey)}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { ["Global Quote"]?: Record<string, string> };
  const price = Number(data["Global Quote"]?.["05. price"]);
  return Number.isFinite(price) && price > 0 ? { price, provider: "alphavantage", resolvedSymbol: providerSymbol } : null;
}

async function fetchTwelveDataQuote(providerSymbol: string): Promise<MarketQuote | null> {
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) {
    return null;
  }

  const response = await fetch(
    `https://api.twelvedata.com/price?symbol=${encodeURIComponent(providerSymbol)}&apikey=${encodeURIComponent(apiKey)}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { price?: string };
  const price = Number(data.price);
  return Number.isFinite(price) && price > 0 ? { price, provider: "twelvedata", resolvedSymbol: providerSymbol } : null;
}

function getCandidateSymbols(assetType: string, symbol: string, market?: string | null) {
  const cleanSymbol = symbol.trim().toUpperCase().replace(/\s+/g, "");
  const cleanMarket = (market ?? "AUTO").toUpperCase() as AssetMarket;
  const candidates = new Set<string>();

  if (!cleanSymbol) {
    return [];
  }

  if (assetType === "crypto") {
    candidates.add(cleanSymbol.replace("/", "-"));

    if (!cleanSymbol.includes("-") && !cleanSymbol.includes("/")) {
      candidates.add(`${cleanSymbol}-USD`);
      candidates.add(`${cleanSymbol}-EUR`);
    }

    if (cleanSymbol.endsWith("USDT")) {
      candidates.add(`${cleanSymbol.slice(0, -4)}-USD`);
    }

    return Array.from(candidates);
  }

  candidates.add(cleanSymbol);

  if (!cleanSymbol.includes(".")) {
    if (cleanMarket !== "AUTO") {
      const suffix = MARKET_SUFFIX[cleanMarket];
      if (suffix) {
        candidates.add(`${cleanSymbol}${suffix}`);
      }
    }

    for (const suffix of AUTO_SUFFIXES) {
      candidates.add(`${cleanSymbol}${suffix}`);
    }
  }

  return Array.from(candidates);
}

function getStooqCandidates(symbol: string, market?: string | null) {
  const cleanSymbol = symbol.trim().toLowerCase().replace(/\s+/g, "");
  const cleanMarket = (market ?? "AUTO").toUpperCase() as AssetMarket;
  const candidates = new Set<string>();

  if (!cleanSymbol) {
    return [];
  }

  candidates.add(cleanSymbol);

  if (!cleanSymbol.includes(".")) {
    if (cleanMarket !== "AUTO" && STOOQ_SUFFIX[cleanMarket]) {
      candidates.add(`${cleanSymbol}${STOOQ_SUFFIX[cleanMarket]}`);
    }

    for (const suffix of Object.values(STOOQ_SUFFIX)) {
      if (suffix) {
        candidates.add(`${cleanSymbol}${suffix}`);
      }
    }
  }

  return Array.from(candidates);
}

export async function fetchMarketQuote(
  assetType: string,
  symbol: string,
  market?: string | null,
  assetCurrency: AssetCurrency = "EUR"
): Promise<MarketQuote | null> {
  if (!["stock", "etf", "crypto", "fund", "commodity"].includes(assetType)) {
    return null;
  }

  if (assetType === "crypto") {
    const cryptoQuote = await fetchCoinGeckoQuote(symbol, assetCurrency);
    if (cryptoQuote) {
      return cryptoQuote;
    }
  }

  const candidates = getCandidateSymbols(assetType, symbol, market);
  for (const candidate of candidates) {
    const yahoo = await fetchYahooQuote(candidate);
    if (yahoo) {
      return yahoo;
    }
  }

  for (const candidate of candidates) {
    const twelveData = await fetchTwelveDataQuote(candidate);
    if (twelveData) {
      return twelveData;
    }
  }

  for (const candidate of candidates) {
    const alphaVantage = await fetchAlphaVantageQuote(candidate);
    if (alphaVantage) {
      return alphaVantage;
    }
  }

  const stooqCandidates = getStooqCandidates(symbol, market);
  for (const candidate of stooqCandidates) {
    const stooq = await fetchStooqQuote(candidate);
    if (stooq) {
      return stooq;
    }
  }

  return null;
}

export async function fetchMarketPrice(
  assetType: string,
  symbol: string,
  market?: string | null,
  assetCurrency: AssetCurrency = "EUR"
): Promise<number | null> {
  const quote = await fetchMarketQuote(assetType, symbol, market, assetCurrency);
  return quote?.price ?? null;
}
