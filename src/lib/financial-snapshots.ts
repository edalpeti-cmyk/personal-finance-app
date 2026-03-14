import type { SupabaseClient } from "@supabase/supabase-js";
import { convertToEur, fetchRatesToEur } from "@/lib/currency-rates";

type ExpenseRow = { amount: number; expense_date: string };
type IncomeRow = { amount: number; income_date: string };
type InvestmentRow = { quantity: number; average_buy_price: number; current_price: number | null; asset_currency: string | null };

export type SnapshotMetrics = {
  totalNetWorth: number;
  cashPosition: number;
  investmentsValue: number;
  annualExpenses: number;
  annualIncome: number;
  annualSavings: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  savingsRate: number | null;
  fireTarget: number;
  fireProgress: number;
};

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

export async function buildSnapshotMetrics(supabase: SupabaseClient, userId: string): Promise<SnapshotMetrics> {
  const ratesToEur = await fetchRatesToEur();

  const [expensesResult, incomeResult, investmentsResult] = await Promise.all([
    supabase.from("expenses").select("amount, expense_date").eq("user_id", userId),
    supabase.from("income").select("amount, income_date").eq("user_id", userId),
    supabase.from("investments").select("quantity, average_buy_price, current_price, asset_currency").eq("user_id", userId)
  ]);

  if (expensesResult.error || incomeResult.error || investmentsResult.error) {
    throw new Error(
      expensesResult.error?.message ||
        incomeResult.error?.message ||
        investmentsResult.error?.message ||
        "No se pudieron calcular los snapshots."
    );
  }

  const now = new Date();
  const expenseRows = (expensesResult.data as ExpenseRow[]) ?? [];
  const incomeRows = (incomeResult.data as IncomeRow[]) ?? [];
  const investmentRows = (investmentsResult.data as InvestmentRow[]) ?? [];

  const investmentsValue = investmentRows.reduce((acc, row) => {
    const qty = Number(row.quantity) || 0;
    const price = Number(row.current_price ?? row.average_buy_price) || 0;
    return acc + convertToEur(qty * price, row.asset_currency, ratesToEur);
  }, 0);

  const totalIncomeAllTime = incomeRows.reduce((acc, row) => acc + Number(row.amount), 0);
  const totalExpensesAllTime = expenseRows.reduce((acc, row) => acc + Number(row.amount), 0);
  const cashPosition = totalIncomeAllTime - totalExpensesAllTime;
  const totalNetWorth = cashPosition + investmentsValue;

  const monthlyExpenses = expenseRows.reduce(
    (acc, row) => (isSameMonth(row.expense_date, now) ? acc + Number(row.amount) : acc),
    0
  );
  const monthlyIncome = incomeRows.reduce(
    (acc, row) => (isSameMonth(row.income_date, now) ? acc + Number(row.amount) : acc),
    0
  );
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
  const fireTarget = annualExpenses > 0 ? annualExpenses / 0.04 : 0;
  const fireProgress = fireTarget > 0 ? Math.min((totalNetWorth / fireTarget) * 100, 100) : 0;

  return {
    totalNetWorth,
    cashPosition,
    investmentsValue,
    annualExpenses,
    annualIncome,
    annualSavings,
    monthlyIncome,
    monthlyExpenses,
    savingsRate,
    fireTarget,
    fireProgress
  };
}
