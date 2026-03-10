export type SupportedAssetType = "stock" | "etf" | "crypto" | "fund" | "commodity";

export async function fetchMarketPrice(assetType: string, symbol: string): Promise<number | null> {
  const cleanSymbol = symbol.trim().toUpperCase();
  if (!cleanSymbol) {
    return null;
  }

  if (!["stock", "etf", "crypto", "fund", "commodity"].includes(assetType)) {
    return null;
  }

  const providerSymbol = assetType === "crypto" && !cleanSymbol.endsWith("-USD") ? `${cleanSymbol}-USD` : cleanSymbol;
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
