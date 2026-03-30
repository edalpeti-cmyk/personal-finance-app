"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/supabase/use-auth-guard";
import AuthLoadingState from "@/components/auth-loading-state";
import SideNav from "@/components/side-nav";
import EmptyStateCard from "@/components/empty-state-card";
import SectionHeader from "@/components/section-header";
import { useTheme } from "@/components/theme-provider";
import { type CurrencyCode, formatCurrencyByPreference, formatDateByPreference, formatMonthByPreference } from "@/lib/preferences-format";

type BudgetRow = {
  id: string;
  month: string;
  category: string;
  budget_amount: number;
  budget_kind: "expense" | "investment_transfer" | "emergency_fund";
};

type ExpenseRow = {
  category: string;
  amount: number;
};
type TransferRow = {
  category: string;
  amount: number;
  transfer_type: "investment" | "emergency_fund";
};

type IncomeRow = {
  id: string;
  amount: number;
  source: string;
  income_date: string;
};

type SavingsTargetRow = {
  id: string;
  month: string;
  savings_target: number;
};

type BudgetWithActual = {
  id: string;
  category: string;
  budget: number;
  actual: number;
  remaining: number;
  spentPercent: number;
  budgetKind: "expense" | "investment_transfer" | "emergency_fund";
};

type IncomeSavingsSummary = {
  currentIncome: number;
  currentExpenses: number;
  currentSavings: number;
  currentSavingsRate: number | null;
  prevIncome: number;
  prevExpenses: number;
  prevSavings: number;
};

type BudgetInlineDraft = {
  category: string;
  amount: string;
};

type IncomeInlineDraft = {
  source: string;
  amount: string;
  incomeDate: string;
};

type ToastState = { type: "success" | "error"; text: string } | null;

function monthToDate(month: string) {
  return `${month}-01`;
}

function getPreviousMonth(month: string) {
  const [year, monthRaw] = month.split("-").map(Number);
  const current = new Date(year, monthRaw - 1, 1);
  current.setMonth(current.getMonth() - 1);
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
}

