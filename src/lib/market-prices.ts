export type SupportedAssetType = "stock" | "etf" | "crypto" | "fund" | "commodity";
export type AssetMarket = "AUTO" | "US" | "ES" | "DE" | "FR" | "NL" | "IT" | "UK" | "DK" | "CH" | "SE" | "FI" | "NO";

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

const AUTO_SUFFIXES = [".MC", ".DE", ".PA", ".AS", ".MI", ".L", ".CO", ".SW", ".ST", ".HE", ".OL"];

async function fetchYahooPrice(providerSymbol: string): Promise<number | null> {
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
  return typeof price === "number" && Number.isFinite(price) ? price : null;
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

export async function fetchMarketPrice(assetType: string, symbol: string, market?: string | null): Promise<number | null> {
  if (!["stock", "etf", "crypto", "fund", "commodity"].includes(assetType)) {
    return null;
  }

  const candidates = getCandidateSymbols(assetType, symbol, market);
  for (const candidate of candidates) {
    const price = await fetchYahooPrice(candidate);
    if (price !== null) {
      return price;
    }
  }

  return null;
}
