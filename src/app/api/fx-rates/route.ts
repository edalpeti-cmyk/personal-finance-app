import { NextResponse } from "next/server";
import { fetchRatesToEur } from "@/lib/currency-rates";

export async function GET() {
  const rates = await fetchRatesToEur();
  return NextResponse.json({ rates });
}
