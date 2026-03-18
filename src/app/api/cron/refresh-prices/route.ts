import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMarketQuote } from "@/lib/market-prices";
import { convertToEur, fetchRatesToEur } from "@/lib/currency-rates";

type InvestmentPriceRow = {
  id: string;
  user_id: string;
  asset_symbol: string | null;
  asset_type: string;
  asset_market: string | null;
  asset_currency: string | null;
  quantity: number;
};

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const ratesToEur = await fetchRatesToEur();
    const { data, error } = await supabase
      .from("investments")
      .select("id, user_id, asset_symbol, asset_type, asset_market, asset_currency, quantity")
      .not("asset_symbol", "is", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data as InvestmentPriceRow[]) ?? [];
    const updated: Array<{ id: string; userId: string; price: number; provider: string; resolvedSymbol: string }> = [];
    const skipped: Array<{ id: string; userId: string; reason: string }> = [];

    for (const row of rows) {
      if (!row.asset_symbol) {
        skipped.push({ id: row.id, userId: row.user_id, reason: "missing_symbol" });
        continue;
      }

      try {
        const quote = await fetchMarketQuote(row.asset_type, row.asset_symbol, row.asset_market, (row.asset_currency as "EUR" | "USD" | "GBP" | "DKK" | null) ?? "EUR");
        if (quote === null) {
          skipped.push({ id: row.id, userId: row.user_id, reason: "price_not_available" });
          continue;
        }

        const roundedPrice = Number(quote.price.toFixed(4));
        const { error: updateError } = await supabase
          .from("investments")
          .update({ current_price: roundedPrice })
          .eq("id", row.id);

        if (updateError) {
          skipped.push({ id: row.id, userId: row.user_id, reason: updateError.message });
          continue;
        }

        const quantity = Number(row.quantity) || 0;
        const priceEur = convertToEur(roundedPrice, row.asset_currency, ratesToEur);
        const historyInsert = await supabase.from("investment_price_history").insert({
          investment_id: row.id,
          user_id: row.user_id,
          asset_symbol: row.asset_symbol,
          asset_currency: row.asset_currency ?? "EUR",
          price_local: roundedPrice,
          price_eur: Number(priceEur.toFixed(4)),
          total_value_local: Number((roundedPrice * quantity).toFixed(4)),
          total_value_eur: Number((priceEur * quantity).toFixed(4))
        });

        if (historyInsert.error) {
          skipped.push({ id: row.id, userId: row.user_id, reason: historyInsert.error.message });
          continue;
        }

        updated.push({ id: row.id, userId: row.user_id, price: roundedPrice, provider: quote.provider, resolvedSymbol: quote.resolvedSymbol });
      } catch (fetchError) {
        skipped.push({
          id: row.id,
          userId: row.user_id,
          reason: fetchError instanceof Error ? fetchError.message : "fetch_failed"
        });
      }
    }

    return NextResponse.json({ updatedCount: updated.length, skippedCount: skipped.length, updated, skipped });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
