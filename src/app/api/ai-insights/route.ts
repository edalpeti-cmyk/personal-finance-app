import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateRuleBasedInsights, type FinancialSnapshot } from "@/lib/ai-insights";
import { type AssetCurrency, convertToEur, fetchRatesToEur } from "@/lib/currency-rates";
import { buildSnapshotMetrics } from "@/lib/financial-snapshots";

type ExpenseRow = { amount: number; expense_date: string; category: string };
type InvestmentRow = { asset_name: string; quantity: number; average_buy_price: number; current_price: number | null; asset_currency: string | null };
type AiInsightDebug = {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySavingsTarget: number;
  annualIncome: number;
  annualExpenses: number;
  annualSavings: number;
  savingsRate: number | null;
  hasAnyIncome: boolean;
  hasCurrentMonthIncome: boolean;
  debtTotal: number;
  monthlyDebtPayment: number;
  debtToIncomeRatio: number | null;
  netWorth: number;
  investmentsValue: number;
  investmentCount: number;
  pricedInvestmentCount: number;
  priceCoveragePct: number;
  topInvestmentName: string | null;
  topInvestmentWeight: number;
  nonEurExposurePct: number;
  fireTarget: number;
  fireProgress: number;
};

function isSameMonth(dateString: string, now: Date) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function parseInsightsFromText(rawText: string) {
  const trimmed = rawText.trim();

  try {
    const parsed = JSON.parse(trimmed) as { insights?: string[] };
    if (Array.isArray(parsed.insights)) {
      return parsed.insights.filter((item) => typeof item === "string").slice(0, 5);
    }
  } catch {
    // fall back to line parsing
  }

  return trimmed
    .split("\n")
    .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

async function getSnapshot(userId: string): Promise<FinancialSnapshot> {
  const supabase = createAdminClient();
  const [baseMetrics, ratesToEur] = await Promise.all([buildSnapshotMetrics(supabase, userId), fetchRatesToEur()]);

  const [{ data: expenses }, { data: investments }] = await Promise.all([
    supabase.from("expenses").select("amount, expense_date, category").eq("user_id", userId),
    supabase.from("investments").select("asset_name, quantity, average_buy_price, current_price, asset_currency").eq("user_id", userId)
  ]);

  const now = new Date();
  const expenseRows = (expenses as ExpenseRow[]) ?? [];
  const investmentRows = (investments as InvestmentRow[]) ?? [];
  const investmentsValue = investmentRows.reduce((acc, row) => {
    const qty = Number(row.quantity) || 0;
    const price = Number(row.current_price ?? row.average_buy_price) || 0;
    return acc + convertToEur(qty * price, row.asset_currency, ratesToEur);
  }, 0);
  const investmentValues = investmentRows.map((row) => {
    const qty = Number(row.quantity) || 0;
    const price = Number(row.current_price ?? row.average_buy_price) || 0;
    const valueEur = convertToEur(qty * price, row.asset_currency, ratesToEur);
    return {
      name: row.asset_name,
      hasCurrentPrice: row.current_price !== null && Number.isFinite(Number(row.current_price)),
      valueEur,
      currency: row.asset_currency
    };
  });
  const investmentCount = investmentValues.length;
  const pricedInvestmentCount = investmentValues.filter((row) => row.hasCurrentPrice).length;
  const priceCoveragePct = investmentCount > 0 ? (pricedInvestmentCount / investmentCount) * 100 : 100;
  const topInvestment = [...investmentValues].sort((a, b) => b.valueEur - a.valueEur)[0] ?? null;
  const topInvestmentWeight = investmentsValue > 0 && topInvestment ? (topInvestment.valueEur / investmentsValue) * 100 : 0;
  const nonEurExposurePct =
    investmentsValue > 0
      ? (investmentValues.filter((row) => row.currency && row.currency !== "EUR").reduce((sum, row) => sum + row.valueEur, 0) / investmentsValue) * 100
      : 0;

  const categoryTotals = new Map<string, number>();
  for (const expense of expenseRows) {
    if (!isSameMonth(expense.expense_date, now)) continue;
    categoryTotals.set(expense.category, (categoryTotals.get(expense.category) ?? 0) + Number(expense.amount));
  }

  const topExpenseCategories = Array.from(categoryTotals.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  return {
    monthlyIncome: baseMetrics.monthlyIncome,
    monthlyExpenses: baseMetrics.monthlyExpenses,
    monthlySavingsTarget: baseMetrics.savingsRate !== null && baseMetrics.monthlyIncome > 0
      ? (baseMetrics.savingsRate / 100) * baseMetrics.monthlyIncome
      : 0,
    annualIncome: baseMetrics.annualIncome,
    annualExpenses: baseMetrics.annualExpenses,
    annualSavings: baseMetrics.annualSavings,
    savingsRate: baseMetrics.savingsRate,
    hasAnyIncome: baseMetrics.annualIncome > 0 || baseMetrics.monthlyIncome > 0,
    hasCurrentMonthIncome: baseMetrics.monthlyIncome > 0,
    debtTotal: baseMetrics.debtTotal,
    monthlyDebtPayment: baseMetrics.monthlyDebtPayment,
    debtToIncomeRatio: baseMetrics.monthlyIncome > 0 ? (baseMetrics.monthlyDebtPayment / baseMetrics.monthlyIncome) * 100 : null,
    netWorth: baseMetrics.totalNetWorth,
    investmentsValue,
    investmentCount,
    pricedInvestmentCount,
    priceCoveragePct,
    topInvestmentName: topInvestment?.name ?? null,
    topInvestmentWeight,
    nonEurExposurePct,
    fireTarget: baseMetrics.fireTarget,
    fireProgress: baseMetrics.fireProgress,
    topExpenseCategories
  };
}

function buildDebugSnapshot(snapshot: FinancialSnapshot): AiInsightDebug {
  return {
    monthlyIncome: snapshot.monthlyIncome,
    monthlyExpenses: snapshot.monthlyExpenses,
    monthlySavingsTarget: snapshot.monthlySavingsTarget,
    annualIncome: snapshot.annualIncome,
    annualExpenses: snapshot.annualExpenses,
    annualSavings: snapshot.annualSavings,
    savingsRate: snapshot.savingsRate,
    hasAnyIncome: snapshot.hasAnyIncome,
    hasCurrentMonthIncome: snapshot.hasCurrentMonthIncome,
    debtTotal: snapshot.debtTotal,
    monthlyDebtPayment: snapshot.monthlyDebtPayment,
    debtToIncomeRatio: snapshot.debtToIncomeRatio,
    netWorth: snapshot.netWorth,
    investmentsValue: snapshot.investmentsValue,
    investmentCount: snapshot.investmentCount,
    pricedInvestmentCount: snapshot.pricedInvestmentCount,
    priceCoveragePct: snapshot.priceCoveragePct,
    topInvestmentName: snapshot.topInvestmentName,
    topInvestmentWeight: snapshot.topInvestmentWeight,
    nonEurExposurePct: snapshot.nonEurExposurePct,
    fireTarget: snapshot.fireTarget,
    fireProgress: snapshot.fireProgress
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const { data: authData, error: authError } = await supabase.auth.getUser(bearerToken);

  if (authError || !authData.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const snapshot = await getSnapshot(authData.user.id);
  const debug = buildDebugSnapshot(snapshot);
  const fallbackInsights = generateRuleBasedInsights(snapshot);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ source: "rule_based", insights: fallbackInsights, debug });
  }

  try {
    const prompt = [
      "Eres un asesor financiero digital y prudente.",
      "Analiza estos datos y genera 3-5 insights accionables en espanol.",
      "Incluye recomendaciones de ahorro e inversion y una accion concreta para esta semana.",
      "Usa exactamente los datos entregados. No inventes ausencia de ingresos si hasAnyIncome es true.",
      "Si hasAnyIncome es true pero hasCurrentMonthIncome es false, explica que faltan ingresos en el mes actual, no que falten ingresos registrados.",
      "Interpreta annualSavings como ahorro objetivo anual acumulado, no como ingresos menos gastos.",
      "Interpreta monthlySavingsTarget como el ahorro objetivo del mes actual.",
      "Si mencionas deuda, usa debtTotal, monthlyDebtPayment y debtToIncomeRatio entregados en los datos.",
      "Si mencionas inversiones, usa investmentsValue, priceCoveragePct, topInvestmentName, topInvestmentWeight y nonEurExposurePct entregados en los datos.",
      "Si mencionas FIRE, usa literalmente fireProgress y fireTarget entregados en los datos.",
      "Si mencionas patrimonio, usa netWorth entregado en los datos.",
      "No contradigas ni recalcules las metricas principales del snapshot.",
      "No des consejo legal/fiscal. Usa lenguaje claro.",
      'Devuelve solo JSON valido con formato: {"insights": ["..."]}',
      `Datos: ${JSON.stringify(snapshot)}`
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: prompt
      })
    });

    if (!response.ok) {
      return NextResponse.json({ source: "rule_based", insights: fallbackInsights, debug });
    }

    const data = (await response.json()) as { output_text?: string };
    const rawText = data.output_text ?? "";
    const parsed = parseInsightsFromText(rawText);

    if (parsed.length === 0) {
      return NextResponse.json({ source: "rule_based", insights: fallbackInsights, debug });
    }

    return NextResponse.json({ source: "openai", insights: parsed, debug });
  } catch {
    return NextResponse.json({ source: "rule_based", insights: fallbackInsights, debug });
  }
}
