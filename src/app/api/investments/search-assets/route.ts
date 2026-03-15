import { NextResponse } from "next/server";
import { AssetMarket } from "@/lib/market-prices";

type AssetType = "stock" | "etf" | "crypto" | "fund" | "commodity";
type SupportedCurrency = "EUR" | "USD" | "GBP" | "DKK";

type AssetSuggestion = {
  symbol: string;
  name: string;
  isin: string | null;
  assetType: AssetType;
  market: AssetMarket;
  currency: SupportedCurrency | null;
  exchange: string | null;
};

type YahooSearchQuote = {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchDisp?: string;
  exchange?: string;
  currency?: string;
};

type OpenFigiMappingResult = {
  ticker?: string;
  name?: string;
  exchCode?: string;
  exchange?: string;
  marketSector?: string;
  securityType?: string;
  securityType2?: string;
  currency?: string;
};

type OpenFigiSearchResult = {
  ticker?: string;
  name?: string;
  exchCode?: string;
  exchangeName?: string;
  marketSector?: string;
  securityType?: string;
  securityType2?: string;
  currency?: string;
};

const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const OPENFIGI_API_KEY = process.env.OPENFIGI_API_KEY;

const MARKET_BY_SUFFIX: Array<{ suffix: string; market: AssetMarket }> = [
  { suffix: ".MC", market: "ES" },
  { suffix: ".DE", market: "DE" },
  { suffix: ".PA", market: "FR" },
  { suffix: ".AS", market: "NL" },
  { suffix: ".MI", market: "IT" },
  { suffix: ".L", market: "UK" },
  { suffix: ".CO", market: "DK" },
  { suffix: ".SW", market: "CH" },
  { suffix: ".ST", market: "SE" },
  { suffix: ".HE", market: "FI" },
  { suffix: ".OL", market: "NO" }
];

function mapCurrency(value?: string): SupportedCurrency | null {
  const upper = (value ?? "").toUpperCase();
  if (upper === "EUR" || upper === "USD" || upper === "GBP" || upper === "DKK") {
    return upper;
  }
  return null;
}

function inferMarket(symbol: string, exchange?: string): AssetMarket {
  const upperSymbol = symbol.toUpperCase();
  const upperExchange = (exchange ?? "").toUpperCase();

  for (const item of MARKET_BY_SUFFIX) {
    if (upperSymbol.endsWith(item.suffix)) {
      return item.market;
    }
  }

  if (upperExchange.includes("MADRID")) return "ES";
  if (upperExchange.includes("XETRA") || upperExchange.includes("GERMANY") || upperExchange.includes("XETR")) return "DE";
  if (upperExchange.includes("PARIS")) return "FR";
  if (upperExchange.includes("AMSTERDAM")) return "NL";
  if (upperExchange.includes("MILAN")) return "IT";
  if (upperExchange.includes("LONDON")) return "UK";
  if (upperExchange.includes("COPENHAGEN")) return "DK";
  if (upperExchange.includes("SWISS") || upperExchange.includes("SIX")) return "CH";
  if (upperExchange.includes("STOCKHOLM")) return "SE";
  if (upperExchange.includes("HELSINKI")) return "FI";
  if (upperExchange.includes("OSLO")) return "NO";
  if (upperExchange.includes("NASDAQ") || upperExchange.includes("NYSE") || upperExchange.includes("ARCA")) return "US";

  return "AUTO";
}

function mapYahooQuoteType(value?: string): AssetType | null {
  switch ((value ?? "").toUpperCase()) {
    case "EQUITY":
      return "stock";
    case "ETF":
      return "etf";
    case "MUTUALFUND":
      return "fund";
    case "CRYPTOCURRENCY":
      return "crypto";
    case "FUTURE":
      return "commodity";
    default:
      return null;
  }
}

function mapOpenFigiType(securityType?: string, securityType2?: string, marketSector?: string): AssetType | null {
  const joined = `${securityType ?? ""} ${securityType2 ?? ""} ${marketSector ?? ""}`.toUpperCase();

  if (joined.includes("ETF")) return "etf";
  if (joined.includes("MUTUAL FUND") || joined.includes("FUND")) return "fund";
  if (joined.includes("CRYPTO")) return "crypto";
  if (joined.includes("COMDTY") || joined.includes("COMMODITY")) return "commodity";
  if (joined.includes("EQUITY")) return "stock";

  return null;
}

