import { NextResponse } from "next/server";
import { AssetMarket } from "@/lib/market-prices";

type AssetType = "stock" | "etf" | "crypto" | "fund" | "commodity";

type YahooSearchQuote = {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchDisp?: string;
  exchange?: string;
  currency?: string;
};

type AssetSuggestion = {
  symbol: string;
  name: string;
  assetType: AssetType;
  market: AssetMarket;
  currency: "EUR" | "USD" | "GBP" | "DKK" | null;
  exchange: string | null;
};

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

function mapQuoteType(value?: string): AssetType | null {
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

function inferMarket(symbol: string, exchange?: string): AssetMarket {
  const upperSymbol = symbol.toUpperCase();
  const upperExchange = (exchange ?? "").toUpperCase();

  for (const item of MARKET_BY_SUFFIX) {
    if (upperSymbol.endsWith(item.suffix)) {
      return item.market;
    }
  }

  if (upperExchange.includes("MADRID")) return "ES";
  if (upperExchange.includes("XETRA") || upperExchange.includes("GERMANY")) return "DE";
  if (upperExchange.includes("PARIS")) return "FR";
  if (upperExchange.includes("AMSTERDAM")) return "NL";
  if (upperExchange.includes("MILAN")) return "IT";
  if (upperExchange.includes("LONDON")) return "UK";
  if (upperExchange.includes("COPENHAGEN")) return "DK";
  if (upperExchange.includes("SWISS")) return "CH";
  if (upperExchange.includes("STOCKHOLM")) return "SE";
  if (upperExchange.includes("HELSINKI")) return "FI";
  if (upperExchange.includes("OSLO")) return "NO";
  if (upperExchange.includes("NASDAQ") || upperExchange.includes("NYSE")) return "US";

  return "AUTO";
}

function mapCurrency(value?: string): AssetSuggestion["currency"] {
  const upper = (value ?? "").toUpperCase();
  if (upper === "EUR" || upper === "USD" || upper === "GBP" || upper === "DKK") {
    return upper;
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
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
      return NextResponse.json({ suggestions: [] });
    }

    const data = (await response.json()) as { quotes?: YahooSearchQuote[] };
    const suggestions: AssetSuggestion[] = (data.quotes ?? [])
      .map((quote) => {
        const assetType = mapQuoteType(quote.quoteType);
        const symbol = quote.symbol?.trim().toUpperCase() ?? "";
        const name = quote.longname ?? quote.shortname ?? symbol;

        if (!assetType || !symbol || !name) {
          return null;
        }

        return {
          symbol,
          name,
          assetType,
          market: inferMarket(symbol, quote.exchDisp ?? quote.exchange),
          currency: mapCurrency(quote.currency),
          exchange: quote.exchDisp ?? quote.exchange ?? null
        };
      })
      .filter((item): item is AssetSuggestion => Boolean(item))
      .slice(0, 6);

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
