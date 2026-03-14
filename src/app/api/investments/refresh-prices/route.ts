import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMarketPrice } from "@/lib/market-prices";

type InvestmentPriceRow = {
  id: string;
  asset_name: string;
  asset_symbol: string | null;
  asset_type: string;
  asset_market: string | null;
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

  let query = db
    .from("investments")
    .select("id, asset_name, asset_symbol, asset_type, asset_market")
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

      const { error: updateError } = await db
        .from("investments")
        .update({ current_price: Number(price.toFixed(4)) })
        .eq("id", row.id)
        .eq("user_id", authData.user.id);

      if (updateError) {
        skipped.push({ id: row.id, symbol: row.asset_symbol, reason: updateError.message });
        continue;
      }

      updated.push({ id: row.id, symbol: row.asset_symbol, price: Number(price.toFixed(4)) });
    } catch (fetchError) {
      skipped.push({ id: row.id, symbol: row.asset_symbol, reason: fetchError instanceof Error ? fetchError.message : "fetch_failed" });
    }
  }

  return NextResponse.json({ updated, skipped });
}