function monthDateRange(month: string) {
  const [year, monthIndexRaw] = month.split("-").map(Number);
  const monthIndex = monthIndexRaw - 1;
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function buildMonthlyRows(budgetRows: BudgetRow[], expenseRows: ExpenseRow[], transferRows: TransferRow[]) {
  const expenseByCategory = new Map<string, number>();
  for (const item of expenseRows) {
    const key = item.category || "Sin categoria";
    expenseByCategory.set(key, (expenseByCategory.get(key) ?? 0) + Number(item.amount));
  }
  const transferByBudgetKey = new Map<string, number>();
  for (const item of transferRows) {
    const key = `${item.transfer_type}:${item.category || "Sin categoria"}`;
    transferByBudgetKey.set(key, (transferByBudgetKey.get(key) ?? 0) + Number(item.amount));
  }

  const rows: BudgetWithActual[] = budgetRows.map((budget) => {
    const actual =
      budget.budget_kind === "investment_transfer" || budget.budget_kind === "emergency_fund"
        ? transferByBudgetKey.get(`${budget.budget_kind === "investment_transfer" ? "investment" : "emergency_fund"}:${budget.category}`) ?? 0
        : expenseByCategory.get(budget.category) ?? 0;
    const remaining = Number(budget.budget_amount) - actual;
    const spentPercent = Number(budget.budget_amount) > 0 ? (actual / Number(budget.budget_amount)) * 100 : 0;

    return {
      id: budget.id,
      category: budget.category,
      budget: Number(budget.budget_amount),
      actual,
      remaining,
      spentPercent,
      budgetKind: budget.budget_kind
    };
  });

  const budgetCategories = new Set(budgetRows.map((b) => b.category));
  const unbudgeted = Array.from(expenseByCategory.entries())
    .filter(([cat]) => !budgetCategories.has(cat))
    .map(([cat, actual]) => ({ category: cat, actual }))
    .sort((a, b) => b.actual - a.actual);

  return { rows, unbudgeted };
}

function toCsv(rows: BudgetWithActual[], month: string, currency: CurrencyCode, dateFormat: "es" | "us") {
  const header = ["mes", "categoria", `presupuesto_${currency.toLowerCase()}`, `gasto_real_${currency.toLowerCase()}`, `restante_${currency.toLowerCase()}`, "consumo_pct"];
  const data = rows.map((row) => [
    formatMonthByPreference(month, dateFormat),
    row.category,
    formatCurrencyByPreference(row.budget, currency),
    formatCurrencyByPreference(row.actual, currency),
    formatCurrencyByPreference(row.remaining, currency),
    row.spentPercent.toFixed(1)
  ]);
  return [header, ...data].map((line) => line.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
}

function inputClass() {
  return "w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-sm text-slate-100 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20";
}

const BUDGETS_COMPARISON_OPEN_KEY = "budgets-comparison-open";
const BUDGETS_CATEGORY_COMPARISON_OPEN_KEY = "budgets-category-comparison-open";
const BUDGETS_UNBUDGETED_OPEN_KEY = "budgets-unbudgeted-open";

export default function BudgetsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { userId, authLoading } = useAuthGuard();
  const { currency, dateFormat } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [incomeSaving, setIncomeSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [copySourceMonth, setCopySourceMonth] = useState(getPreviousMonth(new Date().toISOString().slice(0, 7)));
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [budgetKind, setBudgetKind] = useState<"expense" | "investment_transfer" | "emergency_fund">("expense");
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);

  const [incomeSource, setIncomeSource] = useState("");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeDate, setIncomeDate] = useState(new Date().toISOString().slice(0, 10));
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);
  const [savingsTarget, setSavingsTarget] = useState("");
  const [savingsTargetSaving, setSavingsTargetSaving] = useState(false);
  const [copyingBudget, setCopyingBudget] = useState(false);

  const [rows, setRows] = useState<BudgetWithActual[]>([]);
  const [prevRows, setPrevRows] = useState<BudgetWithActual[]>([]);
  const [unbudgetedExpenses, setUnbudgetedExpenses] = useState<Array<{ category: string; actual: number }>>([]);
  const [currentIncomeEntries, setCurrentIncomeEntries] = useState<IncomeRow[]>([]);
  const [comparisonOpen, setComparisonOpen] = useState(true);
  const [categoryComparisonOpen, setCategoryComparisonOpen] = useState(false);
  const [unbudgetedOpen, setUnbudgetedOpen] = useState(false);
  const [incomeSummary, setIncomeSummary] = useState<IncomeSavingsSummary>({
    currentIncome: 0,
    currentExpenses: 0,
    currentSavings: 0,
    currentSavingsRate: null,
    prevIncome: 0,
    prevExpenses: 0,
    prevSavings: 0
  });
  const budgetFormRef = useRef<HTMLElement | null>(null);
  const incomeFormRef = useRef<HTMLElement | null>(null);

  const showToast = useCallback((nextToast: Exclude<ToastState, null>) => {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const resetBudgetForm = useCallback(() => {
    setEditingBudgetId(null);
    setCategory("");
    setAmount("");
    setBudgetKind("expense");
  }, []);

  const resetIncomeForm = useCallback(() => {
    setEditingIncomeId(null);
    setIncomeSource("");
    setIncomeAmount("");
    setIncomeDate(`${selectedMonth}-01`);
  }, [selectedMonth]);

  useEffect(() => {
    const storedComparison = window.localStorage.getItem(BUDGETS_COMPARISON_OPEN_KEY);
    const storedCategoryComparison = window.localStorage.getItem(BUDGETS_CATEGORY_COMPARISON_OPEN_KEY);
    const storedUnbudgeted = window.localStorage.getItem(BUDGETS_UNBUDGETED_OPEN_KEY);
    if (storedComparison) setComparisonOpen(storedComparison === "true");
    if (storedCategoryComparison) setCategoryComparisonOpen(storedCategoryComparison === "true");
    if (storedUnbudgeted) setUnbudgetedOpen(storedUnbudgeted === "true");
  }, []);

  useEffect(() => {
    window.localStorage.setItem(BUDGETS_COMPARISON_OPEN_KEY, String(comparisonOpen));
  }, [comparisonOpen]);

  useEffect(() => {
    window.localStorage.setItem(BUDGETS_CATEGORY_COMPARISON_OPEN_KEY, String(categoryComparisonOpen));
  }, [categoryComparisonOpen]);

  useEffect(() => {
    window.localStorage.setItem(BUDGETS_UNBUDGETED_OPEN_KEY, String(unbudgetedOpen));
  }, [unbudgetedOpen]);

  const handleSaveSavingsTarget = async (event: FormEvent) => {
    event.preventDefault();
    setToast(null);
    setMessage(null);

    if (!userId) {
      showToast({ type: "error", text: "Debes iniciar sesion para guardar el ahorro objetivo." });
      return;
    }

    const parsedTarget = Number(savingsTarget);
    if (!Number.isFinite(parsedTarget) || parsedTarget < 0) {
      showToast({ type: "error", text: "El ahorro objetivo debe ser 0 o mayor." });
      return;
    }

    setSavingsTargetSaving(true);
    const { error } = await supabase
      .from("monthly_savings_targets")
      .upsert(
        {
          user_id: userId,
          month: monthToDate(selectedMonth),
          savings_target: parsedTarget
        },
        { onConflict: "user_id,month" }
      );

    if (error) {
      showToast({ type: "error", text: error.message });
      setSavingsTargetSaving(false);
      return;
    }

    await loadData(userId, selectedMonth);
    showToast({ type: "success", text: "Ahorro objetivo actualizado." });
    setSavingsTargetSaving(false);
  };

  const handleCopyBudgetFromMonth = async () => {
    setToast(null);
    setMessage(null);

    if (!userId) {
      showToast({ type: "error", text: "Debes iniciar sesion para copiar presupuestos." });
      return;
    }

    if (!copySourceMonth) {
      showToast({ type: "error", text: "Elige un mes origen para copiar el presupuesto." });
      return;
    }

    if (copySourceMonth === selectedMonth) {
      showToast({ type: "error", text: "El mes origen y el mes destino no pueden ser el mismo." });
      return;
    }

    const confirmed = window.confirm(`Se copiara el presupuesto de ${formatMonthByPreference(copySourceMonth, dateFormat)} sobre ${formatMonthByPreference(selectedMonth, dateFormat)}. Se reemplazaran las categorias y el ahorro objetivo del mes destino. Deseas continuar?`);
    if (!confirmed) {
      return;
    }

    setCopyingBudget(true);
    const sourceMonthDate = monthToDate(copySourceMonth);
    const targetMonthDate = monthToDate(selectedMonth);

    const [sourceBudgetsResult, sourceSavingsTargetResult] = await Promise.all([
      supabase.from("monthly_budgets").select("category, budget_amount, budget_kind").eq("user_id", userId).eq("month", sourceMonthDate).order("category", { ascending: true }),
      supabase.from("monthly_savings_targets").select("savings_target").eq("user_id", userId).eq("month", sourceMonthDate).maybeSingle()
    ]);

    if (sourceBudgetsResult.error || sourceSavingsTargetResult.error) {
      showToast({
        type: "error",
        text: sourceBudgetsResult.error?.message || sourceSavingsTargetResult.error?.message || "No se pudo leer el presupuesto del mes origen."
      });
      setCopyingBudget(false);
      return;
    }

      const sourceBudgets = (sourceBudgetsResult.data as Array<{ category: string; budget_amount: number; budget_kind?: "expense" | "investment_transfer" | "emergency_fund" }>) ?? [];
    const sourceSavingsTarget = Number((sourceSavingsTargetResult.data as { savings_target?: number } | null)?.savings_target ?? 0);

    if (sourceBudgets.length === 0 && sourceSavingsTarget === 0) {
      showToast({ type: "error", text: "El mes origen no tiene presupuesto ni ahorro objetivo para copiar." });
      setCopyingBudget(false);
      return;
    }

    const deleteBudgetsResult = await supabase.from("monthly_budgets").delete().eq("user_id", userId).eq("month", targetMonthDate);
    if (deleteBudgetsResult.error) {
      showToast({ type: "error", text: deleteBudgetsResult.error.message });
      setCopyingBudget(false);
      return;
    }

    if (sourceBudgets.length > 0) {
      const budgetsPayload = sourceBudgets.map((row) => ({
        user_id: userId,
        month: targetMonthDate,
        category: row.category,
        budget_amount: Number(row.budget_amount),
        budget_kind: row.budget_kind ?? "expense"
      }));

      const insertBudgetsResult = await supabase.from("monthly_budgets").insert(budgetsPayload);
      if (insertBudgetsResult.error) {
        showToast({ type: "error", text: insertBudgetsResult.error.message });
        setCopyingBudget(false);
        return;
      }
    }

    const savingsResult = await supabase
      .from("monthly_savings_targets")
      .upsert(
        {
          user_id: userId,
          month: targetMonthDate,
          savings_target: sourceSavingsTarget
        },
        { onConflict: "user_id,month" }
      );

    if (savingsResult.error) {
      showToast({ type: "error", text: savingsResult.error.message });
      setCopyingBudget(false);
      return;
    }

    await loadData(userId, selectedMonth);
    showToast({
      type: "success",
      text: `Presupuesto copiado desde ${formatMonthByPreference(copySourceMonth, dateFormat)}.`
    });
    setCopyingBudget(false);
  };

  const loadData = useCallback(
    async (uid: string, month: string) => {
      const currentMonthDate = monthToDate(month);
      const currentRange = monthDateRange(month);
      const prevMonth = getPreviousMonth(month);
      const prevMonthDate = monthToDate(prevMonth);
      const prevRange = monthDateRange(prevMonth);

      const [currentData, prevData] = await Promise.all([
        Promise.all([
          supabase.from("monthly_budgets").select("id, month, category, budget_amount, budget_kind").eq("user_id", uid).eq("month", currentMonthDate).order("category", { ascending: true }),
          supabase.from("monthly_savings_targets").select("id, month, savings_target").eq("user_id", uid).eq("month", currentMonthDate).maybeSingle(),
          supabase.from("expenses").select("category, amount").eq("user_id", uid).gte("expense_date", currentRange.start).lte("expense_date", currentRange.end),
          supabase.from("income").select("id, amount, source, income_date").eq("user_id", uid).gte("income_date", currentRange.start).lte("income_date", currentRange.end).order("income_date", { ascending: false }),
          supabase.from("internal_transfers").select("category, amount").eq("user_id", uid).eq("transfer_type", "investment").gte("transfer_date", currentRange.start).lte("transfer_date", currentRange.end)
        ]),
        Promise.all([
          supabase.from("monthly_budgets").select("id, month, category, budget_amount, budget_kind").eq("user_id", uid).eq("month", prevMonthDate).order("category", { ascending: true }),
          supabase.from("monthly_savings_targets").select("id, month, savings_target").eq("user_id", uid).eq("month", prevMonthDate).maybeSingle(),
          supabase.from("expenses").select("category, amount").eq("user_id", uid).gte("expense_date", prevRange.start).lte("expense_date", prevRange.end),
          supabase.from("income").select("amount").eq("user_id", uid).gte("income_date", prevRange.start).lte("income_date", prevRange.end),
          supabase.from("internal_transfers").select("category, amount").eq("user_id", uid).eq("transfer_type", "investment").gte("transfer_date", prevRange.start).lte("transfer_date", prevRange.end)
        ])
      ]);

      const [currentBudgets, currentSavingsTargetData, currentExpenses, currentIncome, currentTransfers] = currentData;
      const [previousBudgets, previousSavingsTargetData, previousExpenses, previousIncome, previousTransfers] = prevData;

      if (
        currentBudgets.error ||
        currentSavingsTargetData.error ||
        currentExpenses.error ||
        currentIncome.error ||
        currentTransfers.error ||
        previousBudgets.error ||
        previousSavingsTargetData.error ||
        previousExpenses.error ||
        previousIncome.error ||
        previousTransfers.error
      ) {
        setMessage(
          currentBudgets.error?.message ||
            currentSavingsTargetData.error?.message ||
            currentExpenses.error?.message ||
            currentIncome.error?.message ||
            currentTransfers.error?.message ||
            previousBudgets.error?.message ||
            previousSavingsTargetData.error?.message ||
            previousExpenses.error?.message ||
            previousIncome.error?.message ||
            previousTransfers.error?.message ||
            "No se pudo cargar el presupuesto mensual."
        );
        return;
      }

      const currentExpenseRows = (currentExpenses.data as ExpenseRow[]) ?? [];
      const prevExpenseRows = (previousExpenses.data as ExpenseRow[]) ?? [];
      const currentTransferRows = (currentTransfers.data as TransferRow[]) ?? [];
      const prevTransferRows = (previousTransfers.data as TransferRow[]) ?? [];
      const currentIncomeRows = (currentIncome.data as IncomeRow[]) ?? [];
      const prevIncomeRows = ((previousIncome.data as Array<{ amount: number }>) ?? []).map((row) => ({ id: "", amount: row.amount, source: "", income_date: "" }));

      const builtCurrent = buildMonthlyRows((currentBudgets.data as BudgetRow[]) ?? [], currentExpenseRows, currentTransferRows);
      const builtPrevious = buildMonthlyRows((previousBudgets.data as BudgetRow[]) ?? [], prevExpenseRows, prevTransferRows);

      const currentIncomeTotal = currentIncomeRows.reduce((acc, row) => acc + Number(row.amount), 0);
      const currentExpenseTotal = currentExpenseRows.reduce((acc, row) => acc + Number(row.amount), 0);
      const prevIncomeTotal = prevIncomeRows.reduce((acc, row) => acc + Number(row.amount), 0);
      const prevExpenseTotal = prevExpenseRows.reduce((acc, row) => acc + Number(row.amount), 0);
      const currentManualSavings = Number((currentSavingsTargetData.data as SavingsTargetRow | null)?.savings_target ?? 0);
      const prevManualSavings = Number((previousSavingsTargetData.data as SavingsTargetRow | null)?.savings_target ?? 0);
      const currentTransferSavings = ((currentBudgets.data as BudgetRow[] | null) ?? [])
        .filter((row) => row.budget_kind === "investment_transfer" || row.budget_kind === "emergency_fund")
        .reduce((sum, row) => sum + Number(row.budget_amount || 0), 0);
      const prevTransferSavings = ((previousBudgets.data as BudgetRow[] | null) ?? [])
        .filter((row) => row.budget_kind === "investment_transfer" || row.budget_kind === "emergency_fund")
        .reduce((sum, row) => sum + Number(row.budget_amount || 0), 0);
      const currentSavings = currentManualSavings + currentTransferSavings;
      const prevSavings = prevManualSavings + prevTransferSavings;

      setRows(builtCurrent.rows);
      setPrevRows(builtPrevious.rows);
      setUnbudgetedExpenses(builtCurrent.unbudgeted);
      setCurrentIncomeEntries(currentIncomeRows);
      setSavingsTarget(String(currentSavings));
      setIncomeSummary({
        currentIncome: currentIncomeTotal,
        currentExpenses: currentExpenseTotal,
        currentSavings,
        currentSavingsRate: currentIncomeTotal > 0 ? (currentSavings / currentIncomeTotal) * 100 : null,
        prevIncome: prevIncomeTotal,
        prevExpenses: prevExpenseTotal,
        prevSavings
      });
    },
    [supabase]
  );

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      if (authLoading || !userId) {
        return;
      }

      await loadData(userId, selectedMonth);
      setLoading(false);
    };

    void init();
  }, [authLoading, loadData, selectedMonth, userId]);

  const totals = useMemo(() => {
    const totalBudget = rows.reduce((acc, row) => acc + row.budget, 0);
    const totalActual = rows.reduce((acc, row) => acc + row.actual, 0);
    const totalRemaining = totalBudget - totalActual;
    const totalSpentPercent = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
    return { totalBudget, totalActual, totalRemaining, totalSpentPercent };
  }, [rows]);

  const prevTotals = useMemo(() => ({
    totalBudget: prevRows.reduce((acc, row) => acc + row.budget, 0),
    totalActual: prevRows.reduce((acc, row) => acc + row.actual, 0)
  }), [prevRows]);

  const monthOverMonth = useMemo(() => {
    const budgetDelta = totals.totalBudget - prevTotals.totalBudget;
    const actualDelta = totals.totalActual - prevTotals.totalActual;
    const actualDeltaPct = prevTotals.totalActual > 0 ? (actualDelta / prevTotals.totalActual) * 100 : null;
    const prevSpentPercent = prevTotals.totalBudget > 0 ? (prevTotals.totalActual / prevTotals.totalBudget) * 100 : 0;
    const spentPercentDelta = totals.totalSpentPercent - prevSpentPercent;
    return { budgetDelta, actualDelta, actualDeltaPct, prevSpentPercent, spentPercentDelta };
  }, [totals, prevTotals]);

  const incomeComparison = useMemo(() => ({
    incomeDelta: incomeSummary.currentIncome - incomeSummary.prevIncome,
    expensesDelta: incomeSummary.currentExpenses - incomeSummary.prevExpenses,
    savingsDelta: incomeSummary.currentSavings - incomeSummary.prevSavings
  }), [incomeSummary]);

  const categoryComparison = useMemo(() => {
    const currentMap = new Map(rows.map((row) => [row.category, row]));
    const prevMap = new Map(prevRows.map((row) => [row.category, row]));
    const categories = Array.from(new Set([...currentMap.keys(), ...prevMap.keys()])).sort();

    return categories.map((categoryName) => {
      const current = currentMap.get(categoryName);
      const previous = prevMap.get(categoryName);
      const currentActual = current?.actual ?? 0;
      const previousActual = previous?.actual ?? 0;
      return { category: categoryName, currentActual, previousActual, delta: currentActual - previousActual };
    });
  }, [rows, prevRows]);

  const handleExportCsv = () => {
    if (rows.length === 0) {
      showToast({ type: "error", text: "No hay datos para exportar en el mes seleccionado." });
      return;
    }

    const csv = toCsv(rows, selectedMonth, currency, dateFormat);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `presupuesto_${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast({ type: "success", text: "CSV exportado correctamente." });
  };

  const handleSaveIncome = async (event: FormEvent) => {
    event.preventDefault();
    setToast(null);

    if (!userId) {
      showToast({ type: "error", text: "Debes iniciar sesion para guardar ingresos." });
      return;
    }

    const source = incomeSource.trim();
    const parsedAmount = Number(incomeAmount);
    if (source.length < 2 || source.length > 80) {
      showToast({ type: "error", text: "La fuente del ingreso debe tener entre 2 y 80 caracteres." });
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      showToast({ type: "error", text: "El importe del ingreso debe ser mayor que 0." });
      return;
    }
    if (incomeDate.slice(0, 7) !== selectedMonth) {
      showToast({ type: "error", text: "La fecha del ingreso debe pertenecer al mes seleccionado." });
      return;
    }

    setIncomeSaving(true);
    const payload = { user_id: userId, source, amount: parsedAmount, income_date: incomeDate, description: null, recurring: false };
    const query = editingIncomeId
      ? supabase.from("income").update(payload).eq("id", editingIncomeId).eq("user_id", userId)
      : supabase.from("income").insert(payload);
    const { error } = await query;
    if (error) {
      showToast({ type: "error", text: error.message });
      setIncomeSaving(false);
      return;
    }

    resetIncomeForm();
    await loadData(userId, selectedMonth);
    showToast({ type: "success", text: editingIncomeId ? "Ingreso actualizado." : "Ingreso guardado correctamente." });
    setIncomeSaving(false);
  };

  const handleSaveBudget = async (event: FormEvent) => {
    event.preventDefault();
    setToast(null);
    setMessage(null);

    if (!userId) {
      showToast({ type: "error", text: "Debes iniciar sesion para guardar presupuestos." });
      return;
    }

    const cleanCategory = category.trim();
    const parsedAmount = Number(amount);
    if (cleanCategory.length < 2 || cleanCategory.length > 40) {
      showToast({ type: "error", text: "La categoria debe tener entre 2 y 40 caracteres." });
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      showToast({ type: "error", text: "El importe del presupuesto debe ser mayor que 0." });
      return;
    }

    setSaving(true);
    const payload = { user_id: userId, month: monthToDate(selectedMonth), category: cleanCategory, budget_amount: parsedAmount, budget_kind: budgetKind };
    const query = editingBudgetId
      ? supabase.from("monthly_budgets").update(payload).eq("id", editingBudgetId).eq("user_id", userId)
      : supabase.from("monthly_budgets").upsert(payload, { onConflict: "user_id,month,category" });
    const { error } = await query;
    if (error) {
      showToast({ type: "error", text: error.message });
      setSaving(false);
      return;
    }

    resetBudgetForm();
    await loadData(userId, selectedMonth);
    showToast({ type: "success", text: editingBudgetId ? "Presupuesto actualizado." : "Presupuesto guardado correctamente." });
    setSaving(false);
  };

  const handleEditBudget = (row: BudgetWithActual) => {
    setEditingBudgetId(row.id);
    setCategory(row.category);
    setAmount(String(row.budget));
    setBudgetKind(row.budgetKind);
    budgetFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast({ type: "success", text: "Modo edicion activado para este presupuesto." });
  };
  const handleRegisterInvestmentTransfer = async (row: BudgetWithActual) => {
    if (!userId) return;
    const suggestedAmount = Math.max(Number(row.remaining.toFixed(2)), 0);
    const rawValue = window.prompt(
      `Importe a traspasar a inversion para "${row.category}"`,
      suggestedAmount > 0 ? String(suggestedAmount) : String(Number(row.budget.toFixed(2)))
    );

    if (!rawValue) {
      return;
    }

    const parsedAmount = Number(rawValue);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      showToast({ type: "error", text: "El traspaso debe ser mayor que 0." });
      return;
    }

    const { error } = await supabase.from("internal_transfers").insert({
      user_id: userId,
      category: row.category,
      transfer_type: row.budgetKind === "emergency_fund" ? "emergency_fund" : "investment",
      amount: parsedAmount,
      transfer_date: monthToDate(selectedMonth),
      notes: "Registrado desde presupuesto"
    });

    if (error) {
      showToast({ type: "error", text: error.message });
      return;
    }

    await loadData(userId, selectedMonth);
    showToast({ type: "success", text: "Traspaso a inversion registrado." });
  };
  const handleDeleteBudget = async (id: string) => {
    if (!userId || !window.confirm("Se eliminara esta categoria presupuestada. Deseas continuar?")) return;
    const { error } = await supabase.from("monthly_budgets").delete().eq("id", id).eq("user_id", userId);
    if (error) {
      showToast({ type: "error", text: "No se pudo eliminar el presupuesto." });
      return;
    }
    if (editingBudgetId === id) resetBudgetForm();
    await loadData(userId, selectedMonth);
    showToast({ type: "success", text: "Presupuesto eliminado." });
  };

  const handleEditIncome = (row: IncomeRow) => {
    setEditingIncomeId(row.id);
    setIncomeSource(row.source);
    setIncomeAmount(String(row.amount));
    setIncomeDate(row.income_date);
    incomeFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast({ type: "success", text: "Modo edicion activado para este ingreso." });
  };
  const handleDeleteIncome = async (id: string) => {
    if (!userId || !window.confirm("Se eliminara este ingreso. Deseas continuar?")) return;
    const { error } = await supabase.from("income").delete().eq("id", id).eq("user_id", userId);
    if (error) {
      showToast({ type: "error", text: "No se pudo eliminar el ingreso." });
      return;
    }
    if (editingIncomeId === id) resetIncomeForm();
    await loadData(userId, selectedMonth);
    showToast({ type: "success", text: "Ingreso eliminado." });
  };

  if (authLoading) {
    return (
      <>
        <SideNav />
        <main className="mx-auto max-w-6xl p-6 md:pl-72">
          <AuthLoadingState title="Preparando presupuestos" description="Estamos comprobando tu sesion antes de cargar el presupuesto mensual." />
        </main>
      </>
    );
  }

  return (
    <>
      <SideNav />
      <main className="page-enter relative z-10 mx-auto grid max-w-6xl gap-5 p-5 md:pl-72 xl:grid-cols-12">
        <section className="panel rounded-[30px] p-5 text-white md:p-7 xl:col-span-7">
          <p className="text-xs uppercase tracking-[0.26em] text-emerald-300">Presupuesto mensual</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-white">Plan mensual con ingresos y ahorro</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
            {rows.length > 0 || currentIncomeEntries.length > 0
              ? "Ajusta categorias, ingresos y ahorro objetivo del mes activo."
              : "Gestiona limites por categoria, registra ingresos del mes y fija un ahorro objetivo mensual para medir tu plan con claridad."}
          </p>
        </section>

        <section className="rounded-[30px] border border-emerald-400/10 bg-[linear-gradient(180deg,rgba(7,19,35,0.98)_0%,rgba(9,29,48,0.98)_52%,rgba(10,63,70,0.92)_100%)] p-6 text-white shadow-[0_26px_60px_rgba(2,8,23,0.35)] xl:col-span-5">
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">Mes activo</p>
          <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold text-white">{formatMonthByPreference(selectedMonth, dateFormat)}</p>
          <p className="mt-3 text-sm leading-6 text-slate-200">Cambia el mes para revisar historico, rehacer tu presupuesto o comparar tu ahorro frente al mes anterior.</p>
        </section>

        {toast ? <section className={`rounded-[24px] p-4 text-sm xl:col-span-12 ${toast.type === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-red-200 bg-red-50 text-red-800"}`}>{toast.text}</section> : null}
        {message ? <section className="rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm text-red-800 xl:col-span-12">{message}</section> : null}

        <section ref={budgetFormRef} className={`panel rounded-[28px] p-5 text-white xl:col-span-5 ${editingBudgetId ? "ring-2 ring-teal-400/40" : ""}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Categorias</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">{editingBudgetId ? "Editar presupuesto" : "Nuevo presupuesto"}</h2>
            </div>
            {editingBudgetId ? <button type="button" onClick={resetBudgetForm} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 hover:bg-white/10">Cancelar</button> : null}
          </div>

          <label className="mt-6 grid gap-2 text-sm text-slate-200">
            Mes
            <input className={inputClass()} type="month" value={selectedMonth} onChange={(e) => { setSelectedMonth(e.target.value); setIncomeDate(`${e.target.value}-01`); }} />
          </label>

          <div className="mt-4 grid gap-4 rounded-3xl border border-white/8 bg-white/5 p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Copiar otro mes</p>
              {rows.length === 0 ? <p className="mt-2 text-sm leading-6 text-slate-300">Duplica categorias y ahorro objetivo de un mes anterior al mes activo.</p> : null}
            </div>
            <label className="grid gap-2 text-sm text-slate-200">
              Mes origen
              <input className={inputClass()} type="month" value={copySourceMonth} onChange={(e) => setCopySourceMonth(e.target.value)} />
            </label>
            <button
              className="rounded-2xl border border-white/10 bg-white/8 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={copyingBudget || loading}
              onClick={() => void handleCopyBudgetFromMonth()}
              type="button"
            >
              {copyingBudget ? "Copiando..." : "Copiar presupuesto de otro mes"}
            </button>
          </div>

          <form onSubmit={handleSaveSavingsTarget} className="mt-4 grid gap-4 rounded-3xl border border-white/8 bg-white/5 p-4" noValidate>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Ahorro objetivo</p>
              {rows.length === 0 ? <p className="mt-2 text-sm leading-6 text-slate-300">Este valor se usara para calcular el ahorro y la tasa de ahorro del mes seleccionado.</p> : null}
            </div>
            <label className="grid gap-2 text-sm text-slate-200">
              Ahorro planificado del mes
              <input className={inputClass()} type="number" min="0" step="0.01" value={savingsTarget} onChange={(e) => setSavingsTarget(e.target.value)} placeholder="Ej: 500" />
            </label>
            <button className="rounded-2xl border border-emerald-400/20 bg-emerald-500/90 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50" disabled={savingsTargetSaving || loading} type="submit">
              {savingsTargetSaving ? "Guardando..." : "Guardar ahorro objetivo"}
            </button>
          </form>

          <form onSubmit={handleSaveBudget} className="mt-4 grid gap-4" noValidate>
            <label className="grid gap-2 text-sm text-slate-200">
              Categoria
              <input className={inputClass()} value={category} onChange={(e) => setCategory(e.target.value)} maxLength={40} placeholder="Ej: Comida" />
            </label>
            <label className="grid gap-2 text-sm text-slate-200">
              Tipo de partida
              <select className={inputClass()} value={budgetKind} onChange={(e) => setBudgetKind(e.target.value as "expense" | "investment_transfer" | "emergency_fund")}>
                <option value="expense">Gasto</option>
                <option value="investment_transfer">Transferencia a inversion</option>
                <option value="emergency_fund">Fondo de emergencia</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm text-slate-200">
              Presupuesto mensual
              <input className={inputClass()} type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <button className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50" disabled={saving || loading} type="submit">
              {saving ? "Guardando..." : editingBudgetId ? "Guardar cambios" : "Guardar presupuesto"}
            </button>
          </form>
        </section>

        <section className="grid gap-3 xl:col-span-7 md:grid-cols-2">
          <article className="kpi-card rounded-[24px] p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Presupuesto</p>
            <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(totals.totalBudget, currency)}</p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Total planificado para el mes seleccionado.</p>
          </article>
          <article className="kpi-card rounded-[24px] p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Gasto real</p>
            <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(totals.totalActual, currency)}</p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Suma de los gastos ya registrados en el mes.</p>
          </article>
          <article className="kpi-card rounded-[24px] p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Ahorro</p>
            <p className={`mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none ${incomeSummary.currentSavings >= 0 ? "text-emerald-300" : "text-red-300"}`}>{formatCurrencyByPreference(incomeSummary.currentSavings, currency)}</p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Objetivo de ahorro que has marcado para este mes.</p>
          </article>
          <article className="kpi-card rounded-[24px] p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Tasa de ahorro</p>
            <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{incomeSummary.currentSavingsRate === null ? "Sin datos" : `${incomeSummary.currentSavingsRate.toFixed(1)}%`}</p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Ahorro objetivo dividido entre los ingresos del mes seleccionado.</p>
          </article>
        </section>

        <section ref={incomeFormRef} className="panel rounded-[28px] p-5 text-white xl:col-span-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Ingresos</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">{editingIncomeId ? "Editar ingreso" : "Registrar ingreso"}</h2>
            </div>
            {editingIncomeId ? <button type="button" onClick={resetIncomeForm} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 hover:bg-white/10">Cancelar</button> : null}
          </div>

          <form onSubmit={handleSaveIncome} className="mt-6 grid gap-4 md:grid-cols-2" noValidate>
            <label className="grid gap-2 text-sm text-slate-200 md:col-span-2"><span>Fuente de ingreso</span><input className={inputClass()} value={incomeSource} onChange={(e) => setIncomeSource(e.target.value)} maxLength={80} /></label>
            <label className="grid gap-2 text-sm text-slate-200"><span>Importe</span><input className={inputClass()} type="number" min="0" step="0.01" value={incomeAmount} onChange={(e) => setIncomeAmount(e.target.value)} /></label>
            <label className="grid gap-2 text-sm text-slate-200"><span>Fecha</span><input className={inputClass()} type="date" value={incomeDate} onChange={(e) => setIncomeDate(e.target.value)} /></label>
            <button className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2" disabled={incomeSaving || loading} type="submit">{incomeSaving ? "Guardando..." : editingIncomeId ? "Guardar cambios" : "Guardar ingreso"}</button>
          </form>

          <div className="mt-6 grid gap-3 text-sm text-slate-200 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/8 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-400">Ingresos del mes</p><p className="mt-2 font-medium text-slate-100">{formatCurrencyByPreference(incomeSummary.currentIncome, currency)}</p></div>
            <div className="rounded-3xl border border-white/8 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-400">Delta ahorro objetivo</p><p className={`mt-2 font-medium ${incomeComparison.savingsDelta >= 0 ? "text-emerald-300" : "text-red-300"}`}>{formatCurrencyByPreference(incomeComparison.savingsDelta, currency)}</p></div>
          </div>
        </section>

        <section className="panel rounded-[28px] p-5 text-white xl:col-span-6">
          <details className="group" open={comparisonOpen} onToggle={(event) => setComparisonOpen(event.currentTarget.open)}>
            <summary className="list-none cursor-pointer">
              <div className="accordion-summary">
                <div className="accordion-summary-main">
                  <SectionHeader eyebrow="Resumen" title="Comparativa mensual" />
                </div>
                <div className="accordion-summary-side">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                    Delta {formatCurrencyByPreference(incomeComparison.savingsDelta, currency)}
                  </span>
                  <button
                    className="ui-chip rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleExportCsv();
                    }}
                  >
                    Exportar CSV
                  </button>
                  <span className="accordion-chevron" aria-hidden="true">v</span>
                </div>
              </div>
            </summary>
          <div className="accordion-content mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] border border-white/8 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Delta presupuesto</p>
              <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-none text-white">{formatCurrencyByPreference(monthOverMonth.budgetDelta, currency)}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Delta gasto real</p>
              <p className={`mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-none ${monthOverMonth.actualDelta > 0 ? "text-red-300" : "text-emerald-300"}`}>{formatCurrencyByPreference(monthOverMonth.actualDelta, currency)}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Delta ingresos</p>
              <p className={`mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-none ${incomeComparison.incomeDelta >= 0 ? "text-emerald-300" : "text-red-300"}`}>{formatCurrencyByPreference(incomeComparison.incomeDelta, currency)}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Delta ahorro objetivo</p>
              <p className={`mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-none ${incomeComparison.savingsDelta >= 0 ? "text-emerald-300" : "text-red-300"}`}>{formatCurrencyByPreference(incomeComparison.savingsDelta, currency)}</p>
            </div>
          </div>
          <div className="mt-3 rounded-[24px] border border-white/8 bg-white/5 p-4 text-sm text-slate-300">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Consumo del presupuesto</p>
            <p className="mt-2 text-white">
              Actual: <span className="font-medium">{totals.totalSpentPercent.toFixed(1)}%</span>
              {" · "}
              Anterior: <span className="font-medium">{monthOverMonth.prevSpentPercent.toFixed(1)}%</span>
              {" · "}
              Delta: <span className={`font-medium ${monthOverMonth.spentPercentDelta > 0 ? "text-red-300" : monthOverMonth.spentPercentDelta < 0 ? "text-emerald-300" : "text-slate-100"}`}>{monthOverMonth.spentPercentDelta >= 0 ? "+" : ""}{monthOverMonth.spentPercentDelta.toFixed(1)} pts</span>
            </p>
          </div>
          </details>
        </section>

        <section className="panel rounded-[28px] p-5 text-white xl:col-span-7">
          <SectionHeader
            eyebrow="Presupuesto vs real"
            title="Categorias del mes"
            description="Ahora puedes editar y borrar categorias presupuestadas desde la tabla."
          />

          {loading ? <p className="mt-6 text-sm text-slate-300">Cargando presupuesto...</p> : null}
          {!loading && rows.length === 0 ? (
            <div className="mt-6">
              <EmptyStateCard
                eyebrow="Mes vacio"
                title="Todavia no hay categorias presupuestadas"
                description="Crea una categoria nueva o copia el presupuesto de otro mes para no empezar desde cero."
                actionLabel="Usa Crear presupuesto o Copiar otro mes"
                actionHref="/budgets"
                compact
              />
            </div>
          ) : null}

          {!loading && rows.length > 0 ? (
            <div className={`table-scroll mt-6 ${rows.length > 6 ? "max-h-[420px]" : ""}`}>
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead><tr className="text-left text-slate-400"><th className="sticky-col-header px-3 py-2">Categoria</th><th className="px-3 py-2 text-right">Presupuesto</th><th className="px-3 py-2 text-right">Real</th><th className="px-3 py-2 text-right">Restante</th><th className="px-3 py-2 text-right">Consumo</th><th className="px-3 py-2 text-right">Acciones</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="bg-white/5 shadow-sm">
                      <td className="sticky-col rounded-l-2xl px-3 py-4 font-medium text-white">
                        <div className="flex flex-col gap-2">
                          <span>{row.category}</span>
                          <span className={`ui-chip inline-flex w-fit rounded-full border px-3 py-1 text-[11px] ${row.budgetKind === "investment_transfer" ? "border-sky-400/20 bg-sky-500/10 text-sky-200" : row.budgetKind === "emergency_fund" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-300"}`}>
                            {row.budgetKind === "investment_transfer" ? "Transferencia a inversion" : row.budgetKind === "emergency_fund" ? "Fondo de emergencia" : "Gasto"}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-right text-slate-300">{formatCurrencyByPreference(row.budget, currency)}</td>
                      <td className="px-3 py-4 text-right text-slate-300">{formatCurrencyByPreference(row.actual, currency)}</td>
                      <td className={`px-3 py-4 text-right font-medium ${row.remaining < 0 ? "text-red-300" : "text-emerald-300"}`}>{formatCurrencyByPreference(row.remaining, currency)}</td>
                      <td className={`px-3 py-4 text-right ${row.spentPercent > 100 ? "text-red-300" : row.spentPercent > 85 ? "text-amber-300" : "text-slate-100"}`}>{row.spentPercent.toFixed(1)}%</td>
                      <td className="rounded-r-2xl px-3 py-4"><div className="flex justify-end gap-2 whitespace-nowrap">{row.budgetKind === "investment_transfer" || row.budgetKind === "emergency_fund" ? <button type="button" onClick={() => void handleRegisterInvestmentTransfer(row)} className={`rounded-full px-2.5 py-1.5 text-[11px] font-medium ${row.budgetKind === "emergency_fund" ? "border border-emerald-400/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20" : "border border-sky-400/20 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20"}`}>{row.budgetKind === "emergency_fund" ? "Aportar al fondo" : "Registrar traspaso"}</button> : null}<button type="button" onClick={() => handleEditBudget(row)} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-slate-100 hover:bg-white/10">Editar</button><button type="button" onClick={() => void handleDeleteBudget(row.id)} className="rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-medium text-red-200 hover:bg-red-500/20">Borrar</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="panel rounded-[28px] p-5 text-white xl:col-span-12">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Ingresos del mes</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Listado editable</h2>

          <div className={`table-scroll mt-6 ${currentIncomeEntries.length > 5 ? "max-h-[320px]" : ""}`}>
            <table className="min-w-full border-separate border-spacing-y-2 text-sm">
              <thead><tr className="text-left text-slate-400"><th className="sticky-col-header px-3 py-2">Fecha</th><th className="px-3 py-2">Fuente</th><th className="px-3 py-2 text-right">Importe</th><th className="px-3 py-2 text-right">Acciones</th></tr></thead>
              <tbody>
                {currentIncomeEntries.length === 0 ? (
                  <tr><td className="rounded-2xl bg-white/5 px-4 py-5 text-slate-300" colSpan={4}>Aun no hay ingresos registrados para este mes.</td></tr>
                ) : (
                  currentIncomeEntries.map((entry) => (
                    <tr key={entry.id} className="bg-white/5 shadow-sm">
                      <td className="sticky-col rounded-l-2xl px-3 py-4 text-slate-300">{formatDateByPreference(entry.income_date, dateFormat)}</td>
                      <td className="px-3 py-4 font-medium text-white">{entry.source}</td>
                      <td className="px-3 py-4 text-right text-slate-300">{formatCurrencyByPreference(Number(entry.amount), currency)}</td>
                      <td className="rounded-r-2xl px-3 py-4"><div className="flex justify-end gap-2 whitespace-nowrap"><button type="button" onClick={() => handleEditIncome(entry)} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-slate-100 hover:bg-white/10">Editar</button><button type="button" onClick={() => void handleDeleteIncome(entry.id)} className="rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-medium text-red-200 hover:bg-red-500/20">Borrar</button></div></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {categoryComparison.length > 0 ? (
          <section className="panel rounded-[28px] p-5 text-white xl:col-span-7">
            <details className="group" open={categoryComparisonOpen} onToggle={(event) => setCategoryComparisonOpen(event.currentTarget.open)}>
              <summary className="list-none cursor-pointer">
                <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Comparativa</p>
                <div className="accordion-summary mt-2">
                  <h2 className="accordion-summary-main font-[var(--font-heading)] text-2xl font-semibold text-white">{formatMonthByPreference(selectedMonth, dateFormat)} vs {formatMonthByPreference(getPreviousMonth(selectedMonth), dateFormat)}</h2>
                  <div className="accordion-summary-side">
                    <span className="accordion-metric">{categoryComparison.length} categorias</span>
                    <span className="accordion-chevron" aria-hidden="true">v</span>
                  </div>
                </div>
              </summary>
            <div className={`accordion-content table-scroll mt-6 ${categoryComparison.length > 6 ? "max-h-[420px]" : ""}`}>
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead><tr className="text-left text-slate-400"><th className="sticky-col-header px-3 py-2">Categoria</th><th className="px-3 py-2 text-right">Actual</th><th className="px-3 py-2 text-right">Anterior</th><th className="px-3 py-2 text-right">Delta</th></tr></thead>
                <tbody>
                  {categoryComparison.map((item) => (
                    <tr key={item.category} className="bg-white/5 shadow-sm">
                      <td className="sticky-col rounded-l-2xl px-3 py-4 font-medium text-white">{item.category}</td>
                      <td className="px-3 py-4 text-right text-slate-300">{formatCurrencyByPreference(item.currentActual, currency)}</td>
                      <td className="px-3 py-4 text-right text-slate-300">{formatCurrencyByPreference(item.previousActual, currency)}</td>
                      <td className={`rounded-r-2xl px-3 py-4 text-right font-medium ${item.delta > 0 ? "text-red-300" : item.delta < 0 ? "text-emerald-300" : "text-slate-100"}`}>{formatCurrencyByPreference(item.delta, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </details>
          </section>
        ) : null}

        {unbudgetedExpenses.length > 0 ? (
          <section className="panel rounded-[28px] p-5 text-white xl:col-span-12">
            <details className="group" open={unbudgetedOpen} onToggle={(event) => setUnbudgetedOpen(event.currentTarget.open)}>
              <summary className="list-none cursor-pointer">
                <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Gasto sin asignar</p>
                <div className="accordion-summary mt-2">
                  <h2 className="accordion-summary-main font-[var(--font-heading)] text-2xl font-semibold text-white">Categorias no presupuestadas</h2>
                  <div className="accordion-summary-side">
                    <span className="accordion-metric">{unbudgetedExpenses.length} pendientes</span>
                    <span className="accordion-chevron" aria-hidden="true">v</span>
                  </div>
                </div>
              </summary>
              <ul className="accordion-content mt-6 grid gap-3 text-sm text-slate-200 md:grid-cols-2 xl:grid-cols-3">
                {unbudgetedExpenses.map((item) => (
                  <li key={item.category} className="rounded-3xl border border-white/8 bg-white/5 px-4 py-3"><span className="font-medium text-white">{item.category}</span>: {formatCurrencyByPreference(item.actual, currency)}</li>
                ))}
              </ul>
            </details>
          </section>
        ) : null}
      </main>
    </>
  );
}



