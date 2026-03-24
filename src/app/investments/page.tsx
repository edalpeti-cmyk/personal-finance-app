"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  TooltipItem
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/supabase/use-auth-guard";
import AuthLoadingState from "@/components/auth-loading-state";
import SideNav from "@/components/side-nav";
import EmptyStateCard from "@/components/empty-state-card";
import SectionHeader from "@/components/section-header";
import { useTheme } from "@/components/theme-provider";
import { formatCurrencyByPreference } from "@/lib/preferences-format";
import { AssetCurrency, convertToEur, FALLBACK_RATES_TO_EUR, fetchRatesToEurAtDate, SUPPORTED_ASSET_CURRENCIES } from "@/lib/currency-rates";
import { AssetMarket } from "@/lib/market-prices";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, BarElement, Tooltip, Legend);

type AssetType = "stock" | "etf" | "crypto" | "fund" | "commodity" | "cash" | "real_estate" | "loan";

type InvestmentRow = {
  id: string;
  asset_name: string;
  asset_symbol: string | null;
  asset_isin: string | null;
  asset_type: AssetType;
  asset_currency: AssetCurrency;
  asset_market: AssetMarket | null;
  quantity: number;
  average_buy_price: number;
  current_price: number | null;
  purchase_date: string | null;
};

type InvestmentFormErrors = {
  assetName?: string;
  assetSymbol?: string;
  quantity?: string;
  commission?: string;
  averageBuyPrice?: string;
  currentPrice?: string;
  purchaseDate?: string;
};

type ToastState = { type: "success" | "error"; text: string } | null;
type ProfitFilter = "all" | "positive" | "negative";
type SortField = "asset_name" | "asset_type" | "currentValueEur" | "gainEur" | "gainPct" | "weightPct";
type SortDirection = "asc" | "desc";
type SavedInvestmentView = {
  name: string;
  searchTerm: string;
  typeFilter: AssetType | "all";
  marketFilter: AssetMarket | "all";
  profitFilter: ProfitFilter;
  sortField: SortField;
  sortDirection: SortDirection;
};
type SavedViewRow = {
  view_name: string;
  config: SavedInvestmentView;
};
type TypeChartRange = "daily" | "weekly" | "monthly" | "six_months" | "annual" | "current_year";
type TypeChartMode = "value" | "profitability";
type ComparisonMode = "weight" | "profitability";
type TransactionMode = "buy" | "sell";
type HistoryPoint = {
  snapshot_date: string;
  total_value_eur: number;
};
type InvestmentTransactionRow = {
  id: string;
  investment_id: string | null;
  transaction_type: "buy" | "sell";
  quantity: number;
  price_local: number;
  total_local: number;
  total_eur: number;
  asset_currency: AssetCurrency;
  fx_rate_to_eur: number | null;
  fx_rate_date: string | null;
  fx_provider: string | null;
  commission_local: number | null;
  commission_eur: number | null;
  realized_gain_eur: number | null;
  executed_at: string;
  created_at?: string;
};
type PeriodPerformance = {
  amount: number | null;
  pct: number | null;
};
type AssetLookupSuggestion = {
  symbol: string;
  name: string;
  isin: string | null;
  assetType: AssetType;
  market: AssetMarket;
  currency: AssetCurrency | null;
  exchange: string | null;
};
type EnrichedInvestment = InvestmentRow & {
  current: number;
  investedLocal: number;
  currentLocal: number;
  investedEur: number;
  currentValueEur: number;
  gainEur: number;
  gainPct: number | null;
  weightPct: number;
  fxImpactEur: number;
  assetPerformanceEur: number;
  historicalFxRate: number | null;
};

const ASSET_TYPES: Array<{ value: AssetType; label: string }> = [
  { value: "stock", label: "Accion" },
  { value: "etf", label: "ETF" },
  { value: "crypto", label: "Criptomoneda" },
  { value: "fund", label: "Fondo de inversion" },
  { value: "commodity", label: "Materia prima" },
  { value: "cash", label: "Efectivo" },
  { value: "real_estate", label: "Inmobiliario" },
  { value: "loan", label: "Prestamo" }
];

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock: "Accion",
  etf: "ETF",
  crypto: "Criptomoneda",
  fund: "Fondo de inversion",
  commodity: "Materia prima",
  cash: "Efectivo",
  real_estate: "Inmobiliario",
  loan: "Prestamo"
};

const MARKET_OPTIONS: Array<{ value: AssetMarket; label: string }> = [
  { value: "AUTO", label: "Auto" },
  { value: "US", label: "Estados Unidos" },
  { value: "ES", label: "Espana" },
  { value: "DE", label: "Alemania" },
  { value: "FR", label: "Francia" },
  { value: "NL", label: "Paises Bajos" },
  { value: "IT", label: "Italia" },
  { value: "UK", label: "Reino Unido" },
  { value: "DK", label: "Dinamarca" },
  { value: "CH", label: "Suiza" },
  { value: "SE", label: "Suecia" },
  { value: "FI", label: "Finlandia" },
  { value: "NO", label: "Noruega" }
];

const MARKET_LABELS: Record<AssetMarket, string> = Object.fromEntries(
  MARKET_OPTIONS.map((option) => [option.value, option.label])
) as Record<AssetMarket, string>;
const TYPE_RANGE_OPTIONS: Array<{ value: TypeChartRange; label: string }> = [
  { value: "daily", label: "Diaria" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensual" },
  { value: "six_months", label: "6 meses" },
  { value: "annual", label: "Anual" },
  { value: "current_year", label: "Ano actual" }
];
const INVESTMENT_VIEWS_KEY = "investment-saved-views";
const INVESTMENT_VIEW_SCOPE = "investments";
const INVESTMENT_COMPARISON_MODE_KEY = "investment-comparison-mode";
const INVESTMENT_FORM_OPEN_KEY = "investment-form-open";

function inputClass(hasError: boolean) {
  return `w-full rounded-2xl border bg-slate-950/80 px-4 py-2.5 text-sm text-slate-100 outline-none transition ${
    hasError ? "border-red-400 ring-2 ring-red-500/20" : "border-white/10 focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
  }`;
}

function formatNumber(value: number, digits: number) {
  return Number(value).toFixed(digits);
}

function formatCompactList(items: string[], maxVisible = 5) {
  if (items.length <= maxVisible) {
    return items.join(", ");
  }

  const visible = items.slice(0, maxVisible).join(", ");
  return `${visible} y ${items.length - maxVisible} mas`;
}

function formatProviderLabel(provider: string) {
  switch (provider) {
    case "coingecko":
      return "CoinGecko";
    case "alphavantage":
      return "Alpha Vantage";
    case "twelvedata":
      return "Twelve Data";
    case "stooq":
      return "Stooq";
    case "yahoo":
    default:
      return "Yahoo";
  }
}

function resolveRefreshAssetLabel(item: {
  asset_name?: string | null;
  assetName?: string | null;
  symbol?: string | null;
  resolvedSymbol?: string | null;
  id?: string | null;
}) {
  const candidates = [item.asset_name, item.assetName, item.symbol, item.resolvedSymbol]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (candidates.length > 0) {
    return candidates[0];
  }

  if (item.id) {
    return `Activo ${item.id.slice(0, 8)}`;
  }

  return "Activo sin nombre";
}

function isSameInvestmentPosition(
  existing: InvestmentRow,
  candidate: {
    assetName: string;
    assetSymbol: string;
    assetIsin: string;
    assetType: AssetType;
    assetCurrency: AssetCurrency;
    assetMarket: AssetMarket;
  }
) {
  const existingIsin = (existing.asset_isin ?? "").trim().toUpperCase();
  const candidateIsin = candidate.assetIsin.trim().toUpperCase();
  if (existingIsin && candidateIsin) {
    return existingIsin === candidateIsin;
  }

  const existingSymbol = (existing.asset_symbol ?? "").trim().toUpperCase();
  const candidateSymbol = candidate.assetSymbol.trim().toUpperCase();
  if (existingSymbol && candidateSymbol) {
    return (
      existingSymbol === candidateSymbol &&
      existing.asset_type === candidate.assetType &&
      existing.asset_currency === candidate.assetCurrency &&
      (existing.asset_market ?? "AUTO") === candidate.assetMarket
    );
  }

  return (
    existing.asset_name.trim().toLowerCase() === candidate.assetName.trim().toLowerCase() &&
    existing.asset_type === candidate.assetType &&
    existing.asset_currency === candidate.assetCurrency
  );
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === "\"" && inQuotes && nextChar === "\"") {
      current += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function buildEstimatedAssetEvolution(row: EnrichedInvestment) {
  const startDate = row.purchase_date ? new Date(`${row.purchase_date}T00:00:00`) : new Date();
  const now = new Date();
  const monthsDiff = Math.max(
    1,
    (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth())
  );
  const steps = Math.min(Math.max(monthsDiff + 1, 2), 12);
  const labels: string[] = [];
  const values: number[] = [];

  for (let index = 0; index < steps; index++) {
    const progress = steps === 1 ? 1 : index / (steps - 1);
    const pointDate = new Date(startDate.getFullYear(), startDate.getMonth() + Math.round(progress * monthsDiff), 1);
    const estimatedValue = row.investedEur + (row.currentValueEur - row.investedEur) * progress;
    labels.push(`${pointDate.getFullYear()}-${String(pointDate.getMonth() + 1).padStart(2, "0")}`);
    values.push(Number(estimatedValue.toFixed(2)));
  }

  return { labels, values };
}

function buildEstimatedTypeEvolution(rows: EnrichedInvestment[], ratesToEur: Record<AssetCurrency, number>) {
  const byMonth = new Map<string, number>();

  for (const row of rows) {
    const date = row.purchase_date ? new Date(`${row.purchase_date}T00:00:00`) : new Date();
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const current = Number(row.current ?? row.average_buy_price) || 0;
    const qty = Number(row.quantity) || 0;
    const valueEur = convertToEur(qty * current, row.asset_currency, ratesToEur);
    byMonth.set(key, (byMonth.get(key) ?? 0) + valueEur);
  }

  const labels: string[] = [];
  const values: number[] = [];
  let running = 0;

  Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([month, value]) => {
      running += value;
      const [year, monthNumber] = month.split("-");
      labels.push(
        new Date(Number(year), Number(monthNumber) - 1, 1).toLocaleString("es-ES", { month: "short", year: "2-digit" })
      );
      values.push(Number(running.toFixed(2)));
    });

  return { labels, values };
}

function calculatePeriodPerformance(history: HistoryPoint[], days: number): PeriodPerformance {
  if (history.length < 2) {
    return { amount: null, pct: null };
  }

  const latest = history[history.length - 1];
  const latestDate = new Date(latest.snapshot_date);
  const targetDate = new Date(latestDate);
  targetDate.setDate(targetDate.getDate() - days);

  let base: HistoryPoint | null = null;
  for (let index = history.length - 2; index >= 0; index--) {
    const point = history[index];
    if (new Date(point.snapshot_date) <= targetDate) {
      base = point;
      break;
    }
  }

  if (!base) {
    return { amount: null, pct: null };
  }

  const amount = latest.total_value_eur - base.total_value_eur;
  const pct = base.total_value_eur !== 0 ? (amount / base.total_value_eur) * 100 : null;

  return { amount, pct };
}

function normalizeDate(dateString: string) {
  if (dateString.includes("T")) {
    return new Date(dateString);
  }
  return new Date(`${dateString}T00:00:00`);
}

function collapseHistoryToDailyLatest(history: HistoryPoint[]) {
  const byDay = new Map<string, { timestamp: number; value: number }>();

  for (const row of history) {
    const dayKey = row.snapshot_date.slice(0, 10);
    const timestamp = normalizeDate(row.snapshot_date).getTime();
    const current = byDay.get(dayKey);

    if (!current || timestamp >= current.timestamp) {
      byDay.set(dayKey, {
        timestamp,
        value: Number(row.total_value_eur) || 0
      });
    }
  }

  return Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([snapshot_date, entry]) => ({
      snapshot_date,
      total_value_eur: Number(entry.value.toFixed(2))
    }));
}

