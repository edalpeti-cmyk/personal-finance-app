import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMarketPrice } from "@/lib/market-prices";

type InvestmentPriceRow = {
  id: string;
  user_id: string;
  asset_symbol: string | null;
  asset_type: string;
};

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("investments")
      .select("id, user_id, asset_symbol, asset_type")
      .not("asset_symbol", "is", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data as InvestmentPriceRow[]) ?? [];
    const updated: Array<{ id: string; userId: string; price: number }> = [];
    const skipped: Array<{ id: string; userId: string; reason: string }> = [];

    for (const row of rows) {
      if (!row.asset_symbol) {
        skipped.push({ id: row.id, userId: row.user_id, reason: "missing_symbol" });
        continue;
      }

      try {
        const price = await fetchMarketPrice(row.asset_type, row.asset_symbol);
        if (price === null) {
          skipped.push({ id: row.id, userId: row.user_id, reason: "price_not_available" });
          continue;
        }

        const { error: updateError } = await supabase
          .from("investments")
          .update({ current_price: Number(price.toFixed(4)) })
          .eq("id", row.id);

        if (updateError) {
          skipped.push({ id: row.id, userId: row.user_id, reason: updateError.message });
          continue;
        }

        updated.push({ id: row.id, userId: row.user_id, price: Number(price.toFixed(4)) });
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
