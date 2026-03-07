"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
import { analyzeMonthlyExpenses } from "@/lib/expenses-analysis";
import SideNav from "@/components/side-nav";

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
  return `rounded border p-2 ${hasError ? "border-red-600" : "border-slate-300"}`;
}

export default function ExpensesPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(PRESET_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [errors, setErrors] = useState<ExpenseFormErrors>({});
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        setMessage("No hay sesion activa. Inicia sesion para gestionar gastos.");
        setLoading(false);
        return;
      }

      setUserId(data.user.id);
      await loadExpenses(data.user.id);
      setLoading(false);
    };

    void init();
  }, [loadExpenses, supabase]);

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

  const monthlyAnalysis = useMemo(() => analyzeMonthlyExpenses(expenses), [expenses]);

  const chartData = {
    labels: MONTH_LABELS,
    datasets: [
      {
        label: "Gasto mensual",
        data: monthlyTotals,
        borderColor: "#0f766e",
        backgroundColor: "rgba(15, 118, 110, 0.2)",
        borderWidth: 3,
        tension: 0.25,
        fill: true
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        display: true
      }
    }
  };

  const validateForm = () => {
    const nextErrors: ExpenseFormErrors = {};

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      nextErrors.amount = "El importe debe ser mayor que 0.";
    } else if (parsedAmount > 1_000_000) {
      nextErrors.amount = "El importe no puede superar 1.000.000.";
    }

    const selectedCategory = category === "Otros" ? customCategory.trim() : category;
    if (!selectedCategory) {
      nextErrors.category = "Selecciona una categoria valida.";
    } else if (selectedCategory.length < 2 || selectedCategory.length > 40) {
      nextErrors.category = "La categoria debe tener entre 2 y 40 caracteres.";
    }

    const parsedDate = new Date(`${expenseDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (Number.isNaN(parsedDate.getTime())) {
      nextErrors.expenseDate = "La fecha es obligatoria.";
    } else if (parsedDate > today) {
      nextErrors.expenseDate = "La fecha no puede estar en el futuro.";
    }

    if (description.trim().length > 140) {
      nextErrors.description = "La descripcion no puede superar 140 caracteres.";
    }

    setErrors(nextErrors);

    return {
      isValid: Object.keys(nextErrors).length === 0,
      parsedAmount,
      selectedCategory
    };
  };

  const validateField = (field: keyof ExpenseFormErrors) => {
    const parsedAmount = Number(amount);
    const selectedCategory = category === "Otros" ? customCategory.trim() : category;
    const parsedDate = new Date(`${expenseDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let error: string | undefined;

    if (field === "amount") {
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) error = "El importe debe ser mayor que 0.";
      else if (parsedAmount > 1_000_000) error = "El importe no puede superar 1.000.000.";
    }

    if (field === "category") {
      if (!selectedCategory) error = "Selecciona una categoria valida.";
      else if (selectedCategory.length < 2 || selectedCategory.length > 40) {
        error = "La categoria debe tener entre 2 y 40 caracteres.";
      }
    }

    if (field === "expenseDate") {
      if (Number.isNaN(parsedDate.getTime())) error = "La fecha es obligatoria.";
      else if (parsedDate > today) error = "La fecha no puede estar en el futuro.";
    }

    if (field === "description") {
      if (description.trim().length > 140) error = "La descripcion no puede superar 140 caracteres.";
    }

    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setToast(null);

    if (!userId) {
      setMessage("Debes iniciar sesion para anadir gastos.");
      return;
    }

    const validation = validateForm();
    if (!validation.isValid) {
      setToast({ type: "error", text: "Revisa los campos marcados en rojo." });
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("expenses").insert({
      user_id: userId,
      amount: validation.parsedAmount,
      category: validation.selectedCategory,
      description: description.trim() || null,
      expense_date: expenseDate
    });

    if (error) {
      setMessage(error.message);
      setToast({ type: "error", text: "No se pudo guardar el gasto." });
      setSaving(false);
      return;
    }

    setAmount("");
    setDescription("");
    setCustomCategory("");
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setErrors({});
    setToast({ type: "success", text: "Gasto guardado correctamente." });
    window.setTimeout(() => setToast(null), 3000);
    await loadExpenses(userId);
    setSaving(false);
  };

  return (
    <>
      <SideNav />
      <main className="mx-auto grid max-w-5xl gap-6 p-6 md:pl-60 md:grid-cols-2">
      <section className="rounded-lg border bg-white p-4">
        <h1 className="mb-4 text-2xl font-semibold">Gastos</h1>
        {toast ? (
          <p className={`mb-3 rounded p-2 text-sm ${toast.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {toast.text}
          </p>
        ) : null}
        <form onSubmit={handleSubmit} className="grid gap-3" noValidate>
          <label className="grid gap-1 text-sm">
            Importe
            <input
              className={inputClass(Boolean(errors.amount))}
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => validateField("amount")}
              required
            />
            {errors.amount ? <span className="text-xs text-red-700">{errors.amount}</span> : null}
          </label>

          <label className="grid gap-1 text-sm">
            Categoria
            <select
              className={inputClass(Boolean(errors.category))}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onBlur={() => validateField("category")}
            >
              {PRESET_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            {errors.category ? <span className="text-xs text-red-700">{errors.category}</span> : null}
          </label>

          {category === "Otros" ? (
            <label className="grid gap-1 text-sm">
              Categoria personalizada
              <input
                className={inputClass(Boolean(errors.category))}
                type="text"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                onBlur={() => validateField("category")}
                placeholder="Ej: Mascotas"
                required
              />
            </label>
          ) : null}

          <label className="grid gap-1 text-sm">
            Fecha
            <input
              className={inputClass(Boolean(errors.expenseDate))}
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              onBlur={() => validateField("expenseDate")}
              required
            />
            {errors.expenseDate ? <span className="text-xs text-red-700">{errors.expenseDate}</span> : null}
          </label>

          <label className="grid gap-1 text-sm">
            Descripcion
            <input
              className={inputClass(Boolean(errors.description))}
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => validateField("description")}
              placeholder="Opcional"
              maxLength={140}
            />
            <span className="text-xs text-slate-500">{description.length}/140</span>
            {errors.description ? <span className="text-xs text-red-700">{errors.description}</span> : null}
          </label>

          <button
            className="rounded bg-teal-700 px-3 py-2 text-white disabled:opacity-50"
            disabled={saving || loading}
            type="submit"
          >
            {saving ? "Guardando..." : "Anadir gasto"}
          </button>
        </form>

        {message ? <p className="mt-3 text-sm text-red-700">{message}</p> : null}
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-4 text-xl font-semibold">Grafico mensual ({new Date().getFullYear()})</h2>
        <Line data={chartData} options={chartOptions} />
      </section>

      <section className="rounded-lg border bg-white p-4 md:col-span-2">
        <h2 className="mb-4 text-xl font-semibold">Analisis mensual</h2>
        <div className="grid gap-2 text-sm">
          <p>
            <strong>Categoria con mayor gasto:</strong>{" "}
            {monthlyAnalysis.topCategory
              ? `${monthlyAnalysis.topCategory.name} (${monthlyAnalysis.topCategory.total.toFixed(2)} EUR)`
              : "Sin datos"}
          </p>
          <p>
            <strong>Cambio respecto al mes anterior:</strong>{" "}
            {monthlyAnalysis.changePercentage === null
              ? `${monthlyAnalysis.changeAmount.toFixed(2)} EUR (sin base comparativa)`
              : `${monthlyAnalysis.changeAmount >= 0 ? "+" : ""}${monthlyAnalysis.changeAmount.toFixed(2)} EUR (${monthlyAnalysis.changePercentage.toFixed(1)}%)`}
          </p>
          <div>
            <strong>Recomendaciones de ahorro:</strong>
            <ul className="ml-5 list-disc">
              {monthlyAnalysis.recommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4 md:col-span-2">
        <h2 className="mb-4 text-xl font-semibold">Ultimos gastos</h2>
        {loading ? <p>Cargando...</p> : null}
        {!loading && expenses.length === 0 ? <p>Aun no tienes gastos registrados.</p> : null}
        {!loading && expenses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="p-2">Fecha</th>
                  <th className="p-2">Categoria</th>
                  <th className="p-2">Descripcion</th>
                  <th className="p-2 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {expenses.slice(0, 20).map((expense) => (
                  <tr key={expense.id} className="border-b">
                    <td className="p-2">{expense.expense_date}</td>
                    <td className="p-2">{expense.category}</td>
                    <td className="p-2">{expense.description ?? "-"}</td>
                    <td className="p-2 text-right">{Number(expense.amount).toFixed(2)} EUR</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      </main>
    </>
  );
}