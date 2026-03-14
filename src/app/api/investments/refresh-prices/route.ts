import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMarketPrice } from "@/lib/market-prices";
import { convertToEur, fetchRatesToEur } from "@/lib/currency-rates";

type InvestmentPriceRow = {
  id: string;
  asset_name: string;
  asset_symbol: string | null;
  asset_type: string;
  asset_market: string | null;
  asset_currency: string | null;
  quantity: number;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const { data: authData, error: authError } = await supabase.auth.getUser(bearerToken);

  if (authError || !authData.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { investmentId?: string };
  const db = createAdminClient();
  const ratesToEur = await fetchRatesToEur();

  let query = db
    .from("investments")
    .select("id, asset_name, asset_symbol, asset_type, asset_market, asset_currency, quantity")
    .eq("user_id", authData.user.id);

  if (body.investmentId) {
    query = query.eq("id", body.investmentId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data as InvestmentPriceRow[]) ?? [];
  const updated: Array<{ id: string; price: number; symbol: string | null }> = [];
  const skipped: Array<{ id: string; symbol: string | null; reason: string }> = [];

  for (const row of rows) {
    if (!row.asset_symbol) {
      skipped.push({ id: row.id, symbol: null, reason: "missing_symbol" });
      continue;
    }

    try {
      const price = await fetchMarketPrice(row.asset_type, row.asset_symbol, row.asset_market);
      if (price === null) {
        skipped.push({ id: row.id, symbol: row.asset_symbol, reason: "price_not_available" });
        continue;
      }

      const roundedPrice = Number(price.toFixed(4));
      const { error: updateError } = await db
        .from("investments")
        .update({ current_price: roundedPrice })
        .eq("id", row.id)
        .eq("user_id", authData.user.id);

      if (updateError) {
        skipped.push({ id: row.id, symbol: row.asset_symbol, reason: updateError.message });
        continue;
      }

      const quantity = Number(row.quantity) || 0;
      const priceEur = convertToEur(roundedPrice, row.asset_currency, ratesToEur);
      const historyInsert = await db.from("investment_price_history").insert({
        investment_id: row.id,
        user_id: authData.user.id,
        asset_symbol: row.asset_symbol,
        asset_currency: row.asset_currency ?? "EUR",
        price_local: roundedPrice,
        price_eur: Number(priceEur.toFixed(4)),
        total_value_local: Number((roundedPrice * quantity).toFixed(4)),
        total_value_eur: Number((priceEur * quantity).toFixed(4))
      });

      if (historyInsert.error) {
        skipped.push({ id: row.id, symbol: row.asset_symbol, reason: historyInsert.error.message });
        continue;
      }

      updated.push({ id: row.id, symbol: row.asset_symbol, price: roundedPrice });
    } catch (fetchError) {
      skipped.push({ id: row.id, symbol: row.asset_symbol, reason: fetchError instanceof Error ? fetchError.message : "fetch_failed" });
    }
  }

  return NextResponse.json({ updated, skipped });
}
