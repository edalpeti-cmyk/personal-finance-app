import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSnapshotMetrics } from "@/lib/financial-snapshots";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const { data: users, error: usersError } = await supabase.from("users").select("id");

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    const snapshotDate = new Date().toISOString().slice(0, 10);
    const results = [] as Array<{ userId: string; status: string }>;

    for (const user of users ?? []) {
      try {
        const metrics = await buildSnapshotMetrics(supabase, user.id as string);
        const { error } = await supabase.from("net_worth_snapshots").upsert(
          {
            user_id: user.id,
            snapshot_date: snapshotDate,
            total_net_worth: Number(metrics.totalNetWorth.toFixed(2)),
            cash_position: Number(metrics.cashPosition.toFixed(2)),
            investments_value: Number(metrics.investmentsValue.toFixed(2)),
            snapshot_currency: "EUR",
            fx_rates_to_eur: metrics.ratesToEur
          },
          { onConflict: "user_id,snapshot_date" }
        );

        results.push({ userId: user.id as string, status: error ? error.message : "ok" });
      } catch (error) {
        results.push({ userId: user.id as string, status: error instanceof Error ? error.message : "unknown_error" });
      }
    }

    return NextResponse.json({ snapshotDate, results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
