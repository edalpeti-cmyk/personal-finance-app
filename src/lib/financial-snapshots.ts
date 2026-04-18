import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRatesToEur, type AssetCurrency } from "@/lib/currency-rates";
import {
  computeSharedFinancialMetrics,
  type SharedBudgetSavingsRow as BudgetSavingsRow,
  type SharedCashBaselineRow as CashBaselineRow,
  type SharedDebtRow as DebtRow,
  type SharedExpenseRow as ExpenseRow,
  type SharedFireSettingsRow as FireSettingsRow,
  type SharedIncomeRow as IncomeRow,
  type SharedInternalTransferRow as InternalTransferRow,
  type SharedInvestmentRow as InvestmentRow,
  type SharedSavingsTargetRow as SavingsTargetRow,
  type SharedWealthAssetRow as WealthAssetRow
} from "@/lib/shared-financial-metrics";

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
  const shared = computeSharedFinancialMetrics({
    now,
    expenseRows,
    incomeRows,
    investmentRows,
    debtRows,
    savingsTargetRows,
    budgetSavingsRows,
    cashBaseline,
    transferRows,
    wealthAssetRows,
    fireSettings,
    ratesToEur
  });
  const fireTarget = shared.fireAnnualExpenses > 0 ? shared.fireAnnualExpenses / 0.04 : 0;
  const fireProgress = fireTarget > 0 ? Math.min((shared.fireNetWorth / fireTarget) * 100, 100) : 0;

  return {
    totalNetWorth: shared.totalNetWorth,
    cashPosition: shared.cashPosition,
    investmentsValue: shared.investmentsValue,
    annualExpenses: shared.annualExpenses,
    annualIncome: shared.annualIncome,
    annualSavings: shared.totalAnnualSavings,
    monthlyIncome: shared.monthlyIncome,
    monthlyExpenses: shared.monthlyExpenses,
    debtTotal: shared.debtTotal,
    monthlyDebtPayment: shared.monthlyDebtPayment,
    wealthAssetsValue: shared.wealthAssetsValue,
    fireNetWorth: shared.fireNetWorth,
    savingsRate: shared.savingsRate,
    fireTarget,
    fireProgress,
    ratesToEur
  };
}