function collapseTypeHistoryToDailyLatest(history: Array<HistoryPoint & { investment_id: string }>) {
  const byDayAndInvestment = new Map<string, Map<string, { timestamp: number; value: number }>>();

  for (const row of history) {
    const dayKey = row.snapshot_date.slice(0, 10);
    const timestamp = normalizeDate(row.snapshot_date).getTime();
    const investmentMap = byDayAndInvestment.get(dayKey) ?? new Map<string, { timestamp: number; value: number }>();
    const current = investmentMap.get(row.investment_id);

    if (!current || timestamp >= current.timestamp) {
      investmentMap.set(row.investment_id, {
        timestamp,
        value: Number(row.total_value_eur) || 0
      });
    }

    byDayAndInvestment.set(dayKey, investmentMap);
  }

  return Array.from(byDayAndInvestment.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([snapshot_date, investmentMap]) => {
      const total = Array.from(investmentMap.values()).reduce((sum, entry) => sum + entry.value, 0);
      return {
        snapshot_date,
        total_value_eur: Number(total.toFixed(2))
      };
    });
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

function endOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function endOfYear(date: Date) {
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
}

function getTypeRangeCheckpoints(range: TypeChartRange, firstDate: Date) {
  const now = new Date();
  const checkpoints: Array<{ date: Date; label: string }> = [];

  if (range === "daily") {
    const start = addDays(now, -29);
    for (let cursor = new Date(start); cursor <= now; cursor = addDays(cursor, 1)) {
      checkpoints.push({ date: endOfDay(cursor), label: cursor.toISOString().slice(5, 10) });
    }
  }

  if (range === "weekly") {
    const start = addDays(now, -84);
    for (let cursor = new Date(start); cursor <= now; cursor = addDays(cursor, 7)) {
      checkpoints.push({ date: endOfWeek(cursor), label: `Sem ${cursor.toISOString().slice(5, 10)}` });
    }
  }

  if (range === "monthly") {
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    for (let cursor = new Date(start); cursor <= now; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
      checkpoints.push({ date: endOfMonth(cursor), label: `${cursor.toLocaleString("es-ES", { month: "short" })} ${String(cursor.getFullYear()).slice(-2)}` });
    }
  }

  if (range === "six_months") {
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    for (let cursor = new Date(start); cursor <= now; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
      checkpoints.push({ date: endOfMonth(cursor), label: `${cursor.toLocaleString("es-ES", { month: "short" })} ${String(cursor.getFullYear()).slice(-2)}` });
    }
  }

  if (range === "current_year") {
    const start = new Date(now.getFullYear(), 0, 1);
    for (let cursor = new Date(start); cursor <= now; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
      checkpoints.push({ date: endOfMonth(cursor), label: cursor.toLocaleString("es-ES", { month: "short" }) });
    }
  }

  if (range === "annual") {
    const startYear = Math.max(firstDate.getFullYear(), now.getFullYear() - 4);
    for (let year = startYear; year <= now.getFullYear(); year++) {
      checkpoints.push({ date: endOfYear(new Date(year, 0, 1)), label: String(year) });
    }
  }

  return checkpoints;
}

function buildTypeHistoryTimeline(history: HistoryPoint[], range: TypeChartRange) {
  if (history.length === 0) {
    return [] as Array<{ label: string; value: number }>;
  }

  const checkpoints = getTypeRangeCheckpoints(range, normalizeDate(history[0].snapshot_date));
  let historyIndex = 0;
  let latestValue = Number(history[0].total_value_eur) || 0;
  const points: Array<{ label: string; value: number }> = [];

  for (const checkpoint of checkpoints) {
    while (historyIndex < history.length && normalizeDate(history[historyIndex].snapshot_date) <= checkpoint.date) {
      latestValue = Number(history[historyIndex].total_value_eur) || 0;
      historyIndex += 1;
    }

    points.push({ label: checkpoint.label, value: Number(latestValue.toFixed(2)) });
  }

  return points;
}

function sortTransactionsForCostBasis(transactions: InvestmentTransactionRow[]) {
  return [...transactions].sort((a, b) => {
    const byDate = (a.executed_at ?? "").localeCompare(b.executed_at ?? "");
    if (byDate !== 0) return byDate;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });
}

function buildTransactionCostBasisMap(transactions: InvestmentTransactionRow[]) {
  const grouped = new Map<string, InvestmentTransactionRow[]>();
  for (const row of transactions) {
    if (!row.investment_id) continue;
    const current = grouped.get(row.investment_id) ?? [];
    current.push(row);
    grouped.set(row.investment_id, current);
  }

  const map = new Map<
    string,
    {
      openQuantity: number;
      openCostEur: number;
      openCostLocal: number;
      avgFxRate: number | null;
      realizedGainEur: number;
    }
  >();

  for (const [investmentId, rows] of grouped.entries()) {
    let openQuantity = 0;
    let openCostEur = 0;
    let openCostLocal = 0;
    let realizedGainEur = 0;

    for (const row of sortTransactionsForCostBasis(rows)) {
      const quantity = Number(row.quantity) || 0;
      const totalLocal = Number(row.total_local) || 0;
      const totalEur = Number(row.total_eur) || 0;
      const commissionLocal = Number(row.commission_local ?? 0) || 0;
      const commissionEur = Number(row.commission_eur ?? 0) || 0;

      if (quantity <= 0) {
        continue;
      }

      if (row.transaction_type === "buy") {
        openQuantity += quantity;
        openCostLocal += totalLocal + commissionLocal;
        openCostEur += totalEur + commissionEur;
        continue;
      }

      const avgCostPerUnitEur = openQuantity > 0 ? openCostEur / openQuantity : 0;
      const avgCostPerUnitLocal = openQuantity > 0 ? openCostLocal / openQuantity : 0;
      const soldCostEur = avgCostPerUnitEur * quantity;
      const soldCostLocal = avgCostPerUnitLocal * quantity;
      const netSaleEur = totalEur - commissionEur;
      const fallbackRealizedGainEur = netSaleEur - soldCostEur;

      realizedGainEur += Number(row.realized_gain_eur ?? fallbackRealizedGainEur) || 0;
      openQuantity = Math.max(0, openQuantity - quantity);
      openCostEur = Math.max(0, openCostEur - soldCostEur);
      openCostLocal = Math.max(0, openCostLocal - soldCostLocal);
    }

    map.set(investmentId, {
      openQuantity,
      openCostEur,
      openCostLocal,
      avgFxRate: openCostLocal > 0 ? openCostEur / openCostLocal : null,
      realizedGainEur: Number(realizedGainEur.toFixed(4))
    });
  }

  return map;
}

export default function InvestmentsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { userId, authLoading } = useAuthGuard();
  const { showLocalValues, hideBalances } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [transactions, setTransactions] = useState<InvestmentTransactionRow[]>([]);
  const [realizedGainTotalEur, setRealizedGainTotalEur] = useState(0);
  const [ratesToEur, setRatesToEur] = useState<Record<AssetCurrency, number>>(FALLBACK_RATES_TO_EUR);

  const [assetName, setAssetName] = useState("");
  const [assetSymbol, setAssetSymbol] = useState("");
  const [assetIsin, setAssetIsin] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [assetCurrency, setAssetCurrency] = useState<AssetCurrency>("EUR");
  const [assetMarket, setAssetMarket] = useState<AssetMarket>("AUTO");
  const [transactionMode, setTransactionMode] = useState<TransactionMode>("buy");
  const [quantity, setQuantity] = useState("");
  const [commission, setCommission] = useState("");
  const [averageBuyPrice, setAverageBuyPrice] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [lookupQuery, setLookupQuery] = useState("");
  const [assetSuggestions, setAssetSuggestions] = useState<AssetLookupSuggestion[]>([]);
  const [assetLookupLoading, setAssetLookupLoading] = useState(false);
  const [errors, setErrors] = useState<InvestmentFormErrors>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<AssetType | "all">("all");
  const [marketFilter, setMarketFilter] = useState<AssetMarket | "all">("all");
  const [profitFilter, setProfitFilter] = useState<ProfitFilter>("all");
  const [sortField, setSortField] = useState<SortField>("currentValueEur");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [savedViews, setSavedViews] = useState<SavedInvestmentView[]>([]);
  const [viewName, setViewName] = useState("");
  const [selectedType, setSelectedType] = useState<AssetType | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedAssetHistory, setSelectedAssetHistory] = useState<HistoryPoint[]>([]);
  const [selectedAssetTransactions, setSelectedAssetTransactions] = useState<InvestmentTransactionRow[]>([]);
  const [selectedTypeHistory, setSelectedTypeHistory] = useState<HistoryPoint[]>([]);
  const [selectedTypeRange, setSelectedTypeRange] = useState<TypeChartRange>("monthly");
  const [selectedTypeChartMode, setSelectedTypeChartMode] = useState<TypeChartMode>("value");
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("weight");
  const [investmentFormOpen, setInvestmentFormOpen] = useState(true);
  const formRef = useRef<HTMLElement | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const backfillingTransactionsRef = useRef(false);
  const historicalFxCheckedRef = useRef<string | null>(null);
  const investmentNameById = useMemo(
    () => Object.fromEntries(investments.map((row) => [row.id, row.asset_name])),
    [investments]
  );

  const showToast = useCallback((nextToast: Exclude<ToastState, null>) => {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const formatAssetUnits = useCallback(
    (value: number, digits: number) => (hideBalances ? "••••" : formatNumber(value, digits)),
    [hideBalances]
  );

  useEffect(() => {
    const loadSavedViews = async () => {
      if (!userId) return;

      const raw = window.localStorage.getItem(INVESTMENT_VIEWS_KEY);
      let localViews: SavedInvestmentView[] = [];
      if (raw) {
        try {
          localViews = JSON.parse(raw) as SavedInvestmentView[];
        } catch {
          window.localStorage.removeItem(INVESTMENT_VIEWS_KEY);
        }
      }

      const { data, error } = await supabase
        .from("saved_views")
        .select("view_name, config")
        .eq("user_id", userId)
        .eq("view_scope", INVESTMENT_VIEW_SCOPE)
        .order("updated_at", { ascending: false });

      if (error) {
        if (localViews.length > 0) setSavedViews(localViews);
        return;
      }

      const remoteViews = ((data as SavedViewRow[] | null) ?? []).map((row) => ({
        name: row.view_name,
        searchTerm: row.config.searchTerm ?? "",
        typeFilter: row.config.typeFilter ?? "all",
        marketFilter: row.config.marketFilter ?? "all",
        profitFilter: row.config.profitFilter ?? "all",
        sortField: row.config.sortField ?? "currentValueEur",
        sortDirection: row.config.sortDirection ?? "desc"
      }));

      setSavedViews(remoteViews.length > 0 ? remoteViews : localViews);
    };

    void loadSavedViews();
  }, [supabase, userId]);

  useEffect(() => {
    window.localStorage.setItem(INVESTMENT_VIEWS_KEY, JSON.stringify(savedViews));
  }, [savedViews]);

  useEffect(() => {
    const storedMode = window.localStorage.getItem(INVESTMENT_COMPARISON_MODE_KEY);
    if (storedMode === "weight" || storedMode === "profitability") {
      setComparisonMode(storedMode);
    }
    const storedFormOpen = window.localStorage.getItem(INVESTMENT_FORM_OPEN_KEY);
    if (storedFormOpen === "true" || storedFormOpen === "false") {
      setInvestmentFormOpen(storedFormOpen === "true");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(INVESTMENT_COMPARISON_MODE_KEY, comparisonMode);
  }, [comparisonMode]);

  useEffect(() => {
    window.localStorage.setItem(INVESTMENT_FORM_OPEN_KEY, String(investmentFormOpen));
  }, [investmentFormOpen]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setTransactionMode("buy");
    setAssetName("");
    setAssetSymbol("");
    setAssetIsin("");
    setAssetType("stock");
    setAssetCurrency("EUR");
    setAssetMarket("AUTO");
    setQuantity("");
    setCommission("");
    setAverageBuyPrice("");
    setCurrentPrice("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setLookupQuery("");
    setAssetSuggestions([]);
    setErrors({});
  }, []);

  useEffect(() => {
    const trimmedQuery = lookupQuery.trim();
    if (trimmedQuery.length < 2) {
      setAssetSuggestions([]);
      setAssetLookupLoading(false);
      return;
    }

    const controller = new AbortController();
    setAssetLookupLoading(true);

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/investments/search-assets?q=${encodeURIComponent(trimmedQuery)}`, {
          cache: "no-store",
          signal: controller.signal
        });

        if (!response.ok) {
          setAssetSuggestions([]);
          setAssetLookupLoading(false);
          return;
        }

        const data = (await response.json()) as { suggestions?: AssetLookupSuggestion[] };
        setAssetSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
        setAssetLookupLoading(false);
      } catch {
        setAssetSuggestions([]);
        setAssetLookupLoading(false);
      }
    }, 280);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [lookupQuery]);

  const handleAssetSuggestionSelect = (suggestion: AssetLookupSuggestion) => {
    setLookupQuery(suggestion.symbol);
    setAssetSymbol(suggestion.symbol);
    setAssetName(suggestion.name);
    setAssetIsin(suggestion.isin ?? "");
    setAssetType(suggestion.assetType);
    setAssetMarket(suggestion.market);
    if (suggestion.currency && SUPPORTED_ASSET_CURRENCIES.includes(suggestion.currency)) {
      setAssetCurrency(suggestion.currency);
    }
    setAssetSuggestions([]);

    if (!editingId && transactionMode === "sell") {
      const matchingPosition =
        investments.find((row) =>
          isSameInvestmentPosition(row, {
            assetName: suggestion.name,
            assetSymbol: suggestion.symbol,
            assetIsin: suggestion.isin ?? "",
            assetType: suggestion.assetType,
            assetCurrency:
              suggestion.currency && SUPPORTED_ASSET_CURRENCIES.includes(suggestion.currency) ? suggestion.currency : assetCurrency,
            assetMarket: suggestion.market
          })
        ) ?? null;

      if (matchingPosition) {
        setAssetName(matchingPosition.asset_name);
        setAssetSymbol(matchingPosition.asset_symbol ?? suggestion.symbol);
        setAssetIsin(matchingPosition.asset_isin ?? suggestion.isin ?? "");
        setAssetType(matchingPosition.asset_type);
        setAssetCurrency(matchingPosition.asset_currency ?? "EUR");
        setAssetMarket(matchingPosition.asset_market ?? "AUTO");
        setAverageBuyPrice(String(Number(matchingPosition.average_buy_price) || 0));
        setCurrentPrice(String(Number(matchingPosition.current_price ?? matchingPosition.average_buy_price) || 0));
      }
    }

    void (async () => {
      try {
        const response = await fetch("/api/investments/lookup-price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetType: suggestion.assetType,
            symbol: suggestion.symbol,
            market: suggestion.market,
            assetCurrency:
              suggestion.currency && SUPPORTED_ASSET_CURRENCIES.includes(suggestion.currency) ? suggestion.currency : assetCurrency
          })
        });

        if (!response.ok) return;

        const data = (await response.json()) as { price?: number | null };
        if (typeof data.price === "number" && Number.isFinite(data.price)) {
          setCurrentPrice(String(data.price));
        }
      } catch {
        // Leave manual price entry available when lookup fails.
      }
    })();
  };

  const matchedSellPosition = useMemo(() => {
    if (editingId || transactionMode !== "sell") {
      return null;
    }

    const normalizedName = assetName.trim();
    const normalizedSymbol = assetSymbol.trim().toUpperCase();
    const normalizedIsin = assetIsin.trim().toUpperCase();

    if (!normalizedName && !normalizedSymbol && !normalizedIsin) {
      return null;
    }

    return (
      investments.find((row) =>
        isSameInvestmentPosition(row, {
          assetName: normalizedName,
          assetSymbol: normalizedSymbol,
          assetIsin: normalizedIsin,
          assetType,
          assetCurrency,
          assetMarket
        })
      ) ?? null
    );
  }, [assetCurrency, assetIsin, assetMarket, assetName, assetSymbol, assetType, editingId, investments, transactionMode]);

  const sellPreview = useMemo(() => {
    if (!matchedSellPosition || editingId || transactionMode !== "sell") {
      return null;
    }

    const sellQty = Number(quantity);
    if (!Number.isFinite(sellQty) || sellQty <= 0) {
      return null;
    }

    const salePrice = currentPrice ? Number(currentPrice) : Number(matchedSellPosition.current_price ?? matchedSellPosition.average_buy_price) || 0;
    if (!Number.isFinite(salePrice) || salePrice < 0) {
      return null;
    }

    const currency = matchedSellPosition.asset_currency ?? assetCurrency;
    const totalLocal = sellQty * salePrice;
    const fee = commission.trim() ? Number(commission) : 0;
    const netLocal = totalLocal - fee;
    const matchedCostBasis = buildTransactionCostBasisMap(transactions).get(matchedSellPosition.id);
    const avgCostPerUnitEur =
      matchedCostBasis && matchedCostBasis.openQuantity > 0
        ? matchedCostBasis.openCostEur / matchedCostBasis.openQuantity
        : convertToEur(Number(matchedSellPosition.average_buy_price) || 0, currency, ratesToEur);
    const totalEur = convertToEur(totalLocal, currency, ratesToEur);
    const feeEur = convertToEur(fee, currency, ratesToEur);
    const netEur = totalEur - feeEur;

    return {
      totalLocal,
      totalEur,
      feeLocal: fee,
      feeEur,
      netLocal,
      netEur,
      realizedGainEur: netEur - avgCostPerUnitEur * sellQty
    };
  }, [assetCurrency, commission, currentPrice, editingId, matchedSellPosition, quantity, ratesToEur, transactionMode, transactions]);

  useEffect(() => {
    if (!matchedSellPosition || editingId || transactionMode !== "sell") {
      return;
    }

    setAverageBuyPrice(String(Number(matchedSellPosition.average_buy_price) || 0));
    setCurrentPrice(String(Number(matchedSellPosition.current_price ?? matchedSellPosition.average_buy_price) || 0));
  }, [editingId, matchedSellPosition, transactionMode]);

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
        // fallback remains active
      }
    };

    void loadRates();
  }, []);

  const loadInvestments = useCallback(
    async (uid: string) => {
      const { data, error } = await supabase
        .from("investments")
        .select("id, asset_name, asset_symbol, asset_isin, asset_type, asset_currency, asset_market, quantity, average_buy_price, current_price, purchase_date")
        .eq("user_id", uid)
        .in("asset_type", ASSET_TYPES.map((type) => type.value))
        .order("purchase_date", { ascending: false });

      if (error) {
        setMessage(error.message);
        return;
      }

      setInvestments((data as InvestmentRow[]) ?? []);
    },
    [supabase]
  );

  const loadRealizedGainTotal = useCallback(
    async (uid: string) => {
      const { data, error } = await supabase
        .from("investment_transactions")
        .select("realized_gain_eur")
        .eq("user_id", uid)
        .eq("transaction_type", "sell");

      if (error) {
        return;
      }

      const total = ((data as Array<{ realized_gain_eur: number | null }>) ?? []).reduce(
        (sum, row) => sum + Number(row.realized_gain_eur ?? 0),
        0
      );

      setRealizedGainTotalEur(Number(total.toFixed(2)));
    },
    [supabase]
  );

  const loadTransactions = useCallback(
    async (uid: string) => {
      const { data, error } = await supabase
        .from("investment_transactions")
        .select("id, investment_id, transaction_type, quantity, price_local, total_local, total_eur, asset_currency, fx_rate_to_eur, fx_rate_date, fx_provider, commission_local, commission_eur, realized_gain_eur, executed_at, created_at")
        .eq("user_id", uid)
        .order("executed_at", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        return;
      }

      setTransactions((data as InvestmentTransactionRow[]) ?? []);
    },
    [supabase]
  );

  const backfillHistoricalTransactionFx = useCallback(
    async (uid: string, rows: InvestmentTransactionRow[]) => {
      const rowsNeedingReview = rows.filter((row) => row.asset_currency !== "EUR" && Boolean(row.executed_at));
      if (rowsNeedingReview.length === 0 || backfillingTransactionsRef.current) {
        return;
      }

      backfillingTransactionsRef.current = true;

      try {
        const rateCache = new Map<string, Record<AssetCurrency, number>>();
        const getRateForDate = async (date: string, currency: AssetCurrency) => {
          if (currency === "EUR") return 1;
          if (!rateCache.has(date)) {
            const rates = await fetchRatesToEurAtDate(date);
            rateCache.set(date, rates);
          }

          const cachedRates = rateCache.get(date);
          return cachedRates?.[currency] ?? FALLBACK_RATES_TO_EUR[currency] ?? 1;
        };

        const updates: Array<{
          id: string;
          total_eur: number;
          commission_eur: number;
          realized_gain_eur: number | null;
          fx_rate_to_eur: number;
          fx_rate_date: string;
          fx_provider: string;
        }> = [];

        const rowsByInvestment = new Map<string, InvestmentTransactionRow[]>();
        const rowsWithoutInvestment: InvestmentTransactionRow[] = [];

        for (const row of rows) {
          if (row.investment_id) {
            const current = rowsByInvestment.get(row.investment_id) ?? [];
            current.push(row);
            rowsByInvestment.set(row.investment_id, current);
          } else {
            rowsWithoutInvestment.push(row);
          }
        }

        for (const investmentRows of rowsByInvestment.values()) {
          let openQuantity = 0;
          let openCostEur = 0;

          for (const row of sortTransactionsForCostBasis(investmentRows)) {
            const quantityValue = Number(row.quantity) || 0;
            if (quantityValue <= 0) continue;

            const currency = row.asset_currency ?? "EUR";
            const fxRate = await getRateForDate(row.executed_at, currency);
            const totalLocal = Number(row.total_local) || 0;
            const commissionLocal = Number(row.commission_local ?? 0) || 0;
            const totalEur = Number((totalLocal * fxRate).toFixed(4));
            const commissionEur = Number((commissionLocal * fxRate).toFixed(4));
            const shouldRefreshBaseFields =
              !row.fx_rate_to_eur ||
              !row.fx_rate_date ||
              row.fx_rate_date !== row.executed_at ||
              row.fx_provider !== "frankfurter" ||
              Math.abs((Number(row.total_eur) || 0) - totalEur) > 0.01 ||
              Math.abs((Number(row.commission_eur ?? 0) || 0) - commissionEur) > 0.01;

            if (row.transaction_type === "buy") {
              openQuantity += quantityValue;
              openCostEur += totalEur + commissionEur;

              if (shouldRefreshBaseFields) {
                updates.push({
                  id: row.id,
                  total_eur: totalEur,
                  commission_eur: commissionEur,
                  realized_gain_eur: null,
                  fx_rate_to_eur: Number(fxRate.toFixed(8)),
                  fx_rate_date: row.executed_at,
                  fx_provider: "frankfurter"
                });
              }

              continue;
            }

            const avgCostPerUnitEur = openQuantity > 0 ? openCostEur / openQuantity : 0;
            const realizedGainEur = Number((totalEur - commissionEur - avgCostPerUnitEur * quantityValue).toFixed(4));
            const soldCostEur = avgCostPerUnitEur * quantityValue;
            const shouldRefreshSell =
              shouldRefreshBaseFields ||
              row.realized_gain_eur === null ||
              Math.abs(Number(row.realized_gain_eur ?? 0) - realizedGainEur) > 0.01;

            openQuantity = Math.max(0, openQuantity - quantityValue);
            openCostEur = Math.max(0, openCostEur - soldCostEur);

            if (shouldRefreshSell) {
              updates.push({
                id: row.id,
                total_eur: totalEur,
                commission_eur: commissionEur,
                realized_gain_eur: realizedGainEur,
                fx_rate_to_eur: Number(fxRate.toFixed(8)),
                fx_rate_date: row.executed_at,
                fx_provider: "frankfurter"
              });
            }
          }
        }

        for (const row of rowsWithoutInvestment) {
          const currency = row.asset_currency ?? "EUR";
          const fxRate = await getRateForDate(row.executed_at, currency);
          const totalLocal = Number(row.total_local) || 0;
          const commissionLocal = Number(row.commission_local ?? 0) || 0;
          const totalEur = Number((totalLocal * fxRate).toFixed(4));
          const commissionEur = Number((commissionLocal * fxRate).toFixed(4));
          const shouldRefreshBaseFields =
            !row.fx_rate_to_eur ||
            !row.fx_rate_date ||
            row.fx_rate_date !== row.executed_at ||
            row.fx_provider !== "frankfurter" ||
            Math.abs((Number(row.total_eur) || 0) - totalEur) > 0.01 ||
            Math.abs((Number(row.commission_eur ?? 0) || 0) - commissionEur) > 0.01;

          if (!shouldRefreshBaseFields) {
            continue;
          }

          updates.push({
            id: row.id,
            total_eur: totalEur,
            commission_eur: commissionEur,
            realized_gain_eur: row.realized_gain_eur,
            fx_rate_to_eur: Number(fxRate.toFixed(8)),
            fx_rate_date: row.executed_at,
            fx_provider: "frankfurter"
          });
        }

        if (updates.length === 0) {
          return;
        }

        const results = await Promise.all(
          updates.map((update) =>
            supabase
              .from("investment_transactions")
              .update({
                total_eur: update.total_eur,
                commission_eur: update.commission_eur,
                realized_gain_eur: update.realized_gain_eur,
                fx_rate_to_eur: update.fx_rate_to_eur,
                fx_rate_date: update.fx_rate_date,
                fx_provider: update.fx_provider
              })
              .eq("id", update.id)
              .eq("user_id", uid)
          )
        );

        const failed = results.find((result) => result.error);
        if (failed?.error) {
          showToast({ type: "error", text: "No se pudo completar el backfill historico de divisas." });
          return;
        }

        await Promise.all([loadTransactions(uid), loadRealizedGainTotal(uid)]);
        showToast({ type: "success", text: `${updates.length} operaciones antiguas han recuperado su tipo de cambio historico.` });
      } finally {
        backfillingTransactionsRef.current = false;
        historicalFxCheckedRef.current = uid;
      }
    },
    [loadRealizedGainTotal, loadTransactions, showToast, supabase]
  );

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      if (authLoading || !userId) {
        return;
      }

      await Promise.all([loadInvestments(userId), loadRealizedGainTotal(userId), loadTransactions(userId)]);
      setLoading(false);
    };

    void init();
  }, [authLoading, loadInvestments, loadRealizedGainTotal, loadTransactions, userId]);

  useEffect(() => {
    if (!userId || transactions.length === 0) {
      return;
    }

    if (historicalFxCheckedRef.current === userId) {
      return;
    }

    if (!transactions.some((row) => row.asset_currency !== "EUR")) {
      historicalFxCheckedRef.current = userId;
      return;
    }

    void backfillHistoricalTransactionFx(userId, transactions);
  }, [backfillHistoricalTransactionFx, transactions, userId]);

  const costBasisMap = useMemo(() => buildTransactionCostBasisMap(transactions), [transactions]);

  const metrics = useMemo(() => {
    return investments.reduce(
      (acc, row) => {
        const qty = Number(row.quantity) || 0;
        const avg = Number(row.average_buy_price) || 0;
        const current = Number(row.current_price ?? row.average_buy_price) || 0;
        const costBasis = costBasisMap.get(row.id);
        const invested = costBasis ? Number(costBasis.openCostEur.toFixed(4)) : convertToEur(qty * avg, row.asset_currency, ratesToEur);
        const currentValue = convertToEur(qty * current, row.asset_currency, ratesToEur);

        acc.totalValueEur += currentValue;
        acc.investedCapitalEur += invested;
        acc.trackedPositions += current > 0 && row.asset_symbol ? 1 : 0;
        return acc;
      },
      { totalValueEur: 0, investedCapitalEur: 0, trackedPositions: 0 }
    );
  }, [costBasisMap, investments, ratesToEur]);

  const profitEur = metrics.totalValueEur - metrics.investedCapitalEur;
  const profitability = metrics.investedCapitalEur > 0 ? (profitEur / metrics.investedCapitalEur) * 100 : null;
  const combinedProfitEur = profitEur + realizedGainTotalEur;

  const enrichedInvestments = useMemo<EnrichedInvestment[]>(() => {
    return investments.map((row) => {
      const qty = Number(row.quantity) || 0;
      const avg = Number(row.average_buy_price) || 0;
      const current = Number(row.current_price ?? row.average_buy_price) || 0;
      const investedLocal = qty * avg;
      const currentLocal = qty * current;
      const costBasis = costBasisMap.get(row.id);
      const investedEur = costBasis ? Number(costBasis.openCostEur.toFixed(4)) : convertToEur(investedLocal, row.asset_currency, ratesToEur);
      const currentValueEur = convertToEur(currentLocal, row.asset_currency, ratesToEur);
      const gainEur = currentValueEur - investedEur;
      const gainPct = investedEur > 0 ? (gainEur / investedEur) * 100 : null;
      const weightPct = metrics.totalValueEur > 0 ? (currentValueEur / metrics.totalValueEur) * 100 : 0;
      const historicalFxRate = costBasis?.avgFxRate ?? null;
      const currentFxRate = ratesToEur[row.asset_currency ?? "EUR"] ?? 1;
      const assetPerformanceEur = historicalFxRate ? (currentLocal - investedLocal) * historicalFxRate : gainEur;
      const fxImpactEur = historicalFxRate ? currentLocal * (currentFxRate - historicalFxRate) : 0;

      return {
        ...row,
        current,
        investedLocal,
        currentLocal,
        investedEur,
        currentValueEur,
        gainEur,
        gainPct,
        weightPct,
        fxImpactEur: Number(fxImpactEur.toFixed(4)),
        assetPerformanceEur: Number(assetPerformanceEur.toFixed(4)),
        historicalFxRate
      };
    });
  }, [costBasisMap, investments, metrics.totalValueEur, ratesToEur]);

  const filteredInvestments = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    const result = enrichedInvestments.filter((row) => {
      const matchesSearch =
        !search ||
        row.asset_name.toLowerCase().includes(search) ||
        (row.asset_symbol ?? "").toLowerCase().includes(search);
      const matchesType = typeFilter === "all" || row.asset_type === typeFilter;
      const matchesMarket = marketFilter === "all" || (row.asset_market ?? "AUTO") === marketFilter;
      const matchesProfit =
        profitFilter === "all" || (profitFilter === "positive" ? row.gainEur >= 0 : row.gainEur < 0);

      return matchesSearch && matchesType && matchesMarket && matchesProfit;
    });

    return result.sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;

      if (sortField === "asset_name" || sortField === "asset_type") {
        return a[sortField].localeCompare(b[sortField]) * direction;
      }

      return ((a[sortField] as number) - (b[sortField] as number)) * direction;
    });
  }, [enrichedInvestments, marketFilter, profitFilter, searchTerm, sortDirection, sortField, typeFilter]);

  const allocationByType = useMemo(() => {
    const totals = new Map<AssetType, { currentValue: number; investedValue: number }>();
    for (const row of enrichedInvestments) {
      const current = totals.get(row.asset_type) ?? { currentValue: 0, investedValue: 0 };
      current.currentValue += row.currentValueEur;
      current.investedValue += row.investedEur;
      totals.set(row.asset_type, current);
    }

    return Array.from(totals.entries())
      .map(([type, values]) => ({
        type,
        label: ASSET_TYPE_LABELS[type],
        value: values.currentValue,
        weightPct: metrics.totalValueEur > 0 ? (values.currentValue / metrics.totalValueEur) * 100 : 0,
        gainPct: values.investedValue > 0 ? ((values.currentValue - values.investedValue) / values.investedValue) * 100 : null
      }))
      .sort((a, b) => b.value - a.value);
  }, [enrichedInvestments, metrics.totalValueEur]);

  const topHoldings = useMemo(() => {
    return [...enrichedInvestments]
      .sort((a, b) => b.currentValueEur - a.currentValueEur)
      .slice(0, 5);
  }, [enrichedInvestments]);

  const allocationByCurrency = useMemo(() => {
    const totals = new Map<AssetCurrency, { currentValue: number; investedValue: number }>();
    for (const row of enrichedInvestments) {
      const currency = row.asset_currency ?? "EUR";
      const current = totals.get(currency) ?? { currentValue: 0, investedValue: 0 };
      current.currentValue += row.currentValueEur;
      current.investedValue += row.investedEur;
      totals.set(currency, current);
    }

    return Array.from(totals.entries())
      .map(([currency, values]) => ({
        currency,
        value: values.currentValue,
        weightPct: metrics.totalValueEur > 0 ? (values.currentValue / metrics.totalValueEur) * 100 : 0,
        gainPct: values.investedValue > 0 ? ((values.currentValue - values.investedValue) / values.investedValue) * 100 : null
      }))
      .sort((a, b) => b.value - a.value);
  }, [enrichedInvestments, metrics.totalValueEur]);

  const allocationByMarket = useMemo(() => {
    const totals = new Map<AssetMarket, { currentValue: number; investedValue: number }>();
    for (const row of enrichedInvestments) {
      const market = row.asset_market ?? "AUTO";
      const current = totals.get(market) ?? { currentValue: 0, investedValue: 0 };
      current.currentValue += row.currentValueEur;
      current.investedValue += row.investedEur;
      totals.set(market, current);
    }

    return Array.from(totals.entries())
      .map(([market, values]) => ({
        market,
        label: MARKET_LABELS[market],
        value: values.currentValue,
        weightPct: metrics.totalValueEur > 0 ? (values.currentValue / metrics.totalValueEur) * 100 : 0,
        gainPct: values.investedValue > 0 ? ((values.currentValue - values.investedValue) / values.investedValue) * 100 : null
      }))
      .sort((a, b) => b.value - a.value);
  }, [enrichedInvestments, metrics.totalValueEur]);

  const averagePositionGainPct = useMemo(() => {
    const gains = enrichedInvestments.map((row) => row.gainPct).filter((value): value is number => value !== null);
    if (gains.length === 0) {
      return null;
    }
    return gains.reduce((sum, value) => sum + value, 0) / gains.length;
  }, [enrichedInvestments]);
  const bestPerformer = useMemo(
    () =>
      [...enrichedInvestments]
        .filter((row) => row.gainPct !== null)
        .sort((a, b) => Number(b.gainPct ?? -Infinity) - Number(a.gainPct ?? -Infinity))[0] ?? null,
    [enrichedInvestments]
  );
  const worstPerformer = useMemo(
    () =>
      [...enrichedInvestments]
        .filter((row) => row.gainPct !== null)
        .sort((a, b) => Number(a.gainPct ?? Infinity) - Number(b.gainPct ?? Infinity))[0] ?? null,
    [enrichedInvestments]
  );
  const biggestPosition = topHoldings[0] ?? null;
  const profitablePositions = enrichedInvestments.filter((row) => row.gainEur >= 0).length;
  const winRate = enrichedInvestments.length > 0 ? (profitablePositions / enrichedInvestments.length) * 100 : null;
  const topThreeConcentration = topHoldings.slice(0, 3).reduce((sum, row) => sum + row.weightPct, 0);
  const stalePricePositions = enrichedInvestments.filter((row) => row.current_price === null).length;
  const diversificationScore = allocationByType.length;
  const concentrationAlerts = enrichedInvestments.filter((row) => row.weightPct >= 25);
  const drawdownAlerts = enrichedInvestments.filter((row) => (row.gainPct ?? 0) <= -10);
  const largestAssetType = allocationByType[0] ?? null;
  const effectivePositionCount = useMemo(() => {
    if (enrichedInvestments.length === 0 || metrics.totalValueEur <= 0) {
      return null;
    }

    const concentration = enrichedInvestments.reduce((sum, row) => {
      const weight = row.currentValueEur / metrics.totalValueEur;
      return sum + weight * weight;
    }, 0);

    return concentration > 0 ? 1 / concentration : null;
  }, [enrichedInvestments, metrics.totalValueEur]);
  const nonEurExposurePct = useMemo(() => {
    if (metrics.totalValueEur <= 0) {
      return 0;
    }

    const nonEurValue = allocationByCurrency
      .filter((item) => item.currency !== "EUR")
      .reduce((sum, item) => sum + item.value, 0);

    return (nonEurValue / metrics.totalValueEur) * 100;
  }, [allocationByCurrency, metrics.totalValueEur]);
  const realizedSharePct = useMemo(() => {
    const denominator = Math.abs(profitEur) + Math.abs(realizedGainTotalEur);
    if (denominator === 0) {
      return null;
    }

    return (Math.abs(realizedGainTotalEur) / denominator) * 100;
  }, [profitEur, realizedGainTotalEur]);
  const groupedAssetTypes = useMemo(() => {
    const groups = new Map<
      AssetType,
      {
        type: AssetType;
        label: string;
        count: number;
        totalValueEur: number;
        investedEur: number;
        gainEur: number;
        gainPct: number | null;
        topAsset: string | null;
      }
    >();

    for (const row of filteredInvestments) {
      const current = groups.get(row.asset_type) ?? {
        type: row.asset_type,
        label: ASSET_TYPE_LABELS[row.asset_type],
        count: 0,
        totalValueEur: 0,
        investedEur: 0,
        gainEur: 0,
        gainPct: null,
        topAsset: null
      };

      current.count += 1;
      current.totalValueEur += row.currentValueEur;
      current.investedEur += row.investedEur;
      current.gainEur += row.gainEur;
      if (!current.topAsset || row.currentValueEur > (filteredInvestments.find((item) => item.asset_name === current.topAsset)?.currentValueEur ?? -1)) {
        current.topAsset = row.asset_name;
      }
      current.gainPct = current.investedEur > 0 ? (current.gainEur / current.investedEur) * 100 : null;
      groups.set(row.asset_type, current);
    }

    return Array.from(groups.values()).sort((a, b) => b.totalValueEur - a.totalValueEur);
  }, [filteredInvestments]);
  const selectedTypeAssets = useMemo(
    () => (selectedType ? filteredInvestments.filter((row) => row.asset_type === selectedType) : []),
    [filteredInvestments, selectedType]
  );
  const selectedTypeSummary = useMemo(() => {
    const totalValueEur = selectedTypeAssets.reduce((sum, row) => sum + row.currentValueEur, 0);
    const investedEur = selectedTypeAssets.reduce((sum, row) => sum + row.investedEur, 0);
    const gainEur = totalValueEur - investedEur;
    const gainPct = investedEur > 0 ? (gainEur / investedEur) * 100 : null;
    const day = calculatePeriodPerformance(selectedTypeHistory, 1);
    const week = calculatePeriodPerformance(selectedTypeHistory, 7);
    const month = calculatePeriodPerformance(selectedTypeHistory, 30);

    return { totalValueEur, investedEur, gainEur, gainPct, day, week, month };
  }, [selectedTypeAssets, selectedTypeHistory]);
  const selectedAsset = useMemo(
    () => selectedTypeAssets.find((row) => row.id === selectedAssetId) ?? null,
    [selectedAssetId, selectedTypeAssets]
  );
  const selectedAssetEvolution = useMemo(() => {
    if (selectedAssetHistory.length > 1) {
      return {
        labels: selectedAssetHistory.map((point) => new Date(point.snapshot_date).toISOString().slice(0, 10)),
        values: selectedAssetHistory.map((point) => Number(point.total_value_eur))
      };
    }

    return selectedAsset ? buildEstimatedAssetEvolution(selectedAsset) : { labels: [], values: [] };
  }, [selectedAsset, selectedAssetHistory]);
  const selectedAssetReturnPctSeries = useMemo(() => {
    if (selectedAssetEvolution.values.length === 0) {
      return [] as number[];
    }

    const base = selectedAssetHistory.length > 1
      ? Number(selectedAssetHistory[0]?.total_value_eur ?? 0)
      : Number(selectedAsset?.investedEur ?? 0);

    if (!base || base <= 0) {
      return selectedAssetEvolution.values.map(() => 0);
    }

    return selectedAssetEvolution.values.map((value) => Number((((value - base) / base) * 100).toFixed(2)));
  }, [selectedAsset?.investedEur, selectedAssetEvolution.values, selectedAssetHistory]);
  const selectedAssetChartData = useMemo(
    () => ({
      labels: selectedAssetEvolution.labels,
      datasets: [
        {
          label: selectedAssetHistory.length > 1 ? "Valor real en EUR" : "Valor estimado en EUR",
          data: selectedAssetEvolution.values,
          borderColor: "#14b8a6",
          backgroundColor: "rgba(20, 184, 166, 0.14)",
          borderWidth: 3,
          fill: true,
          tension: 0.25
        },
        {
          label: "Rentabilidad %",
          data: selectedAssetReturnPctSeries,
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245, 158, 11, 0.1)",
          borderWidth: 2,
          fill: false,
          tension: 0.22,
          yAxisID: "yPct",
          pointRadius: 0
        }
      ]
    }),
    [selectedAssetEvolution, selectedAssetHistory.length, selectedAssetReturnPctSeries]
  );
  const selectedAssetIndex = useMemo(
    () => selectedTypeAssets.findIndex((row) => row.id === selectedAssetId),
    [selectedAssetId, selectedTypeAssets]
  );
  const previousAsset = selectedAssetIndex > 0 ? selectedTypeAssets[selectedAssetIndex - 1] : null;
  const nextAsset = selectedAssetIndex >= 0 && selectedAssetIndex < selectedTypeAssets.length - 1 ? selectedTypeAssets[selectedAssetIndex + 1] : null;
  const selectedAssetPerformance = useMemo(
    () => ({
      day: calculatePeriodPerformance(selectedAssetHistory, 1),
      week: calculatePeriodPerformance(selectedAssetHistory, 7),
      month: calculatePeriodPerformance(selectedAssetHistory, 30)
    }),
    [selectedAssetHistory]
  );
  const selectedTypeTimeline = useMemo(
    () => {
      if (selectedTypeHistory.length > 1) {
        return buildTypeHistoryTimeline(selectedTypeHistory, selectedTypeRange);
      }

      const estimated = buildEstimatedTypeEvolution(selectedTypeAssets, ratesToEur);
      return estimated.labels.map((label, index) => ({ label, value: estimated.values[index] ?? 0 }));
    },
    [ratesToEur, selectedTypeAssets, selectedTypeHistory, selectedTypeRange]
  );
  const selectedTypeUsesRealHistory = selectedTypeHistory.length > 1;
  const selectedTypeReturnPctSeries = useMemo(() => {
    if (selectedTypeTimeline.length === 0) {
      return [] as number[];
    }

    const base = Number(selectedTypeTimeline[0]?.value ?? 0);
    if (!base || base <= 0) {
      return selectedTypeTimeline.map(() => 0);
    }

    return selectedTypeTimeline.map((point) => Number((((point.value - base) / base) * 100).toFixed(2)));
  }, [selectedTypeTimeline]);
  const selectedTypeChartData = useMemo(
    () => ({
      labels: selectedTypeTimeline.map((point) => point.label),
      datasets: [
        {
          label: "Valor agregado EUR",
          data: selectedTypeTimeline.map((point) => point.value),
          borderColor: "#14b8a6",
          backgroundColor: "rgba(20, 184, 166, 0.14)",
          borderWidth: 3,
          fill: true,
          tension: 0.25,
          hidden: selectedTypeChartMode === "profitability"
        },
        {
          label: "Rentabilidad %",
          data: selectedTypeReturnPctSeries,
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245, 158, 11, 0.1)",
          borderWidth: 2,
          fill: false,
          tension: 0.22,
          yAxisID: "yPct",
          pointRadius: 0,
          hidden: selectedTypeChartMode === "value"
        }
      ]
    }),
    [selectedTypeChartMode, selectedTypeReturnPctSeries, selectedTypeTimeline]
  );
  const selectedTypeChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: "#cbd5e1", usePointStyle: true },
          onClick: () => undefined
        },
        tooltip: {
          callbacks: {
            label: (context: { dataset: { label?: string }; parsed: { y?: number | null } | number; dataIndex: number }) => {
              const rawValue =
                typeof context.parsed === "number"
                  ? context.parsed
                  : Number(context.parsed?.y ?? 0);
              const eurValue = selectedTypeTimeline[context.dataIndex]?.value ?? 0;
              const pctValue = selectedTypeReturnPctSeries[context.dataIndex] ?? 0;

              if ((context.dataset.label ?? "").includes("Rentabilidad")) {
                return `Rentabilidad: ${pctValue >= 0 ? "+" : ""}${pctValue.toFixed(2)}% · ${formatCurrencyByPreference(eurValue, "EUR")}`;
              }

              return `Valor: ${formatCurrencyByPreference(rawValue, "EUR")} · ${pctValue >= 0 ? "+" : ""}${pctValue.toFixed(2)}%`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#cbd5e1" } },
        y: {
          display: selectedTypeChartMode === "value",
          grid: { color: "rgba(148, 163, 184, 0.16)" },
          ticks: { color: "#cbd5e1", callback: (value: string | number) => formatCurrencyByPreference(Number(value), "EUR") }
        },
        yPct: {
          display: selectedTypeChartMode === "profitability",
          position: "right" as const,
          grid: { display: false },
          ticks: { color: "#fbbf24", callback: (value: string | number) => `${Number(value).toFixed(0)}%` }
        }
      }
    }),
    [selectedTypeChartMode, selectedTypeReturnPctSeries, selectedTypeTimeline]
  );

  const allocationChartData = useMemo(
    () => ({
      labels: allocationByType.map((item) => item.label),
      datasets: [
        {
          data: allocationByType.map((item) => Number(item.value.toFixed(2))),
          backgroundColor: ["#14b8a6", "#0f766e", "#1d4ed8", "#f59e0b", "#8b5cf6", "#ef4444", "#22c55e", "#64748b"],
          borderColor: "rgba(2, 8, 23, 0.35)",
          borderWidth: 2
        }
      ]
    }),
    [allocationByType]
  );

  const allocationChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: { color: "#e2e8f0", usePointStyle: true }
      },
      tooltip: {
        callbacks: {
          label: (context: { label?: string; parsed: number }) =>
            `${context.label ?? ""}: ${formatCurrencyByPreference(context.parsed, "EUR")}`
        }
      }
    }
  };

  const typeComparisonChartData = useMemo(
    () => ({
      labels: allocationByType.slice(0, 6).map((item) => item.label),
      datasets: [
        {
          label: comparisonMode === "weight" ? "Peso en cartera" : "Rentabilidad %",
          data: allocationByType
            .slice(0, 6)
            .map((item) => Number((comparisonMode === "weight" ? item.weightPct : item.gainPct ?? 0).toFixed(2))),
          backgroundColor: "#14b8a6",
          borderRadius: 10,
          maxBarThickness: 18
        }
      ]
    }),
    [allocationByType, comparisonMode]
  );

  const marketComparisonChartData = useMemo(
    () => ({
      labels: allocationByMarket.slice(0, 6).map((item) => item.label),
      datasets: [
        {
          label: comparisonMode === "weight" ? "Peso por mercado" : "Rentabilidad %",
          data: allocationByMarket
            .slice(0, 6)
            .map((item) => Number((comparisonMode === "weight" ? item.weightPct : item.gainPct ?? 0).toFixed(2))),
          backgroundColor: "#0ea5e9",
          borderRadius: 10,
          maxBarThickness: 18
        }
      ]
    }),
    [allocationByMarket, comparisonMode]
  );

  const currencyComparisonChartData = useMemo(
    () => ({
      labels: allocationByCurrency.slice(0, 6).map((item) => item.currency),
      datasets: [
        {
          label: comparisonMode === "weight" ? "Peso por divisa" : "Rentabilidad %",
          data: allocationByCurrency
            .slice(0, 6)
            .map((item) => Number((comparisonMode === "weight" ? item.weightPct : item.gainPct ?? 0).toFixed(2))),
          backgroundColor: "#8b5cf6",
          borderRadius: 10,
          maxBarThickness: 18
        }
      ]
    }),
    [allocationByCurrency, comparisonMode]
  );

  const comparisonChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y" as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: TooltipItem<"bar">) => `${formatNumber(Number(context.parsed.x ?? 0), 1)}%`
        }
      }
    },
    scales: {
      x: {
        grid: { color: "rgba(148, 163, 184, 0.12)" },
        ticks: {
          color: "#94a3b8",
          callback: (value: string | number) => `${Number(value).toFixed(0)}%`
        }
      },
      y: {
        grid: { display: false },
        ticks: { color: "#e2e8f0" }
      }
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortDirection(field === "asset_name" || field === "asset_type" ? "asc" : "desc");
  };

  const sortLabel = sortDirection === "asc" ? "↑" : "↓";

  const saveCurrentView = async () => {
    const trimmedName = viewName.trim();
    if (trimmedName.length < 2) {
      showToast({ type: "error", text: "Pon un nombre mas claro para guardar la vista." });
      return;
    }

    const nextView: SavedInvestmentView = {
      name: trimmedName,
      searchTerm,
      typeFilter,
      marketFilter,
      profitFilter,
      sortField,
      sortDirection
    };
    const nextViews = (() => {
      let computed: SavedInvestmentView[] = [];
      setSavedViews((current) => {
        computed = [...current.filter((view) => view.name !== trimmedName), nextView];
        return computed;
      });
      return computed;
    })();

    if (userId) {
      const { error } = await supabase.from("saved_views").upsert(
        {
          user_id: userId,
          view_scope: INVESTMENT_VIEW_SCOPE,
          view_name: trimmedName,
          config: nextView
        },
        { onConflict: "user_id,view_scope,view_name" }
      );

      if (error) {
        setSavedViews(nextViews.filter((view) => view.name !== trimmedName));
        showToast({ type: "error", text: "La vista se guardo en local, pero fallo la sincronizacion." });
        return;
      }
    }

    setViewName("");
    showToast({ type: "success", text: "Vista de cartera guardada." });
  };

  const applySavedView = (view: SavedInvestmentView) => {
    setSearchTerm(view.searchTerm);
    setTypeFilter(view.typeFilter);
    setMarketFilter(view.marketFilter);
    setProfitFilter(view.profitFilter);
    setSortField(view.sortField);
    setSortDirection(view.sortDirection);
    showToast({ type: "success", text: `Vista aplicada: ${view.name}.` });
  };

  const deleteSavedView = async (name: string) => {
    const previousViews = savedViews;
    setSavedViews((current) => current.filter((view) => view.name !== name));

    if (userId) {
      const { error } = await supabase
        .from("saved_views")
        .delete()
        .eq("user_id", userId)
        .eq("view_scope", INVESTMENT_VIEW_SCOPE)
        .eq("view_name", name);

      if (error) {
        setSavedViews(previousViews);
        showToast({ type: "error", text: "No se pudo borrar la vista guardada." });
        return;
      }
    }

    showToast({ type: "success", text: "Vista guardada eliminada." });
  };

  const handleExportPdfReport = useCallback(() => {
    const reportWindow = window.open("", "_blank", "width=1024,height=780");
    if (!reportWindow) {
      return;
    }

    const topRows = [...enrichedInvestments].sort((a, b) => b.currentValueEur - a.currentValueEur).slice(0, 12);
    const alertLines = [
      concentrationAlerts.length > 0 ? `${concentrationAlerts.length} activo(s) pesan 25% o mas de la cartera.` : null,
      drawdownAlerts.length > 0 ? `${drawdownAlerts.length} activo(s) caen 10% o mas frente al capital invertido.` : null,
      stalePricePositions > 0 ? `${stalePricePositions} posicion(es) siguen sin precio actual.` : null
    ].filter((value): value is string => Boolean(value));

    const html = `
      <html>
        <head>
          <title>Reporte de inversiones</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 28px; color: #0f172a; background: #f8fafc; }
            h1, h2 { margin: 0 0 8px; }
            p { margin: 0; }
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
            .bad { color: #b91c1c; }
            @media print { body { padding: 16px; } .card { break-inside: avoid; } }
          </style>
        </head>
        <body>
          <h1>Reporte de inversiones</h1>
          <p class="muted">Generado el ${new Date().toLocaleDateString("es-ES")} · Resumen de cartera, concentracion y rendimiento.</p>

          <div class="grid">
            <div class="card"><p class="metric-label">Valor total en EUR</p><p class="metric-value">${formatCurrencyByPreference(metrics.totalValueEur, "EUR")}</p></div>
            <div class="card"><p class="metric-label">Plusvalia latente</p><p class="metric-value ${profitEur >= 0 ? "good" : "bad"}">${formatCurrencyByPreference(profitEur, "EUR")}</p></div>
            <div class="card"><p class="metric-label">Plusvalia realizada</p><p class="metric-value ${realizedGainTotalEur >= 0 ? "good" : "bad"}">${formatCurrencyByPreference(realizedGainTotalEur, "EUR")}</p></div>
            <div class="card"><p class="metric-label">Resultado total</p><p class="metric-value ${combinedProfitEur >= 0 ? "good" : "bad"}">${formatCurrencyByPreference(combinedProfitEur, "EUR")}</p></div>
          </div>

          <div class="section">
            <h2>Senales rapidas</h2>
            <div>
              <span class="pill">Win rate: ${winRate === null ? "Sin datos" : `${formatNumber(winRate, 1)}%`}</span>
              <span class="pill">Top 3 concentracion: ${formatNumber(topThreeConcentration, 1)}%</span>
              <span class="pill">Precios conectados: ${metrics.trackedPositions}</span>
              <span class="pill">Cobertura de precios: ${enrichedInvestments.length === 0 ? "Sin datos" : `${enrichedInvestments.length - stalePricePositions}/${enrichedInvestments.length}`}</span>
            </div>
          </div>

          <div class="section">
            <h2>Analitica avanzada</h2>
            <p class="section-intro">Mejor y peor posicion junto con distribucion por tipo.</p>
            <ul class="list">
              <li><strong>Mejor posicion:</strong> ${bestPerformer ? `${bestPerformer.asset_name} (${bestPerformer.gainPct === null ? "Sin datos" : `${bestPerformer.gainPct >= 0 ? "+" : ""}${formatNumber(bestPerformer.gainPct, 2)}%`})` : "Sin datos"}</li>
              <li><strong>Posicion mas debil:</strong> ${worstPerformer ? `${worstPerformer.asset_name} (${worstPerformer.gainPct === null ? "Sin datos" : `${worstPerformer.gainPct >= 0 ? "+" : ""}${formatNumber(worstPerformer.gainPct, 2)}%`})` : "Sin datos"}</li>
            </ul>
            <div style="margin-top:12px;">
              ${allocationByType.map((item) => `<span class="pill">${item.label}: ${formatCurrencyByPreference(item.value, "EUR")} · ${formatNumber(item.weightPct, 1)}%</span>`).join("")}
            </div>
          </div>

          <div class="section">
            <h2>Alertas de cartera</h2>
            ${alertLines.length > 0 ? `<ul class="list">${alertLines.map((line) => `<li>${line}</li>`).join("")}</ul>` : `<p class="muted">Sin alertas relevantes en este momento.</p>`}
          </div>

          <div class="section">
            <h2>Posiciones principales</h2>
            <table>
              <thead>
                <tr>
                  <th>Activo</th>
                  <th>Tipo</th>
                  <th>Valor EUR</th>
                  <th>Plusvalia</th>
                  <th>Rentabilidad</th>
                </tr>
              </thead>
              <tbody>
                ${topRows
                  .map(
                    (row) => `
                      <tr>
                        <td>${row.asset_name}</td>
                        <td>${ASSET_TYPE_LABELS[row.asset_type]}</td>
                        <td>${formatCurrencyByPreference(row.currentValueEur, "EUR")}</td>
                        <td>${formatCurrencyByPreference(row.gainEur, "EUR")}</td>
                        <td>${row.gainPct === null ? "Sin datos" : `${row.gainPct >= 0 ? "+" : ""}${formatNumber(row.gainPct, 2)}%`}</td>
                      </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </body>
      </html>`;

    reportWindow.document.write(html);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  }, [
    allocationByType,
    bestPerformer,
    combinedProfitEur,
    concentrationAlerts.length,
    drawdownAlerts.length,
    enrichedInvestments,
    metrics.totalValueEur,
    metrics.trackedPositions,
    profitEur,
    realizedGainTotalEur,
    stalePricePositions,
    topThreeConcentration,
    winRate,
    worstPerformer
  ]);

  useEffect(() => {
    if (selectedType && !groupedAssetTypes.some((group) => group.type === selectedType)) {
      setSelectedType(null);
      setSelectedAssetId(null);
    }
  }, [groupedAssetTypes, selectedType]);

  useEffect(() => {
    if (selectedAssetId && !selectedTypeAssets.some((row) => row.id === selectedAssetId)) {
      setSelectedAssetId(null);
    }
  }, [selectedAssetId, selectedTypeAssets]);

  useEffect(() => {
    const loadTypeHistory = async () => {
      if (!selectedType || !userId || selectedTypeAssets.length === 0) {
        setSelectedTypeHistory([]);
        return;
      }

      const assetIds = selectedTypeAssets.map((row) => row.id);
      const { data, error } = await supabase
        .from("investment_price_history")
        .select("snapshot_date, total_value_eur, investment_id")
        .eq("user_id", userId)
        .in("investment_id", assetIds)
        .order("snapshot_date", { ascending: true });

      if (error) {
        setSelectedTypeHistory([]);
        return;
      }

      setSelectedTypeHistory(collapseTypeHistoryToDailyLatest((data as Array<HistoryPoint & { investment_id: string }>) ?? []));
    };

    void loadTypeHistory();
  }, [selectedType, selectedTypeAssets, supabase, userId]);

  useEffect(() => {
    const loadAssetHistory = async () => {
      if (!selectedAssetId || !userId) {
        setSelectedAssetHistory([]);
        return;
      }

      const { data, error } = await supabase
        .from("investment_price_history")
        .select("snapshot_date, total_value_eur")
        .eq("user_id", userId)
        .eq("investment_id", selectedAssetId)
        .order("snapshot_date", { ascending: true });

      if (error) {
        setSelectedAssetHistory([]);
        return;
      }

      setSelectedAssetHistory(collapseHistoryToDailyLatest((data as HistoryPoint[]) ?? []));
    };

    void loadAssetHistory();
  }, [selectedAssetId, supabase, userId]);

  useEffect(() => {
    const loadAssetTransactions = async () => {
      if (!selectedAssetId || !userId) {
        setSelectedAssetTransactions([]);
        return;
      }

      const { data } = await supabase
        .from("investment_transactions")
        .select("id, investment_id, transaction_type, quantity, price_local, total_local, total_eur, asset_currency, fx_rate_to_eur, fx_rate_date, fx_provider, commission_local, commission_eur, realized_gain_eur, executed_at, created_at")
        .eq("user_id", userId)
        .eq("investment_id", selectedAssetId)
        .order("executed_at", { ascending: false })
        .limit(12);

      setSelectedAssetTransactions((data as InvestmentTransactionRow[]) ?? []);
    };

    void loadAssetTransactions();
  }, [selectedAssetId, supabase, userId]);

  const evolution = useMemo(() => {
    const byMonth = new Map<string, { invested: number; current: number }>();

    for (const row of investments) {
      const date = row.purchase_date ? new Date(`${row.purchase_date}T00:00:00`) : new Date();
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const qty = Number(row.quantity) || 0;
      const avg = Number(row.average_buy_price) || 0;
      const current = Number(row.current_price ?? row.average_buy_price) || 0;
      const previous = byMonth.get(key) ?? { invested: 0, current: 0 };

      previous.invested += convertToEur(qty * avg, row.asset_currency, ratesToEur);
      previous.current += convertToEur(qty * current, row.asset_currency, ratesToEur);
      byMonth.set(key, previous);
    }

    const labels: string[] = [];
    const investedData: number[] = [];
    const currentData: number[] = [];
    let runningInvested = 0;
    let runningCurrent = 0;

    for (const key of Array.from(byMonth.keys()).sort()) {
      const values = byMonth.get(key);
      if (!values) continue;
      runningInvested += values.invested;
      runningCurrent += values.current;
      labels.push(key);
      investedData.push(Number(runningInvested.toFixed(2)));
      currentData.push(Number(runningCurrent.toFixed(2)));
    }

    return { labels, investedData, currentData };
  }, [investments, ratesToEur]);

  const chartData = {
    labels: evolution.labels,
    datasets: [
      {
        label: "Capital invertido (EUR)",
        data: evolution.investedData,
        borderColor: "#0f766e",
        backgroundColor: "rgba(15, 118, 110, 0.12)",
        borderWidth: 3,
        tension: 0.28
      },
      {
        label: "Valor actual (EUR)",
        data: evolution.currentData,
        borderColor: "#1d4ed8",
        backgroundColor: "rgba(29, 78, 216, 0.12)",
        borderWidth: 3,
        tension: 0.28
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: { usePointStyle: true, color: "#e2e8f0" }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#cbd5e1" } },
      y: {
        ticks: { color: "#cbd5e1", callback: (value: string | number) => formatCurrencyByPreference(Number(value), "EUR") },
        grid: { color: "rgba(148, 163, 184, 0.16)" }
      }
    }
  };

  const validateForm = () => {
    const nextErrors: InvestmentFormErrors = {};
    const cleanName = assetName.trim();
    const cleanSymbol = assetSymbol.trim();
    const qty = Number(quantity);
    const fee = commission.trim() ? Number(commission) : 0;
    const avg = Number(averageBuyPrice);
    const curr = currentPrice ? Number(currentPrice) : avg;
    const parsedDate = new Date(`${purchaseDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (cleanName.length < 2 || cleanName.length > 80) nextErrors.assetName = "El nombre debe tener entre 2 y 80 caracteres.";
    if (cleanSymbol.length > 24) nextErrors.assetSymbol = "El ticker o identificador no puede superar 24 caracteres.";
    else if (cleanSymbol && !/^[A-Z0-9.-]+$/.test(cleanSymbol)) nextErrors.assetSymbol = "El ticker solo admite A-Z, 0-9, punto y guion.";
    if (!Number.isFinite(qty) || qty <= 0) nextErrors.quantity = "La cantidad debe ser mayor que 0.";
    if (!Number.isFinite(fee) || fee < 0) nextErrors.commission = "La comision debe ser un numero valido >= 0.";
    if (!Number.isFinite(avg) || avg < 0) nextErrors.averageBuyPrice = "El precio medio debe ser un numero valido >= 0.";
    if (!Number.isFinite(curr) || curr < 0) nextErrors.currentPrice = "El precio actual debe ser un numero valido >= 0.";
    if (Number.isNaN(parsedDate.getTime())) nextErrors.purchaseDate = "La fecha de compra es obligatoria.";
    else if (parsedDate > today) nextErrors.purchaseDate = "La fecha no puede estar en el futuro.";

    setErrors(nextErrors);
    return { isValid: Object.keys(nextErrors).length === 0, cleanName, cleanSymbol, qty, fee, avg, curr };
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setToast(null);

    if (!userId) {
      setMessage("Debes iniciar sesion para gestionar inversiones.");
      return;
    }

    const validation = validateForm();
    if (!validation.isValid) {
      showToast({ type: "error", text: "Revisa los campos marcados antes de guardar." });
      return;
    }

    setSaving(true);

    const normalizedIsin = assetIsin.trim().toUpperCase();
    const existingPosition =
      !editingId
        ? investments.find((row) =>
            isSameInvestmentPosition(row, {
              assetName: validation.cleanName,
              assetSymbol: validation.cleanSymbol,
              assetIsin: normalizedIsin,
              assetType,
              assetCurrency,
              assetMarket
            })
          ) ?? null
        : null;

    const payload = {
      user_id: userId,
      asset_name: validation.cleanName,
      asset_symbol: validation.cleanSymbol || null,
      asset_isin: normalizedIsin || null,
      asset_type: assetType,
      asset_currency: assetCurrency,
      asset_market: assetMarket,
      quantity: validation.qty,
      average_buy_price: validation.avg,
      current_price: validation.curr,
      purchase_date: purchaseDate
    };

    if (!editingId && transactionMode === "sell") {
      if (!existingPosition) {
        showToast({ type: "error", text: "No existe una posicion previa para registrar esta venta." });
        setSaving(false);
        return;
      }

      const existingQty = Number(existingPosition.quantity) || 0;
      if (validation.qty > existingQty) {
        showToast({ type: "error", text: "No puedes vender mas cantidad de la que tienes en cartera." });
        setSaving(false);
        return;
      }

      const remainingQty = Number((existingQty - validation.qty).toFixed(8));
      const sellQuery =
        remainingQty <= 0
          ? supabase.from("investments").delete().eq("id", existingPosition.id).eq("user_id", userId)
          : supabase
              .from("investments")
              .update({
                ...payload,
                asset_name: existingPosition.asset_name,
                asset_symbol: existingPosition.asset_symbol,
                asset_isin: existingPosition.asset_isin,
                asset_type: existingPosition.asset_type,
                asset_currency: existingPosition.asset_currency,
                asset_market: existingPosition.asset_market,
                quantity: remainingQty,
                average_buy_price: Number(existingPosition.average_buy_price),
                purchase_date: existingPosition.purchase_date
              })
              .eq("id", existingPosition.id)
              .eq("user_id", userId);

      const { error } = await sellQuery;

      if (error) {
        setMessage(error.message);
        showToast({ type: "error", text: "No se pudo registrar la venta." });
        setSaving(false);
        return;
      }

      const salePrice = validation.curr;
      const tradeCurrency = existingPosition.asset_currency ?? assetCurrency;
      const tradeRatesToEur = await fetchRatesToEurAtDate(purchaseDate);
      const tradeFxRate = tradeCurrency === "EUR" ? 1 : tradeRatesToEur[tradeCurrency] ?? ratesToEur[tradeCurrency] ?? 1;
      const commissionLocal = Number(validation.fee || 0);
      const totalLocal = Number((validation.qty * salePrice).toFixed(4));
      const totalEur = Number((totalLocal * tradeFxRate).toFixed(4));
      const commissionEur = Number((commissionLocal * tradeFxRate).toFixed(4));
      const existingCostBasis = costBasisMap.get(existingPosition.id);
      const avgCostPerUnitEur =
        existingCostBasis && existingCostBasis.openQuantity > 0
          ? existingCostBasis.openCostEur / existingCostBasis.openQuantity
          : convertToEur(Number(existingPosition.average_buy_price) || 0, tradeCurrency, ratesToEur);
      const realizedGainEur = Number((totalEur - commissionEur - avgCostPerUnitEur * validation.qty).toFixed(4));

      await supabase.from("investment_transactions").insert({
        investment_id: existingPosition.id,
        user_id: userId,
        transaction_type: "sell",
        quantity: validation.qty,
        price_local: salePrice,
        total_local: totalLocal,
        total_eur: totalEur,
        asset_currency: tradeCurrency,
        fx_rate_to_eur: Number(tradeFxRate.toFixed(8)),
        fx_rate_date: purchaseDate,
        fx_provider: "frankfurter",
        commission_local: Number(commissionLocal.toFixed(4)),
        commission_eur: commissionEur,
        realized_gain_eur: realizedGainEur,
        executed_at: purchaseDate
      });

      resetForm();
      await loadInvestments(userId);
      await loadRealizedGainTotal(userId);
      await loadTransactions(userId);
      showToast({
        type: "success",
        text: remainingQty <= 0 ? "Venta registrada y posicion cerrada." : "Venta registrada y cantidad restada de la posicion existente."
      });
      setSaving(false);
      return;
    }

    let error: { message: string } | null = null;
    let transactionInvestmentId: string | null = null;

    if (editingId) {
      const result = await supabase.from("investments").update(payload).eq("id", editingId).eq("user_id", userId);
      error = result.error;
    } else if (existingPosition) {
      const existingQty = Number(existingPosition.quantity) || 0;
      const mergedQty = existingQty + validation.qty;
      const existingAvg = Number(existingPosition.average_buy_price) || 0;
      const mergedAverage =
        mergedQty > 0
          ? ((existingQty * existingAvg) + (validation.qty * validation.avg)) / mergedQty
          : validation.avg;
      const existingPurchaseDate = existingPosition.purchase_date ?? purchaseDate;
      const mergedPurchaseDate =
        existingPurchaseDate && existingPurchaseDate <= purchaseDate ? existingPurchaseDate : purchaseDate;

      const result = await supabase
        .from("investments")
        .update({
          ...payload,
          quantity: Number(mergedQty.toFixed(8)),
          average_buy_price: Number(mergedAverage.toFixed(6)),
          purchase_date: mergedPurchaseDate
        })
        .eq("id", existingPosition.id)
        .eq("user_id", userId);

      error = result.error;
      transactionInvestmentId = existingPosition.id;
    } else {
      const result = await supabase.from("investments").insert(payload).select("id").single();
      error = result.error;
      transactionInvestmentId = (result.data as { id: string } | null)?.id ?? null;
    }

    if (error) {
      setMessage(error.message);
      showToast({ type: "error", text: editingId ? "No se pudo actualizar la posicion." : "No se pudo guardar la posicion." });
      setSaving(false);
      return;
    }

    if (!editingId && transactionInvestmentId) {
      const tradeRatesToEur = await fetchRatesToEurAtDate(purchaseDate);
      const tradeFxRate = assetCurrency === "EUR" ? 1 : tradeRatesToEur[assetCurrency] ?? ratesToEur[assetCurrency] ?? 1;
      const totalLocal = Number((validation.qty * validation.avg).toFixed(4));
      const commissionLocal = Number((validation.fee || 0).toFixed(4));
      const totalEur = Number((totalLocal * tradeFxRate).toFixed(4));
      const commissionEur = Number((commissionLocal * tradeFxRate).toFixed(4));
      await supabase.from("investment_transactions").insert({
        investment_id: transactionInvestmentId,
        user_id: userId,
        transaction_type: "buy",
        quantity: validation.qty,
        price_local: validation.avg,
        total_local: totalLocal,
        total_eur: totalEur,
        asset_currency: assetCurrency,
        fx_rate_to_eur: Number(tradeFxRate.toFixed(8)),
        fx_rate_date: purchaseDate,
        fx_provider: "frankfurter",
        commission_local: commissionLocal,
        commission_eur: commissionEur,
        realized_gain_eur: null,
        executed_at: purchaseDate
      });
    }

    resetForm();
    await loadInvestments(userId);
    await loadTransactions(userId);
    showToast({
      type: "success",
      text: editingId
        ? "Posicion actualizada."
        : existingPosition
          ? "Compra sumada a la posicion existente y precio medio recalculado."
          : "Posicion guardada correctamente."
    });
    setSaving(false);
  };

  const handleEdit = (row: InvestmentRow) => {
    setEditingId(row.id);
    setAssetName(row.asset_name);
    setAssetSymbol(row.asset_symbol ?? "");
    setAssetIsin(row.asset_isin ?? "");
    setLookupQuery(row.asset_symbol ?? row.asset_name);
    setAssetSuggestions([]);
    setAssetType(row.asset_type);
    setAssetCurrency(row.asset_currency ?? "EUR");
    setAssetMarket(row.asset_market ?? "AUTO");
    setQuantity(String(row.quantity));
    setCommission("");
    setAverageBuyPrice(String(row.average_buy_price));
    setCurrentPrice(row.current_price === null ? "" : String(row.current_price));
    setPurchaseDate(row.purchase_date ?? new Date().toISOString().slice(0, 10));
    setErrors({});
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast({ type: "success", text: "Modo edicion activado para esta posicion." });
  };

  const handleDelete = async (id: string) => {
    if (!userId || !window.confirm("Se eliminara esta posicion. Deseas continuar?")) {
      return;
    }

    const { error } = await supabase.from("investments").delete().eq("id", id).eq("user_id", userId);
    if (error) {
      showToast({ type: "error", text: "No se pudo eliminar la posicion." });
      return;
    }

    if (editingId === id) {
      resetForm();
    }

    await loadInvestments(userId);
    showToast({ type: "success", text: "Posicion eliminada." });
  };

  const handleRefreshPrices = async (investmentId?: string) => {
    setRefreshingPrices(true);
    setMessage(null);
    const localNameById = investmentNameById;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch("/api/investments/refresh-prices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify(investmentId ? { investmentId } : {})
      });

      if (!response.ok) {
        showToast({ type: "error", text: "No se pudieron actualizar los precios ahora mismo." });
        setRefreshingPrices(false);
        return;
      }

      const data = (await response.json()) as {
        updated?: Array<{ id: string; asset_name?: string | null; assetName?: string | null; price: number; symbol: string | null; provider: string; resolvedSymbol: string }>;
        skipped?: Array<{ id: string; asset_name?: string | null; assetName?: string | null; symbol: string | null; reason: string }>;
      };

      await loadInvestments(userId as string);
      const updatedCount = data.updated?.length ?? 0;
      const skippedCount = data.skipped?.length ?? 0;
      showToast({
        type: updatedCount > 0 ? "success" : "error",
        text:
          updatedCount > 0
            ? `Precios actualizados: ${updatedCount}.${skippedCount > 0 ? ` Sin cambios: ${skippedCount}.` : ""}`
            : "No hubo precios disponibles para actualizar."
      });

      const updatedExamples = (data.updated ?? []).map((item) => {
        const assetLabel = resolveRefreshAssetLabel({
          ...item,
          asset_name: item.asset_name ?? localNameById[item.id] ?? null
        });
        const resolved = item.resolvedSymbol && item.resolvedSymbol !== item.symbol ? ` -> ${item.resolvedSymbol}` : "";
        return `${assetLabel}${resolved} (${formatProviderLabel(item.provider)})`;
      });
      const skippedExamples = (data.skipped ?? []).map((item) =>
        resolveRefreshAssetLabel({
          ...item,
          asset_name: item.asset_name ?? localNameById[item.id] ?? null
        })
      );

      if (skippedCount > 0 || updatedExamples.length > 0) {
        const parts: string[] = [];
        if (updatedExamples.length > 0) {
          parts.push(`Actualizados: ${formatCompactList(updatedExamples, 4)}.`);
        }
        if (skippedExamples.length > 0) {
          parts.push(`No devolvieron precio: ${formatCompactList(skippedExamples, 8)}.`);
        }
        if (skippedCount > 0) {
          parts.push("Si son activos europeos, revisa bolsa y ticker completo, por ejemplo SAN.MC, BMW.DE o VUSA.AS.");
        }
        setMessage(parts.join(" "));
      } else {
        setMessage(null);
      }
    } catch {
      showToast({ type: "error", text: "Error de red al actualizar precios." });
    } finally {
      setRefreshingPrices(false);
    }
  };

  const handleCsvImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!userId) {
      showToast({ type: "error", text: "Debes iniciar sesion para importar cartera." });
      return;
    }

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (lines.length < 2) {
        showToast({ type: "error", text: "El CSV no tiene suficientes filas." });
        return;
      }

      const headers = parseCsvLine(lines[0]).map((item) => item.toLowerCase());
      const getIndex = (name: string) => headers.indexOf(name);

      const required = ["asset_name", "asset_type", "asset_currency", "quantity", "average_buy_price"];
      const missing = required.filter((name) => getIndex(name) === -1);
      if (missing.length > 0) {
        showToast({ type: "error", text: `Faltan columnas obligatorias: ${missing.join(", ")}` });
        return;
      }

      const payload = lines.slice(1).map((line) => {
        const values = parseCsvLine(line);
        const read = (name: string) => {
          const index = getIndex(name);
          return index >= 0 ? values[index] ?? "" : "";
        };

        return {
          user_id: userId,
          asset_name: read("asset_name"),
          asset_symbol: read("asset_symbol") || null,
          asset_isin: read("asset_isin") || null,
          asset_type: read("asset_type") as AssetType,
          asset_currency: read("asset_currency") as AssetCurrency,
          asset_market: (read("asset_market") || "AUTO") as AssetMarket,
          quantity: Number(read("quantity")),
          average_buy_price: Number(read("average_buy_price")),
          current_price: read("current_price") ? Number(read("current_price")) : Number(read("average_buy_price")),
          purchase_date: read("purchase_date") || new Date().toISOString().slice(0, 10)
        };
      }).filter((row) =>
        row.asset_name &&
        ASSET_TYPES.some((type) => type.value === row.asset_type) &&
        SUPPORTED_ASSET_CURRENCIES.includes(row.asset_currency) &&
        Number.isFinite(row.quantity) &&
        row.quantity > 0 &&
        Number.isFinite(row.average_buy_price) &&
        row.average_buy_price >= 0 &&
        Number.isFinite(row.current_price ?? 0)
      );

      if (payload.length === 0) {
        showToast({ type: "error", text: "No se encontraron filas validas para importar." });
        return;
      }

      const { error } = await supabase.from("investments").insert(payload);
      if (error) {
        showToast({ type: "error", text: error.message });
        return;
      }

      await loadInvestments(userId);
      showToast({ type: "success", text: `${payload.length} posiciones importadas desde CSV.` });
    } catch {
      showToast({ type: "error", text: "No se pudo leer el CSV de inversiones." });
    } finally {
      if (csvInputRef.current) {
        csvInputRef.current.value = "";
      }
    }
  };

  if (authLoading) {
    return (
      <>
        <SideNav />
        <main className="mx-auto max-w-6xl p-6 md:pl-72">
          <AuthLoadingState title="Preparando inversiones" description="Estamos validando tu sesion antes de abrir tu cartera." />
        </main>
      </>
    );
  }

  return (
    <>
      <SideNav />
      <main className="page-enter relative z-10 mx-auto grid max-w-6xl gap-5 p-5 md:pl-72 xl:grid-cols-12">
        <section className="panel rounded-[30px] p-5 text-white md:p-7 xl:col-span-7">
          <p className="text-xs uppercase tracking-[0.26em] text-emerald-300">Portfolio tracker</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-white">Cartera con seguimiento real</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
            Anade activos, elige la moneda de cada posicion y calcula automaticamente el valor total convertido a EUR.
          </p>
        </section>

        <section className="rounded-[30px] border border-emerald-400/10 bg-[linear-gradient(180deg,rgba(7,19,35,0.98)_0%,rgba(9,29,48,0.98)_52%,rgba(10,63,70,0.92)_100%)] p-6 text-white shadow-[0_26px_60px_rgba(2,8,23,0.35)] xl:col-span-5">
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">Estado actual</p>
          <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold text-white">{formatCurrencyByPreference(metrics.totalValueEur, "EUR")}</p>
          <p className="mt-3 text-sm leading-6 text-slate-200">Valor total convertido automaticamente a EUR segun la moneda elegida en cada posicion.</p>
          <button
            type="button"
            onClick={() => void handleRefreshPrices()}
            disabled={refreshingPrices || investments.length === 0}
            className="mt-6 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshingPrices ? "Actualizando precios..." : "Actualizar precios reales"}
          </button>
        </section>

        {toast ? (
          <section className={`rounded-[24px] p-4 text-sm md:col-span-12 ${toast.type === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-red-200 bg-red-50 text-red-800"}`}>
            {toast.text}
          </section>
        ) : null}

        {message ? <section className="rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm text-red-800 md:col-span-12">{message}</section> : null}

        <section ref={formRef} className={`panel self-start rounded-[28px] p-5 text-white xl:col-span-7 ${editingId ? "ring-2 ring-teal-400/40" : ""}`}>
          <details
            className="group"
            open={investmentFormOpen}
            onToggle={(event) => setInvestmentFormOpen(event.currentTarget.open)}
          >
            <summary className="accordion-summary cursor-pointer list-none !flex-col !items-start !gap-3">
              <div className="accordion-summary-main w-full min-w-0">
                <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Formulario</p>
                <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">
                  {editingId ? "Editar posicion" : "Nueva posicion"}
                </h2>
              </div>
              <div className="accordion-summary-side !w-full !justify-between">
                <span className="accordion-metric">
                  {editingId ? "Edicion" : transactionMode === "sell" ? "Venta" : "Compra"}
                </span>
                <span className="accordion-chevron" aria-hidden="true">
                  v
                </span>
              </div>
            </summary>

            <div className="accordion-content">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Formulario</p>
                  <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">{editingId ? "Editar posicion" : "Nueva posicion"}</h2>
                </div>
                {editingId ? (
                  <button type="button" onClick={resetForm} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 hover:bg-white/10">
                    Cancelar edicion
                  </button>
                ) : null}
              </div>

              <form onSubmit={handleSubmit} className="mt-6 grid gap-4" noValidate>
            {!editingId ? (
              <div className="grid gap-3">
                <span className="text-sm text-slate-200">Operacion</span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTransactionMode("buy")}
                    className={`rounded-2xl border px-4 py-2.5 text-sm font-medium transition ${
                      transactionMode === "buy"
                        ? "border-emerald-400/40 bg-emerald-500 text-slate-950"
                        : "border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                    }`}
                  >
                    Compra
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransactionMode("sell")}
                    className={`rounded-2xl border px-4 py-2.5 text-sm font-medium transition ${
                      transactionMode === "sell"
                        ? "border-red-300/40 bg-red-400 text-slate-950"
                        : "border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                    }`}
                  >
                    Venta
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  {transactionMode === "sell"
                    ? "La venta descuenta cantidad de la posicion existente y la cierra si la dejas a cero."
                    : "Si compras mas del mismo activo, la app consolidara la posicion y recalculara el precio medio."}
                </p>
                {transactionMode === "sell" ? (
                  <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-sm text-slate-200">
                    {matchedSellPosition ? (
                      <div className="grid gap-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span>
                            Posicion detectada: <span className="font-medium text-white">{matchedSellPosition.asset_name}</span>
                          </span>
                          <span className="text-emerald-300">
                            Disponible: {formatAssetUnits(Number(matchedSellPosition.quantity) || 0, 8)} unidades
                          </span>
                        </div>
                        {sellPreview ? (
                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="rounded-2xl border border-white/8 bg-slate-950/50 px-4 py-3">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">Importe estimado</p>
                              <p className="mt-2 text-lg font-semibold text-white">
                                {formatCurrencyByPreference(sellPreview.totalLocal, matchedSellPosition.asset_currency ?? assetCurrency)}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">{formatCurrencyByPreference(sellPreview.totalEur, "EUR")} en EUR</p>
                            </div>
                            <div className="rounded-2xl border border-white/8 bg-slate-950/50 px-4 py-3">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">Impacto neto</p>
                              <p className="mt-2 text-lg font-semibold text-white">
                                {formatCurrencyByPreference(sellPreview.netLocal, matchedSellPosition.asset_currency ?? assetCurrency)}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                Comision: {formatCurrencyByPreference(sellPreview.feeLocal, matchedSellPosition.asset_currency ?? assetCurrency)} · {formatCurrencyByPreference(sellPreview.netEur, "EUR")} en EUR
                              </p>
                            </div>
                            <div className="rounded-2xl border border-white/8 bg-slate-950/50 px-4 py-3">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">Plusvalia realizada</p>
                              <p className={`mt-2 text-lg font-semibold ${sellPreview.realizedGainEur >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                                {formatCurrencyByPreference(sellPreview.realizedGainEur, "EUR")}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">Estimacion segun precio medio y precio de venta.</p>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-slate-300">Selecciona o escribe un activo existente para rellenar la posicion disponible.</span>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            <label className="grid gap-2 text-sm text-slate-200">
              Tipo de activo
              <select className={inputClass(false)} value={assetType} onChange={(e) => setAssetType(e.target.value as AssetType)}>
                {ASSET_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              Moneda del activo
              <select className={inputClass(false)} value={assetCurrency} onChange={(e) => setAssetCurrency(e.target.value as AssetCurrency)}>
                {SUPPORTED_ASSET_CURRENCIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              Mercado
              <select className={inputClass(false)} value={assetMarket} onChange={(e) => setAssetMarket(e.target.value as AssetMarket)}>
                {MARKET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-400">Si eliges mercado, la app probara automaticamente el ticker con el sufijo correcto, por ejemplo `SAN` + `Espana` da `SAN.MC`.</span>
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              Nombre
              <input className={inputClass(Boolean(errors.assetName))} value={assetName} onChange={(e) => setAssetName(e.target.value)} maxLength={80} />
              {errors.assetName ? <span className="text-xs text-red-700">{errors.assetName}</span> : null}
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              ISIN
              <input className={inputClass(false)} value={assetIsin} onChange={(e) => setAssetIsin(e.target.value.toUpperCase())} maxLength={12} placeholder="Opcional" />
              <span className="text-xs text-slate-400">Si eliges una sugerencia con ISIN disponible, este campo se completa automaticamente.</span>
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              Ticker / simbolo / ISIN
              <input
                className={inputClass(Boolean(errors.assetSymbol))}
                value={lookupQuery}
                onChange={(e) => {
                  const nextValue = e.target.value.toUpperCase();
                  setLookupQuery(nextValue);
                  setAssetSymbol(nextValue);
                }}
                maxLength={20}
                placeholder="Ej: SAN, VUSA, BTC-USD o un ISIN"
              />
              <span className="text-xs text-slate-400">Escribe ticker, simbolo o ISIN y elige el activo sugerido. Si no aparece, puedes seguir rellenando a mano.</span>
              {assetLookupLoading ? <span className="text-xs text-emerald-300">Buscando activos...</span> : null}
              {assetSuggestions.length > 0 ? (
                <div className="grid gap-2 rounded-3xl border border-white/8 bg-white/5 p-3">
                  {assetSuggestions.map((suggestion) => (
                    <button
                      key={`${suggestion.symbol}-${suggestion.market}-${suggestion.exchange ?? "na"}`}
                      type="button"
                      onClick={() => handleAssetSuggestionSelect(suggestion)}
                      className="rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-3 text-left transition hover:border-emerald-400/20 hover:bg-white/10"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-white">{suggestion.name}</p>
                          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-400">
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-300">{suggestion.symbol}</span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{ASSET_TYPE_LABELS[suggestion.assetType]}</span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Mercado: {MARKET_LABELS[suggestion.market]}</span>
                            {suggestion.exchange ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Bolsa: {suggestion.exchange}</span> : null}
                            {suggestion.currency ? <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-300">Moneda: {suggestion.currency}</span> : null}
                          </div>
                          {suggestion.isin ? <p className="mt-2 text-[11px] text-slate-500">ISIN: {suggestion.isin}</p> : null}
                        </div>
                        <div className="text-right text-xs text-slate-300">
                          <p className="mt-1 text-emerald-300">Elegir</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
              {errors.assetSymbol ? <span className="text-xs text-red-700">{errors.assetSymbol}</span> : null}
            </label>

            <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              <label className="grid gap-2 text-sm text-slate-200">
                Cantidad
                <input className={inputClass(Boolean(errors.quantity))} type="number" min="0" step="0.00000001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                {errors.quantity ? <span className="text-xs text-red-700">{errors.quantity}</span> : null}
              </label>

              <label className="grid gap-2 text-sm text-slate-200">
                Comision ({assetCurrency})
                <input className={inputClass(Boolean(errors.commission))} type="number" min="0" step="0.0001" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="Opcional" />
                {errors.commission ? <span className="text-xs text-red-700">{errors.commission}</span> : <span className="text-xs text-slate-400">Se usa para calcular impacto neto y plusvalia realizada.</span>}
              </label>

              <label className="grid gap-2 text-sm text-slate-200 xl:col-span-2 2xl:col-span-1">
                {editingId ? "Fecha de compra" : transactionMode === "sell" ? "Fecha de venta" : "Fecha de compra"}
                <input className={inputClass(Boolean(errors.purchaseDate))} type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
                {errors.purchaseDate ? <span className="text-xs text-red-700">{errors.purchaseDate}</span> : null}
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-200">
                {editingId ? `Precio medio (${assetCurrency})` : transactionMode === "sell" ? `Precio medio en cartera (${assetCurrency})` : `Precio medio (${assetCurrency})`}
                <input className={inputClass(Boolean(errors.averageBuyPrice))} type="number" min="0" step="0.0001" value={averageBuyPrice} onChange={(e) => setAverageBuyPrice(e.target.value)} />
                {errors.averageBuyPrice ? <span className="text-xs text-red-700">{errors.averageBuyPrice}</span> : null}
              </label>

              <label className="grid gap-2 text-sm text-slate-200">
                {editingId ? `Precio actual (${assetCurrency})` : transactionMode === "sell" ? `Precio de venta / actual (${assetCurrency})` : `Precio actual (${assetCurrency})`}
                <input className={inputClass(Boolean(errors.currentPrice))} type="number" min="0" step="0.0001" value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} placeholder="Opcional" />
                {errors.currentPrice ? <span className="text-xs text-red-700">{errors.currentPrice}</span> : null}
              </label>
            </div>

            <button className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50" disabled={saving || loading} type="submit">
              {saving ? "Guardando..." : editingId ? "Guardar cambios" : transactionMode === "sell" ? "Registrar venta" : "Anadir activo"}
            </button>
              </form>
            </div>
          </details>
        </section>

        <section className="grid gap-3 xl:col-span-5 md:grid-cols-2">
          <article className="kpi-card rounded-[24px] p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Valor total en EUR</p>
            <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-tight text-white">{formatCurrencyByPreference(metrics.totalValueEur, "EUR")}</p>
            <p className="mt-3 max-w-[28ch] text-sm leading-6 text-slate-300">Suma del valor actual de tus posiciones, consolidada en EUR.</p>
          </article>
          <article className="kpi-card rounded-[24px] p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Plusvalia latente</p>
            <p className={`mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-tight ${profitEur >= 0 ? "text-emerald-300" : "text-red-300"}`}>
              {formatCurrencyByPreference(profitEur, "EUR")}
            </p>
            <p className={`mt-3 text-sm font-medium ${profitability === null ? "text-slate-300" : profitability >= 0 ? "text-emerald-300" : "text-red-300"}`}>
              {profitability === null ? "Sin porcentaje" : `${profitability >= 0 ? "+" : ""}${formatNumber(profitability, 2)}%`}
            </p>
            <p className="mt-3 max-w-[28ch] text-sm leading-6 text-slate-300">Resultado aun no realizado de las posiciones que sigues manteniendo en cartera.</p>
          </article>
          <article className="kpi-card rounded-[24px] p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Plusvalia realizada</p>
            <p className={`mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-tight ${realizedGainTotalEur >= 0 ? "text-emerald-300" : "text-red-300"}`}>
              {formatCurrencyByPreference(realizedGainTotalEur, "EUR")}
            </p>
            <p className="mt-3 max-w-[28ch] text-sm leading-6 text-slate-300">Suma acumulada de ganancias o perdidas cerradas en tus ventas.</p>
          </article>
          <article className="kpi-card rounded-[24px] p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Resultado total</p>
            <p className={`mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-tight ${combinedProfitEur >= 0 ? "text-emerald-300" : "text-red-300"}`}>
              {formatCurrencyByPreference(combinedProfitEur, "EUR")}
            </p>
            <p className="mt-3 max-w-[28ch] text-sm leading-6 text-slate-300">Suma de la plusvalia latente actual y la plusvalia ya realizada en ventas.</p>
          </article>
          <article className="kpi-card rounded-[24px] p-4 md:col-span-1">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Precios conectados</p>
            <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-tight text-white">{metrics.trackedPositions}</p>
            <p className="mt-3 max-w-[28ch] text-sm leading-6 text-slate-300">Activos con simbolo valido para actualizar precio automaticamente.</p>
          </article>
          <article className="kpi-card rounded-[24px] p-4 md:col-span-1">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Mayor posicion</p>
            <p className="mt-3 font-[var(--font-heading)] text-[2rem] font-semibold leading-tight text-white">{biggestPosition ? biggestPosition.asset_name : "Sin datos"}</p>
            <p className="mt-3 max-w-[28ch] text-sm leading-6 text-slate-300">
              {biggestPosition ? `${biggestPosition.weightPct.toFixed(1)}% del portfolio` : "Anade posiciones para medir concentracion."}
            </p>
          </article>
        </section>

        <section className="panel rounded-[28px] p-5 text-white xl:col-span-12">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Evolucion</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Crecimiento del portfolio en EUR</h2>
            </div>
          </div>
          <div className="mt-6 h-[320px]">
            {evolution.labels.length > 0 ? (
              <Line data={chartData} options={chartOptions} />
            ) : (
              <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-white/15 bg-white/5 text-sm text-slate-300">
                Aun no hay suficiente historico para dibujar la evolucion.
              </div>
            )}
          </div>
        </section>

        <section className="panel rounded-[28px] p-5 text-white xl:col-span-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Analisis de cartera</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Distribucion por tipo de activo</h2>
            </div>
            <p className="text-sm text-slate-400">{diversificationScore} tipos activos, {profitablePositions} posiciones en positivo</p>
          </div>

          <div className="mt-5 grid gap-4">
            <div className="min-w-0 grid gap-3 md:grid-cols-2">
            {allocationByType.length > 0 ? (
              allocationByType.map((item) => (
                <article key={item.type} className="rounded-[24px] border border-white/8 bg-white/5 p-3.5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-sm font-semibold text-emerald-300">
                      {item.weightPct.toFixed(0)}%
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate font-medium text-white">{item.label}</p>
                        <p className="shrink-0 text-sm font-medium text-slate-200">{formatCurrencyByPreference(item.value, "EUR")}</p>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e_0%,#14b8a6_100%)]" style={{ width: `${Math.min(item.weightPct, 100)}%` }} />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                        <span>Peso en cartera</span>
                        <span>{item.weightPct.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-300">Aun no hay datos suficientes para analizar la distribucion.</p>
            )}
            </div>

            <div className="min-w-0 overflow-hidden rounded-[24px] border border-white/8 bg-white/5 p-3.5">
              <p className="text-sm font-medium text-white">Grafico de distribucion</p>
              <div className="relative mt-4 h-[320px] w-full">
                {allocationByType.length > 0 ? (
                  <Doughnut data={allocationChartData} options={allocationChartOptions} />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-300">Sin datos para el grafico.</div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="panel rounded-[28px] p-5 text-white xl:col-span-5">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Concentracion</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Posiciones con mas peso</h2>

          <div className="mt-6 grid gap-3">
            {topHoldings.length > 0 ? (
              topHoldings.map((row) => (
                <article key={row.id} className="rounded-3xl border border-white/8 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-white">{row.asset_name}</p>
                      <p className="mt-1 text-sm text-slate-400">{row.asset_symbol ?? row.asset_type}</p>
                    </div>
                    <p className="text-sm font-medium text-emerald-300">{row.weightPct.toFixed(1)}%</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-400">{formatCurrencyByPreference(row.currentValueEur, "EUR")}</span>
                    <span className={row.gainEur >= 0 ? "text-emerald-300" : "text-red-300"}>
                      {formatCurrencyByPreference(row.gainEur, "EUR")}
                      {row.gainPct === null ? "" : ` · ${row.gainPct >= 0 ? "+" : ""}${formatNumber(row.gainPct, 2)}%`}
                    </span>
                  </div>
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-300">Aun no hay posiciones para analizar.</p>
            )}
          </div>
        </section>

        <section className="panel rounded-[28px] p-5 text-white xl:col-span-12">
          <details className="group">
            <summary className="accordion-summary cursor-pointer list-none">
              <div className="accordion-summary-main">
                <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Analitica avanzada</p>
                <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Lectura extra de cartera</h2>
              </div>
              <div className="accordion-summary-side">
                <span className="accordion-metric">
                  {enrichedInvestments.length === 0 ? "Sin datos" : `${enrichedInvestments.length - stalePricePositions}/${enrichedInvestments.length} precios`}
                </span>
                <span className="accordion-chevron" aria-hidden="true">v</span>
              </div>
            </summary>

          <div className="accordion-content mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <article className="rounded-3xl border border-white/8 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Plusvalia latente</p>
              <p className={`mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-none ${profitEur >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                {formatCurrencyByPreference(profitEur, "EUR")}
              </p>
              <p className="mt-3 text-sm text-slate-300">Resultado no realizado de las posiciones que siguen abiertas.</p>
            </article>
            <article className="rounded-3xl border border-white/8 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Plusvalia realizada</p>
              <p className={`mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-none ${realizedGainTotalEur >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                {formatCurrencyByPreference(realizedGainTotalEur, "EUR")}
              </p>
              <p className="mt-3 text-sm text-slate-300">Beneficio o perdida ya consolidada tras las ventas registradas.</p>
            </article>
            <article className="rounded-3xl border border-white/8 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Rentabilidad media</p>
              <p className={`mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-none ${averagePositionGainPct !== null && averagePositionGainPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                {averagePositionGainPct === null ? "Sin datos" : `${averagePositionGainPct >= 0 ? "+" : ""}${formatNumber(averagePositionGainPct, 2)}%`}
              </p>
              <p className="mt-3 text-sm text-slate-300">Media simple de la rentabilidad porcentual de tus posiciones abiertas.</p>
            </article>
            <article className="rounded-3xl border border-white/8 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Mejor posicion</p>
              <p className="mt-3 text-xl font-semibold leading-tight text-white">{bestPerformer ? bestPerformer.asset_name : "Sin datos"}</p>
              <p className={`mt-3 text-sm font-medium ${bestPerformer && (bestPerformer.gainPct ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                {bestPerformer?.gainPct === null || !bestPerformer ? "Sin porcentaje" : `${bestPerformer.gainPct >= 0 ? "+" : ""}${formatNumber(bestPerformer.gainPct, 2)}%`}
              </p>
              <p className="mt-3 text-sm text-slate-300">La posicion abierta con mejor comportamiento porcentual ahora mismo.</p>
            </article>
            <article className="rounded-3xl border border-white/8 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Posicion mas debil</p>
              <p className="mt-3 text-xl font-semibold leading-tight text-white">{worstPerformer ? worstPerformer.asset_name : "Sin datos"}</p>
              <p className={`mt-3 text-sm font-medium ${worstPerformer && (worstPerformer.gainPct ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                {worstPerformer?.gainPct === null || !worstPerformer ? "Sin porcentaje" : `${worstPerformer.gainPct >= 0 ? "+" : ""}${formatNumber(worstPerformer.gainPct, 2)}%`}
              </p>
              <p className="mt-3 text-sm text-slate-300">La posicion abierta con peor comportamiento porcentual.</p>
            </article>
            <article className="rounded-3xl border border-white/8 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Win rate</p>
              <p className={`mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-none ${winRate !== null && winRate >= 50 ? "text-emerald-300" : "text-amber-300"}`}>
                {winRate === null ? "Sin datos" : `${formatNumber(winRate, 1)}%`}
              </p>
              <p className="mt-3 text-sm text-slate-300">
                {profitablePositions} de {enrichedInvestments.length} posiciones abiertas estan en positivo.
              </p>
            </article>
            <article className="rounded-3xl border border-white/8 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Top 3 concentracion</p>
              <p className={`mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-none ${topThreeConcentration >= 60 ? "text-amber-300" : "text-white"}`}>
                {formatNumber(topThreeConcentration, 1)}%
              </p>
              <p className="mt-3 text-sm text-slate-300">Porcentaje conjunto que ocupan las tres posiciones de mayor peso.</p>
            </article>
            <article className="rounded-3xl border border-white/8 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Cobertura de precios</p>
              <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-none text-white">
                {enrichedInvestments.length === 0 ? "Sin datos" : `${enrichedInvestments.length - stalePricePositions}/${enrichedInvestments.length}`}
              </p>
              <p className="mt-3 text-sm text-slate-300">
                {stalePricePositions === 0
                  ? "Todas tus posiciones tienen precio actual guardado."
                  : `${stalePricePositions} posicion(es) siguen sin precio actual y pueden sesgar el valor total.`}
              </p>
            </article>
            <article className="rounded-3xl border border-white/8 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Diversificacion efectiva</p>
              <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-none text-white">
                {effectivePositionCount === null ? "Sin datos" : formatNumber(effectivePositionCount, 1)}
              </p>
              <p className="mt-3 text-sm text-slate-300">Numero efectivo de posiciones tras descontar el peso real de las mas concentradas.</p>
            </article>
            <article className="rounded-3xl border border-white/8 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Exposicion no EUR</p>
              <p className={`mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-none ${nonEurExposurePct >= 50 ? "text-amber-300" : "text-white"}`}>
                {formatNumber(nonEurExposurePct, 1)}%
              </p>
              <p className="mt-3 text-sm text-slate-300">Parte de la cartera abierta que depende de divisas distintas del euro.</p>
            </article>
            <article className="rounded-3xl border border-white/8 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Tipo dominante</p>
              <p className="mt-3 text-xl font-semibold leading-tight text-white">{largestAssetType ? largestAssetType.label : "Sin datos"}</p>
              <p className="mt-3 text-sm font-medium text-slate-200">
                {largestAssetType ? `${formatNumber(largestAssetType.weightPct, 1)}% del valor total` : "Sin peso suficiente para medir"}
              </p>
              <p className="mt-3 text-sm text-slate-300">Te ayuda a ver de un vistazo si la cartera depende demasiado de un solo bloque.</p>
            </article>
            <article className="rounded-3xl border border-white/8 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Ganancia ya cristalizada</p>
              <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-none text-white">
                {realizedSharePct === null ? "Sin datos" : `${formatNumber(realizedSharePct, 1)}%`}
              </p>
              <p className="mt-3 text-sm text-slate-300">Peso que tienen las ventas realizadas dentro del resultado total combinado de la cartera.</p>
            </article>
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Distribucion por divisa</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {allocationByCurrency.length > 0 ? (
                  allocationByCurrency.map((item) => (
                    <article key={item.currency} className="rounded-3xl border border-white/8 bg-white/5 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-white">{item.currency}</p>
                        <p className="text-sm text-slate-200">{formatCurrencyByPreference(item.value, "EUR")}</p>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-[linear-gradient(90deg,#1d4ed8_0%,#38bdf8_100%)]" style={{ width: `${Math.min(item.weightPct, 100)}%` }} />
                      </div>
                      <p className="mt-2 text-xs text-slate-400">{item.weightPct.toFixed(1)}% del valor total de cartera</p>
                    </article>
                  ))
                ) : (
                  <div className="rounded-[24px] border border-white/8 bg-white/5 p-4 text-sm text-slate-300">Aun no hay divisas suficientes para analizar la distribucion monetaria.</div>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Distribucion por mercado</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {allocationByMarket.length > 0 ? (
                  allocationByMarket.map((item) => (
                    <article key={item.market} className="rounded-3xl border border-white/8 bg-white/5 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-white">{item.label}</p>
                        <p className="text-sm text-slate-200">{formatCurrencyByPreference(item.value, "EUR")}</p>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e_0%,#34d399_100%)]" style={{ width: `${Math.min(item.weightPct, 100)}%` }} />
                      </div>
                      <p className="mt-2 text-xs text-slate-400">{item.weightPct.toFixed(1)}% del valor total de cartera</p>
                    </article>
                  ))
                ) : (
                  <div className="rounded-[24px] border border-white/8 bg-white/5 p-4 text-sm text-slate-300">Aun no hay mercados suficientes para analizar la diversificacion geografica.</div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-3">
            <div className="xl:col-span-3 flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Modo comparativa</span>
              <button
                type="button"
                onClick={() => setComparisonMode("weight")}
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                  comparisonMode === "weight"
                    ? "border border-emerald-400/20 bg-emerald-500/14 text-emerald-100"
                    : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                Peso
              </button>
              <button
                type="button"
                onClick={() => setComparisonMode("profitability")}
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                  comparisonMode === "profitability"
                    ? "border border-emerald-400/20 bg-emerald-500/14 text-emerald-100"
                    : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                Rentabilidad %
              </button>
            </div>
            <article className="rounded-3xl border border-white/8 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Comparativa por tipo</p>
              <p className="mt-2 text-sm text-slate-400">
                {comparisonMode === "weight"
                  ? "Que bloques pesan mas dentro de la cartera abierta."
                  : "Que bloques aportan mas o menos rentabilidad porcentual."}
              </p>
              <div className="mt-4 h-[220px]">
                <Bar data={typeComparisonChartData} options={comparisonChartOptions} />
              </div>
            </article>
            <article className="rounded-3xl border border-white/8 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Comparativa por mercado</p>
              <p className="mt-2 text-sm text-slate-400">
                {comparisonMode === "weight"
                  ? "Lectura rapida de la exposicion geografica o de bolsa."
                  : "Rentabilidad comparada entre bolsas o mercados donde inviertes."}
              </p>
              <div className="mt-4 h-[220px]">
                <Bar data={marketComparisonChartData} options={comparisonChartOptions} />
              </div>
            </article>
            <article className="rounded-3xl border border-white/8 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Comparativa por divisa</p>
              <p className="mt-2 text-sm text-slate-400">
                {comparisonMode === "weight"
                  ? "Cuanta parte del riesgo total depende de cada moneda."
                  : "Rentabilidad agregada que te aporta cada bloque de divisa."}
              </p>
              <div className="mt-4 h-[220px]">
                <Bar data={currencyComparisonChartData} options={comparisonChartOptions} />
              </div>
            </article>
          </div>
          </details>
        </section>

        <section className="panel rounded-[28px] p-5 text-white xl:col-span-12">
          <SectionHeader
            eyebrow="Posiciones"
            title="Tipos de activo"
            description="Primero eliges el tipo de activo y luego abres los activos concretos dentro de ese grupo."
          />

          <div className="mt-6 grid gap-4 xl:grid-cols-6">
            <label className="grid gap-2 text-sm text-slate-200 xl:col-span-2">
              Buscar por nombre o ticker
              <input
                className={inputClass(false)}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Ej: Apple, SAN, BTC"
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              Filtrar por tipo
              <select className={inputClass(false)} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as AssetType | "all")}>
                <option value="all">Todos</option>
                {ASSET_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              Filtrar por mercado
              <select className={inputClass(false)} value={marketFilter} onChange={(e) => setMarketFilter(e.target.value as AssetMarket | "all")}>
                <option value="all">Todos</option>
                {MARKET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              Filtrar por rentabilidad
              <select className={inputClass(false)} value={profitFilter} onChange={(e) => setProfitFilter(e.target.value as ProfitFilter)}>
                <option value="all">Todas</option>
                <option value="positive">En positivo</option>
                <option value="negative">En negativo</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              Ordenar por
              <select className={inputClass(false)} value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}>
                <option value="currentValueEur">Valor EUR</option>
                <option value="gainEur">Plusvalia EUR</option>
                <option value="gainPct">Rentabilidad %</option>
                <option value="weightPct">Peso</option>
                <option value="asset_name">Nombre</option>
                <option value="asset_type">Tipo</option>
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="ui-chip rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
              Mostrando {groupedAssetTypes.length} tipos de activo
            </span>
            <span className="ui-chip rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
              Orden: {sortField} {sortLabel}
            </span>
            {(searchTerm || typeFilter !== "all" || marketFilter !== "all" || profitFilter !== "all") ? (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setTypeFilter("all");
                  setMarketFilter("all");
                  setProfitFilter("all");
                }}
                className="ui-chip rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
              >
                Limpiar filtros
              </button>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex min-w-[280px] flex-1 gap-2">
              <input
                className={inputClass(false)}
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                placeholder="Guardar vista de cartera"
              />
              <button
                type="button"
                onClick={() => void saveCurrentView()}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-100 transition hover:bg-white/10"
              >
                Guardar vista
              </button>
            </div>
            {savedViews.map((view) => (
              <div key={view.name} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <button type="button" onClick={() => applySavedView(view)} className="text-xs text-slate-200 transition hover:text-white">
                  {view.name}
                </button>
                <button type="button" onClick={() => void deleteSavedView(view.name)} className="text-[11px] text-slate-400 transition hover:text-red-300">
                  x
                </button>
              </div>
            ))}
          </div>

          <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void handleCsvImport(e)} />
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              className="ui-chip rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
            >
              Importar cartera CSV
            </button>
            <button
              type="button"
              onClick={handleExportPdfReport}
              className="ui-chip rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
            >
              Exportar PDF
            </button>
            <span className="ui-chip rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
              CSV: asset_name, asset_symbol, asset_isin, asset_type, asset_currency, asset_market, quantity, average_buy_price, current_price, purchase_date
            </span>
          </div>

          {loading ? <p className="mt-6 text-sm text-slate-300">Cargando posiciones...</p> : null}
          {!loading && investments.length === 0 ? (
            <div className="mt-6">
              <EmptyStateCard
                eyebrow="Sin cartera"
                title="Todavia no hay inversiones registradas"
                description="Anade tu primera posicion, importa un CSV o usa el buscador por ticker/ISIN para montar la cartera mas rapido."
                actionLabel="Empieza con Nueva posicion o Importar CSV"
                actionHref="/investments"
                compact
              />
            </div>
          ) : null}
          {!loading && investments.length > 0 && groupedAssetTypes.length === 0 ? (
            <div className="mt-6">
              <EmptyStateCard
                eyebrow="Filtros"
                title="No hay resultados con los filtros actuales"
                description="Prueba a limpiar filtros o ampliar la busqueda para volver a ver tipos de activo y posiciones."
                actionLabel="Usa Limpiar filtros"
                actionHref="/investments"
                compact
              />
            </div>
          ) : null}

          {!loading && groupedAssetTypes.length > 0 ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {groupedAssetTypes.map((group) => (
                <button
                  key={group.type}
                  type="button"
                  onClick={() => {
                    setSelectedType(group.type);
                    setSelectedAssetId(null);
                  }}
                  className="rounded-[28px] border border-white/8 bg-white/5 p-5 text-left transition hover:border-emerald-400/20 hover:bg-white/10"
                >
                  <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">{group.label}</p>
                  <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-white">{group.count}</p>
                  <p className="mt-2 text-sm text-slate-300">Activos dentro de este tipo.</p>
                  <div className="mt-5 grid gap-2 text-sm text-slate-300">
                    <p>Total: <span className="font-medium text-white">{formatCurrencyByPreference(group.totalValueEur, "EUR")}</span></p>
                    <p>Plusvalia: <span className={group.gainEur >= 0 ? "font-medium text-emerald-300" : "font-medium text-red-300"}>{formatCurrencyByPreference(group.gainEur, "EUR")}</span></p>
                    {group.type !== "cash" ? (
                      <p>
                        Rentabilidad:{" "}
                        <span className={group.gainPct !== null && group.gainPct >= 0 ? "font-medium text-emerald-300" : "font-medium text-red-300"}>
                          {group.gainPct === null ? "Sin datos" : `${group.gainPct >= 0 ? "+" : ""}${formatNumber(group.gainPct, 2)}%`}
                        </span>
                      </p>
                    ) : null}
                    <p>Principal: <span className="font-medium text-white">{group.topAsset ?? "Sin datos"}</span></p>
                  </div>
                  <div className="ui-chip mt-5 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                    Abrir activos
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {!loading && (concentrationAlerts.length > 0 || drawdownAlerts.length > 0) ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <article className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-amber-200">Concentracion</p>
                <p className="mt-2 text-sm leading-6 text-amber-50">
                  {concentrationAlerts.length > 0
                    ? `${concentrationAlerts.length} activo(s) pesan 25% o mas de la cartera.`
                    : "Sin alertas de concentracion."}
                </p>
              </article>
              <article className="rounded-3xl border border-red-400/20 bg-red-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-red-200">Perdidas relevantes</p>
                <p className="mt-2 text-sm leading-6 text-red-50">
                  {drawdownAlerts.length > 0
                    ? `${drawdownAlerts.length} activo(s) caen 10% o mas frente al capital invertido.`
                    : "Sin alertas de perdidas relevantes."}
                </p>
              </article>
            </div>
          ) : null}
        </section>
      </main>

      {selectedType ? (
        <>
          <button type="button" className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-[2px]" onClick={() => { setSelectedType(null); setSelectedAssetId(null); }} />
          <aside className="fixed right-4 top-4 z-40 h-[calc(100vh-2rem)] w-[min(92vw,760px)] rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,#020817_0%,#071427_56%,#0a1d31_100%)] p-6 text-white shadow-[0_30px_80px_rgba(2,8,23,0.58)]">
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">Tipo de activo</p>
                  <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">{ASSET_TYPE_LABELS[selectedType]}</h2>
                  <p className="mt-2 text-sm text-slate-300">{selectedTypeAssets.length} activos en este grupo</p>
                </div>
                <button type="button" onClick={() => { setSelectedType(null); setSelectedAssetId(null); }} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 hover:bg-white/10">
                  Cerrar
                </button>
              </div>

              <div className="mt-6 flex-1 overflow-y-auto pr-1">
                <section className="rounded-3xl border border-white/8 bg-white/5 p-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <article className="rounded-2xl border border-white/8 bg-slate-950/40 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">Valor actual</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{formatCurrencyByPreference(selectedTypeSummary.totalValueEur, "EUR")}</p>
                    </article>
                    <article className="rounded-2xl border border-white/8 bg-slate-950/40 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">Rentabilidad</p>
                      <p className={`mt-2 text-2xl font-semibold ${selectedTypeSummary.gainPct !== null && selectedTypeSummary.gainPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                        {selectedTypeSummary.gainPct === null ? "Sin datos" : `${selectedTypeSummary.gainPct >= 0 ? "+" : ""}${selectedTypeSummary.gainPct.toFixed(2)}%`}
                      </p>
                      <p className={`mt-1 text-xs ${selectedTypeSummary.gainEur >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                        {formatCurrencyByPreference(selectedTypeSummary.gainEur, "EUR")}
                      </p>
                    </article>
                    <article className="rounded-2xl border border-white/8 bg-slate-950/40 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">Variacion semanal</p>
                      <p className={`mt-2 text-2xl font-semibold ${selectedTypeSummary.week.amount !== null && selectedTypeSummary.week.amount >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                        {selectedTypeSummary.week.amount === null ? "Sin datos" : formatCurrencyByPreference(selectedTypeSummary.week.amount, "EUR")}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {selectedTypeSummary.week.pct === null ? "n/d" : `${selectedTypeSummary.week.pct >= 0 ? "+" : ""}${selectedTypeSummary.week.pct.toFixed(2)}%`}
                      </p>
                    </article>
                    <article className="rounded-2xl border border-white/8 bg-slate-950/40 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">Variacion mensual</p>
                      <p className={`mt-2 text-2xl font-semibold ${selectedTypeSummary.month.amount !== null && selectedTypeSummary.month.amount >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                        {selectedTypeSummary.month.amount === null ? "Sin datos" : formatCurrencyByPreference(selectedTypeSummary.month.amount, "EUR")}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {selectedTypeSummary.month.pct === null ? "n/d" : `${selectedTypeSummary.month.pct >= 0 ? "+" : ""}${selectedTypeSummary.month.pct.toFixed(2)}%`}
                      </p>
                    </article>
                  </div>

                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="mt-4">
                      <p className="text-sm font-medium text-white">Evolucion del tipo de activo</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {selectedTypeUsesRealHistory
                          ? "Evolucion agregada real de todas las posiciones de este tipo segun el historico guardado."
                          : "Estimacion agregada del tipo construida con las posiciones actuales hasta que haya historico suficiente."}
                      </p>
                    </div>
                    <div className="mt-4 flex flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedTypeChartMode("value")}
                          className={`rounded-full px-3 py-1.5 text-xs transition ${
                            selectedTypeChartMode === "value" ? "bg-emerald-500 text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"
                          }`}
                        >
                          Valor
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedTypeChartMode("profitability")}
                          className={`rounded-full px-3 py-1.5 text-xs transition ${
                            selectedTypeChartMode === "profitability" ? "bg-emerald-500 text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"
                          }`}
                        >
                          Rentabilidad %
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {TYPE_RANGE_OPTIONS.map((option) => {
                          const active = selectedTypeRange === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setSelectedTypeRange(option.value)}
                              className={`rounded-full px-3 py-1.5 text-xs transition ${
                                active ? "bg-emerald-500 text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 h-[220px]">
                    {selectedTypeTimeline.length > 0 ? (
                      <Line
                        data={selectedTypeChartData}
                        options={selectedTypeChartOptions}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-white/12 text-sm text-slate-400">
                        Sin datos suficientes para construir la evolucion de este tipo de activo.
                      </div>
                    )}
                  </div>
                </section>

                <div className="grid gap-3">
                  {selectedTypeAssets.map((row) => {
                    const fxRate = ratesToEur[row.asset_currency] ?? 1;

                    return (
                      <article key={row.id} className="rounded-3xl border border-white/8 bg-white/5 p-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="font-medium text-white">{row.asset_name}</p>
                            <p className="mt-1 text-sm text-slate-400">{row.asset_symbol ?? "Sin ticker"} · {row.asset_market ?? "AUTO"} · {row.asset_currency}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {row.weightPct >= 25 ? <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-200">Concentrado</span> : null}
                              {(row.gainPct ?? 0) <= -10 ? <span className="rounded-full border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-200">Perdida relevante</span> : null}
                            </div>
                            <div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                              <p>Valor EUR: <span className="font-medium text-white">{formatCurrencyByPreference(row.currentValueEur, "EUR")}</span></p>
                              <p>Peso: <span className="font-medium text-white">{row.weightPct.toFixed(1)}%</span></p>
                              <p>
                                Plusvalia:{" "}
                                <span className={row.gainEur >= 0 ? "font-medium text-emerald-300" : "font-medium text-red-300"}>
                                  {formatCurrencyByPreference(row.gainEur, "EUR")}
                                  {row.gainPct === null ? "" : ` · ${row.gainPct >= 0 ? "+" : ""}${formatNumber(row.gainPct, 2)}%`}
                                </span>
                              </p>
                              <p>Rentabilidad: <span className={row.gainPct !== null && row.gainPct >= 0 ? "font-medium text-emerald-300" : "font-medium text-red-300"}>{row.gainPct === null ? "Sin datos" : `${row.gainPct >= 0 ? "+" : ""}${formatNumber(row.gainPct, 2)}%`}</span></p>
                              <p>Cambio EUR: <span className="font-medium text-white">{fxRate.toFixed(4)}</span></p>
                            </div>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            <button type="button" onClick={() => setSelectedAssetId(row.id)} className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20">
                              Ver detalle
                            </button>
                            <button type="button" onClick={() => { setSelectedType(null); setSelectedAssetId(null); handleEdit(row); }} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-slate-100 hover:bg-white/10">
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRefreshPrices(row.id)}
                              disabled={refreshingPrices || !row.asset_symbol}
                              className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Precio
                            </button>
                            <button type="button" onClick={() => void handleDelete(row.id)} className="rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-medium text-red-200 hover:bg-red-500/20">
                              Borrar
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>
        </>
      ) : null}

      {selectedAsset ? (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-slate-950/72 backdrop-blur-[2px]" onClick={() => setSelectedAssetId(null)} />
          <aside className="fixed left-1/2 top-1/2 z-50 h-[min(88vh,760px)] w-[min(92vw,820px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,#020817_0%,#071427_56%,#0a1d31_100%)] p-5 text-white shadow-[0_30px_80px_rgba(2,8,23,0.58)]">
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">Activo</p>
                  <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">{selectedAsset.asset_name}</h2>
                  <p className="mt-2 text-sm text-slate-300">{selectedAsset.asset_symbol ?? "Sin ticker"} · {ASSET_TYPE_LABELS[selectedAsset.asset_type]} · {selectedAsset.asset_currency}</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => previousAsset && setSelectedAssetId(previousAsset.id)}
                    disabled={!previousAsset}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => nextAsset && setSelectedAssetId(nextAsset.id)}
                    disabled={!nextAsset}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                  <button type="button" onClick={() => setSelectedAssetId(null)} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 hover:bg-white/10">
                    Cerrar
                  </button>
                </div>
              </div>

              <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <article className="rounded-3xl border border-white/8 bg-white/5 p-3.5">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Cantidad</p>
                  <p className="mt-3 break-words font-[var(--font-heading)] text-[2rem] font-semibold leading-tight text-white">{formatAssetUnits(Number(selectedAsset.quantity) || 0, 4)}</p>
                  <p className="mt-2 text-sm leading-5 text-slate-300">Unidades actuales en cartera.</p>
                </article>
                <article className="rounded-3xl border border-white/8 bg-white/5 p-3.5">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Valor EUR</p>
                  <p className="mt-3 font-[var(--font-heading)] text-[2rem] font-semibold leading-tight text-white">{formatCurrencyByPreference(selectedAsset.currentValueEur, "EUR")}</p>
                  <p className="mt-2 text-sm leading-5 text-slate-300">Valor consolidado en EUR.</p>
                </article>
                <article className="rounded-3xl border border-white/8 bg-white/5 p-3.5">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Invertido EUR</p>
                  <p className="mt-3 font-[var(--font-heading)] text-[2rem] font-semibold leading-tight text-white">{formatCurrencyByPreference(selectedAsset.investedEur, "EUR")}</p>
                  <p className="mt-2 text-sm leading-5 text-slate-300">Capital aportado desde la compra.</p>
                </article>
                <article className="rounded-3xl border border-white/8 bg-white/5 p-3.5">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Plusvalia</p>
                  <p className={`mt-3 font-[var(--font-heading)] text-[2rem] font-semibold leading-tight ${selectedAsset.gainEur >= 0 ? "text-emerald-300" : "text-red-300"}`}>{formatCurrencyByPreference(selectedAsset.gainEur, "EUR")}</p>
                  <p className="mt-2 text-sm leading-5 text-slate-300">Resultado acumulado a precio actual.</p>
                </article>
                <article className="rounded-3xl border border-white/8 bg-white/5 p-3.5">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Rentabilidad</p>
                  <p className={`mt-3 font-[var(--font-heading)] text-[2rem] font-semibold leading-tight ${selectedAsset.gainPct !== null && selectedAsset.gainPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {selectedAsset.gainPct === null ? "Sin datos" : `${selectedAsset.gainPct >= 0 ? "+" : ""}${formatNumber(selectedAsset.gainPct, 2)}%`}
                  </p>
                  <p className="mt-2 text-sm leading-5 text-slate-300">Rentabilidad sobre el capital invertido.</p>
                </article>
                <article className="rounded-3xl border border-white/8 bg-white/5 p-3.5">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Peso cartera</p>
                  <p className="mt-3 font-[var(--font-heading)] text-[2rem] font-semibold leading-tight text-white">{selectedAsset.weightPct.toFixed(1)}%</p>
                  <p className="mt-2 text-sm leading-5 text-slate-300">Peso dentro de la cartera.</p>
                </article>
                <article className="rounded-3xl border border-white/8 bg-white/5 p-3.5">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Impacto divisa</p>
                  <p className={`mt-3 font-[var(--font-heading)] text-[2rem] font-semibold leading-tight ${selectedAsset.fxImpactEur >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {formatCurrencyByPreference(selectedAsset.fxImpactEur, "EUR")}
                  </p>
                  <p className="mt-2 text-sm leading-5 text-slate-300">Impacto acumulado del cambio de divisa sobre esta posicion.</p>
                </article>
                <article className="rounded-3xl border border-white/8 bg-white/5 p-3.5">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Resultado activo</p>
                  <p className={`mt-3 font-[var(--font-heading)] text-[2rem] font-semibold leading-tight ${selectedAsset.assetPerformanceEur >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {formatCurrencyByPreference(selectedAsset.assetPerformanceEur, "EUR")}
                  </p>
                  <p className="mt-2 text-sm leading-5 text-slate-300">Rentabilidad del propio activo sin mezclar el efecto FX.</p>
                </article>
                <article className="rounded-3xl border border-white/8 bg-white/5 p-3.5">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">FX historico</p>
                  <p className="mt-3 font-[var(--font-heading)] text-[2rem] font-semibold leading-tight text-white">
                    {selectedAsset.historicalFxRate ? formatNumber(selectedAsset.historicalFxRate, 4) : "n/d"}
                  </p>
                  <p className="mt-2 text-sm leading-5 text-slate-300">Cambio medio historico usado para el coste en EUR.</p>
                </article>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {[
                  { label: "Variacion diaria", data: selectedAssetPerformance.day },
                  { label: "Variacion semanal", data: selectedAssetPerformance.week },
                  { label: "Variacion mensual", data: selectedAssetPerformance.month }
                ].map((item) => {
                  const positive = (item.data.amount ?? 0) >= 0;
                  const toneClass =
                    item.data.amount === null ? "text-slate-300" : positive ? "text-emerald-300" : "text-red-300";

                  return (
                    <article key={item.label} className={`rounded-3xl border border-white/8 bg-white/5 p-4 ${item.label === "Variacion mensual" ? "md:col-span-2" : ""}`}>
                      <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">{item.label}</p>
                      <p className={`mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-none ${toneClass}`}>
                        {item.data.amount === null ? "Sin datos" : formatCurrencyByPreference(item.data.amount, "EUR")}
                      </p>
                      <p className="mt-3 text-sm leading-6 text-slate-400">
                        {item.data.pct === null ? "Hace falta mas historico real para esta ventana." : `${item.data.pct >= 0 ? "+" : ""}${item.data.pct.toFixed(2)}%`}
                      </p>
                    </article>
                  );
                })}
              </div>

              <div className="mt-6 flex-1 rounded-3xl border border-white/8 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {selectedAssetHistory.length > 1 ? "Evolucion real del activo" : "Evolucion estimada del activo"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {selectedAssetHistory.length > 1
                        ? "Serie construida con snapshots reales del activo guardados tras las actualizaciones de precio."
                        : "Estimacion basada en precio medio y precio actual. En cuanto se acumulen snapshots reales, este grafico dejara de ser estimado."}
                    </p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                    {selectedAssetHistory.length > 1 ? `${selectedAssetHistory.length} puntos reales` : "Sin historico suficiente"}
                  </div>
                </div>
                <div className="mt-4 h-[320px]">
                  <Line
                    data={selectedAssetChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: true, labels: { color: "#cbd5e1", usePointStyle: true } }
                      },
                      scales: {
                        x: { grid: { display: false }, ticks: { color: "#cbd5e1" } },
                        y: {
                          grid: { color: "rgba(148, 163, 184, 0.16)" },
                          ticks: { color: "#cbd5e1", callback: (value: string | number) => formatCurrencyByPreference(Number(value), "EUR") }
                        },
                        yPct: {
                          position: "right",
                          grid: { display: false },
                          ticks: { color: "#fbbf24", callback: (value: string | number) => `${Number(value).toFixed(0)}%` }
                        }
                      }
                    }}
                  />
                </div>
              </div>

              <div className="mt-4 rounded-3xl border border-white/8 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">Historial de operaciones</p>
                    <p className="mt-1 text-xs text-slate-400">Compras y ventas guardadas para este activo.</p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                    {selectedAssetTransactions.length} movimientos
                  </div>
                </div>

                {selectedAssetTransactions.length > 0 ? (
                  <div className="mt-4 grid gap-3">
                    {selectedAssetTransactions.map((transaction) => (
                      <article key={transaction.id} className="rounded-2xl border border-white/8 bg-slate-950/45 px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className={`text-sm font-medium ${transaction.transaction_type === "buy" ? "text-emerald-300" : "text-amber-300"}`}>
                              {transaction.transaction_type === "buy" ? "Compra" : "Venta"}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">{transaction.executed_at}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-white">{formatAssetUnits(Number(transaction.quantity) || 0, 8)} unidades</p>
                            <p className="mt-1 text-xs text-slate-400">{formatCurrencyByPreference(Number(transaction.price_local) || 0, transaction.asset_currency)}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                          <span className="text-slate-300">Importe: {formatCurrencyByPreference(Number(transaction.total_eur) || 0, "EUR")}</span>
                          <span className="text-slate-300">
                            Comision: {formatCurrencyByPreference(Number(transaction.commission_eur) || 0, "EUR")}
                          </span>
                          {transaction.transaction_type === "sell" ? (
                            <span className={(Number(transaction.realized_gain_eur) || 0) >= 0 ? "text-emerald-300" : "text-red-300"}>
                              Realizada: {transaction.realized_gain_eur === null ? "Sin datos" : formatCurrencyByPreference(Number(transaction.realized_gain_eur), "EUR")}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 text-xs text-slate-400">
                          Impacto neto: {formatCurrencyByPreference((Number(transaction.total_eur) || 0) - (Number(transaction.commission_eur) || 0), "EUR")}
                          {" · "}
                          FX: {transaction.fx_rate_to_eur ? `${formatNumber(Number(transaction.fx_rate_to_eur), 4)} EUR/${transaction.asset_currency}` : "n/d"}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4 text-sm text-slate-300">
                    Aun no hay operaciones guardadas para este activo.
                  </div>
                )}
              </div>
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}



