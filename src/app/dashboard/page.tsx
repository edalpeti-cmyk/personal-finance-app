"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Chart as ChartJS,
  CategoryScale,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  TooltipItem
} from "chart.js";
import { Line } from "react-chartjs-2";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/supabase/use-auth-guard";
import AuthLoadingState from "@/components/auth-loading-state";
import SideNav from "@/components/side-nav";

type ExpenseRow = { amount: number; expense_date: string };
type IncomeRow = { amount: number; income_date: string };
type InvestmentRow = { quantity: number; average_buy_price: number; current_price: number | null };
type CashflowEvent = { date: string; delta: number };
type TimelinePoint = { label: string; value: number };
type ChartRange = "daily" | "monthly" | "annual" | "six_months" | "current_year";

type DashboardMetrics = {
  totalNetWorth: number;
  savingsRate: number | null;
  fireTarget: number;
  fireProgress: number;
  yearsToFire: number | null;
  annualExpenses: number;
  annualSavings: number;
};

const RANGE_OPTIONS: Array<{ value: ChartRange; label: string }> = [
  { value: "daily", label: "Diaria" },
  { value: "monthly", label: "Mensual" },
  { value: "annual", label: "Anual" },
  { value: "six_months", label: "6 meses" },
  { value: "current_year", label: "Ano actual" }
];

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

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

function estimateYearsToFire(current: number, target: number, annualContribution: number, expectedReturn = 0.05) {
  if (current >= target) return 0;
  if (annualContribution <= 0) return null;

  let value = current;
  const maxYears = 100;

  for (let year = 1; year <= maxYears; year++) {
    value = value * (1 + expectedReturn) + annualContribution;
    if (value >= target) {
      return year;
    }
  }

  return null;
}

