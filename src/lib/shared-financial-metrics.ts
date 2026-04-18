import { convertToEur, type AssetCurrency } from "@/lib/currency-rates";

export type SharedExpenseRow = { amount: number; expense_date: string };
export type SharedIncomeRow = { amount: number; income_date: string };
export type SharedInvestmentRow = {
  quantity: number;
  average_buy_price: number;
  current_price: number | null;
  asset_currency: AssetCurrency | null;
};
export type SharedDebtRow = {
  outstanding_balance: number;
  monthly_payment: number | null;
  currency: AssetCurrency | null;
  status: "active" | "paused" | "closed";
  include_in_net_worth: boolean;
  include_in_fire: boolean;
};
export type SharedSavingsTargetRow = { savings_target: number; month: string };
export type SharedBudgetSavingsRow = {
  month: string;
  budget_amount: number;
  budget_kind: "expense" | "investment_transfer" | "emergency_fund";
};
export type SharedCashBaselineRow = {
  baseline_amount: number;
  baseline_date: string;
};
export type SharedInternalTransferRow = {
  amount: number;
  transfer_date: string;
  transfer_type: "investment" | "emergency_fund";
};
export type SharedWealthAssetRow = {
  current_estimated_value: number;
  ownership_pct: number;
  currency: AssetCurrency | null;
  include_in_net_worth: boolean;
  include_in_fire: boolean;
};
export type SharedFireSettingsRow = {
  annual_expenses: number;
  current_net_worth: number;
  annual_contribution: number;
  expected_return: number;
};

export type SharedFinancialMetrics = {
  investmentsValue: number;
  incomeFromBaseline: number;
  expensesFromBaseline: number;
  investmentTransfersFromBaseline: number;
  emergencyFundReserved: number;
  cashPosition: number;
  wealthAssetsValue: number;
  fireIncludedWealthValue: number;
  debtTotal: number;
  fireDebtTotal: number;
  monthlyDebtPayment: number;
  grossWorth: number;
  totalNetWorth: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySavingsTarget: number;
  monthlyBudgetSavings: number;
  totalMonthlySavings: number;
  savingsRate: number | null;
  annualExpenses: number;
  annualIncome: number;
  annualSavings: number;
  annualBudgetSavings: number;
  totalAnnualSavings: number;
  fireAnnualExpenses: number;
  fireNetWorth: number;
  fireAnnualContribution: number;
  fireExpectedReturn: number;
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

export function computeSharedFinancialMetrics(input: {
  now?: Date;
  expenseRows: SharedExpenseRow[];
  incomeRows: SharedIncomeRow[];
  investmentRows: SharedInvestmentRow[];
  debtRows: SharedDebtRow[];
  savingsTargetRows: SharedSavingsTargetRow[];
  budgetSavingsRows: SharedBudgetSavingsRow[];
  cashBaseline: SharedCashBaselineRow | null;
  transferRows: SharedInternalTransferRow[];
  wealthAssetRows: SharedWealthAssetRow[];
  fireSettings: SharedFireSettingsRow | null;
  ratesToEur: Record<AssetCurrency, number>;
}) {
  const {
    now = new Date(),
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
  } = input;

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

  const monthlyExpenses = expenseRows.reduce((acc, row) => (isSameMonth(row.expense_date, now) ? acc + Number(row.amount) : acc), 0);
  const monthlyIncome = incomeRows.reduce((acc, row) => (isSameMonth(row.income_date, now) ? acc + Number(row.amount) : acc), 0);
  const monthlySavingsTarget = savingsTargetRows.reduce((acc, row) => (isSameMonth(row.month, now) ? acc + Number(row.savings_target) : acc), 0);
  const monthlyBudgetSavings = budgetSavingsRows.reduce((acc, row) => (isSameMonth(row.month, now) ? acc + Number(row.budget_amount || 0) : acc), 0);
  const totalMonthlySavings = monthlySavingsTarget + monthlyBudgetSavings;
  const savingsRate = monthlyIncome > 0 ? (totalMonthlySavings / monthlyIncome) * 100 : null;

  const annualExpenses = expenseRows.reduce((acc, row) => (isWithinLast12Months(row.expense_date, now) ? acc + Number(row.amount) : acc), 0);
  const annualIncome = incomeRows.reduce((acc, row) => (isWithinLast12Months(row.income_date, now) ? acc + Number(row.amount) : acc), 0);
  const annualSavings = savingsTargetRows.reduce((acc, row) => (isCurrentYear(row.month, now) ? acc + Number(row.savings_target) : acc), 0);
  const annualBudgetSavings = budgetSavingsRows.reduce((acc, row) => (isCurrentYear(row.month, now) ? acc + Number(row.budget_amount || 0) : acc), 0);
  const totalAnnualSavings = annualSavings + annualBudgetSavings;

  const fireAnnualExpenses = fireSettings?.annual_expenses && fireSettings.annual_expenses > 0 ? fireSettings.annual_expenses : annualExpenses;
  const fireNetWorth =
    fireSettings && fireSettings.current_net_worth >= 0
      ? Math.max(fireSettings.current_net_worth + fireIncludedWealthValue - fireDebtTotal, 0)
      : totalNetWorth;
  const fireAnnualContribution = fireSettings && fireSettings.annual_contribution >= 0 ? fireSettings.annual_contribution : Math.max(totalAnnualSavings, 0);
  const fireExpectedReturn =
    fireSettings && fireSettings.expected_return >= -20 && fireSettings.expected_return <= 30
      ? fireSettings.expected_return / 100
      : 0.05;

  return {
    investmentsValue,
    incomeFromBaseline,
    expensesFromBaseline,
    investmentTransfersFromBaseline,
    emergencyFundReserved,
    cashPosition,
    wealthAssetsValue,
    fireIncludedWealthValue,
    debtTotal,
    fireDebtTotal,
    monthlyDebtPayment,
    grossWorth,
    totalNetWorth,
    monthlyIncome,
    monthlyExpenses,
    monthlySavingsTarget,
    monthlyBudgetSavings,
    totalMonthlySavings,
    savingsRate,
    annualExpenses,
    annualIncome,
    annualSavings,
    annualBudgetSavings,
    totalAnnualSavings,
    fireAnnualExpenses,
    fireNetWorth,
    fireAnnualContribution,
    fireExpectedReturn
  } satisfies SharedFinancialMetrics;
}
