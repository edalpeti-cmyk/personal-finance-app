"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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

type BudgetWithActual = {
  id: string;
  category: string;
  budget: number;
  actual: number;
  remaining: number;
  spentPercent: number;
};

function monthToDate(month: string) {
  return `${month}-01`;
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

export default function BudgetsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");

  const [rows, setRows] = useState<BudgetWithActual[]>([]);
  const [unbudgetedExpenses, setUnbudgetedExpenses] = useState<Array<{ category: string; actual: number }>>([]);

  const loadData = useCallback(
    async (uid: string, month: string) => {
      const monthDate = monthToDate(month);
      const range = monthDateRange(month);

      const [{ data: budgets, error: budgetError }, { data: expenses, error: expenseError }] = await Promise.all([
        supabase
          .from("monthly_budgets")
          .select("id, month, category, budget_amount")
          .eq("user_id", uid)
          .eq("month", monthDate)
          .order("category", { ascending: true }),
        supabase
          .from("expenses")
          .select("category, amount")
          .eq("user_id", uid)
          .gte("expense_date", range.start)
          .lte("expense_date", range.end)
      ]);

      if (budgetError || expenseError) {
        setMessage(budgetError?.message || expenseError?.message || "No se pudo cargar el presupuesto mensual.");
        return;
      }

      const budgetRows = (budgets as BudgetRow[]) ?? [];
      const expenseRows = (expenses as ExpenseRow[]) ?? [];

      const expenseByCategory = new Map<string, number>();
      for (const item of expenseRows) {
        const key = item.category || "Sin categoria";
        expenseByCategory.set(key, (expenseByCategory.get(key) ?? 0) + Number(item.amount));
      }

      const merged: BudgetWithActual[] = budgetRows.map((budget) => {
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

      setRows(merged);
      setUnbudgetedExpenses(unbudgeted);
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
    <main className="mx-auto grid max-w-6xl gap-6 p-6 md:grid-cols-2">
      <section className="rounded-lg border bg-white p-4">
        <h1 className="mb-4 text-2xl font-semibold">Presupuesto mensual</h1>

        <label className="mb-3 grid gap-1 text-sm">
          Mes
          <input
            className="rounded border border-slate-300 p-2"
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
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
  );
}
