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
import { useTheme } from "@/components/theme-provider";
import { formatCurrencyByPreference, formatDateByPreference } from "@/lib/preferences-format";
import { AssetCurrency, convertToEur, FALLBACK_RATES_TO_EUR } from "@/lib/currency-rates";

type ExpenseRow = { amount: number; expense_date: string };
type IncomeRow = { amount: number; income_date: string };
type InvestmentRow = { quantity: number; average_buy_price: number; current_price: number | null; asset_currency: AssetCurrency | null };
type SnapshotRow = { snapshot_date: string; total_net_worth: number };
type SavingsTargetRow = { savings_target: number; month: string };
type FireSettingsRow = {
  annual_expenses: number;
  current_net_worth: number;
  annual_contribution: number;
  expected_return: number;
  current_age: number;
};
type CashflowEvent = { date: string; delta: number };
type TimelinePoint = { label: string; value: number };
type ChartRange = "daily" | "weekly" | "monthly" | "annual" | "six_months" | "current_year";

type DashboardMetrics = {
  totalNetWorth: number;
  savingsRate: number | null;
  fireTarget: number;
  fireProgress: number;
  yearsToFire: number | null;
  annualExpenses: number;
  annualSavings: number;
  cashPosition: number;
  investmentsValue: number;
};
type AiInsightDebug = {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySavingsTarget: number;
  annualIncome: number;
  annualExpenses: number;
  annualSavings: number;
  savingsRate: number | null;
  hasAnyIncome: boolean;
  hasCurrentMonthIncome: boolean;
  netWorth: number;
  fireTarget: number;
  fireProgress: number;
};

