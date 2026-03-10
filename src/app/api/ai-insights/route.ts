import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateRuleBasedInsights, type FinancialSnapshot } from "@/lib/ai-insights";

type ExpenseRow = { amount: number; expense_date: string; category: string };
type IncomeRow = { amount: number; income_date: string };
type InvestmentRow = { quantity: number; average_buy_price: number; current_price: number | null };

function isSameMonth(dateString: string, now: Date) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function isWithinLast12Months(dateString: string, now: Date) {
  const date = new Date(`${dateString}T00:00:00`);
  const cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
  cutoff.setMonth(cutoff.getMonth() - 11);
  return date >= cutoff;
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
  const supabase = await createClient();

  const [{ data: expenses }, { data: income }, { data: investments }] = await Promise.all([
    supabase.from("expenses").select("amount, expense_date, category").eq("user_id", userId),
    supabase.from("income").select("amount, income_date").eq("user_id", userId),
    supabase.from("investments").select("quantity, average_buy_price, current_price").eq("user_id", userId)
  ]);

  const now = new Date();
  const expenseRows = (expenses as ExpenseRow[]) ?? [];
  const incomeRows = (income as IncomeRow[]) ?? [];
  const investmentRows = (investments as InvestmentRow[]) ?? [];

  const monthlyExpenses = expenseRows.reduce(
    (acc, row) => (isSameMonth(row.expense_date, now) ? acc + Number(row.amount) : acc),
    0
  );
  const monthlyIncome = incomeRows.reduce((acc, row) => (isSameMonth(row.income_date, now) ? acc + Number(row.amount) : acc), 0);
  const savingsRate = monthlyIncome > 0 ? ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100 : null;

  const annualExpenses = expenseRows.reduce(
    (acc, row) => (isWithinLast12Months(row.expense_date, now) ? acc + Number(row.amount) : acc),
    0
  );
  const annualIncome = incomeRows.reduce(
    (acc, row) => (isWithinLast12Months(row.income_date, now) ? acc + Number(row.amount) : acc),
    0
  );
  const annualSavings = annualIncome - annualExpenses;

  const netWorth = investmentRows.reduce((acc, row) => {
    const qty = Number(row.quantity) || 0;
    const price = Number(row.current_price ?? row.average_buy_price) || 0;
    return acc + qty * price;
  }, 0);

  const fireTarget = annualExpenses > 0 ? annualExpenses / 0.04 : 0;
  const fireProgress = fireTarget > 0 ? Math.min((netWorth / fireTarget) * 100, 100) : 0;

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
    monthlyIncome,
    monthlyExpenses,
    annualIncome,
    annualExpenses,
    annualSavings,
    savingsRate,
    netWorth,
    fireTarget,
    fireProgress,
    topExpenseCategories
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
  const fallbackInsights = generateRuleBasedInsights(snapshot);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ source: "rule_based", insights: fallbackInsights });
  }

  try {
    const prompt = [
      "Eres un asesor financiero digital y prudente.",
      "Analiza estos datos y genera 3-5 insights accionables en espanol.",
      "Incluye recomendaciones de ahorro e inversion y una accion concreta para esta semana.",
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
      return NextResponse.json({ source: "rule_based", insights: fallbackInsights });
    }

    const data = (await response.json()) as { output_text?: string };
    const rawText = data.output_text ?? "";
    const parsed = parseInsightsFromText(rawText);

    if (parsed.length === 0) {
      return NextResponse.json({ source: "rule_based", insights: fallbackInsights });
    }

    return NextResponse.json({ source: "openai", insights: parsed });
  } catch {
    return NextResponse.json({ source: "rule_based", insights: fallbackInsights });
  }
}
