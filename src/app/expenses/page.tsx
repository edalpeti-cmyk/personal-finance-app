"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from "chart.js";
import { Line } from "react-chartjs-2";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/supabase/use-auth-guard";
import AuthLoadingState from "@/components/auth-loading-state";
import { analyzeMonthlyExpenses } from "@/lib/expenses-analysis";
import SideNav from "@/components/side-nav";
import { useTheme } from "@/components/theme-provider";
import { formatCurrencyByPreference, formatDateByPreference } from "@/lib/preferences-format";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

type ExpenseRow = {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  expense_date: string;
};

type ExpenseFormErrors = {
  amount?: string;
  category?: string;
  expenseDate?: string;
  description?: string;
};

type ToastState = { type: "success" | "error"; text: string } | null;

const PRESET_CATEGORIES = [
  "Vivienda",
  "Comida",
  "Transporte",
  "Salud",
  "Ocio",
  "Educacion",
  "Suscripciones",
  "Otros"
];

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function inputClass(hasError: boolean) {
  return `w-full rounded-2xl border bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition ${
    hasError ? "border-red-400 ring-2 ring-red-500/20" : "border-white/10 focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
  }`;
}

export default function ExpensesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { userId, authLoading } = useAuthGuard();
  const { currency, dateFormat } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [toast, setToast] = useState<ToastState>(null);

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(PRESET_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [errors, setErrors] = useState<ExpenseFormErrors>({});
  const [selectedExpenseCategory, setSelectedExpenseCategory] = useState<string | null>(null);
  const formRef = useRef<HTMLElement | null>(null);

  const showToast = useCallback((nextToast: Exclude<ToastState, null>) => {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setAmount("");
    setCategory(PRESET_CATEGORIES[0]);
    setCustomCategory("");
    setDescription("");
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setErrors({});
  }, []);

  const loadExpenses = useCallback(
    async (uid: string) => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, amount, category, description, expense_date")
        .eq("user_id", uid)
        .order("expense_date", { ascending: false });

      if (error) {
        setMessage(error.message);
        return;
      }

      setExpenses((data as ExpenseRow[]) ?? []);
    },
    [supabase]
  );

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      if (authLoading || !userId) {
        return;
      }

      await loadExpenses(userId);
      setLoading(false);
    };

    void init();
  }, [authLoading, loadExpenses, userId]);

  const monthlyTotals = useMemo(() => {
    const year = new Date().getFullYear();
    const totals = new Array<number>(12).fill(0);

    for (const expense of expenses) {
      const date = new Date(`${expense.expense_date}T00:00:00`);
      if (date.getFullYear() === year) {
        totals[date.getMonth()] += Number(expense.amount);
      }
    }

    return totals;
  }, [expenses]);

  const currentMonthTotal = useMemo(() => {
    const now = new Date();
    return expenses.reduce((acc, expense) => {
      const date = new Date(`${expense.expense_date}T00:00:00`);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() ? acc + Number(expense.amount) : acc;
    }, 0);
  }, [expenses]);

  const averageMonthlyExpense = useMemo(() => {
    const monthsWithData = monthlyTotals.filter((value) => value > 0);
    if (monthsWithData.length === 0) return 0;
    return monthsWithData.reduce((acc, value) => acc + value, 0) / monthsWithData.length;
  }, [monthlyTotals]);

  const monthlyAnalysis = useMemo(() => analyzeMonthlyExpenses(expenses), [expenses]);
  const groupedExpenses = useMemo(() => {
    const groups = new Map<
      string,
      { category: string; total: number; count: number; latestDate: string; items: ExpenseRow[] }
    >();

    for (const expense of expenses) {
      const current = groups.get(expense.category) ?? {
        category: expense.category,
        total: 0,
        count: 0,
        latestDate: expense.expense_date,
        items: []
      };

      current.total += Number(expense.amount);
      current.count += 1;
      current.items.push(expense);
      if (expense.expense_date > current.latestDate) {
        current.latestDate = expense.expense_date;
      }

      groups.set(expense.category, current);
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        items: [...group.items].sort((a, b) => b.expense_date.localeCompare(a.expense_date))
      }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);
  const selectedCategoryExpenses = useMemo(
    () => groupedExpenses.find((group) => group.category === selectedExpenseCategory) ?? null,
    [groupedExpenses, selectedExpenseCategory]
  );

  const chartData = {
    labels: MONTH_LABELS,
    datasets: [
      {
        label: "Gasto mensual",
        data: monthlyTotals,
        borderColor: "#0f766e",
        backgroundColor: "rgba(15, 118, 110, 0.16)",
        borderWidth: 3,
        tension: 0.28,
        fill: true
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#cbd5e1" } },
      y: {
        ticks: { color: "#cbd5e1", callback: (value: string | number) => formatCurrencyByPreference(Number(value), currency) },
        grid: { color: "rgba(148, 163, 184, 0.16)" }
      }
    }
  };

  const validateForm = () => {
    const nextErrors: ExpenseFormErrors = {};
    const parsedAmount = Number(amount);
    const selectedCategory = category === "Otros" ? customCategory.trim() : category;
    const parsedDate = new Date(`${expenseDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) nextErrors.amount = "El importe debe ser mayor que 0.";
    if (!selectedCategory || selectedCategory.length < 2 || selectedCategory.length > 40) nextErrors.category = "La categoria debe tener entre 2 y 40 caracteres.";
    if (Number.isNaN(parsedDate.getTime())) nextErrors.expenseDate = "La fecha es obligatoria.";
    else if (parsedDate > today) nextErrors.expenseDate = "La fecha no puede estar en el futuro.";
    if (description.trim().length > 140) nextErrors.description = "La descripcion no puede superar 140 caracteres.";

    setErrors(nextErrors);
    return { isValid: Object.keys(nextErrors).length === 0, parsedAmount, selectedCategory };
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setToast(null);

    if (!userId) {
      setMessage("Debes iniciar sesion para gestionar gastos.");
      return;
    }

    const validation = validateForm();
    if (!validation.isValid) {
      showToast({ type: "error", text: "Revisa los campos marcados antes de guardar." });
      return;
    }

    setSaving(true);

    const payload = {
      user_id: userId,
      amount: validation.parsedAmount,
      category: validation.selectedCategory,
      description: description.trim() || null,
      expense_date: expenseDate
    };

    const query = editingId
      ? supabase.from("expenses").update(payload).eq("id", editingId).eq("user_id", userId)
      : supabase.from("expenses").insert(payload);

    const { error } = await query;

    if (error) {
      setMessage(error.message);
      showToast({ type: "error", text: editingId ? "No se pudo actualizar el gasto." : "No se pudo guardar el gasto." });
      setSaving(false);
      return;
    }

    resetForm();
    await loadExpenses(userId);
    showToast({ type: "success", text: editingId ? "Gasto actualizado." : "Gasto guardado correctamente." });
    setSaving(false);
  };

  const handleEdit = (expense: ExpenseRow) => {
    setEditingId(expense.id);
    setAmount(String(expense.amount));
    if (PRESET_CATEGORIES.includes(expense.category)) {
      setCategory(expense.category);
      setCustomCategory("");
    } else {
      setCategory("Otros");
      setCustomCategory(expense.category);
    }
    setDescription(expense.description ?? "");
    setExpenseDate(expense.expense_date);
    setErrors({});
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast({ type: "success", text: "Modo edicion activado para este gasto." });
  };
  const handleDelete = async (id: string) => {
    if (!userId || !window.confirm("Se eliminara este gasto. Deseas continuar?")) {
      return;
    }

    const { error } = await supabase.from("expenses").delete().eq("id", id).eq("user_id", userId);
    if (error) {
      showToast({ type: "error", text: "No se pudo eliminar el gasto." });
      return;
    }

    if (editingId === id) {
      resetForm();
    }

    await loadExpenses(userId);
    showToast({ type: "success", text: "Gasto eliminado." });
  };

  if (authLoading) {
    return (
      <>
        <SideNav />
        <main className="mx-auto max-w-6xl p-6 md:pl-72">
          <AuthLoadingState title="Preparando gastos" description="Estamos comprobando tu sesion antes de cargar el gestor de gastos." />
        </main>
      </>
    );
  }

  return (
    <>
      <SideNav />
      <main className="page-enter relative z-10 mx-auto grid max-w-6xl gap-6 p-6 md:pl-72 xl:grid-cols-12">
        <section className="panel rounded-[30px] p-6 text-white md:p-8 xl:col-span-7">
          <p className="text-xs uppercase tracking-[0.26em] text-emerald-300">Control de gasto</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-white">Gastos con analisis accionable</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
            Registra movimientos, clasificalos, editalos cuando haga falta y detecta rapidamente en que categoria se te va mas presupuesto.
          </p>
        </section>

        <section className="rounded-[30px] border border-emerald-400/10 bg-[linear-gradient(180deg,rgba(7,19,35,0.98)_0%,rgba(9,29,48,0.98)_52%,rgba(10,63,70,0.92)_100%)] p-6 text-white shadow-[0_26px_60px_rgba(2,8,23,0.35)] xl:col-span-5">
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">Pulso del mes</p>
          <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold text-white">{formatCurrencyByPreference(currentMonthTotal, currency)}</p>
          <p className="mt-3 text-sm leading-6 text-slate-200">Gasto acumulado del mes actual con comparativa automatica frente al mes anterior.</p>
        </section>

        {toast ? (
          <section className={`rounded-[24px] p-4 text-sm xl:col-span-12 ${toast.type === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-red-200 bg-red-50 text-red-800"}`}>
            {toast.text}
          </section>
        ) : null}

        {message ? <section className="rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm text-red-800 xl:col-span-12">{message}</section> : null}

        <section ref={formRef} className={`panel rounded-[28px] p-6 text-white xl:col-span-5 ${editingId ? "ring-2 ring-teal-400/40" : ""}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Formulario</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">{editingId ? "Editar gasto" : "Nuevo gasto"}</h2>
            </div>
            {editingId ? (
              <button type="button" onClick={resetForm} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 hover:bg-white/10">
                Cancelar edicion
              </button>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4" noValidate>
            <label className="grid gap-2 text-sm text-slate-200">
              Importe
              <input className={inputClass(Boolean(errors.amount))} type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
              {errors.amount ? <span className="text-xs text-red-700">{errors.amount}</span> : null}
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              Categoria
              <select className={inputClass(Boolean(errors.category))} value={category} onChange={(e) => setCategory(e.target.value)}>
                {PRESET_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              {errors.category ? <span className="text-xs text-red-700">{errors.category}</span> : null}
            </label>

            {category === "Otros" ? (
              <label className="grid gap-2 text-sm text-slate-200">
                Categoria personalizada
                <input className={inputClass(Boolean(errors.category))} value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="Ej: Mascotas" />
              </label>
            ) : null}

            <label className="grid gap-2 text-sm text-slate-200">
              Fecha
              <input className={inputClass(Boolean(errors.expenseDate))} type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
              {errors.expenseDate ? <span className="text-xs text-red-700">{errors.expenseDate}</span> : null}
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              Descripcion
              <input className={inputClass(Boolean(errors.description))} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={140} placeholder="Opcional" />
              <span className="text-xs text-slate-400">{description.length}/140</span>
              {errors.description ? <span className="text-xs text-red-700">{errors.description}</span> : null}
            </label>

            <button className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50" disabled={saving || loading} type="submit">
              {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Anadir gasto"}
            </button>
          </form>
        </section>

        <section className="grid gap-4 xl:col-span-7 md:grid-cols-2">
          <article className="kpi-card rounded-[26px] p-6">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Mes actual</p>
            <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(currentMonthTotal, currency)}</p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Importe total de gastos del mes en curso.</p>
          </article>
          <article className="kpi-card rounded-[26px] p-6">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Media mensual</p>
            <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(averageMonthlyExpense, currency)}</p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Promedio de los meses con gasto registrado.</p>
          </article>
          <article className="kpi-card rounded-[26px] p-6 md:col-span-2">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Categoria principal</p>
            <p className="mt-4 font-[var(--font-heading)] text-3xl font-semibold leading-tight text-white">{monthlyAnalysis.topCategory?.name ?? "Sin datos"}</p>
            <p className="mt-4 max-w-[28ch] text-sm leading-6 text-slate-300">Mayor concentracion de gasto del mes actual.</p>
          </article>
        </section>

        <section className="panel rounded-[28px] p-6 text-white xl:col-span-7">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Grafico mensual</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Evolucion anual del gasto</h2>
          <div className="mt-6 h-[320px]">
            <Line data={chartData} options={chartOptions} />
          </div>
        </section>

        <section className="panel rounded-[28px] p-6 text-white xl:col-span-5">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Analisis mensual</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Lectura rapida</h2>
          <div className="mt-6 grid gap-4 text-sm text-slate-200">
            <div className="rounded-3xl border border-white/8 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Categoria con mayor gasto</p>
              <p className="mt-2 font-medium text-slate-100">
                {monthlyAnalysis.topCategory ? `${monthlyAnalysis.topCategory.name} (${formatCurrencyByPreference(monthlyAnalysis.topCategory.total, currency)})` : "Sin datos"}
              </p>
            </div>
            <div className="rounded-3xl border border-white/8 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Cambio respecto al mes anterior</p>
              <p className="mt-2 font-medium text-slate-100">
                {monthlyAnalysis.changePercentage === null
                  ? `${formatCurrencyByPreference(monthlyAnalysis.changeAmount, currency)} (sin base comparativa)`
                  : `${monthlyAnalysis.changeAmount >= 0 ? "+" : ""}${formatCurrencyByPreference(monthlyAnalysis.changeAmount, currency)} (${monthlyAnalysis.changePercentage.toFixed(1)}%)`}
              </p>
            </div>
            <div className="rounded-3xl border border-white/8 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Recomendaciones</p>
              <ul className="mt-2 grid gap-2 text-slate-100">
                {monthlyAnalysis.recommendations.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="panel rounded-[28px] p-6 text-white xl:col-span-12">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Vista por niveles</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Categorias de gasto</h2>
            </div>
            <p className="text-sm text-slate-400">Primero entras en una categoria y despues abres los gastos concretos de ese grupo.</p>
          </div>

          {loading ? <p className="mt-6 text-sm text-slate-300">Cargando gastos...</p> : null}
          {!loading && expenses.length === 0 ? <p className="mt-6 text-sm text-slate-300">Aun no tienes gastos registrados.</p> : null}

          {!loading && expenses.length > 0 ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {groupedExpenses.map((group) => (
                <button
                  key={group.category}
                  type="button"
                  onClick={() => setSelectedExpenseCategory(group.category)}
                  className="rounded-[28px] border border-white/8 bg-white/5 p-5 text-left transition hover:border-emerald-400/20 hover:bg-white/10"
                >
                  <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">{group.category}</p>
                  <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-white">{group.count}</p>
                  <p className="mt-2 text-sm text-slate-300">Gastos registrados en esta categoria.</p>
                  <div className="mt-5 grid gap-2 text-sm text-slate-300">
                    <p>Total: <span className="font-medium text-white">{formatCurrencyByPreference(group.total, currency)}</span></p>
                    <p>Ultimo movimiento: <span className="font-medium text-white">{formatDateByPreference(group.latestDate, dateFormat)}</span></p>
                  </div>
                  <div className="mt-5 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                    Ver gastos
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      </main>

      {selectedCategoryExpenses ? (
        <>
          <button type="button" className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-[2px]" onClick={() => setSelectedExpenseCategory(null)} />
          <aside className="fixed right-4 top-4 z-40 h-[calc(100vh-2rem)] w-[min(92vw,840px)] rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,#020817_0%,#071427_56%,#0a1d31_100%)] p-6 text-white shadow-[0_30px_80px_rgba(2,8,23,0.58)]">
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">Categoria</p>
                  <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">{selectedCategoryExpenses.category}</h2>
                  <p className="mt-2 text-sm text-slate-300">
                    {selectedCategoryExpenses.count} movimientos · {formatCurrencyByPreference(selectedCategoryExpenses.total, currency)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedExpenseCategory(null)}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 hover:bg-white/10"
                >
                  Cerrar
                </button>
              </div>

              <div className="table-scroll mt-6 flex-1 pr-1">
                <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="sticky-col-header px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Descripcion</th>
                      <th className="px-3 py-2 text-right">Importe</th>
                      <th className="px-3 py-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCategoryExpenses.items.map((expense) => (
                      <tr key={expense.id} className="bg-white/5 shadow-sm">
                        <td className="sticky-col rounded-l-2xl px-3 py-4 text-slate-300">
                          {formatDateByPreference(expense.expense_date, dateFormat)}
                        </td>
                        <td className="px-3 py-4 text-slate-300">{expense.description ?? "-"}</td>
                        <td className="px-3 py-4 text-right font-medium text-slate-100">
                          {formatCurrencyByPreference(Number(expense.amount), currency)}
                        </td>
                        <td className="rounded-r-2xl px-3 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedExpenseCategory(null);
                                handleEdit(expense);
                              }}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-white/10"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(expense.id)}
                              className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-500/20"
                            >
                              Borrar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}