const RANGE_OPTIONS: Array<{ value: ChartRange; label: string }> = [
  { value: "daily", label: "Diaria" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensual" },
  { value: "six_months", label: "6 meses" },
  { value: "annual", label: "Anual" },
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

function isCurrentYear(dateString: string, now: Date) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.getFullYear() === now.getFullYear();
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

function getRangeCheckpoints(range: ChartRange, firstDate: Date, dateFormat: "es" | "us") {
  const now = new Date();
  const checkpoints: Array<{ date: Date; label: string }> = [];

  if (range === "daily") {
    const start = addDays(now, -29);
    for (let cursor = new Date(start); cursor <= now; cursor = addDays(cursor, 1)) {
      checkpoints.push({ date: endOfDay(cursor), label: formatDateByPreference(cursor, dateFormat, { day: "2-digit", month: "short" }) });
    }
  }

  if (range === "weekly") {
    const start = addDays(now, -83);
    for (let cursor = new Date(start); cursor <= now; cursor = addDays(cursor, 7)) {
      checkpoints.push({ date: endOfDay(cursor), label: formatDateByPreference(cursor, dateFormat, { day: "2-digit", month: "short" }) });
    }
  }

  if (range === "monthly") {
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    for (let cursor = new Date(start); cursor <= now; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
      checkpoints.push({ date: endOfMonth(cursor), label: formatDateByPreference(cursor, dateFormat, { month: "short", year: "2-digit" }) });
    }
  }

  if (range === "six_months") {
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    for (let cursor = new Date(start); cursor <= now; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
      checkpoints.push({ date: endOfMonth(cursor), label: formatDateByPreference(cursor, dateFormat, { month: "short", year: "2-digit" }) });
    }
  }

  if (range === "current_year") {
    const start = new Date(now.getFullYear(), 0, 1);
    for (let cursor = new Date(start); cursor <= now; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
      checkpoints.push({ date: endOfMonth(cursor), label: formatDateByPreference(cursor, dateFormat, { month: "short", year: "2-digit" }) });
    }
  }

  if (range === "annual") {
    const startYear = Math.max(firstDate.getFullYear(), now.getFullYear() - 4);
    for (let year = startYear; year <= now.getFullYear(); year++) {
      const date = endOfYear(new Date(year, 0, 1));
      checkpoints.push({ date, label: formatYear(date) });
    }
  }

  return checkpoints;
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

function buildCashflowTimeline(events: CashflowEvent[], range: ChartRange, dateFormat: "es" | "us") {
  if (events.length === 0) {
    return [] as TimelinePoint[];
  }

  const checkpoints = getRangeCheckpoints(range, normalizeDate(events[0].date), dateFormat);
  let runningValue = 0;
  let eventIndex = 0;

  const points: TimelinePoint[] = [];
  for (const checkpoint of checkpoints) {
    while (eventIndex < events.length && normalizeDate(events[eventIndex].date) <= checkpoint.date) {
      runningValue += events[eventIndex].delta;
      eventIndex += 1;
    }

    points.push({ label: checkpoint.label, value: Number(runningValue.toFixed(2)) });
  }

  return points;
}

function buildSnapshotTimeline(snapshots: SnapshotRow[], range: ChartRange, dateFormat: "es" | "us") {
  if (snapshots.length === 0) {
    return [] as TimelinePoint[];
  }

  const checkpoints = getRangeCheckpoints(range, normalizeDate(snapshots[0].snapshot_date), dateFormat);
  let snapshotIndex = 0;
  let latestValue = Number(snapshots[0].total_net_worth) || 0;

  const points: TimelinePoint[] = [];
  for (const checkpoint of checkpoints) {
    while (snapshotIndex < snapshots.length && normalizeDate(snapshots[snapshotIndex].snapshot_date) <= checkpoint.date) {
      latestValue = Number(snapshots[snapshotIndex].total_net_worth) || 0;
      snapshotIndex += 1;
    }

    points.push({ label: checkpoint.label, value: Number(latestValue.toFixed(2)) });
  }

  return points;
}

function getVariationStartDate(range: ChartRange, now: Date) {
  if (range === "daily") return addDays(now, -1);
  if (range === "weekly") return addDays(now, -7);
  if (range === "monthly") return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  if (range === "six_months") return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
  if (range === "annual") return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  return new Date(now.getFullYear(), 0, 1);
}

function getCashflowValueAtDate(events: CashflowEvent[], checkpoint: Date) {
  let total = 0;
  for (const event of events) {
    if (normalizeDate(event.date) <= checkpoint) {
      total += event.delta;
    }
  }
  return total;
}

function getSnapshotValueAtDate(snapshots: SnapshotRow[], checkpoint: Date) {
  let latestValue = Number(snapshots[0]?.total_net_worth ?? 0);
  for (const snapshot of snapshots) {
    if (normalizeDate(snapshot.snapshot_date) <= checkpoint) {
      latestValue = Number(snapshot.total_net_worth) || 0;
    } else {
      break;
    }
  }
  return latestValue;
}

function calculateRangeVariationPct(
  range: ChartRange,
  snapshots: SnapshotRow[],
  events: CashflowEvent[]
) {
  const now = new Date();
  const endDate = endOfDay(now);
  const startDate = getVariationStartDate(range, now);
  const useSnapshots = snapshots.length > 1;

  const startValue = useSnapshots ? getSnapshotValueAtDate(snapshots, startDate) : getCashflowValueAtDate(events, startDate);
  const endValue = useSnapshots ? getSnapshotValueAtDate(snapshots, endDate) : getCashflowValueAtDate(events, endDate);

  if (startValue === 0) {
    return endValue === 0 ? 0 : null;
  }

  return ((endValue - startValue) / Math.abs(startValue)) * 100;
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const { userId, authLoading } = useAuthGuard();
  const { currency, dateFormat } = useTheme();

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  const [snapshotRows, setSnapshotRows] = useState<SnapshotRow[]>([]);
  const [chartRange, setChartRange] = useState<ChartRange>("monthly");

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSource, setAiSource] = useState<string | null>(null);
  const [aiInsights, setAiInsights] = useState<string[]>([]);
  const [aiDebug, setAiDebug] = useState<AiInsightDebug | null>(null);
  const [aiAutoGenerated, setAiAutoGenerated] = useState(false);

  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);
  const [ratesToEur, setRatesToEur] = useState<Record<AssetCurrency, number>>(FALLBACK_RATES_TO_EUR);

  const hasFinancialData = Boolean(
    metrics && (metrics.totalNetWorth > 0 || metrics.annualExpenses > 0 || metrics.annualSavings !== 0)
  );

  const cashflowEvents = useMemo(() => buildCashflowEvents(incomeRows, expenseRows), [incomeRows, expenseRows]);
  const timelinePoints = useMemo(() => {
    if (snapshotRows.length > 1) {
      return buildSnapshotTimeline(snapshotRows, chartRange, dateFormat);
    }

    return buildCashflowTimeline(cashflowEvents, chartRange, dateFormat);
  }, [cashflowEvents, chartRange, dateFormat, snapshotRows]);

  const timelineRangeVariations = useMemo(() => {
    return Object.fromEntries(
      RANGE_OPTIONS.map((option) => [option.value, calculateRangeVariationPct(option.value, snapshotRows, cashflowEvents)])
    ) as Record<ChartRange, number | null>;
  }, [cashflowEvents, snapshotRows]);

  const timelineChartData = useMemo(
    () => ({
      labels: timelinePoints.map((point: TimelinePoint) => point.label),
      datasets: [
        {
          label: snapshotRows.length > 1 ? "Patrimonio real guardado" : "Patrimonio estimado",
          data: timelinePoints.map((point: TimelinePoint) => point.value),
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
    [chartRange, snapshotRows.length, timelinePoints]
  );

  const timelineChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context: TooltipItem<"line">) => ` ${formatCurrencyByPreference(Number(context.parsed.y ?? 0), currency)}`
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
            callback: (value: string | number) => formatCurrencyByPreference(Number(value), currency)
          }
        }
      }
    }),
    [currency]
  );

  const persistSnapshot = useCallback(
    async (snapshotUserId: string, totalNetWorth: number, cashPosition: number, investmentsValue: number) => {
      const snapshotPayload = {
        user_id: snapshotUserId,
        snapshot_date: new Date().toISOString().slice(0, 10),
        total_net_worth: Number(totalNetWorth.toFixed(2)),
        cash_position: Number(cashPosition.toFixed(2)),
        investments_value: Number(investmentsValue.toFixed(2)),
        snapshot_currency: "EUR",
        fx_rates_to_eur: ratesToEur
      };

      const upsertResult = await supabase.from("net_worth_snapshots").upsert(snapshotPayload, {
        onConflict: "user_id,snapshot_date"
      });

      if (upsertResult.error) {
        return { error: upsertResult.error.message };
      }

      const snapshotsResult = await supabase
        .from("net_worth_snapshots")
        .select("snapshot_date, total_net_worth")
        .eq("user_id", snapshotUserId)
        .order("snapshot_date", { ascending: true });

      if (snapshotsResult.error) {
        return { error: snapshotsResult.error.message };
      }

      setSnapshotRows((snapshotsResult.data as SnapshotRow[]) ?? []);
      return { error: null };
    },
    [ratesToEur, supabase]
  );

  const generateInsights = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/ai-insights", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
      });

      if (!response.ok) {
        setAiError("No se pudieron generar insights en este momento.");
        setAiLoading(false);
        return;
      }

      const data = (await response.json()) as { source?: string; insights?: string[]; debug?: AiInsightDebug };
      setAiSource(data.source ?? "unknown");
      setAiInsights(Array.isArray(data.insights) ? data.insights : []);
      setAiDebug(data.debug ?? null);
      setAiLoading(false);
    } catch {
      setAiError("Error de red al generar insights.");
      setAiLoading(false);
    }
  }, [supabase]);

  const handleSaveSnapshot = useCallback(async () => {
    if (!userId || !metrics) {
      return;
    }

    setSnapshotSaving(true);
    setSnapshotMessage(null);

    const result = await persistSnapshot(userId, metrics.totalNetWorth, metrics.cashPosition, metrics.investmentsValue);
    setSnapshotMessage(result.error ? "No se pudo guardar el snapshot ahora mismo." : "Snapshot guardado correctamente.");
    setSnapshotSaving(false);
  }, [metrics, persistSnapshot, userId]);

  useEffect(() => {
    const loadRates = async () => {
      try {
        const response = await fetch("/api/fx-rates", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { rates?: Record<AssetCurrency, number> };
        if (data.rates) {
          setRatesToEur(data.rates);
        }
      } catch {
        // keep fallback
      }
    };

    void loadRates();
  }, []);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setMessage(null);
      setSnapshotMessage(null);

      if (authLoading || !userId) {
        return;
      }

      const [expensesResult, incomeResult, investmentsResult, savingsTargetsResult, fireSettingsResult] = await Promise.all([
        supabase.from("expenses").select("amount, expense_date").eq("user_id", userId),
        supabase.from("income").select("amount, income_date").eq("user_id", userId),
        supabase.from("investments").select("quantity, average_buy_price, current_price, asset_currency").eq("user_id", userId),
        supabase.from("monthly_savings_targets").select("savings_target, month").eq("user_id", userId),
        supabase.from("fire_settings").select("annual_expenses, current_net_worth, annual_contribution, expected_return, current_age").eq("user_id", userId).maybeSingle()
      ]);

      if (expensesResult.error || incomeResult.error || investmentsResult.error || savingsTargetsResult.error || fireSettingsResult.error) {
        setMessage(
          expensesResult.error?.message ||
            incomeResult.error?.message ||
            savingsTargetsResult.error?.message ||
            fireSettingsResult.error?.message ||
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
      const savingsTargetRows = (savingsTargetsResult.data as SavingsTargetRow[]) ?? [];
      const fireSettings = (fireSettingsResult.data as FireSettingsRow | null) ?? null;

      setExpenseRows(nextExpenseRows);
      setIncomeRows(nextIncomeRows);

      const investmentsValue = investmentRows.reduce((acc, row) => {
        const qty = Number(row.quantity) || 0;
        const price = Number(row.current_price ?? row.average_buy_price) || 0;
        return acc + convertToEur(qty * price, row.asset_currency, ratesToEur);
      }, 0);

      const totalIncomeAllTime = nextIncomeRows.reduce((acc, row) => acc + Number(row.amount), 0);
      const totalExpensesAllTime = nextExpenseRows.reduce((acc, row) => acc + Number(row.amount), 0);
      const cashPosition = totalIncomeAllTime - totalExpensesAllTime;
      const totalNetWorth = cashPosition + investmentsValue;

      const monthExpenses = nextExpenseRows.reduce(
        (acc, row) => (isSameMonth(row.expense_date, now) ? acc + Number(row.amount) : acc),
        0
      );
      const monthIncome = nextIncomeRows.reduce(
        (acc, row) => (isSameMonth(row.income_date, now) ? acc + Number(row.amount) : acc),
        0
      );
      const monthSavingsTarget = savingsTargetRows.reduce(
        (acc, row) => (isSameMonth(row.month, now) ? acc + Number(row.savings_target) : acc),
        0
      );
      const savingsRate = monthIncome > 0 ? (monthSavingsTarget / monthIncome) * 100 : null;

      const annualExpenses = nextExpenseRows.reduce(
        (acc, row) => (isWithinLast12Months(row.expense_date, now) ? acc + Number(row.amount) : acc),
        0
      );
      const annualSavings = savingsTargetRows.reduce(
        (acc, row) => (isCurrentYear(row.month, now) ? acc + Number(row.savings_target) : acc),
        0
      );

      const fireAnnualExpenses = fireSettings?.annual_expenses && fireSettings.annual_expenses > 0 ? fireSettings.annual_expenses : annualExpenses;
      const fireNetWorth = fireSettings && fireSettings.current_net_worth >= 0 ? fireSettings.current_net_worth : totalNetWorth;
      const fireAnnualContribution = fireSettings && fireSettings.annual_contribution >= 0 ? fireSettings.annual_contribution : Math.max(annualSavings, 0);
      const fireExpectedReturn =
        fireSettings && fireSettings.expected_return >= -20 && fireSettings.expected_return <= 30
          ? fireSettings.expected_return / 100
          : 0.05;

      const fireTarget = fireAnnualExpenses > 0 ? fireAnnualExpenses / 0.04 : 0;
      const fireProgress = fireTarget > 0 ? Math.min((fireNetWorth / fireTarget) * 100, 100) : 0;
      const yearsToFire = fireTarget > 0 ? estimateYearsToFire(fireNetWorth, fireTarget, fireAnnualContribution, fireExpectedReturn) : null;

      setMetrics({
        totalNetWorth,
        savingsRate,
        fireTarget,
        fireProgress,
        yearsToFire,
        annualExpenses,
        annualSavings,
        cashPosition,
        investmentsValue
      });

      await persistSnapshot(userId, totalNetWorth, cashPosition, investmentsValue);
      setLoading(false);
    };

    void run();
  }, [authLoading, persistSnapshot, ratesToEur, supabase, userId]);

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
      <main className="page-enter relative z-10 mx-auto grid max-w-6xl gap-5 p-5 md:grid-cols-2 md:pl-72 xl:grid-cols-12">
        <section className="rounded-[30px] border border-white/6 bg-[linear-gradient(180deg,rgba(9,20,38,0.98)_0%,rgba(12,27,49,0.96)_100%)] p-6 text-white shadow-[0_24px_64px_rgba(2,8,23,0.5)] md:col-span-2 md:p-8 xl:col-span-7">
          <p className="font-[var(--font-heading)] text-xs uppercase tracking-[0.26em] text-emerald-300">Vista general</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-white">Tu sistema financiero, de un vistazo</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/72">
            Patrimonio, ahorro, progreso FIRE e ideas accionables en una sola pantalla para decidir con rapidez.
          </p>
        </section>

        <section className="rounded-[30px] border border-emerald-400/10 bg-[linear-gradient(180deg,rgba(7,19,35,0.98)_0%,rgba(9,29,48,0.98)_52%,rgba(10,63,70,0.92)_100%)] p-6 text-white shadow-[0_28px_72px_rgba(2,8,23,0.56)] md:col-span-2 xl:col-span-5">
          <p className="text-xs uppercase tracking-[0.26em] text-white/60">Momentum actual</p>
          <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold text-white">{metrics ? formatCurrencyByPreference(metrics.totalNetWorth, currency) : "--"}</p>
          <p className="mt-2 max-w-sm text-sm text-white/76">Patrimonio total combinando caja acumulada e inversiones actuales registradas.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-white/6 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/54">Caja estimada</p>
              <p className="mt-2 text-2xl font-semibold">{metrics ? formatCurrencyByPreference(metrics.cashPosition, currency) : "--"}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/6 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/54">Inversiones</p>
              <p className="mt-2 text-2xl font-semibold">{metrics ? formatCurrencyByPreference(metrics.investmentsValue, currency) : "--"}</p>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] p-6 text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] md:col-span-2 xl:col-span-12">
            <p className="text-sm text-white/64">Cargando metricas financieras...</p>
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

            <section className="rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] p-6 text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] md:col-span-1 xl:col-span-6">
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Patrimonio total</p>
              <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(metrics.totalNetWorth, currency)}</p>
              <p className="mt-4 max-w-[24ch] text-sm leading-6 text-white/64">Caja neta acumulada mas valor actual de inversiones.</p>
            </section>

            <section className="rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] p-6 text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] md:col-span-1 xl:col-span-6">
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Tasa de ahorro</p>
              <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">
                {metrics.savingsRate === null ? "Sin datos" : `${metrics.savingsRate.toFixed(2)}%`}
              </p>
              <p className="mt-4 max-w-[24ch] text-sm leading-6 text-white/64">Basada en tu ahorro objetivo del mes actual frente a los ingresos del mes.</p>
            </section>

            <section className="rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] p-6 text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] md:col-span-1 xl:col-span-6">
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Ahorro anual</p>
              <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(metrics.annualSavings, currency)}</p>
              <p className="mt-4 max-w-[24ch] text-sm leading-6 text-white/64">Suma de tus objetivos de ahorro de los meses del año actual.</p>
            </section>

            <section className="rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] p-6 text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] md:col-span-1 xl:col-span-6">
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Objetivo FIRE</p>
              <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">
                {metrics.fireTarget > 0 ? formatCurrencyByPreference(metrics.fireTarget, currency) : "Sin calcular"}
              </p>
              <p className="mt-4 max-w-[24ch] text-sm leading-6 text-white/64">Calculado con la misma configuracion que tienes en la pagina FIRE.</p>
            </section>

            <section className="rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] p-6 text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] md:col-span-2 xl:col-span-12">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Evolucion del patrimonio</p>
                  <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Patrimonio guardado por periodos</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-white/64">
                    {snapshotRows.length > 1
                      ? "Grafico basado en snapshots diarios guardados en tu base de datos."
                      : "Aun no hay suficiente historico guardado. Mientras tanto mostramos una estimacion basada en flujo de caja acumulado."}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-3 lg:items-end">
                  <div className="flex flex-wrap gap-2">
                    {RANGE_OPTIONS.map((option) => {
                      const active = chartRange === option.value;
                      const variation = timelineRangeVariations[option.value];
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setChartRange(option.value)}
                          className={`rounded-full px-4 py-2 text-sm transition ${
                            active ? "bg-emerald-500 text-slate-950" : "bg-white/6 text-white/78 hover:bg-white/12"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span>{option.label}</span>
                            <span className={`text-xs ${active ? "text-slate-950/80" : "text-white/58"}`}>
                              {variation === null ? "n/d" : `${variation >= 0 ? "+" : ""}${variation.toFixed(1)}%`}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveSnapshot}
                    disabled={snapshotSaving || !metrics}
                    className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm text-white transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {snapshotSaving ? "Guardando..." : "Guardar snapshot ahora"}
                  </button>
                </div>
              </div>

              {snapshotMessage ? <p className="mt-4 text-sm text-emerald-300">{snapshotMessage}</p> : null}

              <div className="mt-6 h-[320px]">
                {timelinePoints.length > 0 ? (
                  <Line data={timelineChartData} options={timelineChartOptions} />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-white/60 text-sm text-slate-500">
                    Aun no hay suficientes datos para dibujar la evolucion del patrimonio.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] p-6 text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] md:col-span-2 xl:col-span-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Progreso FIRE</p>
                  <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Camino hacia libertad financiera</h2>
                </div>
                <p className="rounded-full bg-teal-700 px-3 py-1 text-sm font-medium text-white">{metrics.fireProgress.toFixed(2)}%</p>
              </div>

              <div className="mt-6 h-5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e_0%,#14b8a6_100%)] transition-all duration-500"
                  style={{ width: `${metrics.fireProgress.toFixed(2)}%` }}
                />
              </div>

              <div className="mt-5 grid gap-3 text-sm text-white/64 sm:grid-cols-2">
                <p>Objetivo estimado: <span className="font-medium text-white/84">{metrics.fireTarget > 0 ? formatCurrencyByPreference(metrics.fireTarget, currency) : "Sin calcular"}</span></p>
                <p>Rentabilidad asumida: <span className="font-medium text-white/84">5% anual</span></p>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] p-6 text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] md:col-span-2 xl:col-span-5">
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Horizonte</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Anos estimados para independencia</h2>
              <p className="mt-5 font-[var(--font-heading)] text-4xl font-semibold text-white">
                {metrics.fireTarget <= 0
                  ? "No calculable"
                  : metrics.yearsToFire === null
                    ? "No alcanzable"
                    : `${metrics.yearsToFire} anos`}
              </p>
              <p className="mt-4 text-sm leading-6 text-white/64">
                La estimacion usa la configuracion guardada en FIRE: gastos anuales, aportacion anual y rentabilidad esperada.
              </p>
            </section>

            <section className="rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] p-6 text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] md:col-span-2 xl:col-span-12">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">IA financiera</p>
                  <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Lectura automatica de tus habitos</h2>
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
                <p className="mt-4 text-sm text-white/64">Sin datos financieros suficientes para generar insights utiles.</p>
              ) : null}
              {aiError ? <p className="mt-4 text-sm text-red-700">{aiError}</p> : null}
              {!aiError && aiInsights.length === 0 && hasFinancialData ? (
                <p className="mt-4 text-sm text-white/64">Generando recomendaciones personalizadas...</p>
              ) : null}

              {aiInsights.length > 0 ? (
                <>
                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    {aiInsights.map((insight: string) => (
                      <article key={insight} className="rounded-3xl border border-white/8 bg-white/6 p-5 shadow-[0_16px_34px_rgba(2,8,23,0.26)]">
                        <p className="text-sm leading-6 text-white/84">{insight}</p>
                      </article>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-slate-500">
                    Fuente: {aiSource === "openai" ? "modelo OpenAI" : "motor local de reglas"}. No es consejo financiero profesional.
                  </p>
                  {aiDebug ? (
                    <details className="mt-4 rounded-3xl border border-white/8 bg-white/6 p-4 text-sm text-white/80">
                      <summary className="cursor-pointer font-medium text-white">Ver datos usados por la IA</summary>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/8 bg-slate-950/40 p-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Mes actual</p>
                          <p className="mt-2">Ingresos: {formatCurrencyByPreference(aiDebug.monthlyIncome, currency)}</p>
                          <p className="mt-1">Gastos: {formatCurrencyByPreference(aiDebug.monthlyExpenses, currency)}</p>
                          <p className="mt-1">Ahorro objetivo: {formatCurrencyByPreference(aiDebug.monthlySavingsTarget, currency)}</p>
                          <p className="mt-1">Tasa ahorro: {aiDebug.savingsRate === null ? "Sin datos" : `${aiDebug.savingsRate.toFixed(2)}%`}</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-slate-950/40 p-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Ano actual y FIRE</p>
                          <p className="mt-2">Ahorro anual: {formatCurrencyByPreference(aiDebug.annualSavings, currency)}</p>
                          <p className="mt-1">Patrimonio: {formatCurrencyByPreference(aiDebug.netWorth, currency)}</p>
                          <p className="mt-1">Objetivo FIRE: {formatCurrencyByPreference(aiDebug.fireTarget, currency)}</p>
                          <p className="mt-1">Progreso FIRE: {aiDebug.fireProgress.toFixed(2)}%</p>
                        </div>
                      </div>
                    </details>
                  ) : null}
                </>
              ) : null}
            </section>
          </>
        ) : null}
      </main>
    </>
  );
}



