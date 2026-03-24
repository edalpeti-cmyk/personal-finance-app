import type { SupabaseClient } from "@supabase/supabase-js";
import { convertToEur, fetchRatesToEur, type AssetCurrency } from "@/lib/currency-rates";

type ExpenseRow = { amount: number; expense_date: string };
type IncomeRow = { amount: number; income_date: string };
type InvestmentRow = { quantity: number; average_buy_price: number; current_price: number | null; asset_currency: string | null };
type DebtRow = { outstanding_balance: number; currency: AssetCurrency | null; status: "active" | "paused" | "closed" };
type SavingsTargetRow = { savings_target: number; month: string };
type FireSettingsRow = {
  annual_expenses: number;
  current_net_worth: number;
  annual_contribution: number;
  expected_return: number;
  current_age: number;
};

export type SnapshotMetrics = {
  totalNetWorth: number;
  cashPosition: number;
  investmentsValue: number;
  annualExpenses: number;
  annualIncome: number;
  annualSavings: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  debtTotal: number;
  savingsRate: number | null;
  fireTarget: number;
  fireProgress: number;
  ratesToEur: Record<AssetCurrency, number>;
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

function isCurrentYear(dateString: string, now: Date) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.getFullYear() === now.getFullYear();
}

export async function buildSnapshotMetrics(supabase: SupabaseClient, userId: string): Promise<SnapshotMetrics> {
  const ratesToEur = await fetchRatesToEur();

  const [expensesResult, incomeResult, investmentsResult, debtsResult, savingsTargetsResult, fireSettingsResult] = await Promise.all([
    supabase.from("expenses").select("amount, expense_date").eq("user_id", userId),
    supabase.from("income").select("amount, income_date").eq("user_id", userId),
    supabase.from("investments").select("quantity, average_buy_price, current_price, asset_currency").eq("user_id", userId),
    supabase.from("debts").select("outstanding_balance, currency, status").eq("user_id", userId),
    supabase.from("monthly_savings_targets").select("savings_target, month").eq("user_id", userId),
    supabase.from("fire_settings").select("annual_expenses, current_net_worth, annual_contribution, expected_return, current_age").eq("user_id", userId).maybeSingle()
  ]);

  if (expensesResult.error || incomeResult.error || investmentsResult.error || debtsResult.error || savingsTargetsResult.error || fireSettingsResult.error) {
    throw new Error(
      expensesResult.error?.message ||
        incomeResult.error?.message ||
        debtsResult.error?.message ||
        savingsTargetsResult.error?.message ||
        fireSettingsResult.error?.message ||
        investmentsResult.error?.message ||
        "No se pudieron calcular los snapshots."
    );
  }

  const now = new Date();
  const expenseRows = (expensesResult.data as ExpenseRow[]) ?? [];
  const incomeRows = (incomeResult.data as IncomeRow[]) ?? [];
  const investmentRows = (investmentsResult.data as InvestmentRow[]) ?? [];
  const debtRows = (debtsResult.data as DebtRow[]) ?? [];
  const savingsTargetRows = (savingsTargetsResult.data as SavingsTargetRow[]) ?? [];
  const fireSettings = (fireSettingsResult.data as FireSettingsRow | null) ?? null;

  const investmentsValue = investmentRows.reduce((acc, row) => {
    const qty = Number(row.quantity) || 0;
    const price = Number(row.current_price ?? row.average_buy_price) || 0;
    return acc + convertToEur(qty * price, row.asset_currency, ratesToEur);
  }, 0);

  const totalIncomeAllTime = incomeRows.reduce((acc, row) => acc + Number(row.amount), 0);
  const totalExpensesAllTime = expenseRows.reduce((acc, row) => acc + Number(row.amount), 0);
  const cashPosition = totalIncomeAllTime - totalExpensesAllTime;
  const debtTotal = debtRows
    .filter((row) => row.status !== "closed")
    .reduce((acc, row) => acc + convertToEur(Number(row.outstanding_balance || 0), row.currency, ratesToEur), 0);
  const totalNetWorth = cashPosition + investmentsValue - debtTotal;

  const monthlyExpenses = expenseRows.reduce(
    (acc, row) => (isSameMonth(row.expense_date, now) ? acc + Number(row.amount) : acc),
    0
  );
  const monthlyIncome = incomeRows.reduce(
    (acc, row) => (isSameMonth(row.income_date, now) ? acc + Number(row.amount) : acc),
    0
  );
  const monthlySavingsTarget = savingsTargetRows.reduce(
    (acc, row) => (isSameMonth(row.month, now) ? acc + Number(row.savings_target) : acc),
    0
  );
  const savingsRate = monthlyIncome > 0 ? (monthlySavingsTarget / monthlyIncome) * 100 : null;

  const annualExpenses = expenseRows.reduce(
    (acc, row) => (isWithinLast12Months(row.expense_date, now) ? acc + Number(row.amount) : acc),
    0
  );
  const annualIncome = incomeRows.reduce(
    (acc, row) => (isWithinLast12Months(row.income_date, now) ? acc + Number(row.amount) : acc),
    0
  );
  const annualSavings = savingsTargetRows.reduce(
    (acc, row) => (isCurrentYear(row.month, now) ? acc + Number(row.savings_target) : acc),
    0
  );
  const fireAnnualExpenses = fireSettings?.annual_expenses && fireSettings.annual_expenses > 0 ? fireSettings.annual_expenses : annualExpenses;
  const fireNetWorth = fireSettings && fireSettings.current_net_worth >= 0 ? Math.max(fireSettings.current_net_worth - debtTotal, 0) : totalNetWorth;
  const fireTarget = fireAnnualExpenses > 0 ? fireAnnualExpenses / 0.04 : 0;
  const fireProgress = fireTarget > 0 ? Math.min((fireNetWorth / fireTarget) * 100, 100) : 0;

  return {
    totalNetWorth,
    cashPosition,
    investmentsValue,
    annualExpenses,
    annualIncome,
    annualSavings,
    monthlyIncome,
    monthlyExpenses,
    debtTotal,
    savingsRate,
    fireTarget,
    fireProgress,
    ratesToEur
  };
}
