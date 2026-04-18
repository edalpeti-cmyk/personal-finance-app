import type { SupabaseClient } from "@supabase/supabase-js";
import { convertToEur, fetchRatesToEur, type AssetCurrency } from "@/lib/currency-rates";

type ExpenseRow = { amount: number; expense_date: string };
type IncomeRow = { amount: number; income_date: string };
type InvestmentRow = { quantity: number; average_buy_price: number; current_price: number | null; asset_currency: string | null };
type DebtRow = {
  outstanding_balance: number;
  monthly_payment: number | null;
  currency: AssetCurrency | null;
  status: "active" | "paused" | "closed";
  include_in_net_worth: boolean;
  include_in_fire: boolean;
};
type SavingsTargetRow = { savings_target: number; month: string };
type BudgetSavingsRow = {
  month: string;
  budget_amount: number;
  budget_kind: "expense" | "investment_transfer" | "emergency_fund";
};
type CashBaselineRow = {
  baseline_amount: number;
  baseline_date: string;
};
type InternalTransferRow = {
  amount: number;
  transfer_date: string;
  transfer_type: "investment" | "emergency_fund";
};
type WealthAssetRow = {
  current_estimated_value: number;
  ownership_pct: number;
  currency: AssetCurrency | null;
  include_in_net_worth: boolean;
  include_in_fire: boolean;
};
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
  monthlyDebtPayment: number;
  wealthAssetsValue: number;
  fireNetWorth: number;
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

  const [
    expensesResult,
    incomeResult,
    investmentsResult,
    debtsResult,
    savingsTargetsResult,
    fireSettingsResult,
    budgetSavingsResult,
    cashBaselineResult,
    transfersResult,
    wealthAssetsResult
  ] = await Promise.all([
    supabase.from("expenses").select("amount, expense_date").eq("user_id", userId),
    supabase.from("income").select("amount, income_date").eq("user_id", userId),
    supabase.from("investments").select("quantity, average_buy_price, current_price, asset_currency").eq("user_id", userId),
    supabase.from("debts").select("outstanding_balance, monthly_payment, currency, status, include_in_net_worth, include_in_fire").eq("user_id", userId),
    supabase.from("monthly_savings_targets").select("savings_target, month").eq("user_id", userId),
    supabase.from("fire_settings").select("annual_expenses, current_net_worth, annual_contribution, expected_return, current_age").eq("user_id", userId).maybeSingle(),
    supabase.from("monthly_budgets").select("month, budget_amount, budget_kind").eq("user_id", userId).in("budget_kind", ["investment_transfer", "emergency_fund"]),
    supabase.from("cash_baseline_settings").select("baseline_amount, baseline_date").eq("user_id", userId).maybeSingle(),
    supabase.from("internal_transfers").select("amount, transfer_date, transfer_type").eq("user_id", userId).in("transfer_type", ["investment", "emergency_fund"]),
    supabase.from("wealth_assets").select("current_estimated_value, ownership_pct, currency, include_in_net_worth, include_in_fire").eq("user_id", userId)
  ]);

  if (
    expensesResult.error ||
    incomeResult.error ||
    investmentsResult.error ||
    debtsResult.error ||
    savingsTargetsResult.error ||
    fireSettingsResult.error ||
    budgetSavingsResult.error ||
    cashBaselineResult.error ||
    transfersResult.error ||
    wealthAssetsResult.error
  ) {
    throw new Error(
      expensesResult.error?.message ||
        incomeResult.error?.message ||
        debtsResult.error?.message ||
        savingsTargetsResult.error?.message ||
        fireSettingsResult.error?.message ||
        budgetSavingsResult.error?.message ||
        cashBaselineResult.error?.message ||
        transfersResult.error?.message ||
        wealthAssetsResult.error?.message ||
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
  const budgetSavingsRows = (budgetSavingsResult.data as BudgetSavingsRow[]) ?? [];
  const cashBaseline = (cashBaselineResult.data as CashBaselineRow | null) ?? null;
  const transferRows = (transfersResult.data as InternalTransferRow[]) ?? [];
  const wealthAssetRows = (wealthAssetsResult.data as WealthAssetRow[]) ?? [];
  const fireSettings = (fireSettingsResult.data as FireSettingsRow | null) ?? null;

  const investmentsValue = investmentRows.reduce((acc, row) => {
    const qty = Number(row.quantity) || 0;
    const price = Number(row.current_price ?? row.average_buy_price) || 0;
    return acc + convertToEur(qty * price, row.asset_currency, ratesToEur);
  }, 0);

  const baselineStart = cashBaseline?.baseline_date ? `${cashBaseline.baseline_date}T00:00:00` : null;
  const incomeFromBaseline = baselineStart
    ? incomeRows.reduce((acc, row) => acc + (new Date(`${row.income_date}T00:00:00`) >= new Date(baselineStart) ? Number(row.amount) : 0), 0)
    : incomeRows.reduce((acc, row) => acc + Number(row.amount), 0);
  const expensesFromBaseline = baselineStart
    ? expenseRows.reduce((acc, row) => acc + (new Date(`${row.expense_date}T00:00:00`) >= new Date(baselineStart) ? Number(row.amount) : 0), 0)
    : expenseRows.reduce((acc, row) => acc + Number(row.amount), 0);
  const investmentTransfersFromBaseline = baselineStart
    ? transferRows.reduce((acc, row) => acc + (row.transfer_type === "investment" && new Date(`${row.transfer_date}T00:00:00`) >= new Date(baselineStart) ? Number(row.amount) : 0), 0)
    : transferRows.reduce((acc, row) => acc + (row.transfer_type === "investment" ? Number(row.amount) : 0), 0);
  const emergencyFundReserved = transferRows.reduce((acc, row) => acc + (row.transfer_type === "emergency_fund" ? Number(row.amount) : 0), 0);
  const cashPosition = (cashBaseline ? Number(cashBaseline.baseline_amount || 0) : 0) + incomeFromBaseline - expensesFromBaseline - investmentTransfersFromBaseline - emergencyFundReserved;
  const wealthAssetsValue = wealthAssetRows
    .filter((row) => row.include_in_net_worth)
    .reduce((acc, row) => acc + convertToEur(Number(row.current_estimated_value || 0) * (Number(row.ownership_pct || 0) / 100), row.currency, ratesToEur), 0);
  const fireIncludedWealthValue = wealthAssetRows
    .filter((row) => row.include_in_fire)
    .reduce((acc, row) => acc + convertToEur(Number(row.current_estimated_value || 0) * (Number(row.ownership_pct || 0) / 100), row.currency, ratesToEur), 0);
  const debtTotal = debtRows
    .filter((row) => row.status !== "closed" && row.include_in_net_worth)
    .reduce((acc, row) => acc + convertToEur(Number(row.outstanding_balance || 0), row.currency, ratesToEur), 0);
  const fireDebtTotal = debtRows
    .filter((row) => row.status !== "closed" && row.include_in_fire)
    .reduce((acc, row) => acc + convertToEur(Number(row.outstanding_balance || 0), row.currency, ratesToEur), 0);
  const monthlyDebtPayment = debtRows
    .filter((row) => row.status !== "closed" && row.include_in_net_worth)
    .reduce((acc, row) => acc + convertToEur(Number(row.monthly_payment || 0), row.currency, ratesToEur), 0);
  const grossWorth = cashPosition + investmentsValue + emergencyFundReserved + wealthAssetsValue;
  const totalNetWorth = grossWorth - debtTotal;

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
  const monthlyBudgetSavings = budgetSavingsRows.reduce(
    (acc, row) => (isSameMonth(row.month, now) ? acc + Number(row.budget_amount || 0) : acc),
    0
  );
  const totalMonthlySavings = monthlySavingsTarget + monthlyBudgetSavings;
  const savingsRate = monthlyIncome > 0 ? (totalMonthlySavings / monthlyIncome) * 100 : null;

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
  const annualBudgetSavings = budgetSavingsRows.reduce(
    (acc, row) => (isCurrentYear(row.month, now) ? acc + Number(row.budget_amount || 0) : acc),
    0
  );
  const totalAnnualSavings = annualSavings + annualBudgetSavings;
  const fireAnnualExpenses = fireSettings?.annual_expenses && fireSettings.annual_expenses > 0 ? fireSettings.annual_expenses : annualExpenses;
  const fireNetWorth =
    fireSettings && fireSettings.current_net_worth >= 0
      ? Math.max(fireSettings.current_net_worth + fireIncludedWealthValue - fireDebtTotal, 0)
      : totalNetWorth;
  const fireTarget = fireAnnualExpenses > 0 ? fireAnnualExpenses / 0.04 : 0;
  const fireProgress = fireTarget > 0 ? Math.min((fireNetWorth / fireTarget) * 100, 100) : 0;

  return {
    totalNetWorth,
    cashPosition,
    investmentsValue,
    annualExpenses,
    annualIncome,
    annualSavings: totalAnnualSavings,
    monthlyIncome,
    monthlyExpenses,
    debtTotal,
    monthlyDebtPayment,
    wealthAssetsValue,
    fireNetWorth,
    savingsRate,
    fireTarget,
    fireProgress,
    ratesToEur
  };
}