function dedupeSuggestions(suggestions: AssetSuggestion[]) {
  const map = new Map<string, AssetSuggestion>();

  for (const item of suggestions) {
    const key = `${item.symbol}|${item.market}|${item.exchange ?? ""}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}

async function searchYahoo(query: string): Promise<AssetSuggestion[]> {
  const response = await fetch(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0&enableFuzzyQuery=false`,
    {
      cache: "no-store",
      headers: {
        "User-Agent": "personal-finance-app/1.0"
      }
    }
  );

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as { quotes?: YahooSearchQuote[] };
  const suggestions: AssetSuggestion[] = [];

  for (const quote of data.quotes ?? []) {
      const assetType = mapYahooQuoteType(quote.quoteType);
      const symbol = quote.symbol?.trim().toUpperCase() ?? "";
      const name = quote.longname ?? quote.shortname ?? symbol;

      if (!assetType || !symbol || !name) {
        continue;
      }

      suggestions.push({
        symbol,
        name,
        isin: null,
        assetType,
        market: inferMarket(symbol, quote.exchDisp ?? quote.exchange),
        currency: mapCurrency(quote.currency),
        exchange: quote.exchDisp ?? quote.exchange ?? null
      });
  }

  return suggestions;
}

async function searchOpenFigiByIsin(isin: string): Promise<AssetSuggestion[]> {
  const response = await fetch("https://api.openfigi.com/v3/mapping", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(OPENFIGI_API_KEY ? { "X-OPENFIGI-APIKEY": OPENFIGI_API_KEY } : {})
    },
    body: JSON.stringify([{ idType: "ID_ISIN", idValue: isin }])
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as Array<{ data?: OpenFigiMappingResult[] }>;
  const suggestions: AssetSuggestion[] = [];

  for (const item of data[0]?.data ?? []) {
      const symbol = item.ticker?.trim().toUpperCase() ?? "";
      const name = item.name?.trim() ?? symbol;
      const assetType = mapOpenFigiType(item.securityType, item.securityType2, item.marketSector);

      if (!symbol || !name || !assetType) {
        continue;
      }

      suggestions.push({
        symbol,
        name,
        isin,
        assetType,
        market: inferMarket(symbol, item.exchange ?? item.exchCode),
        currency: mapCurrency(item.currency),
        exchange: item.exchange ?? item.exchCode ?? null
      });
  }

  return suggestions;
}

async function searchOpenFigiFallback(query: string): Promise<AssetSuggestion[]> {
  const response = await fetch("https://api.openfigi.com/v3/search", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(OPENFIGI_API_KEY ? { "X-OPENFIGI-APIKEY": OPENFIGI_API_KEY } : {})
    },
    body: JSON.stringify({
      query,
      maxResults: 6
    })
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as OpenFigiSearchResult[];
  const suggestions: AssetSuggestion[] = [];

  for (const item of data) {
      const symbol = item.ticker?.trim().toUpperCase() ?? "";
      const name = item.name?.trim() ?? symbol;
      const assetType = mapOpenFigiType(item.securityType, item.securityType2, item.marketSector);

      if (!symbol || !name || !assetType) {
        continue;
      }

      suggestions.push({
        symbol,
        name,
        isin: null,
        assetType,
        market: inferMarket(symbol, item.exchangeName ?? item.exchCode),
        currency: mapCurrency(item.currency),
        exchange: item.exchangeName ?? item.exchCode ?? null
      });
  }

  return suggestions;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim().toUpperCase() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const isIsin = ISIN_REGEX.test(query);
    const [yahooSuggestions, openFigiSuggestions] = await Promise.all([
      searchYahoo(query).catch(() => []),
      (isIsin ? searchOpenFigiByIsin(query) : searchOpenFigiFallback(query)).catch(() => [])
    ]);

    const suggestions = dedupeSuggestions([...openFigiSuggestions, ...yahooSuggestions]).slice(0, 8);
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
