"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import EmptyStateCard from "@/components/empty-state-card";
import SectionHeader from "@/components/section-header";
import { useTheme } from "@/components/theme-provider";
import { formatCurrencyByPreference, formatDateByPreference } from "@/lib/preferences-format";
import { AssetCurrency, convertToEur, FALLBACK_RATES_TO_EUR } from "@/lib/currency-rates";

type ExpenseRow = { amount: number; expense_date: string };
type IncomeRow = { amount: number; income_date: string };
type InvestmentRow = {
  asset_name: string;
  asset_type: string;
  quantity: number;
  average_buy_price: number;
  current_price: number | null;
  asset_currency: AssetCurrency | null;
};
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
type DashboardAlert = {
  id: DashboardAlertRuleKey | "stable_panel";
  tone: "warning" | "info" | "success";
  title: string;
  body: string;
};
type DashboardAlertRuleKey =
  | "low_savings_rate"
  | "missing_annual_savings"
  | "early_fire_progress"
  | "high_concentration"
  | "missing_prices";
type DashboardAlertRule = {
  key: DashboardAlertRuleKey;
  label: string;
  description: string;
  enabled: boolean;
  threshold: number | null;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
};
type DashboardAlertRulesRow = {
  alert_key: DashboardAlertRuleKey;
  enabled: boolean;
  threshold: number | null;
};
type DashboardReminder = {
  id: string;
  title: string;
  body: string;
  cta: string;
  href?: string;
};
type DashboardWidgetId = "netWorthChart" | "reminders" | "alerts" | "monthlyTrend" | "fireOverview" | "aiInsights";
type DashboardWidgetSize = "compact" | "expanded";
type DashboardWidgetWidth = "normal" | "full";
type DashboardPreferencesRow = {
  widget_order: DashboardWidgetId[] | null;
  hidden_widgets: DashboardWidgetId[] | null;
  widget_sizes: Record<DashboardWidgetId, DashboardWidgetSize> | null;
  widget_widths: Record<DashboardWidgetId, DashboardWidgetWidth> | null;
};
type MonthlyTrendPoint = {
  label: string;
  income: number;
  savingsTarget: number;
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
const DASHBOARD_WIDGETS: Array<{ id: DashboardWidgetId; label: string; description: string }> = [
  { id: "netWorthChart", label: "Patrimonio", description: "Grafico de evolucion, snapshots y exportes." },
  { id: "reminders", label: "Recordatorios", description: "Pendientes operativos del mes y de la cartera." },
  { id: "alerts", label: "Alertas", description: "Riesgos y senales automaticas del panel." },
  { id: "monthlyTrend", label: "Historico mensual", description: "Ingresos frente a ahorro objetivo." },
  { id: "fireOverview", label: "FIRE", description: "Progreso y horizonte hacia independencia financiera." },
  { id: "aiInsights", label: "IA financiera", description: "Lectura automatica de habitos y contexto." }
];
const DASHBOARD_WIDGET_ORDER_KEY = "dashboard-widget-order";
const DASHBOARD_HIDDEN_WIDGETS_KEY = "dashboard-hidden-widgets";
const DASHBOARD_WIDGET_SIZES_KEY = "dashboard-widget-sizes";
const DASHBOARD_WIDGET_WIDTHS_KEY = "dashboard-widget-widths";
const DASHBOARD_ALERT_RULE_DEFAULTS: DashboardAlertRule[] = [
  {
    key: "low_savings_rate",
    label: "Tasa de ahorro baja",
    description: "Avisar si el ahorro mensual cae por debajo del umbral.",
    enabled: true,
    threshold: 10,
    min: 0,
    max: 100,
    step: 1,
    suffix: "%"
  },
  {
    key: "missing_annual_savings",
    label: "Ahorro anual sin objetivo",
    description: "Avisar si el ano actual no acumula ahorro objetivo.",
    enabled: true,
    threshold: null
  },
  {
    key: "early_fire_progress",
    label: "FIRE en fase inicial",
    description: "Avisar si el progreso FIRE sigue por debajo del umbral.",
    enabled: true,
    threshold: 25,
    min: 0,
    max: 100,
    step: 1,
    suffix: "%"
  },
  {
    key: "high_concentration",
    label: "Concentracion elevada",
    description: "Avisar si una posicion supera este peso en cartera.",
    enabled: true,
    threshold: 35,
    min: 0,
    max: 100,
    step: 1,
    suffix: "%"
  },
  {
    key: "missing_prices",
    label: "Activos sin precio",
    description: "Avisar si faltan precios actualizados en cartera.",
    enabled: true,
    threshold: 1,
    min: 1,
    max: 999,
    step: 1,
    suffix: " act."
  }
];
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

function mergeAlertRules(rows: DashboardAlertRulesRow[] | null | undefined) {
  return DASHBOARD_ALERT_RULE_DEFAULTS.map((rule) => {
    const remoteRule = rows?.find((row) => row.alert_key === rule.key);
    return remoteRule
      ? {
          ...rule,
          enabled: remoteRule.enabled,
          threshold: remoteRule.threshold
        }
      : rule;
  });
}

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

function getMonthlyTrendPoints(incomeRows: IncomeRow[], savingsTargets: SavingsTargetRow[], dateFormat: "es" | "us") {
  const now = new Date();
  const months: string[] = [];
  for (let offset = 5; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }

  return months.map((month) => {
    const income = incomeRows.reduce((acc, row) => (row.income_date.slice(0, 7) === month ? acc + Number(row.amount) : acc), 0);
    const savingsTarget = savingsTargets.reduce((acc, row) => (row.month.slice(0, 7) === month ? acc + Number(row.savings_target) : acc), 0);
    return {
      label: formatDateByPreference(`${month}-01`, dateFormat, { month: "short", year: "2-digit" }),
      income: Number(income.toFixed(2)),
      savingsTarget: Number(savingsTarget.toFixed(2))
    };
  });
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
  const [investmentRows, setInvestmentRows] = useState<InvestmentRow[]>([]);
  const [savingsTargetRows, setSavingsTargetRows] = useState<SavingsTargetRow[]>([]);
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
  const [dismissedReminderIds, setDismissedReminderIds] = useState<string[]>([]);
  const [widgetOrder, setWidgetOrder] = useState<DashboardWidgetId[]>(DASHBOARD_WIDGETS.map((widget) => widget.id));
  const [hiddenWidgets, setHiddenWidgets] = useState<DashboardWidgetId[]>([]);
  const [widgetSizes, setWidgetSizes] = useState<Record<DashboardWidgetId, DashboardWidgetSize>>({
    netWorthChart: "expanded",
    reminders: "compact",
    alerts: "compact",
    monthlyTrend: "expanded",
    fireOverview: "compact",
    aiInsights: "expanded"
  });
  const [widgetWidths, setWidgetWidths] = useState<Record<DashboardWidgetId, DashboardWidgetWidth>>({
    netWorthChart: "full",
    reminders: "full",
    alerts: "full",
    monthlyTrend: "full",
    fireOverview: "normal",
    aiInsights: "full"
  });
  const [widgetPrefsLoaded, setWidgetPrefsLoaded] = useState(false);
  const [draggedWidgetId, setDraggedWidgetId] = useState<DashboardWidgetId | null>(null);
  const [alertRules, setAlertRules] = useState<DashboardAlertRule[]>(DASHBOARD_ALERT_RULE_DEFAULTS);
  const [alertRulesLoaded, setAlertRulesLoaded] = useState(false);
  const [savingAlertRuleKey, setSavingAlertRuleKey] = useState<DashboardAlertRuleKey | null>(null);

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

  const monthlyTrendPoints = useMemo(
    () => getMonthlyTrendPoints(incomeRows, savingsTargetRows, dateFormat),
    [dateFormat, incomeRows, savingsTargetRows]
  );

  const monthlyTrendChartData = useMemo(
    () => ({
      labels: monthlyTrendPoints.map((point) => point.label),
      datasets: [
        {
          label: "Ingresos",
          data: monthlyTrendPoints.map((point) => point.income),
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.18)",
          fill: false,
          tension: 0.3,
          borderWidth: 3
        },
        {
          label: "Ahorro objetivo",
          data: monthlyTrendPoints.map((point) => point.savingsTarget),
          borderColor: "#22c55e",
          backgroundColor: "rgba(34, 197, 94, 0.18)",
          fill: false,
          tension: 0.3,
          borderWidth: 3
        }
      ]
    }),
    [monthlyTrendPoints]
  );

  const monthlyTrendChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#cbd5e1", usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: (context: TooltipItem<"line">) => ` ${formatCurrencyByPreference(Number(context.parsed.y ?? 0), currency)}`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#cbd5e1" } },
        y: {
          grid: { color: "rgba(148, 163, 184, 0.16)" },
          ticks: { color: "#cbd5e1", callback: (value: string | number) => formatCurrencyByPreference(Number(value), currency) }
        }
      }
    }),
    [currency]
  );

  const dashboardAlerts = useMemo<DashboardAlert[]>(() => {
    if (!metrics) {
      return [];
    }

    const alerts: DashboardAlert[] = [];
    const alertRuleMap = Object.fromEntries(alertRules.map((rule) => [rule.key, rule])) as Record<DashboardAlertRuleKey, DashboardAlertRule>;
    const assetsWithoutCurrentPrice = investmentRows.filter((row) => row.current_price === null);
    const topHolding = investmentRows
      .map((row) => {
        const qty = Number(row.quantity) || 0;
        const price = Number(row.current_price ?? row.average_buy_price) || 0;
        const valueEur = convertToEur(qty * price, row.asset_currency, ratesToEur);
        const weight = metrics.investmentsValue > 0 ? (valueEur / metrics.investmentsValue) * 100 : 0;
        return { name: row.asset_name, valueEur, weight };
      })
      .sort((a, b) => b.valueEur - a.valueEur)[0];

    if (
      alertRuleMap.low_savings_rate.enabled &&
      metrics.savingsRate !== null &&
      metrics.savingsRate < Number(alertRuleMap.low_savings_rate.threshold ?? 10)
    ) {
      alerts.push({
        id: "low_savings_rate",
        tone: "warning",
        title: "Tasa de ahorro baja",
        body: `Tu tasa de ahorro del mes esta en ${metrics.savingsRate.toFixed(1)}%. Revisar gasto variable puede darte margen rapido.`
      });
    }

    if (alertRuleMap.missing_annual_savings.enabled && metrics.annualSavings === 0) {
      alerts.push({
        id: "missing_annual_savings",
        tone: "info",
        title: "Ahorro anual sin objetivo",
        body: "Aun no has acumulado ahorro objetivo en el ano actual. Definir una cifra mensual hara mas util el seguimiento."
      });
    }

    if (
      alertRuleMap.early_fire_progress.enabled &&
      metrics.fireProgress < Number(alertRuleMap.early_fire_progress.threshold ?? 25)
    ) {
      alerts.push({
        id: "early_fire_progress",
        tone: "info",
        title: "FIRE aun en fase inicial",
        body: "Tu progreso FIRE sigue en una fase temprana. La consistencia mensual importa mas que buscar rentabilidades puntuales."
      });
    }

    if (
      alertRuleMap.high_concentration.enabled &&
      topHolding &&
      topHolding.weight >= Number(alertRuleMap.high_concentration.threshold ?? 35)
    ) {
      alerts.push({
        id: "high_concentration",
        tone: "warning",
        title: "Concentracion elevada",
        body: `${topHolding.name} pesa ${topHolding.weight.toFixed(1)}% de tu cartera. Puede valer la pena diversificar gradualmente.`
      });
    }

    if (
      alertRuleMap.missing_prices.enabled &&
      assetsWithoutCurrentPrice.length >= Number(alertRuleMap.missing_prices.threshold ?? 1)
    ) {
      alerts.push({
        id: "missing_prices",
        tone: "warning",
        title: "Precios pendientes de actualizar",
        body: `${assetsWithoutCurrentPrice.length} activo(s) siguen sin precio actual guardado. La valoracion de la cartera pierde precision mientras sigan pendientes.`
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        id: "stable_panel",
        tone: "success",
        title: "Panel estable",
        body: "No hay alertas criticas ahora mismo. Tus metricas principales no muestran desequilibrios relevantes."
      });
    }

    return alerts.slice(0, 4);
  }, [alertRules, investmentRows, metrics, ratesToEur]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("dashboard-dismissed-reminders");
      if (!stored) {
        return;
      }

      const parsed = JSON.parse(stored) as string[];
      if (Array.isArray(parsed)) {
        setDismissedReminderIds(parsed);
      }
    } catch {
      setDismissedReminderIds([]);
    }
  }, []);

  useEffect(() => {
    try {
      const storedOrder = window.localStorage.getItem(DASHBOARD_WIDGET_ORDER_KEY);
      const storedHidden = window.localStorage.getItem(DASHBOARD_HIDDEN_WIDGETS_KEY);
      const storedSizes = window.localStorage.getItem(DASHBOARD_WIDGET_SIZES_KEY);
      const storedWidths = window.localStorage.getItem(DASHBOARD_WIDGET_WIDTHS_KEY);

      if (storedOrder) {
        const parsedOrder = JSON.parse(storedOrder) as DashboardWidgetId[];
        if (Array.isArray(parsedOrder)) {
          const validIds = DASHBOARD_WIDGETS.map((widget) => widget.id);
          const sanitized = parsedOrder.filter((id): id is DashboardWidgetId => validIds.includes(id));
          const missing = validIds.filter((id) => !sanitized.includes(id));
          setWidgetOrder([...sanitized, ...missing]);
        }
      }

      if (storedHidden) {
        const parsedHidden = JSON.parse(storedHidden) as DashboardWidgetId[];
        if (Array.isArray(parsedHidden)) {
          const validIds = DASHBOARD_WIDGETS.map((widget) => widget.id);
          setHiddenWidgets(parsedHidden.filter((id): id is DashboardWidgetId => validIds.includes(id)));
        }
      }

      if (storedSizes) {
        const parsedSizes = JSON.parse(storedSizes) as Record<DashboardWidgetId, DashboardWidgetSize>;
        const validIds = DASHBOARD_WIDGETS.map((widget) => widget.id);
        setWidgetSizes((current) => {
          const next = { ...current };
          validIds.forEach((id) => {
            const value = parsedSizes?.[id];
            if (value === "compact" || value === "expanded") {
              next[id] = value;
            }
          });
          return next;
        });
      }

      if (storedWidths) {
        const parsedWidths = JSON.parse(storedWidths) as Record<DashboardWidgetId, DashboardWidgetWidth>;
        const validIds = DASHBOARD_WIDGETS.map((widget) => widget.id);
        setWidgetWidths((current) => {
          const next = { ...current };
          validIds.forEach((id) => {
            const value = parsedWidths?.[id];
            if (value === "normal" || value === "full") {
              next[id] = value;
            }
          });
          return next;
        });
      }
    } catch {
      setWidgetOrder(DASHBOARD_WIDGETS.map((widget) => widget.id));
      setHiddenWidgets([]);
    }
  }, []);

  useEffect(() => {
    const loadRemoteDashboardPreferences = async () => {
      if (!userId) {
        setWidgetPrefsLoaded(true);
        return;
      }

      const { data, error } = await supabase
        .from("dashboard_preferences")
        .select("widget_order, hidden_widgets, widget_sizes, widget_widths")
        .eq("user_id", userId)
        .maybeSingle();

      if (!error && data) {
        const remotePrefs = data as DashboardPreferencesRow;
        const validIds = DASHBOARD_WIDGETS.map((widget) => widget.id);

        if (Array.isArray(remotePrefs.widget_order)) {
          const sanitized = remotePrefs.widget_order.filter((id): id is DashboardWidgetId => validIds.includes(id));
          const missing = validIds.filter((id) => !sanitized.includes(id));
          setWidgetOrder([...sanitized, ...missing]);
        }

        if (Array.isArray(remotePrefs.hidden_widgets)) {
          setHiddenWidgets(remotePrefs.hidden_widgets.filter((id): id is DashboardWidgetId => validIds.includes(id)));
        }

        if (remotePrefs.widget_sizes) {
          setWidgetSizes((current) => {
            const next = { ...current };
            validIds.forEach((id) => {
              const size = remotePrefs.widget_sizes?.[id];
              if (size === "compact" || size === "expanded") {
                next[id] = size;
              }
            });
            return next;
          });
        }

        if (remotePrefs.widget_widths) {
          setWidgetWidths((current) => {
            const next = { ...current };
            validIds.forEach((id) => {
              const width = remotePrefs.widget_widths?.[id];
              if (width === "normal" || width === "full") {
                next[id] = width;
              }
            });
            return next;
          });
        }
      }

      setWidgetPrefsLoaded(true);
    };

    void loadRemoteDashboardPreferences();
  }, [supabase, userId]);

  useEffect(() => {
    const loadAlertRules = async () => {
      if (!userId) {
        setAlertRulesLoaded(true);
        return;
      }

      const { data, error } = await supabase
        .from("dashboard_alert_rules")
        .select("alert_key, enabled, threshold")
        .eq("user_id", userId);

      if (!error && data) {
        setAlertRules(mergeAlertRules(data as DashboardAlertRulesRow[]));
      }

      setAlertRulesLoaded(true);
    };

    void loadAlertRules();
  }, [supabase, userId]);

  const visibleWidgetOrder = useMemo(
    () => widgetOrder.filter((widgetId) => !hiddenWidgets.includes(widgetId)),
    [hiddenWidgets, widgetOrder]
  );

  const toggleWidgetVisibility = useCallback((widgetId: DashboardWidgetId) => {
    setHiddenWidgets((current) => {
      const next = current.includes(widgetId) ? current.filter((id) => id !== widgetId) : [...current, widgetId];
      window.localStorage.setItem(DASHBOARD_HIDDEN_WIDGETS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const moveWidget = useCallback((widgetId: DashboardWidgetId, direction: "up" | "down") => {
    setWidgetOrder((current) => {
      const index = current.indexOf(widgetId);
      if (index === -1) {
        return current;
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      window.localStorage.setItem(DASHBOARD_WIDGET_ORDER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetWidgets = useCallback(() => {
    const defaultOrder = DASHBOARD_WIDGETS.map((widget) => widget.id);
    setWidgetOrder(defaultOrder);
    setHiddenWidgets([]);
    setWidgetSizes({
      netWorthChart: "expanded",
      reminders: "compact",
      alerts: "compact",
      monthlyTrend: "expanded",
      fireOverview: "compact",
      aiInsights: "expanded"
    });
    setWidgetWidths({
      netWorthChart: "full",
      reminders: "full",
      alerts: "full",
      monthlyTrend: "full",
      fireOverview: "normal",
      aiInsights: "full"
    });
    window.localStorage.setItem(DASHBOARD_WIDGET_ORDER_KEY, JSON.stringify(defaultOrder));
    window.localStorage.removeItem(DASHBOARD_HIDDEN_WIDGETS_KEY);
    window.localStorage.removeItem(DASHBOARD_WIDGET_SIZES_KEY);
    window.localStorage.removeItem(DASHBOARD_WIDGET_WIDTHS_KEY);
  }, []);

  const toggleWidgetSize = useCallback((widgetId: DashboardWidgetId) => {
    setWidgetSizes((current) => {
      const next = {
        ...current,
        [widgetId]: current[widgetId] === "compact" ? "expanded" : "compact"
      };
      window.localStorage.setItem(DASHBOARD_WIDGET_SIZES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleWidgetWidth = useCallback((widgetId: DashboardWidgetId) => {
    setWidgetWidths((current) => {
      const next = {
        ...current,
        [widgetId]: current[widgetId] === "full" ? "normal" : "full"
      };
      window.localStorage.setItem(DASHBOARD_WIDGET_WIDTHS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const moveWidgetByDrop = useCallback((sourceId: DashboardWidgetId, targetId: DashboardWidgetId) => {
    if (sourceId === targetId) {
      return;
    }

    setWidgetOrder((current) => {
      const sourceIndex = current.indexOf(sourceId);
      const targetIndex = current.indexOf(targetId);
      if (sourceIndex === -1 || targetIndex === -1) {
        return current;
      }

      const next = [...current];
      next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, sourceId);
      window.localStorage.setItem(DASHBOARD_WIDGET_ORDER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const syncDashboardPreferences = async () => {
      if (!userId || !widgetPrefsLoaded) {
        return;
      }

      await supabase.from("dashboard_preferences").upsert(
        {
          user_id: userId,
          widget_order: widgetOrder,
          hidden_widgets: hiddenWidgets,
          widget_sizes: widgetSizes,
          widget_widths: widgetWidths
        },
        { onConflict: "user_id" }
      );
    };

    void syncDashboardPreferences();
  }, [hiddenWidgets, supabase, userId, widgetOrder, widgetPrefsLoaded, widgetSizes, widgetWidths]);

  const updateAlertRule = useCallback(
    async (ruleKey: DashboardAlertRuleKey, patch: Partial<Pick<DashboardAlertRule, "enabled" | "threshold">>) => {
      const currentRule = alertRules.find((rule) => rule.key === ruleKey);
      if (!currentRule) {
        return;
      }

      const nextRule = { ...currentRule, ...patch };
      setAlertRules((current) => current.map((rule) => (rule.key === ruleKey ? nextRule : rule)));

      if (!userId) {
        return;
      }

      setSavingAlertRuleKey(ruleKey);
      const { error } = await supabase.from("dashboard_alert_rules").upsert(
        {
          user_id: userId,
          alert_key: ruleKey,
          enabled: nextRule.enabled,
          threshold: nextRule.threshold
        },
        { onConflict: "user_id,alert_key" }
      );

      if (error) {
        setAlertRules((current) => current.map((rule) => (rule.key === ruleKey ? currentRule : rule)));
        setMessage("No hemos podido guardar la configuracion de alertas. Intentalo otra vez.");
      }

      setSavingAlertRuleKey((current) => (current === ruleKey ? null : current));
    },
    [alertRules, supabase, userId]
  );

  const dashboardReminders = useMemo<DashboardReminder[]>(() => {
    if (!metrics) {
      return [];
    }

    const now = new Date();
    const currentMonthIncome = incomeRows.some((row) => isSameMonth(row.income_date, now));
    const currentMonthSavingsTarget = savingsTargetRows.some((row) => isSameMonth(row.month, now));
    const todaySnapshotKey = new Date().toISOString().slice(0, 10);
    const hasSnapshotToday = snapshotRows.some((row) => row.snapshot_date === todaySnapshotKey);
    const assetsWithoutCurrentPrice = investmentRows.filter((row) => row.current_price === null);

    const reminders: DashboardReminder[] = [];

    if (!currentMonthIncome) {
      reminders.push({
        id: "missing-income-month",
        title: "Ingresos del mes pendientes",
        body: "Este mes no tiene ingresos registrados. Sin eso, tasa de ahorro e insights pierden contexto.",
        cta: "Anade ingresos en Presupuestos",
        href: "/budgets"
      });
    }

    if (!currentMonthSavingsTarget) {
      reminders.push({
        id: "missing-savings-target-month",
        title: "Ahorro objetivo sin definir",
        body: "Todavia no hay ahorro objetivo para el mes actual. Eso afecta al dashboard, FIRE y a la IA.",
        cta: "Define el ahorro en Presupuestos",
        href: "/budgets"
      });
    }

    if (snapshotRows.length > 0 && !hasSnapshotToday) {
      reminders.push({
        id: "missing-today-snapshot",
        title: "Snapshot diario pendiente",
        body: "Hoy aun no has guardado snapshot de patrimonio. Mantenerlo al dia mejora la evolucion historica.",
        cta: "Pulsa Guardar snapshot ahora"
      });
    }

    if (assetsWithoutCurrentPrice.length > 0) {
      reminders.push({
        id: "missing-current-prices",
        title: "Precios pendientes de actualizar",
        body: `${assetsWithoutCurrentPrice.length} activo(s) siguen sin precio actual guardado. Eso limita la precision del patrimonio y de la cartera.`,
        cta: "Actualiza precios en Inversiones",
        href: "/investments"
      });
    }

    if (metrics.fireTarget <= 0) {
      reminders.push({
        id: "missing-fire-config",
        title: "Configuracion FIRE sin cerrar",
        body: "El objetivo FIRE sigue sin una base completa. Guardar tu configuracion mejora el seguimiento real.",
        cta: "Actualiza FIRE",
        href: "/fire"
      });
    }

    return reminders.filter((reminder) => !dismissedReminderIds.includes(reminder.id)).slice(0, 4);
  }, [dismissedReminderIds, incomeRows, investmentRows, metrics, savingsTargetRows, snapshotRows]);

  const currentMonthSavingsTarget = useMemo(() => {
    const now = new Date();
    return savingsTargetRows.reduce((sum, row) => (isSameMonth(row.month, now) ? sum + Number(row.savings_target) : sum), 0);
  }, [savingsTargetRows]);

  const currentMonthIncome = useMemo(() => {
    const now = new Date();
    return incomeRows.reduce((sum, row) => (isSameMonth(row.income_date, now) ? sum + Number(row.amount) : sum), 0);
  }, [incomeRows]);

  const dismissReminder = useCallback((reminderId: string) => {
    setDismissedReminderIds((current) => {
      const next = Array.from(new Set([...current, reminderId]));
      window.localStorage.setItem("dashboard-dismissed-reminders", JSON.stringify(next));
      return next;
    });
  }, []);

  const restoreReminders = useCallback(() => {
    setDismissedReminderIds([]);
    window.localStorage.removeItem("dashboard-dismissed-reminders");
  }, []);

  const handleExportCsvReport = useCallback(() => {
    if (!metrics) {
      return;
    }

    const rows = [
      ["seccion", "metrica", "valor"],
      ["dashboard", "patrimonio_total", metrics.totalNetWorth.toFixed(2)],
      ["dashboard", "tasa_ahorro_pct", metrics.savingsRate === null ? "" : metrics.savingsRate.toFixed(2)],
      ["dashboard", "ahorro_anual", metrics.annualSavings.toFixed(2)],
      ["dashboard", "objetivo_fire", metrics.fireTarget.toFixed(2)],
      ["dashboard", "progreso_fire_pct", metrics.fireProgress.toFixed(2)],
      ["dashboard", "anos_hasta_fire", metrics.yearsToFire === null ? "" : String(metrics.yearsToFire)],
      ...dashboardAlerts.map((alert, index) => ["alerta", String(index + 1), `${alert.title}: ${alert.body}`]),
      ...dashboardReminders.map((reminder, index) => ["recordatorio", String(index + 1), `${reminder.title}: ${reminder.body}`]),
      ...monthlyTrendPoints.map((point) => ["tendencia_mensual", point.label, `${point.income.toFixed(2)}|${point.savingsTarget.toFixed(2)}`]),
      ...investmentRows.map((row) => [
        "inversion",
        row.asset_name,
        convertToEur((Number(row.quantity) || 0) * (Number(row.current_price ?? row.average_buy_price) || 0), row.asset_currency, ratesToEur).toFixed(2)
      ])
    ];

    const csv = rows.map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte_financiero_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [dashboardAlerts, dashboardReminders, investmentRows, metrics, monthlyTrendPoints, ratesToEur]);

  const handleExportPdfReport = useCallback(() => {
    if (!metrics) {
      return;
    }

    const reportWindow = window.open("", "_blank", "width=980,height=780");
    if (!reportWindow) {
      return;
    }

    const topHoldings = investmentRows
      .map((row) => {
        const valueEur = convertToEur((Number(row.quantity) || 0) * (Number(row.current_price ?? row.average_buy_price) || 0), row.asset_currency, ratesToEur);
        return { name: row.asset_name, type: row.asset_type, valueEur };
      })
      .sort((a, b) => b.valueEur - a.valueEur)
      .slice(0, 8);

    const html = `
      <html>
        <head>
          <title>Reporte financiero</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 28px; color: #0f172a; background: #f8fafc; }
            h1, h2, h3 { margin: 0 0 8px; }
            p { margin: 0; }
            .header { margin-bottom: 24px; }
            .muted { color: #475569; }
            .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin: 18px 0 26px; }
            .card { border: 1px solid #cbd5e1; border-radius: 16px; padding: 16px; background: white; }
            .metric-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #0f766e; }
            .metric-value { font-size: 28px; font-weight: 700; margin-top: 8px; }
            .section { margin-top: 22px; }
            .section-intro { margin-bottom: 12px; color: #475569; }
            .pill { display: inline-block; margin: 4px 8px 0 0; padding: 6px 10px; border-radius: 999px; background: #e2e8f0; color: #0f172a; font-size: 12px; }
            .list { margin: 10px 0 0; padding-left: 18px; }
            table { width: 100%; border-collapse: collapse; margin-top: 14px; background: white; border-radius: 14px; overflow: hidden; }
            th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 8px; text-align: left; font-size: 14px; }
            th { background: #e2e8f0; color: #0f172a; }
            .good { color: #047857; }
            .warn { color: #b45309; }
            .small-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
            @media print { body { padding: 16px; } .card { break-inside: avoid; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Reporte financiero</h1>
            <p class="muted">Generado el ${new Date().toLocaleDateString("es-ES")} · Resumen ejecutivo de dashboard, cartera y FIRE.</p>
          </div>
          <div class="grid">
            <div class="card"><p class="metric-label">Patrimonio</p><p class="metric-value">${formatCurrencyByPreference(metrics.totalNetWorth, currency)}</p></div>
            <div class="card"><p class="metric-label">Tasa ahorro</p><p class="metric-value">${metrics.savingsRate === null ? "Sin datos" : `${metrics.savingsRate.toFixed(2)}%`}</p></div>
            <div class="card"><p class="metric-label">Ahorro anual</p><p class="metric-value">${formatCurrencyByPreference(metrics.annualSavings, currency)}</p></div>
            <div class="card"><p class="metric-label">Objetivo FIRE</p><p class="metric-value">${formatCurrencyByPreference(metrics.fireTarget, currency)}</p></div>
          </div>

          <div class="section">
            <h2>Alertas automaticas</h2>
            <p class="section-intro">Senales que conviene revisar al tomar decisiones del mes.</p>
            <ul class="list">${dashboardAlerts.map((alert) => `<li><strong>${alert.title}:</strong> ${alert.body}</li>`).join("")}</ul>
          </div>

          <div class="section">
            <h2>Recordatorios</h2>
            <p class="section-intro">Pendientes operativos para mantener el panel al dia.</p>
            ${dashboardReminders.length > 0 ? `<ul class="list">${dashboardReminders.map((reminder) => `<li><strong>${reminder.title}:</strong> ${reminder.body} <span class="muted">(${reminder.cta})</span></li>`).join("")}</ul>` : `<p class="muted">No hay recordatorios pendientes.</p>`}
          </div>

          <div class="section">
            <h2>Tendencia 6 meses</h2>
            <div class="small-grid">
              ${monthlyTrendPoints
                .map(
                  (point) => `<div class="card"><p class="metric-label">${point.label}</p><p style="margin-top:8px;"><strong>Ingresos:</strong> ${formatCurrencyByPreference(point.income, currency)}</p><p style="margin-top:6px;"><strong>Ahorro objetivo:</strong> ${formatCurrencyByPreference(point.savingsTarget, currency)}</p></div>`
                )
                .join("")}
            </div>
          </div>

          <div class="section">
            <h2>Cartera</h2>
            <p class="section-intro">Top de posiciones por valor consolidado en EUR.</p>
            <div>${topHoldings.map((holding) => `<span class="pill">${holding.name} · ${formatCurrencyByPreference(holding.valueEur, "EUR")}</span>`).join("")}</div>
          </div>

          <table>
            <thead><tr><th>Activo</th><th>Tipo</th><th>Valor EUR</th></tr></thead>
            <tbody>
              ${investmentRows
                .map((row) => {
                  const valueEur = convertToEur((Number(row.quantity) || 0) * (Number(row.current_price ?? row.average_buy_price) || 0), row.asset_currency, ratesToEur);
                  return `<tr><td>${row.asset_name}</td><td>${row.asset_type}</td><td>${formatCurrencyByPreference(valueEur, "EUR")}</td></tr>`;
                })
                .join("")}
            </tbody>
          </table>

          <div class="section">
            <h2>FIRE e IA</h2>
            <div class="small-grid">
              <div class="card">
                <p class="metric-label">Progreso FIRE</p>
                <p class="metric-value">${metrics.fireProgress.toFixed(2)}%</p>
                <p class="muted">${metrics.yearsToFire === null ? "Horizonte no alcanzable todavia" : `${metrics.yearsToFire} anos estimados hasta FIRE`}</p>
              </div>
              <div class="card">
                <p class="metric-label">Ultimos insights</p>
                ${aiInsights.length > 0 ? `<ul class="list">${aiInsights.slice(0, 4).map((insight) => `<li>${insight}</li>`).join("")}</ul>` : `<p class="muted">Sin insights disponibles en este momento.</p>`}
              </div>
            </div>
          </div>
        </body>
      </html>`;

    reportWindow.document.write(html);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  }, [aiInsights, currency, dashboardAlerts, dashboardReminders, investmentRows, metrics, monthlyTrendPoints, ratesToEur]);

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

  const renderDashboardWidget = useCallback(
    (widgetId: DashboardWidgetId) => {
      if (!metrics) {
        return null;
      }

      const widgetSize = widgetSizes[widgetId] ?? "expanded";
      const isCompact = widgetSize === "compact";
      const widgetWidth = widgetWidths[widgetId] ?? "full";
      const widthClass = widgetWidth === "full" ? "md:col-span-2 xl:col-span-12" : "";

      switch (widgetId) {
        case "netWorthChart":
          return (
            <section key={widgetId} className={`rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] ${isCompact ? "p-5" : "p-6"} text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] ${widthClass}`}>
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
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSaveSnapshot}
                      disabled={snapshotSaving || !metrics}
                      className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm text-white transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {snapshotSaving ? "Guardando..." : "Guardar snapshot ahora"}
                    </button>
                    <button
                      type="button"
                      onClick={handleExportCsvReport}
                      disabled={!metrics}
                      className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm text-white transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Exportar CSV
                    </button>
                    <button
                      type="button"
                      onClick={handleExportPdfReport}
                      disabled={!metrics}
                      className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm text-white transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Exportar PDF
                    </button>
                  </div>
                </div>
              </div>

              {snapshotMessage ? <p className="mt-4 text-sm text-emerald-300">{snapshotMessage}</p> : null}

              <div className={`mt-6 ${isCompact ? "h-[240px]" : "h-[320px]"}`}>
                {timelinePoints.length > 0 ? (
                  <Line data={timelineChartData} options={timelineChartOptions} />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-white/60 text-sm text-slate-500">
                    Aun no hay suficientes datos para dibujar la evolucion del patrimonio.
                  </div>
                )}
              </div>
            </section>
          );
        case "reminders":
          return (
            <section key={widgetId} className={`rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] ${isCompact ? "p-5" : "p-6"} text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] ${widthClass}`}>
              <SectionHeader
                eyebrow="Recordatorios automaticos"
                title="Pequenos pendientes para mantener el panel al dia"
                aside={
                  dismissedReminderIds.length > 0 ? (
                    <button
                      type="button"
                      onClick={restoreReminders}
                      className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm text-white transition hover:border-white/20 hover:bg-white/10"
                    >
                      Reactivar recordatorios
                    </button>
                  ) : null
                }
              />

              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {dashboardReminders.length > 0 ? (
                  dashboardReminders.map((reminder) => (
                    <article key={reminder.id} className="rounded-[24px] border border-sky-400/12 bg-white/6 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-sky-300">{reminder.title}</p>
                        <button
                          type="button"
                          onClick={() => dismissReminder(reminder.id)}
                          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                        >
                          Ocultar
                        </button>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-white/80">{reminder.body}</p>
                      {reminder.href ? (
                        <Link href={reminder.href} className="mt-3 inline-flex text-xs font-medium text-emerald-300 transition hover:text-emerald-200">
                          {reminder.cta}
                        </Link>
                      ) : (
                        <p className="mt-3 text-xs font-medium text-emerald-300">{reminder.cta}</p>
                      )}
                    </article>
                  ))
                ) : (
                  <article className="rounded-[24px] border border-emerald-400/12 bg-white/6 p-4 md:col-span-2 xl:col-span-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Todo en orden</p>
                    <p className="mt-3 text-sm leading-6 text-white/80">
                      No hay recordatorios pendientes ahora mismo. El panel tiene los datos clave bastante al dia.
                    </p>
                  </article>
                )}
              </div>
            </section>
          );
        case "alerts":
          return (
            <section key={widgetId} className={`rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] ${isCompact ? "p-5" : "p-6"} text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] ${widthClass}`}>
              <SectionHeader
                eyebrow="Alertas automaticas"
                title="Senales que conviene vigilar"
                description="Ajusta que reglas quieres ver y con que umbral para que el panel te avise solo de lo importante."
              />
              <div className="mt-6 rounded-[24px] border border-white/8 bg-white/6 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-sky-300">Configuracion</p>
                    <p className="mt-2 text-sm leading-6 text-white/72">Puedes activar, pausar o afinar cada alerta sin salir del dashboard.</p>
                  </div>
                  {alertRulesLoaded ? (
                    <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] text-white/70">Sincronizado</span>
                  ) : (
                    <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] text-white/70">Cargando...</span>
                  )}
                </div>
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  {alertRules.map((rule) => (
                    <article key={rule.key} className="rounded-[20px] border border-white/8 bg-slate-950/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-white">{rule.label}</p>
                          <p className="mt-1 text-xs leading-5 text-white/60">{rule.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void updateAlertRule(rule.key, { enabled: !rule.enabled })}
                          className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                            rule.enabled
                              ? "border border-emerald-400/20 bg-emerald-500/18 text-emerald-200"
                              : "border border-white/10 bg-white/6 text-white/60"
                          }`}
                        >
                          {rule.enabled ? "Activa" : "Pausada"}
                        </button>
                      </div>
                      {rule.threshold !== null ? (
                        <label className="mt-3 block">
                          <span className="text-[11px] uppercase tracking-[0.16em] text-white/46">Umbral</span>
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              type="number"
                              min={rule.min}
                              max={rule.max}
                              step={rule.step ?? 1}
                              value={rule.threshold}
                              onChange={(event) => {
                                const rawValue = Number(event.target.value);
                                const fallback = DASHBOARD_ALERT_RULE_DEFAULTS.find((item) => item.key === rule.key)?.threshold ?? 0;
                                void updateAlertRule(rule.key, {
                                  threshold: Number.isFinite(rawValue) ? rawValue : fallback
                                });
                              }}
                              className="w-28 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-300/40"
                            />
                            <span className="text-xs text-white/56">{rule.suffix ?? ""}</span>
                            {savingAlertRuleKey === rule.key ? <span className="text-[11px] text-emerald-300">Guardando...</span> : null}
                          </div>
                        </label>
                      ) : (
                        <p className="mt-3 text-[11px] text-white/46">{savingAlertRuleKey === rule.key ? "Guardando cambios..." : "Sin umbral numerico configurable."}</p>
                      )}
                    </article>
                  ))}
                </div>
              </div>
              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {dashboardAlerts.map((alert) => (
                  <article key={alert.id} className="rounded-[24px] border border-white/8 bg-white/6 p-4">
                    <p className={`text-xs uppercase tracking-[0.18em] ${alert.tone === "warning" ? "text-amber-300" : alert.tone === "success" ? "text-emerald-300" : "text-sky-300"}`}>
                      {alert.title}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-white/80">{alert.body}</p>
                  </article>
                ))}
              </div>
            </section>
          );
        case "monthlyTrend":
          return (
            <section key={widgetId} className={`rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] ${isCompact ? "p-5" : "p-6"} text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] ${widthClass}`}>
              <SectionHeader eyebrow="Historico mensual" title="Ingresos frente a ahorro objetivo" />
              <div className={`mt-6 ${isCompact ? "h-[220px]" : "h-[280px]"}`}>
                <Line data={monthlyTrendChartData} options={monthlyTrendChartOptions} />
              </div>
            </section>
          );
        case "fireOverview":
          return (
            <>
              <section key={`${widgetId}-progress`} className={`rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] ${isCompact ? "p-5" : "p-6"} text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] ${widgetWidth === "full" ? "md:col-span-2 xl:col-span-7" : "md:col-span-1 xl:col-span-6"}`}>
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

              <section key={`${widgetId}-horizon`} className={`rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] ${isCompact ? "p-5" : "p-6"} text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] ${widgetWidth === "full" ? "md:col-span-2 xl:col-span-5" : "md:col-span-1 xl:col-span-6"}`}>
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
            </>
          );
        case "aiInsights":
          return (
            <section key={widgetId} className={`rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] ${isCompact ? "p-5" : "p-6"} text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] ${widthClass}`}>
              <SectionHeader
                eyebrow="IA financiera"
                title="Lectura automatica de tus habitos"
                aside={
                  <button
                    className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={generateInsights}
                    disabled={aiLoading || !hasFinancialData}
                    type="button"
                  >
                    {aiLoading ? "Analizando..." : "Regenerar insights IA"}
                  </button>
                }
              />

              {!hasFinancialData ? (
                <p className="mt-4 text-sm text-white/64">Sin datos financieros suficientes para generar insights utiles.</p>
              ) : null}
              {aiError ? <p className="mt-4 text-sm text-red-700">{aiError}</p> : null}
              {!aiError && aiInsights.length === 0 && hasFinancialData ? (
                <p className="mt-4 text-sm text-white/64">Generando recomendaciones personalizadas...</p>
              ) : null}

              {aiInsights.length > 0 ? (
                <>
                  <div className={`mt-6 grid gap-3 ${isCompact ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
                    {aiInsights.map((insight: string) => (
                      <article key={insight} className="rounded-[24px] border border-white/8 bg-white/6 p-4 shadow-[0_16px_34px_rgba(2,8,23,0.26)]">
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
          );
        default:
          return null;
      }
    },
    [
      aiDebug,
      aiError,
      aiInsights,
      aiLoading,
      aiSource,
      chartRange,
      currency,
      dashboardAlerts,
      dashboardReminders,
      dateFormat,
      dismissedReminderIds.length,
      dismissReminder,
      generateInsights,
      handleExportCsvReport,
      handleExportPdfReport,
      handleSaveSnapshot,
      hasFinancialData,
      metrics,
      monthlyTrendChartData,
      monthlyTrendChartOptions,
      restoreReminders,
      snapshotMessage,
      snapshotRows.length,
      snapshotSaving,
      timelineChartData,
      timelineChartOptions,
      timelinePoints.length,
      timelineRangeVariations,
      widgetSizes,
      widgetWidths
    ]
  );

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
        supabase.from("investments").select("asset_name, asset_type, quantity, average_buy_price, current_price, asset_currency").eq("user_id", userId),
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
      setInvestmentRows(investmentRows);
      setSavingsTargetRows(savingsTargetRows);

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
                <section className="md:col-span-2 xl:col-span-12">
                  <EmptyStateCard
                    eyebrow="Primeros pasos"
                    title="Todavia no hay suficiente contexto financiero"
                    description="Registra ingresos, gastos o inversiones para activar metricas, alertas, IA y seguimiento historico del patrimonio."
                    actionLabel="Empieza por Presupuestos o Inversiones"
                    actionHref="/budgets"
                  />
                </section>
              ) : null}

            <section className="rounded-[26px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] p-5 text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] md:col-span-1 xl:col-span-6">
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Patrimonio total</p>
              <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(metrics.totalNetWorth, currency)}</p>
              <p className="mt-4 max-w-[24ch] text-sm leading-6 text-white/64">Caja neta acumulada mas valor actual de inversiones.</p>
            </section>

            <section className="rounded-[26px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] p-5 text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] md:col-span-1 xl:col-span-6">
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Tasa de ahorro</p>
              <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">
                {metrics.savingsRate === null ? "Sin datos" : `${metrics.savingsRate.toFixed(2)}%`}
              </p>
              <p className="mt-4 max-w-[24ch] text-sm leading-6 text-white/64">Basada en tu ahorro objetivo del mes actual frente a los ingresos del mes.</p>
            </section>

            <section className="rounded-[26px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] p-5 text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] md:col-span-1 xl:col-span-6">
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Ahorro anual</p>
              <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(metrics.annualSavings, currency)}</p>
              <p className="mt-4 max-w-[24ch] text-sm leading-6 text-white/64">Suma de tus objetivos de ahorro de los meses del año actual.</p>
            </section>

            <section className="rounded-[26px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] p-5 text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] md:col-span-1 xl:col-span-6">
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Objetivo FIRE</p>
              <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">
                {metrics.fireTarget > 0 ? formatCurrencyByPreference(metrics.fireTarget, currency) : "Sin calcular"}
              </p>
              <p className="mt-4 max-w-[24ch] text-sm leading-6 text-white/64">Calculado con la misma configuracion que tienes en la pagina FIRE.</p>
            </section>

            <section className="rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(8,22,39,0.98)_0%,rgba(9,33,47,0.96)_100%)] p-5 text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] md:col-span-2 xl:col-span-12">
              <SectionHeader
                eyebrow="Centro del mes"
                title="Lo importante antes de entrar al detalle"
                description="Un resumen operativo para saber si toca registrar, ajustar o revisar."
              />

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <article className="rounded-[24px] border border-white/8 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Ahorro del mes</p>
                  <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-white">{formatCurrencyByPreference(currentMonthSavingsTarget, currency)}</p>
                  <p className="mt-2 text-sm leading-6 text-white/72">
                    {currentMonthIncome > 0
                      ? `Objetivo sobre ${formatCurrencyByPreference(currentMonthIncome, currency)} de ingresos actuales.`
                      : "Todavia no hay ingresos del mes para contextualizar la tasa de ahorro."}
                  </p>
                </article>
                <article className="rounded-[24px] border border-white/8 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Siguiente accion</p>
                  <p className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-white">
                    {dashboardReminders[0]?.title ?? "Panel al dia"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/72">
                    {dashboardReminders[0]?.cta ?? "No hay pendientes urgentes. Puedes usar el dashboard como revisión rápida."}
                  </p>
                </article>
                <article className="rounded-[24px] border border-white/8 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Cobertura de cartera</p>
                  <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-white">
                    {investmentRows.length === 0 ? "Sin cartera" : `${investmentRows.filter((row) => row.current_price !== null).length}/${investmentRows.length}`}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/72">
                    {investmentRows.length === 0
                      ? "Aun no has registrado inversiones en la cartera."
                      : "Posiciones con precio actual guardado frente al total de activos registrados."}
                  </p>
                </article>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] p-6 text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] md:col-span-2 xl:col-span-12">
              <SectionHeader
                eyebrow="Widgets del dashboard"
                title="Personaliza lo que quieres ver primero"
                description="Puedes ocultar bloques que ahora no te aporten valor y mover arriba los que quieres revisar siempre primero."
                aside={
                  <button
                    type="button"
                    onClick={resetWidgets}
                    className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm text-white transition hover:border-white/20 hover:bg-white/10"
                  >
                    Restaurar orden
                  </button>
                }
              />

              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {widgetOrder.map((widgetId, index) => {
                  const widget = DASHBOARD_WIDGETS.find((entry) => entry.id === widgetId);
                  if (!widget) {
                    return null;
                  }

                  const hidden = hiddenWidgets.includes(widgetId);
                  return (
                    <article
                      key={widget.id}
                      draggable
                      onDragStart={() => setDraggedWidgetId(widget.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (draggedWidgetId) {
                          moveWidgetByDrop(draggedWidgetId, widget.id);
                        }
                        setDraggedWidgetId(null);
                      }}
                      onDragEnd={() => setDraggedWidgetId(null)}
                      className={`rounded-[24px] border border-white/8 bg-white/6 p-4 transition ${draggedWidgetId === widget.id ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">{widget.label}</p>
                          <p className="mt-2 text-sm leading-6 text-white/80">{widget.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleWidgetVisibility(widget.id)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                            hidden ? "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10" : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                          }`}
                        >
                          {hidden ? "Mostrar" : "Visible"}
                        </button>
                      </div>
                      <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => toggleWidgetWidth(widget.id)}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
                          >
                            {widgetWidths[widget.id] === "full" ? "Ancho normal" : "Ancho completo"}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleWidgetSize(widget.id)}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
                          >
                            {widgetSizes[widget.id] === "compact" ? "Expandir" : "Compactar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => moveWidget(widget.id, "up")}
                            disabled={index === 0}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Subir
                          </button>
                          <button
                            type="button"
                            onClick={() => moveWidget(widget.id, "down")}
                            disabled={index === widgetOrder.length - 1}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Bajar
                          </button>
                        </div>
                        <div className="grid gap-1 text-xs text-slate-400 sm:grid-cols-3">
                          <span>Posicion {index + 1}</span>
                          <span>{widgetSizes[widget.id] === "compact" ? "Compacto" : "Expandido"}</span>
                          <span>{widgetWidths[widget.id] === "full" ? "Completo" : "Normal"}</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            {visibleWidgetOrder.map((widgetId) => renderDashboardWidget(widgetId))}
          </>
        ) : null}
      </main>
    </>
  );
}







