"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/supabase/use-auth-guard";
import AuthLoadingState from "@/components/auth-loading-state";
import SideNav from "@/components/side-nav";

type BudgetRow = {
  id: string;
  month: string;
  category: string;
  budget_amount: number;
};

type ExpenseRow = {
  category: string;
  amount: number;
};

type IncomeRow = {
  id: string;
  amount: number;
  source: string;
  income_date: string;
};

type BudgetWithActual = {
  id: string;
  category: string;
  budget: number;
  actual: number;
  remaining: number;
  spentPercent: number;
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

function buildMonthlyRows(budgetRows: BudgetRow[], expenseRows: ExpenseRow[]) {
  const expenseByCategory = new Map<string, number>();
  for (const item of expenseRows) {
    const key = item.category || "Sin categoria";
    expenseByCategory.set(key, (expenseByCategory.get(key) ?? 0) + Number(item.amount));
  }

  const rows: BudgetWithActual[] = budgetRows.map((budget) => {
    const actual = expenseByCategory.get(budget.category) ?? 0;
    const remaining = Number(budget.budget_amount) - actual;
    const spentPercent = Number(budget.budget_amount) > 0 ? (actual / Number(budget.budget_amount)) * 100 : 0;

    return {
      id: budget.id,
      category: budget.category,
      budget: Number(budget.budget_amount),
      actual,
      remaining,
      spentPercent
    };
  });

  const budgetCategories = new Set(budgetRows.map((b) => b.category));
  const unbudgeted = Array.from(expenseByCategory.entries())
    .filter(([cat]) => !budgetCategories.has(cat))
    .map(([cat, actual]) => ({ category: cat, actual }))
    .sort((a, b) => b.actual - a.actual);

  return { rows, unbudgeted };
}

function toCsv(rows: BudgetWithActual[], month: string) {
  const header = ["mes", "categoria", "presupuesto", "gasto_real", "restante", "consumo_pct"];
  const data = rows.map((row) => [month, row.category, row.budget.toFixed(2), row.actual.toFixed(2), row.remaining.toFixed(2), row.spentPercent.toFixed(1)]);
  return [header, ...data].map((line) => line.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
}

function formatCurrency(value: number) {
  return `${value.toFixed(2)} EUR`;
}

function inputClass() {
  return "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100";
}

export default function BudgetsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { userId, authLoading } = useAuthGuard();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [incomeSaving, setIncomeSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);

  const [incomeSource, setIncomeSource] = useState("");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeDate, setIncomeDate] = useState(new Date().toISOString().slice(0, 10));
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);

  const [rows, setRows] = useState<BudgetWithActual[]>([]);
  const [prevRows, setPrevRows] = useState<BudgetWithActual[]>([]);
  const [unbudgetedExpenses, setUnbudgetedExpenses] = useState<Array<{ category: string; actual: number }>>([]);
  const [currentIncomeEntries, setCurrentIncomeEntries] = useState<IncomeRow[]>([]);
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
  }, []);

  const resetIncomeForm = useCallback(() => {
    setEditingIncomeId(null);
    setIncomeSource("");
    setIncomeAmount("");
    setIncomeDate(`${selectedMonth}-01`);
  }, [selectedMonth]);

  const loadData = useCallback(
    async (uid: string, month: string) => {
      const currentMonthDate = monthToDate(month);
      const currentRange = monthDateRange(month);
      const prevMonth = getPreviousMonth(month);
      const prevMonthDate = monthToDate(prevMonth);
      const prevRange = monthDateRange(prevMonth);

      const [currentData, prevData] = await Promise.all([
        Promise.all([
          supabase.from("monthly_budgets").select("id, month, category, budget_amount").eq("user_id", uid).eq("month", currentMonthDate).order("category", { ascending: true }),
          supabase.from("expenses").select("category, amount").eq("user_id", uid).gte("expense_date", currentRange.start).lte("expense_date", currentRange.end),
          supabase.from("income").select("id, amount, source, income_date").eq("user_id", uid).gte("income_date", currentRange.start).lte("income_date", currentRange.end).order("income_date", { ascending: false })
        ]),
        Promise.all([
          supabase.from("monthly_budgets").select("id, month, category, budget_amount").eq("user_id", uid).eq("month", prevMonthDate).order("category", { ascending: true }),
          supabase.from("expenses").select("category, amount").eq("user_id", uid).gte("expense_date", prevRange.start).lte("expense_date", prevRange.end),
          supabase.from("income").select("amount").eq("user_id", uid).gte("income_date", prevRange.start).lte("income_date", prevRange.end)
        ])
      ]);

      const [currentBudgets, currentExpenses, currentIncome] = currentData;
      const [previousBudgets, previousExpenses, previousIncome] = prevData;

      if (currentBudgets.error || currentExpenses.error || currentIncome.error || previousBudgets.error || previousExpenses.error || previousIncome.error) {
        setMessage(
          currentBudgets.error?.message ||
            currentExpenses.error?.message ||
            currentIncome.error?.message ||
            previousBudgets.error?.message ||
            previousExpenses.error?.message ||
            previousIncome.error?.message ||
            "No se pudo cargar el presupuesto mensual."
        );
        return;
      }

      const currentExpenseRows = (currentExpenses.data as ExpenseRow[]) ?? [];
      const prevExpenseRows = (previousExpenses.data as ExpenseRow[]) ?? [];
      const currentIncomeRows = (currentIncome.data as IncomeRow[]) ?? [];
      const prevIncomeRows = ((previousIncome.data as Array<{ amount: number }>) ?? []).map((row) => ({ id: "", amount: row.amount, source: "", income_date: "" }));

      const builtCurrent = buildMonthlyRows((currentBudgets.data as BudgetRow[]) ?? [], currentExpenseRows);
      const builtPrevious = buildMonthlyRows((previousBudgets.data as BudgetRow[]) ?? [], prevExpenseRows);

      const currentIncomeTotal = currentIncomeRows.reduce((acc, row) => acc + Number(row.amount), 0);
      const currentExpenseTotal = currentExpenseRows.reduce((acc, row) => acc + Number(row.amount), 0);
      const prevIncomeTotal = prevIncomeRows.reduce((acc, row) => acc + Number(row.amount), 0);
      const prevExpenseTotal = prevExpenseRows.reduce((acc, row) => acc + Number(row.amount), 0);
      const currentSavings = currentIncomeTotal - currentExpenseTotal;
      const prevSavings = prevIncomeTotal - prevExpenseTotal;

      setRows(builtCurrent.rows);
      setPrevRows(builtPrevious.rows);
      setUnbudgetedExpenses(builtCurrent.unbudgeted);
      setCurrentIncomeEntries(currentIncomeRows);
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

  useEffect(() => {
    if (loading || typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const budgetId = params.get("editBudget");
    const incomeId = params.get("editIncome");

    if (budgetId) {
      const row = rows.find((item) => item.id === budgetId);
      if (row) {
        handleEditBudget(row);
      }
      params.delete("editBudget");
      const nextQuery = params.toString();
      window.history.replaceState({}, "", nextQuery ? '?' + nextQuery : window.location.pathname);
      return;
    }

    if (incomeId) {
      const row = currentIncomeEntries.find((item) => item.id === incomeId);
      if (row) {
        handleEditIncome(row);
      }
      params.delete("editIncome");
      const nextQuery = params.toString();
      window.history.replaceState({}, "", nextQuery ? '?' + nextQuery : window.location.pathname);
    }
  }, [currentIncomeEntries, loading, rows]);

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
    return { budgetDelta, actualDelta, actualDeltaPct };
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

    const csv = toCsv(rows, selectedMonth);
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
    const payload = { user_id: userId, month: monthToDate(selectedMonth), category: cleanCategory, budget_amount: parsedAmount };
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

  const handleEditBudget = async (row: BudgetWithActual) => {
    if (!userId) {
      showToast({ type: "error", text: "Debes iniciar sesion para editar presupuestos." });
      return;
    }

    const nextCategory = window.prompt("Categoria", row.category);
    if (nextCategory === null) return;
    const nextAmountRaw = window.prompt("Presupuesto mensual", String(row.budget));
    if (nextAmountRaw === null) return;

    const parsedAmount = Number(nextAmountRaw);
    if (nextCategory.trim().length < 2 || nextCategory.trim().length > 40) {
      showToast({ type: "error", text: "La categoria debe tener entre 2 y 40 caracteres." });
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      showToast({ type: "error", text: "El importe del presupuesto debe ser mayor que 0." });
      return;
    }

    const { error } = await supabase
      .from("monthly_budgets")
      .update({
        category: nextCategory.trim(),
        budget_amount: parsedAmount
      })
      .eq("id", row.id)
      .eq("user_id", userId);

    if (error) {
      showToast({ type: "error", text: "No se pudo actualizar el presupuesto." });
      return;
    }

    await loadData(userId, selectedMonth);
    showToast({ type: "success", text: "Presupuesto actualizado." });
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

  const handleEditIncome = async (row: IncomeRow) => {
    if (!userId) {
      showToast({ type: "error", text: "Debes iniciar sesion para editar ingresos." });
      return;
    }

    const nextSource = window.prompt("Fuente de ingreso", row.source);
    if (nextSource === null) return;
    const nextAmountRaw = window.prompt("Importe", String(row.amount));
    if (nextAmountRaw === null) return;
    const nextDate = window.prompt("Fecha (YYYY-MM-DD)", row.income_date);
    if (nextDate === null) return;

    const parsedAmount = Number(nextAmountRaw);
    if (nextSource.trim().length < 2 || nextSource.trim().length > 80) {
      showToast({ type: "error", text: "La fuente del ingreso debe tener entre 2 y 80 caracteres." });
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      showToast({ type: "error", text: "El importe del ingreso debe ser mayor que 0." });
      return;
    }

    const parsedDate = new Date(`${nextDate}T00:00:00`);
    if (Number.isNaN(parsedDate.getTime())) {
      showToast({ type: "error", text: "La fecha no es valida." });
      return;
    }

    const { error } = await supabase
      .from("income")
      .update({
        source: nextSource.trim(),
        amount: parsedAmount,
        income_date: nextDate
      })
      .eq("id", row.id)
      .eq("user_id", userId);

    if (error) {
      showToast({ type: "error", text: "No se pudo actualizar el ingreso." });
      return;
    }

    await loadData(userId, selectedMonth);
    showToast({ type: "success", text: "Ingreso actualizado." });
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
      <main className="page-enter relative z-10 mx-auto grid max-w-6xl gap-6 p-6 md:pl-72 xl:grid-cols-12">
        <section className="panel rounded-[30px] p-6 md:p-8 xl:col-span-7">
          <p className="text-xs uppercase tracking-[0.26em] text-teal-700">Presupuesto mensual</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-slate-950">Plan mensual con ingresos y ahorro</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">Gestiona limites por categoria, registra ingresos del mes y controla si tu ahorro real va en la direccion correcta.</p>
        </section>

        <section className="rounded-[30px] bg-[linear-gradient(135deg,#14532d_0%,#0f766e_55%,#14b8a6_100%)] p-6 text-white shadow-[0_24px_60px_rgba(20,83,45,0.22)] xl:col-span-5">
          <p className="text-xs uppercase tracking-[0.24em] text-white/70">Mes activo</p>
          <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold">{selectedMonth}</p>
          <p className="mt-3 text-sm leading-6 text-white/80">Cambia el mes para revisar historico, rehacer tu presupuesto o comparar tu ahorro frente al mes anterior.</p>
        </section>

        {toast ? <section className={`rounded-[24px] p-4 text-sm xl:col-span-12 ${toast.type === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-red-200 bg-red-50 text-red-800"}`}>{toast.text}</section> : null}
        {message ? <section className="rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm text-red-800 xl:col-span-12">{message}</section> : null}

        <section ref={budgetFormRef} className="panel rounded-[28px] p-6 xl:col-span-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-teal-700">Categorias</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-slate-950">{editingBudgetId ? "Editar presupuesto" : "Nuevo presupuesto"}</h2>
            </div>
            {editingBudgetId ? <button type="button" onClick={resetBudgetForm} className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-700 hover:bg-slate-200">Cancelar</button> : null}
          </div>

          <label className="mt-6 grid gap-2 text-sm text-slate-700">
            Mes
            <input className={inputClass()} type="month" value={selectedMonth} onChange={(e) => { setSelectedMonth(e.target.value); setIncomeDate(`${e.target.value}-01`); }} />
          </label>

          <form onSubmit={handleSaveBudget} className="mt-4 grid gap-4" noValidate>
            <label className="grid gap-2 text-sm text-slate-700">
              Categoria
              <input className={inputClass()} value={category} onChange={(e) => setCategory(e.target.value)} maxLength={40} placeholder="Ej: Comida" />
            </label>
            <label className="grid gap-2 text-sm text-slate-700">
              Presupuesto mensual
              <input className={inputClass()} type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <button className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50" disabled={saving || loading} type="submit">
              {saving ? "Guardando..." : editingBudgetId ? "Guardar cambios" : "Guardar presupuesto"}
            </button>
          </form>
        </section>

        <section className="grid gap-4 xl:col-span-7 xl:grid-cols-4">
          <article className="kpi-card rounded-[26px] p-6"><p className="text-xs uppercase tracking-[0.22em] text-teal-700">Presupuesto</p><p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-slate-950">{formatCurrency(totals.totalBudget)}</p><p className="mt-3 text-sm text-slate-600">Total planificado para el mes.</p></article>
          <article className="kpi-card rounded-[26px] p-6"><p className="text-xs uppercase tracking-[0.22em] text-teal-700">Gasto real</p><p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-slate-950">{formatCurrency(totals.totalActual)}</p><p className="mt-3 text-sm text-slate-600">Suma de gastos registrados del mes.</p></article>
          <article className="kpi-card rounded-[26px] p-6"><p className="text-xs uppercase tracking-[0.22em] text-teal-700">Ahorro</p><p className={`mt-3 font-[var(--font-heading)] text-3xl font-semibold ${incomeSummary.currentSavings >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(incomeSummary.currentSavings)}</p><p className="mt-3 text-sm text-slate-600">Ingresos menos gastos del mes seleccionado.</p></article>
          <article className="kpi-card rounded-[26px] p-6"><p className="text-xs uppercase tracking-[0.22em] text-teal-700">Tasa de ahorro</p><p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-slate-950">{incomeSummary.currentSavingsRate === null ? "Sin datos" : `${incomeSummary.currentSavingsRate.toFixed(1)}%`}</p><p className="mt-3 text-sm text-slate-600">Se calcula sobre ingresos del mes.</p></article>
        </section>

        <section ref={incomeFormRef} className="panel rounded-[28px] p-6 xl:col-span-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-teal-700">Ingresos</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-slate-950">{editingIncomeId ? "Editar ingreso" : "Registrar ingreso"}</h2>
            </div>
            {editingIncomeId ? <button type="button" onClick={resetIncomeForm} className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-700 hover:bg-slate-200">Cancelar</button> : null}
          </div>

          <form onSubmit={handleSaveIncome} className="mt-6 grid gap-4 md:grid-cols-2" noValidate>
            <label className="grid gap-2 text-sm text-slate-700 md:col-span-2"><span>Fuente de ingreso</span><input className={inputClass()} value={incomeSource} onChange={(e) => setIncomeSource(e.target.value)} maxLength={80} /></label>
            <label className="grid gap-2 text-sm text-slate-700"><span>Importe</span><input className={inputClass()} type="number" min="0" step="0.01" value={incomeAmount} onChange={(e) => setIncomeAmount(e.target.value)} /></label>
            <label className="grid gap-2 text-sm text-slate-700"><span>Fecha</span><input className={inputClass()} type="date" value={incomeDate} onChange={(e) => setIncomeDate(e.target.value)} /></label>
            <button className="rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2" disabled={incomeSaving || loading} type="submit">{incomeSaving ? "Guardando..." : editingIncomeId ? "Guardar cambios" : "Guardar ingreso"}</button>
          </form>

          <div className="mt-6 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
            <div className="rounded-3xl bg-white/80 p-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-500">Ingresos del mes</p><p className="mt-2 font-medium text-slate-900">{formatCurrency(incomeSummary.currentIncome)}</p></div>
            <div className="rounded-3xl bg-white/80 p-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-500">Delta ahorro</p><p className={`mt-2 font-medium ${incomeComparison.savingsDelta >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(incomeComparison.savingsDelta)}</p></div>
          </div>
        </section>

        <section ref={incomeFormRef} className="panel rounded-[28px] p-6 xl:col-span-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-teal-700">Resumen</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-slate-950">Comparativa mensual</h2>
            </div>
            <button className="rounded-full bg-slate-950 px-4 py-2 text-sm text-white hover:bg-slate-800" type="button" onClick={handleExportCsv}>Exportar CSV</button>
          </div>

          <div className="mt-6 grid gap-4 text-sm text-slate-700 sm:grid-cols-2">
            <div className="rounded-3xl bg-white/80 p-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-500">Delta presupuesto</p><p className="mt-2 font-medium text-slate-900">{formatCurrency(monthOverMonth.budgetDelta)}</p></div>
            <div className="rounded-3xl bg-white/80 p-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-500">Delta gasto real</p><p className={`mt-2 font-medium ${monthOverMonth.actualDelta > 0 ? "text-red-700" : "text-emerald-700"}`}>{formatCurrency(monthOverMonth.actualDelta)}</p></div>
            <div className="rounded-3xl bg-white/80 p-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-500">Delta ingresos</p><p className={`mt-2 font-medium ${incomeComparison.incomeDelta >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(incomeComparison.incomeDelta)}</p></div>
            <div className="rounded-3xl bg-white/80 p-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-500">Consumo presupuesto</p><p className="mt-2 font-medium text-slate-900">{totals.totalSpentPercent.toFixed(1)}%</p></div>
          </div>
        </section>

        <section className="panel rounded-[28px] p-6 xl:col-span-7">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-teal-700">Presupuesto vs real</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-slate-950">Categorias del mes</h2>
            </div>
            <p className="text-sm text-slate-500">Ahora puedes editar y borrar categorias presupuestadas desde la tabla.</p>
          </div>

          {loading ? <p className="mt-6 text-sm text-slate-600">Cargando presupuesto...</p> : null}
          {!loading && rows.length === 0 ? <p className="mt-6 text-sm text-slate-600">Aun no hay categorias presupuestadas para este mes.</p> : null}

          {!loading && rows.length > 0 ? (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead><tr className="text-left text-slate-500"><th className="px-3 py-2">Categoria</th><th className="px-3 py-2 text-right">Presupuesto</th><th className="px-3 py-2 text-right">Real</th><th className="px-3 py-2 text-right">Restante</th><th className="px-3 py-2 text-right">Consumo</th><th className="px-3 py-2 text-right">Acciones</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="bg-white/90 shadow-sm">
                      <td className="rounded-l-2xl px-3 py-4 font-medium text-slate-900">{row.category}</td>
                      <td className="px-3 py-4 text-right text-slate-600">{formatCurrency(row.budget)}</td>
                      <td className="px-3 py-4 text-right text-slate-600">{formatCurrency(row.actual)}</td>
                      <td className={`px-3 py-4 text-right font-medium ${row.remaining < 0 ? "text-red-700" : "text-emerald-700"}`}>{formatCurrency(row.remaining)}</td>
                      <td className={`px-3 py-4 text-right ${row.spentPercent > 100 ? "text-red-700" : row.spentPercent > 85 ? "text-amber-700" : "text-slate-700"}`}>{row.spentPercent.toFixed(1)}%</td>
                      <td className="rounded-r-2xl px-3 py-4"><div className="flex justify-end gap-2"><a href={`?editBudget=${row.id}`} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200">Editar</a><button type="button" onClick={() => void handleDeleteBudget(row.id)} className="rounded-full bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100">Borrar</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section ref={budgetFormRef} className="panel rounded-[28px] p-6 xl:col-span-5">
          <p className="text-xs uppercase tracking-[0.22em] text-teal-700">Ingresos del mes</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-slate-950">Listado editable</h2>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-sm">
              <thead><tr className="text-left text-slate-500"><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Fuente</th><th className="px-3 py-2 text-right">Importe</th><th className="px-3 py-2 text-right">Acciones</th></tr></thead>
              <tbody>
                {currentIncomeEntries.length === 0 ? (
                  <tr><td className="rounded-2xl bg-white/70 px-3 py-4 text-slate-500" colSpan={4}>Aun no hay ingresos registrados para este mes.</td></tr>
                ) : (
                  currentIncomeEntries.map((entry) => (
                    <tr key={entry.id} className="bg-white/90 shadow-sm">
                      <td className="rounded-l-2xl px-3 py-4 text-slate-600">{entry.income_date}</td>
                      <td className="px-3 py-4 font-medium text-slate-900">{entry.source}</td>
                      <td className="px-3 py-4 text-right text-slate-600">{formatCurrency(Number(entry.amount))}</td>
                      <td className="rounded-r-2xl px-3 py-4"><div className="flex justify-end gap-2"><a href={`?editIncome=${entry.id}`} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200">Editar</a><button type="button" onClick={() => void handleDeleteIncome(entry.id)} className="rounded-full bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100">Borrar</button></div></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel rounded-[28px] p-6 xl:col-span-7">
          <p className="text-xs uppercase tracking-[0.22em] text-teal-700">Comparativa</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-slate-950">{selectedMonth} vs {getPreviousMonth(selectedMonth)}</h2>

          {categoryComparison.length === 0 ? (
            <p className="mt-6 text-sm text-slate-600">Sin datos suficientes para comparar meses.</p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead><tr className="text-left text-slate-500"><th className="px-3 py-2">Categoria</th><th className="px-3 py-2 text-right">Actual</th><th className="px-3 py-2 text-right">Anterior</th><th className="px-3 py-2 text-right">Delta</th></tr></thead>
                <tbody>
                  {categoryComparison.map((item) => (
                    <tr key={item.category} className="bg-white/90 shadow-sm">
                      <td className="rounded-l-2xl px-3 py-4 font-medium text-slate-900">{item.category}</td>
                      <td className="px-3 py-4 text-right text-slate-600">{formatCurrency(item.currentActual)}</td>
                      <td className="px-3 py-4 text-right text-slate-600">{formatCurrency(item.previousActual)}</td>
                      <td className={`rounded-r-2xl px-3 py-4 text-right font-medium ${item.delta > 0 ? "text-red-700" : item.delta < 0 ? "text-emerald-700" : "text-slate-700"}`}>{formatCurrency(item.delta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section ref={budgetFormRef} className="panel rounded-[28px] p-6 xl:col-span-5">
          <p className="text-xs uppercase tracking-[0.22em] text-teal-700">Gasto sin asignar</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-slate-950">Categorias no presupuestadas</h2>
          {unbudgetedExpenses.length === 0 ? (
            <p className="mt-6 text-sm text-slate-600">Todo el gasto del mes actual esta cubierto por categorias presupuestadas.</p>
          ) : (
            <ul className="mt-6 grid gap-3 text-sm text-slate-700">
              {unbudgetedExpenses.map((item) => (
                <li key={item.category} className="rounded-3xl bg-white/80 px-4 py-3"><span className="font-medium text-slate-900">{item.category}</span>: {formatCurrency(item.actual)}</li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
