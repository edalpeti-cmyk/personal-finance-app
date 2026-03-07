"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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

function monthToDate(month: string) {
  return `${month}-01`;
}

function getPreviousMonth(month: string) {
  const [year, monthRaw] = month.split("-").map(Number);
  const current = new Date(year, monthRaw - 1, 1);
  current.setMonth(current.getMonth() - 1);
  const y = current.getFullYear();
  const m = String(current.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
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
  const data = rows.map((row) => [
    month,
    row.category,
    row.budget.toFixed(2),
    row.actual.toFixed(2),
    row.remaining.toFixed(2),
    row.spentPercent.toFixed(1)
  ]);
  return [header, ...data].map((line) => line.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
}

export default function BudgetsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [incomeSaving, setIncomeSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");

  const [incomeSource, setIncomeSource] = useState("");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeDate, setIncomeDate] = useState(new Date().toISOString().slice(0, 10));

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

  const loadData = useCallback(
    async (uid: string, month: string) => {
      const currentMonthDate = monthToDate(month);
      const currentRange = monthDateRange(month);
      const prevMonth = getPreviousMonth(month);
      const prevMonthDate = monthToDate(prevMonth);
      const prevRange = monthDateRange(prevMonth);

      const [currentData, prevData] = await Promise.all([
        Promise.all([
          supabase
            .from("monthly_budgets")
            .select("id, month, category, budget_amount")
            .eq("user_id", uid)
            .eq("month", currentMonthDate)
            .order("category", { ascending: true }),
          supabase
            .from("expenses")
            .select("category, amount")
            .eq("user_id", uid)
            .gte("expense_date", currentRange.start)
            .lte("expense_date", currentRange.end),
          supabase
            .from("income")
            .select("amount, source, income_date")
            .eq("user_id", uid)
            .gte("income_date", currentRange.start)
            .lte("income_date", currentRange.end)
            .order("income_date", { ascending: false })
        ]),
        Promise.all([
          supabase
            .from("monthly_budgets")
            .select("id, month, category, budget_amount")
            .eq("user_id", uid)
            .eq("month", prevMonthDate)
            .order("category", { ascending: true }),
          supabase
            .from("expenses")
            .select("category, amount")
            .eq("user_id", uid)
            .gte("expense_date", prevRange.start)
            .lte("expense_date", prevRange.end),
          supabase
            .from("income")
            .select("amount")
            .eq("user_id", uid)
            .gte("income_date", prevRange.start)
            .lte("income_date", prevRange.end)
        ])
      ]);

      const [currentBudgets, currentExpenses, currentIncome] = currentData;
      const [previousBudgets, previousExpenses, previousIncome] = prevData;

      if (
        currentBudgets.error ||
        currentExpenses.error ||
        currentIncome.error ||
        previousBudgets.error ||
        previousExpenses.error ||
        previousIncome.error
      ) {
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
      const prevIncomeRows = ((previousIncome.data as Array<{ amount: number }>) ?? []).map((r) => ({
        amount: r.amount,
        source: "",
        income_date: ""
      }));

      const builtCurrent = buildMonthlyRows((currentBudgets.data as BudgetRow[]) ?? [], currentExpenseRows);
      const builtPrevious = buildMonthlyRows((previousBudgets.data as BudgetRow[]) ?? [], prevExpenseRows);

      const currentIncomeTotal = currentIncomeRows.reduce((acc, row) => acc + Number(row.amount), 0);
      const currentExpenseTotal = currentExpenseRows.reduce((acc, row) => acc + Number(row.amount), 0);
      const prevIncomeTotal = prevIncomeRows.reduce((acc, row) => acc + Number(row.amount), 0);
      const prevExpenseTotal = prevExpenseRows.reduce((acc, row) => acc + Number(row.amount), 0);

      const currentSavings = currentIncomeTotal - currentExpenseTotal;
      const prevSavings = prevIncomeTotal - prevExpenseTotal;
      const currentSavingsRate = currentIncomeTotal > 0 ? (currentSavings / currentIncomeTotal) * 100 : null;

      setRows(builtCurrent.rows);
      setUnbudgetedExpenses(builtCurrent.unbudgeted);
      setPrevRows(builtPrevious.rows);
      setCurrentIncomeEntries(currentIncomeRows);
      setIncomeSummary({
        currentIncome: currentIncomeTotal,
        currentExpenses: currentExpenseTotal,
        currentSavings,
        currentSavingsRate,
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
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        setMessage("No hay sesion activa. Inicia sesion para gestionar presupuestos.");
        setLoading(false);
        return;
      }

      setUserId(data.user.id);
      await loadData(data.user.id, selectedMonth);
      setLoading(false);
    };

    void init();
  }, [loadData, selectedMonth, supabase]);

  const totals = useMemo(() => {
    const totalBudget = rows.reduce((acc, row) => acc + row.budget, 0);
    const totalActual = rows.reduce((acc, row) => acc + row.actual, 0);
    const totalRemaining = totalBudget - totalActual;
    const totalSpentPercent = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;

    return { totalBudget, totalActual, totalRemaining, totalSpentPercent };
  }, [rows]);

  const prevTotals = useMemo(() => {
    const totalBudget = prevRows.reduce((acc, row) => acc + row.budget, 0);
    const totalActual = prevRows.reduce((acc, row) => acc + row.actual, 0);
    return { totalBudget, totalActual };
  }, [prevRows]);

  const monthOverMonth = useMemo(() => {
    const budgetDelta = totals.totalBudget - prevTotals.totalBudget;
    const actualDelta = totals.totalActual - prevTotals.totalActual;
    const actualDeltaPct = prevTotals.totalActual > 0 ? (actualDelta / prevTotals.totalActual) * 100 : null;
    return { budgetDelta, actualDelta, actualDeltaPct };
  }, [totals, prevTotals]);

  const incomeComparison = useMemo(() => {
    const incomeDelta = incomeSummary.currentIncome - incomeSummary.prevIncome;
    const expensesDelta = incomeSummary.currentExpenses - incomeSummary.prevExpenses;
    const savingsDelta = incomeSummary.currentSavings - incomeSummary.prevSavings;
    return { incomeDelta, expensesDelta, savingsDelta };
  }, [incomeSummary]);

  const categoryComparison = useMemo(() => {
    const currentMap = new Map(rows.map((row) => [row.category, row]));
    const prevMap = new Map(prevRows.map((row) => [row.category, row]));
    const categories = Array.from(new Set([...currentMap.keys(), ...prevMap.keys()])).sort();

    return categories.map((cat) => {
      const current = currentMap.get(cat);
      const previous = prevMap.get(cat);
      const currentActual = current?.actual ?? 0;
      const previousActual = previous?.actual ?? 0;
      return {
        category: cat,
        currentActual,
        previousActual,
        delta: currentActual - previousActual
      };
    });
  }, [rows, prevRows]);

  const handleExportCsv = () => {
    if (rows.length === 0) {
      setToast({ type: "error", text: "No hay datos para exportar en el mes seleccionado." });
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
    setToast({ type: "success", text: "CSV exportado correctamente." });
    window.setTimeout(() => setToast(null), 2500);
  };

  const handleSaveIncome = async (e: FormEvent) => {
    e.preventDefault();
    setToast(null);

    if (!userId) {
      setToast({ type: "error", text: "Debes iniciar sesion para guardar ingresos." });
      return;
    }

    const source = incomeSource.trim();
    const parsedAmount = Number(incomeAmount);

    if (source.length < 2 || source.length > 80) {
      setToast({ type: "error", text: "La fuente del ingreso debe tener entre 2 y 80 caracteres." });
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setToast({ type: "error", text: "El importe del ingreso debe ser mayor que 0." });
      return;
    }

    if (incomeDate.slice(0, 7) !== selectedMonth) {
      setToast({ type: "error", text: "La fecha del ingreso debe pertenecer al mes seleccionado." });
      return;
    }

    setIncomeSaving(true);

    const { error } = await supabase.from("income").insert({
      user_id: userId,
      source,
      amount: parsedAmount,
      income_date: incomeDate,
      description: null,
      recurring: false
    });

    if (error) {
      setToast({ type: "error", text: error.message });
      setIncomeSaving(false);
      return;
    }

    setIncomeSource("");
    setIncomeAmount("");
    setToast({ type: "success", text: "Ingreso guardado correctamente." });
    window.setTimeout(() => setToast(null), 3000);

    await loadData(userId, selectedMonth);
    setIncomeSaving(false);
  };

  const handleSaveBudget = async (e: FormEvent) => {
    e.preventDefault();
    setToast(null);
    setMessage(null);

    if (!userId) {
      setToast({ type: "error", text: "Debes iniciar sesion para guardar presupuestos." });
      return;
    }

    const cleanCategory = category.trim();
    const parsedAmount = Number(amount);

    if (cleanCategory.length < 2 || cleanCategory.length > 40) {
      setToast({ type: "error", text: "La categoria debe tener entre 2 y 40 caracteres." });
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setToast({ type: "error", text: "El importe del presupuesto debe ser mayor que 0." });
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("monthly_budgets").upsert(
      {
        user_id: userId,
        month: monthToDate(selectedMonth),
        category: cleanCategory,
        budget_amount: parsedAmount
      },
      {
        onConflict: "user_id,month,category"
      }
    );

    if (error) {
      setToast({ type: "error", text: error.message });
      setSaving(false);
      return;
    }

    setCategory("");
    setAmount("");
    setToast({ type: "success", text: "Presupuesto guardado correctamente." });
    window.setTimeout(() => setToast(null), 3000);

    await loadData(userId, selectedMonth);
    setSaving(false);
  };

  return (
    <>
      <SideNav />
      <main className="mx-auto grid max-w-6xl gap-6 p-6 md:pl-60 md:grid-cols-2">
      <section className="rounded-lg border bg-white p-4">
        <h1 className="mb-4 text-2xl font-semibold">Presupuesto mensual</h1>

        <label className="mb-3 grid gap-1 text-sm">
          Mes
          <input
            className="rounded border border-slate-300 p-2"
            type="month"
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value);
              setIncomeDate(`${e.target.value}-01`);
            }}
          />
        </label>

        {toast ? (
          <p className={`mb-3 rounded p-2 text-sm ${toast.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {toast.text}
          </p>
        ) : null}

        <form onSubmit={handleSaveBudget} className="grid gap-3" noValidate>
          <label className="grid gap-1 text-sm">
            Categoria
            <input
              className="rounded border border-slate-300 p-2"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ej: Comida"
              maxLength={40}
              required
            />
          </label>

          <label className="grid gap-1 text-sm">
            Presupuesto mensual (EUR)
            <input
              className="rounded border border-slate-300 p-2"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>

          <button className="rounded bg-cyan-700 px-3 py-2 text-white disabled:opacity-50" disabled={saving || loading} type="submit">
            {saving ? "Guardando..." : "Guardar presupuesto"}
          </button>
        </form>

        {message ? <p className="mt-3 text-sm text-red-700">{message}</p> : null}
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-xl font-semibold">Resumen del mes</h2>
        <div className="grid gap-2 text-sm">
          <p>
            <strong>Presupuesto total:</strong> {totals.totalBudget.toFixed(2)} EUR
          </p>
          <p>
            <strong>Gasto real:</strong> {totals.totalActual.toFixed(2)} EUR
          </p>
          <p>
            <strong>Restante:</strong> {totals.totalRemaining.toFixed(2)} EUR
          </p>
          <p>
            <strong>Consumo del presupuesto:</strong> {totals.totalSpentPercent.toFixed(1)}%
          </p>
          <button className="mt-2 rounded bg-slate-800 px-3 py-2 text-sm text-white" type="button" onClick={handleExportCsv}>
            Exportar CSV
          </button>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4 md:col-span-2">
        <h2 className="mb-4 text-xl font-semibold">Ingresos y ahorro ({selectedMonth})</h2>

        <form onSubmit={handleSaveIncome} className="mb-4 grid gap-3 md:grid-cols-4" noValidate>
          <input
            className="rounded border border-slate-300 p-2"
            type="text"
            placeholder="Fuente de ingreso"
            value={incomeSource}
            onChange={(e) => setIncomeSource(e.target.value)}
            maxLength={80}
            required
          />
          <input
            className="rounded border border-slate-300 p-2"
            type="number"
            min="0"
            step="0.01"
            placeholder="Importe"
            value={incomeAmount}
            onChange={(e) => setIncomeAmount(e.target.value)}
            required
          />
          <input
            className="rounded border border-slate-300 p-2"
            type="date"
            value={incomeDate}
            onChange={(e) => setIncomeDate(e.target.value)}
            required
          />
          <button className="rounded bg-emerald-700 px-3 py-2 text-white disabled:opacity-50" disabled={incomeSaving || loading} type="submit">
            {incomeSaving ? "Guardando..." : "Guardar ingreso"}
          </button>
        </form>

        <div className="grid gap-2 text-sm md:grid-cols-2">
          <p>
            <strong>Ingresos del mes:</strong> {incomeSummary.currentIncome.toFixed(2)} EUR
          </p>
          <p>
            <strong>Gasto total del mes:</strong> {incomeSummary.currentExpenses.toFixed(2)} EUR
          </p>
          <p>
            <strong>Ahorro del mes:</strong>{" "}
            <span className={incomeSummary.currentSavings < 0 ? "text-red-700" : "text-emerald-700"}>{incomeSummary.currentSavings.toFixed(2)} EUR</span>
          </p>
          <p>
            <strong>Tasa de ahorro:</strong>{" "}
            {incomeSummary.currentSavingsRate === null ? "Sin ingresos" : `${incomeSummary.currentSavingsRate.toFixed(1)}%`}
          </p>
          <p>
            <strong>Delta ingresos vs mes anterior:</strong> {incomeComparison.incomeDelta.toFixed(2)} EUR
          </p>
          <p>
            <strong>Delta ahorro vs mes anterior:</strong> {incomeComparison.savingsDelta.toFixed(2)} EUR
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="p-2">Fecha</th>
                <th className="p-2">Fuente</th>
                <th className="p-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {currentIncomeEntries.length === 0 ? (
                <tr>
                  <td className="p-2 text-slate-500" colSpan={3}>
                    Aun no hay ingresos registrados para este mes.
                  </td>
                </tr>
              ) : (
                currentIncomeEntries.map((entry, idx) => (
                  <tr key={`${entry.income_date}-${entry.source}-${idx}`} className="border-b">
                    <td className="p-2">{entry.income_date}</td>
                    <td className="p-2">{entry.source}</td>
                    <td className="p-2 text-right">{Number(entry.amount).toFixed(2)} EUR</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4 md:col-span-2">
        <h2 className="mb-4 text-xl font-semibold">Presupuesto vs gasto real</h2>
        {loading ? <p>Cargando...</p> : null}
        {!loading && rows.length === 0 ? <p>Aun no hay categorias presupuestadas para este mes.</p> : null}

        {!loading && rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="p-2">Categoria</th>
                  <th className="p-2 text-right">Presupuesto</th>
                  <th className="p-2 text-right">Gasto real</th>
                  <th className="p-2 text-right">Restante</th>
                  <th className="p-2 text-right">Consumo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="p-2">{row.category}</td>
                    <td className="p-2 text-right">{row.budget.toFixed(2)} EUR</td>
                    <td className="p-2 text-right">{row.actual.toFixed(2)} EUR</td>
                    <td className={`p-2 text-right ${row.remaining < 0 ? "text-red-700" : "text-emerald-700"}`}>
                      {row.remaining.toFixed(2)} EUR
                    </td>
                    <td className={`p-2 text-right ${row.spentPercent > 100 ? "text-red-700" : row.spentPercent > 85 ? "text-amber-700" : "text-slate-700"}`}>
                      {row.spentPercent.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border bg-white p-4 md:col-span-2">
        <h2 className="mb-4 text-xl font-semibold">Comparativa mensual ({selectedMonth} vs {getPreviousMonth(selectedMonth)})</h2>
        {categoryComparison.length === 0 ? (
          <p>Sin datos suficientes para comparar meses.</p>
        ) : (
          <>
            <div className="mb-3 grid gap-1 text-sm md:grid-cols-3">
              <p>
                <strong>Delta presupuesto total:</strong> {monthOverMonth.budgetDelta.toFixed(2)} EUR
              </p>
              <p>
                <strong>Delta gasto real total:</strong> {monthOverMonth.actualDelta.toFixed(2)} EUR
              </p>
              <p>
                <strong>Delta gasto real %:</strong>{" "}
                {monthOverMonth.actualDeltaPct === null ? "Sin base" : `${monthOverMonth.actualDeltaPct.toFixed(1)}%`}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left">
                    <th className="p-2">Categoria</th>
                    <th className="p-2 text-right">Gasto actual</th>
                    <th className="p-2 text-right">Gasto mes anterior</th>
                    <th className="p-2 text-right">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryComparison.map((item) => (
                    <tr key={item.category} className="border-b">
                      <td className="p-2">{item.category}</td>
                      <td className="p-2 text-right">{item.currentActual.toFixed(2)} EUR</td>
                      <td className="p-2 text-right">{item.previousActual.toFixed(2)} EUR</td>
                      <td className={`p-2 text-right ${item.delta > 0 ? "text-red-700" : item.delta < 0 ? "text-emerald-700" : "text-slate-700"}`}>
                        {item.delta.toFixed(2)} EUR
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="rounded-lg border bg-white p-4 md:col-span-2">
        <h2 className="mb-4 text-xl font-semibold">Gastos sin presupuesto</h2>
        {unbudgetedExpenses.length === 0 ? (
          <p>Todo el gasto del mes actual esta cubierto por categorias presupuestadas.</p>
        ) : (
          <ul className="list-disc pl-5 text-sm">
            {unbudgetedExpenses.map((item) => (
              <li key={item.category}>
                {item.category}: {item.actual.toFixed(2)} EUR
              </li>
            ))}
          </ul>
        )}
      </section>
      </main>
    </>
  );
}