function formatCurrency(value: number) {
  return `${value.toFixed(2)} EUR`;
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function formatMonth(date: Date) {
  return date.toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
}

function formatYear(date: Date) {
  return date.getFullYear().toString();
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function endOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function endOfYear(date: Date) {
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
}

function normalizeDate(dateString: string) {
  return new Date(`${dateString}T00:00:00`);
}

function buildCashflowEvents(incomeRows: IncomeRow[], expenseRows: ExpenseRow[]) {
  const incomeEvents: CashflowEvent[] = incomeRows.map((row) => ({
    date: row.income_date,
    delta: Number(row.amount) || 0
  }));

  const expenseEvents: CashflowEvent[] = expenseRows.map((row) => ({
    date: row.expense_date,
    delta: -(Number(row.amount) || 0)
  }));

  return [...incomeEvents, ...expenseEvents].sort((a, b) => a.date.localeCompare(b.date));
}

function buildTimelinePoints(events: CashflowEvent[], range: ChartRange) {
  if (events.length === 0) {
    return [] as TimelinePoint[];
  }

  const deltasByDate = new Map<string, number>();
  for (const event of events) {
    deltasByDate.set(event.date, (deltasByDate.get(event.date) ?? 0) + event.delta);
  }

  const now = new Date();
  const sortedDates = Array.from(deltasByDate.keys()).sort();
  const firstEventDate = normalizeDate(sortedDates[0]);

  const checkpoints: Array<{ date: Date; label: string }> = [];

  if (range === "daily") {
    const start = addDays(now, -29);
    for (let cursor = new Date(start); cursor <= now; cursor = addDays(cursor, 1)) {
      checkpoints.push({ date: endOfDay(cursor), label: formatShortDate(cursor) });
    }
  }

  if (range === "monthly") {
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    for (let cursor = new Date(start); cursor <= now; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
      checkpoints.push({ date: endOfMonth(cursor), label: formatMonth(cursor) });
    }
  }

  if (range === "six_months") {
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    for (let cursor = new Date(start); cursor <= now; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
      checkpoints.push({ date: endOfMonth(cursor), label: formatMonth(cursor) });
    }
  }

  if (range === "current_year") {
    const start = new Date(now.getFullYear(), 0, 1);
    for (let cursor = new Date(start); cursor <= now; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
      checkpoints.push({ date: endOfMonth(cursor), label: formatMonth(cursor) });
    }
  }

  if (range === "annual") {
    const startYear = Math.max(firstEventDate.getFullYear(), now.getFullYear() - 4);
    for (let year = startYear; year <= now.getFullYear(); year++) {
      const date = endOfYear(new Date(year, 0, 1));
      checkpoints.push({ date, label: formatYear(date) });
    }
  }

  let runningValue = 0;
  let eventIndex = 0;

  const points: TimelinePoint[] = [];
  for (const checkpoint of checkpoints) {
    while (eventIndex < events.length && normalizeDate(events[eventIndex].date) <= checkpoint.date) {
      runningValue += events[eventIndex].delta;
      eventIndex += 1;
    }

    points.push({
      label: checkpoint.label,
      value: Number(runningValue.toFixed(2))
    });
  }

  return points;
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const { userId, authLoading } = useAuthGuard();

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  const [chartRange, setChartRange] = useState<ChartRange>("monthly");

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSource, setAiSource] = useState<string | null>(null);
  const [aiInsights, setAiInsights] = useState<string[]>([]);
  const [aiAutoGenerated, setAiAutoGenerated] = useState(false);

  const hasFinancialData = Boolean(
    metrics && (metrics.totalNetWorth > 0 || metrics.annualExpenses > 0 || metrics.annualSavings !== 0)
  );

  const cashflowEvents = useMemo(() => buildCashflowEvents(incomeRows, expenseRows), [incomeRows, expenseRows]);
  const netWorthTimeline = useMemo(() => buildTimelinePoints(cashflowEvents, chartRange), [cashflowEvents, chartRange]);

  const timelineChartData = useMemo(
    () => ({
      labels: netWorthTimeline.map((point: TimelinePoint) => point.label),
      datasets: [
        {
          label: "Patrimonio estimado",
          data: netWorthTimeline.map((point: TimelinePoint) => point.value),
          borderColor: "#0f766e",
          backgroundColor: "rgba(15, 118, 110, 0.16)",
          fill: true,
          tension: 0.28,
          borderWidth: 3,
          pointRadius: chartRange === "daily" ? 2 : 3,
          pointHoverRadius: 5
        }
      ]
    }),
    [chartRange, netWorthTimeline]
  );

  const timelineChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context: TooltipItem<"line">) => ` ${formatCurrency(Number(context.parsed.y ?? 0))}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#5f6d69" }
        },
        y: {
          grid: { color: "rgba(24, 34, 34, 0.08)" },
          ticks: {
            color: "#5f6d69",
            callback: (value: string | number) => `${Number(value).toFixed(0)} EUR`
          }
        }
      }
    }),
    []
  );

  const generateInsights = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);

    try {
      const response = await fetch("/api/ai-insights", {
        method: "POST",
        credentials: "include",
        cache: "no-store"
      });

      if (!response.ok) {
        setAiError("No se pudieron generar insights en este momento.");
        setAiLoading(false);
        return;
      }

      const data = (await response.json()) as { source?: string; insights?: string[] };
      setAiSource(data.source ?? "unknown");
      setAiInsights(Array.isArray(data.insights) ? data.insights : []);
      setAiLoading(false);
    } catch {
      setAiError("Error de red al generar insights.");
      setAiLoading(false);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setMessage(null);

      if (authLoading || !userId) {
        return;
      }

      const [expensesResult, incomeResult, investmentsResult] = await Promise.all([
        supabase.from("expenses").select("amount, expense_date").eq("user_id", userId),
        supabase.from("income").select("amount, income_date").eq("user_id", userId),
        supabase.from("investments").select("quantity, average_buy_price, current_price").eq("user_id", userId)
      ]);

      if (expensesResult.error || incomeResult.error || investmentsResult.error) {
        setMessage(
          expensesResult.error?.message ||
            incomeResult.error?.message ||
            investmentsResult.error?.message ||
            "Error al cargar datos."
        );
        setLoading(false);
        return;
      }

      const now = new Date();
      const nextExpenseRows = (expensesResult.data as ExpenseRow[]) ?? [];
      const nextIncomeRows = (incomeResult.data as IncomeRow[]) ?? [];
      const investmentRows = (investmentsResult.data as InvestmentRow[]) ?? [];

      setExpenseRows(nextExpenseRows);
      setIncomeRows(nextIncomeRows);

      const totalNetWorth = investmentRows.reduce((acc, row) => {
        const qty = Number(row.quantity) || 0;
        const price = Number(row.current_price ?? row.average_buy_price) || 0;
        return acc + qty * price;
      }, 0);

      const monthExpenses = nextExpenseRows.reduce(
        (acc, row) => (isSameMonth(row.expense_date, now) ? acc + Number(row.amount) : acc),
        0
      );
      const monthIncome = nextIncomeRows.reduce(
        (acc, row) => (isSameMonth(row.income_date, now) ? acc + Number(row.amount) : acc),
        0
      );
      const savingsRate = monthIncome > 0 ? ((monthIncome - monthExpenses) / monthIncome) * 100 : null;

      const annualExpenses = nextExpenseRows.reduce(
        (acc, row) => (isWithinLast12Months(row.expense_date, now) ? acc + Number(row.amount) : acc),
        0
      );
      const annualIncome = nextIncomeRows.reduce(
        (acc, row) => (isWithinLast12Months(row.income_date, now) ? acc + Number(row.amount) : acc),
        0
      );
      const annualSavings = annualIncome - annualExpenses;

      const fireTarget = annualExpenses > 0 ? annualExpenses / 0.04 : 0;
      const fireProgress = fireTarget > 0 ? Math.min((totalNetWorth / fireTarget) * 100, 100) : 0;
      const yearsToFire = fireTarget > 0 ? estimateYearsToFire(totalNetWorth, fireTarget, Math.max(annualSavings, 0), 0.05) : null;

      setMetrics({
        totalNetWorth,
        savingsRate,
        fireTarget,
        fireProgress,
        yearsToFire,
        annualExpenses,
        annualSavings
      });
      setLoading(false);
    };

    void run();
  }, [authLoading, supabase, userId]);

  useEffect(() => {
    if (!loading && !message && metrics && !aiAutoGenerated && hasFinancialData) {
      setAiAutoGenerated(true);
      void generateInsights();
    }
  }, [loading, message, metrics, aiAutoGenerated, generateInsights, hasFinancialData]);

  if (authLoading) {
    return (
      <>
        <SideNav />
        <main className="mx-auto max-w-6xl p-6 md:pl-72">
          <AuthLoadingState title="Preparando dashboard" description="Estamos validando tu sesion y cargando tu resumen financiero." />
        </main>
      </>
    );
  }

  return (
    <>
      <SideNav />
      <main className="page-enter relative z-10 mx-auto grid max-w-6xl gap-6 p-6 md:grid-cols-2 md:pl-72 xl:grid-cols-12">
        <section className="panel rounded-[30px] p-6 md:col-span-2 md:p-8 xl:col-span-7">
          <p className="font-[var(--font-heading)] text-xs uppercase tracking-[0.26em] text-teal-700">Vista general</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-slate-950">Tu sistema financiero, de un vistazo</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
            Patrimonio, ahorro, progreso FIRE e ideas accionables en una sola pantalla para decidir con rapidez.
          </p>
        </section>

        <section className="rounded-[30px] bg-[linear-gradient(135deg,#134e4a_0%,#0f766e_55%,#14b8a6_100%)] p-6 text-white shadow-[0_24px_60px_rgba(15,118,110,0.26)] md:col-span-2 xl:col-span-5">
          <p className="text-xs uppercase tracking-[0.26em] text-emerald-100/80">Momentum actual</p>
          <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold">{metrics ? formatCurrency(metrics.totalNetWorth) : "--"}</p>
          <p className="mt-2 max-w-sm text-sm text-emerald-50/88">Patrimonio estimado con tus posiciones registradas y una lectura rapida del avance hacia independencia.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/12 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-100/70">Tasa de ahorro</p>
              <p className="mt-2 text-2xl font-semibold">{metrics && metrics.savingsRate !== null ? `${metrics.savingsRate.toFixed(2)}%` : "Sin datos"}</p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-100/70">Anos estimados</p>
              <p className="mt-2 text-2xl font-semibold">{metrics && metrics.yearsToFire !== null ? metrics.yearsToFire : "--"}</p>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="panel rounded-[28px] p-6 md:col-span-2 xl:col-span-12">
            <p className="text-sm text-slate-600">Cargando metricas financieras...</p>
          </section>
        ) : null}

        {message ? (
          <section className="panel rounded-[28px] border-red-200 bg-red-50/90 p-6 text-red-800 md:col-span-2 xl:col-span-12">
            {message}
          </section>
        ) : null}

        {!loading && !message && metrics ? (
          <>
            {!hasFinancialData ? (
              <section className="rounded-[28px] border border-amber-200 bg-amber-50/95 p-6 text-amber-900 md:col-span-2 xl:col-span-12">
                Aun no hay datos suficientes para un analisis completo. Registra ingresos, gastos o inversiones para activar todas las metricas.
              </section>
            ) : null}

            <section className="kpi-card rounded-[28px] p-6 md:col-span-1 xl:col-span-3">
              <p className="text-xs uppercase tracking-[0.22em] text-teal-700">Patrimonio total</p>
              <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-slate-950">{formatCurrency(metrics.totalNetWorth)}</p>
              <p className="mt-3 text-sm text-slate-600">Suma estimada de tus inversiones registradas.</p>
            </section>

            <section className="kpi-card rounded-[28px] p-6 md:col-span-1 xl:col-span-3">
              <p className="text-xs uppercase tracking-[0.22em] text-teal-700">Tasa de ahorro</p>
              <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-slate-950">
                {metrics.savingsRate === null ? "Sin datos" : `${metrics.savingsRate.toFixed(2)}%`}
              </p>
              <p className="mt-3 text-sm text-slate-600">Basada en ingresos y gastos del mes actual.</p>
            </section>

            <section className="kpi-card rounded-[28px] p-6 md:col-span-1 xl:col-span-3">
              <p className="text-xs uppercase tracking-[0.22em] text-teal-700">Ahorro anual</p>
              <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-slate-950">{formatCurrency(metrics.annualSavings)}</p>
              <p className="mt-3 text-sm text-slate-600">Ingresos anuales recientes menos gastos anuales recientes.</p>
            </section>

            <section className="kpi-card rounded-[28px] p-6 md:col-span-1 xl:col-span-3">
              <p className="text-xs uppercase tracking-[0.22em] text-teal-700">Objetivo FIRE</p>
              <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-slate-950">
                {metrics.fireTarget > 0 ? formatCurrency(metrics.fireTarget) : "Sin calcular"}
              </p>
              <p className="mt-3 text-sm text-slate-600">Calculado con la regla del 4% sobre tus gastos anuales.</p>
            </section>

            <section className="panel rounded-[28px] p-6 md:col-span-2 xl:col-span-12">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-teal-700">Evolucion del patrimonio</p>
                  <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-slate-950">Patrimonio estimado por periodos</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    Estimacion basada en ingresos menos gastos acumulados. Sirve como lectura rapida de tendencia diaria, mensual y anual.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {RANGE_OPTIONS.map((option) => {
                    const active = chartRange === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setChartRange(option.value)}
                        className={`rounded-full px-4 py-2 text-sm transition ${
                          active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 h-[320px]">
                {netWorthTimeline.length > 0 ? (
                  <Line data={timelineChartData} options={timelineChartOptions} />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-white/60 text-sm text-slate-500">
                    Aun no hay suficientes ingresos y gastos registrados para dibujar la evolucion del patrimonio.
                  </div>
                )}
              </div>
            </section>

            <section className="panel rounded-[28px] p-6 md:col-span-2 xl:col-span-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-teal-700">Progreso FIRE</p>
                  <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-slate-950">Camino hacia libertad financiera</h2>
                </div>
                <p className="rounded-full bg-teal-700 px-3 py-1 text-sm font-medium text-white">{metrics.fireProgress.toFixed(2)}%</p>
              </div>

              <div className="mt-6 h-5 overflow-hidden rounded-full bg-slate-200/80">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e_0%,#14b8a6_100%)] transition-all duration-500"
                  style={{ width: `${metrics.fireProgress.toFixed(2)}%` }}
                />
              </div>

              <div className="mt-5 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                <p>Objetivo estimado: <span className="font-medium text-slate-900">{metrics.fireTarget > 0 ? formatCurrency(metrics.fireTarget) : "Sin calcular"}</span></p>
                <p>Rentabilidad asumida: <span className="font-medium text-slate-900">5% anual</span></p>
              </div>
            </section>

            <section className="panel rounded-[28px] p-6 md:col-span-2 xl:col-span-5">
              <p className="text-xs uppercase tracking-[0.22em] text-teal-700">Horizonte</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-slate-950">Anos estimados para independencia</h2>
              <p className="mt-5 font-[var(--font-heading)] text-4xl font-semibold text-slate-950">
                {metrics.fireTarget <= 0
                  ? "No calculable"
                  : metrics.yearsToFire === null
                    ? "No alcanzable"
                    : `${metrics.yearsToFire} anos`}
              </p>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                La estimacion usa tus gastos anuales recientes, ahorro anual positivo y una rentabilidad esperada del 5%.
              </p>
            </section>

            <section className="panel rounded-[28px] p-6 md:col-span-2 xl:col-span-12">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-teal-700">IA financiera</p>
                  <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-slate-950">Lectura automatica de tus habitos</h2>
                </div>
                <button
                  className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={generateInsights}
                  disabled={aiLoading || !hasFinancialData}
                  type="button"
                >
                  {aiLoading ? "Analizando..." : "Regenerar insights IA"}
                </button>
              </div>

              {!hasFinancialData ? (
                <p className="mt-4 text-sm text-slate-600">Sin datos financieros suficientes para generar insights utiles.</p>
              ) : null}
              {aiError ? <p className="mt-4 text-sm text-red-700">{aiError}</p> : null}
              {!aiError && aiInsights.length === 0 && hasFinancialData ? (
                <p className="mt-4 text-sm text-slate-600">Generando recomendaciones personalizadas...</p>
              ) : null}

              {aiInsights.length > 0 ? (
                <>
                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    {aiInsights.map((insight: string) => (
                      <article key={insight} className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
                        <p className="text-sm leading-6 text-slate-700">{insight}</p>
                      </article>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-slate-500">
                    Fuente: {aiSource === "openai" ? "modelo OpenAI" : "motor local de reglas"}. No es consejo financiero profesional.
                  </p>
                </>
              ) : null}
            </section>
          </>
        ) : null}
      </main>
    </>
  );
}






