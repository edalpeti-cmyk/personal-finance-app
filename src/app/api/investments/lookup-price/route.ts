import { NextResponse } from "next/server";
import { fetchMarketPrice } from "@/lib/market-prices";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    assetType?: string;
    symbol?: string;
    market?: string | null;
    assetCurrency?: "EUR" | "USD" | "GBP" | "DKK";
  };

  if (!body.assetType || !body.symbol) {
    return NextResponse.json({ price: null }, { status: 400 });
  }

  try {
    const price = await fetchMarketPrice(body.assetType, body.symbol, body.market, body.assetCurrency ?? "EUR");
    return NextResponse.json({ price: price === null ? null : Number(price.toFixed(4)) });
  } catch {
    return NextResponse.json({ price: null });
  }
}
