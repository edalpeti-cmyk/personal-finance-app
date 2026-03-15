"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend
} from "chart.js";
import { Doughnut, Line } from "react-chartjs-2";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/supabase/use-auth-guard";
import AuthLoadingState from "@/components/auth-loading-state";
import SideNav from "@/components/side-nav";
import { useTheme } from "@/components/theme-provider";
import { formatCurrencyByPreference } from "@/lib/preferences-format";
import { AssetCurrency, convertToEur, FALLBACK_RATES_TO_EUR, SUPPORTED_ASSET_CURRENCIES } from "@/lib/currency-rates";
import { AssetMarket } from "@/lib/market-prices";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend);

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
  averageBuyPrice?: string;
  currentPrice?: string;
  purchaseDate?: string;
};

type ToastState = { type: "success" | "error"; text: string } | null;
type ProfitFilter = "all" | "positive" | "negative";
type SortField = "asset_name" | "asset_type" | "currentValueEur" | "gainEur" | "weightPct";
type SortDirection = "asc" | "desc";
type HistoryPoint = {
  snapshot_date: string;
  total_value_eur: number;
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

function inputClass(hasError: boolean) {
  return `w-full rounded-2xl border bg-slate-950/80 px-4 py-2.5 text-sm text-slate-100 outline-none transition ${
    hasError ? "border-red-400 ring-2 ring-red-500/20" : "border-white/10 focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
  }`;
}

function formatNumber(value: number, digits: number) {
  return Number(value).toFixed(digits);
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

export default function InvestmentsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { userId, authLoading } = useAuthGuard();
  const { showLocalValues } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [ratesToEur, setRatesToEur] = useState<Record<AssetCurrency, number>>(FALLBACK_RATES_TO_EUR);

  const [assetName, setAssetName] = useState("");
  const [assetSymbol, setAssetSymbol] = useState("");
  const [assetIsin, setAssetIsin] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [assetCurrency, setAssetCurrency] = useState<AssetCurrency>("EUR");
  const [assetMarket, setAssetMarket] = useState<AssetMarket>("AUTO");
  const [quantity, setQuantity] = useState("");
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
  const [selectedType, setSelectedType] = useState<AssetType | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedAssetHistory, setSelectedAssetHistory] = useState<HistoryPoint[]>([]);
  const formRef = useRef<HTMLElement | null>(null);

  const showToast = useCallback((nextToast: Exclude<ToastState, null>) => {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setAssetName("");
    setAssetSymbol("");
    setAssetIsin("");
    setAssetType("stock");
    setAssetCurrency("EUR");
    setAssetMarket("AUTO");
    setQuantity("");
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
    void (async () => {
      try {
        const response = await fetch("/api/investments/lookup-price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetType: suggestion.assetType,
            symbol: suggestion.symbol,
            market: suggestion.market
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

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      if (authLoading || !userId) {
        return;
      }

      await loadInvestments(userId);
      setLoading(false);
    };

    void init();
  }, [authLoading, loadInvestments, userId]);

  const metrics = useMemo(() => {
    return investments.reduce(
      (acc, row) => {
        const qty = Number(row.quantity) || 0;
        const avg = Number(row.average_buy_price) || 0;
        const current = Number(row.current_price ?? row.average_buy_price) || 0;
        const invested = convertToEur(qty * avg, row.asset_currency, ratesToEur);
        const currentValue = convertToEur(qty * current, row.asset_currency, ratesToEur);

        acc.totalValueEur += currentValue;
        acc.investedCapitalEur += invested;
        acc.trackedPositions += current > 0 && row.asset_symbol ? 1 : 0;
        return acc;
      },
      { totalValueEur: 0, investedCapitalEur: 0, trackedPositions: 0 }
    );
  }, [investments, ratesToEur]);

  const profitEur = metrics.totalValueEur - metrics.investedCapitalEur;
  const profitability = metrics.investedCapitalEur > 0 ? (profitEur / metrics.investedCapitalEur) * 100 : null;

  const enrichedInvestments = useMemo<EnrichedInvestment[]>(() => {
    return investments.map((row) => {
      const qty = Number(row.quantity) || 0;
      const avg = Number(row.average_buy_price) || 0;
      const current = Number(row.current_price ?? row.average_buy_price) || 0;
      const investedLocal = qty * avg;
      const currentLocal = qty * current;
      const investedEur = convertToEur(investedLocal, row.asset_currency, ratesToEur);
      const currentValueEur = convertToEur(currentLocal, row.asset_currency, ratesToEur);
      const gainEur = currentValueEur - investedEur;
      const gainPct = investedEur > 0 ? (gainEur / investedEur) * 100 : null;
      const weightPct = metrics.totalValueEur > 0 ? (currentValueEur / metrics.totalValueEur) * 100 : 0;

      return {
        ...row,
        current,
        investedLocal,
        currentLocal,
        investedEur,
        currentValueEur,
        gainEur,
        gainPct,
        weightPct
      };
    });
  }, [investments, metrics.totalValueEur, ratesToEur]);

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
    const totals = new Map<AssetType, number>();
    for (const row of enrichedInvestments) {
      totals.set(row.asset_type, (totals.get(row.asset_type) ?? 0) + row.currentValueEur);
    }

    return Array.from(totals.entries())
      .map(([type, value]) => ({
        type,
        label: ASSET_TYPE_LABELS[type],
        value,
        weightPct: metrics.totalValueEur > 0 ? (value / metrics.totalValueEur) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value);
  }, [enrichedInvestments, metrics.totalValueEur]);

  const topHoldings = useMemo(() => {
    return [...enrichedInvestments]
      .sort((a, b) => b.currentValueEur - a.currentValueEur)
      .slice(0, 5);
  }, [enrichedInvestments]);

  const biggestPosition = topHoldings[0] ?? null;
  const profitablePositions = enrichedInvestments.filter((row) => row.gainEur >= 0).length;
  const diversificationScore = allocationByType.length;
  const groupedAssetTypes = useMemo(() => {
    const groups = new Map<
      AssetType,
      { type: AssetType; label: string; count: number; totalValueEur: number; gainEur: number; topAsset: string | null }
    >();

    for (const row of filteredInvestments) {
      const current = groups.get(row.asset_type) ?? {
        type: row.asset_type,
        label: ASSET_TYPE_LABELS[row.asset_type],
        count: 0,
        totalValueEur: 0,
        gainEur: 0,
        topAsset: null
      };

      current.count += 1;
      current.totalValueEur += row.currentValueEur;
      current.gainEur += row.gainEur;
      if (!current.topAsset || row.currentValueEur > (filteredInvestments.find((item) => item.asset_name === current.topAsset)?.currentValueEur ?? -1)) {
        current.topAsset = row.asset_name;
      }
      groups.set(row.asset_type, current);
    }

    return Array.from(groups.values()).sort((a, b) => b.totalValueEur - a.totalValueEur);
  }, [filteredInvestments]);
  const selectedTypeAssets = useMemo(
    () => (selectedType ? filteredInvestments.filter((row) => row.asset_type === selectedType) : []),
    [filteredInvestments, selectedType]
  );
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
        }
      ]
    }),
    [selectedAssetEvolution, selectedAssetHistory.length]
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortDirection(field === "asset_name" || field === "asset_type" ? "asc" : "desc");
  };

  const sortLabel = sortDirection === "asc" ? "↑" : "↓";

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

      setSelectedAssetHistory((data as HistoryPoint[]) ?? []);
    };

    void loadAssetHistory();
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
    const avg = Number(averageBuyPrice);
    const curr = currentPrice ? Number(currentPrice) : avg;
    const parsedDate = new Date(`${purchaseDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (cleanName.length < 2 || cleanName.length > 80) nextErrors.assetName = "El nombre debe tener entre 2 y 80 caracteres.";
    if (cleanSymbol.length > 24) nextErrors.assetSymbol = "El ticker o identificador no puede superar 24 caracteres.";
    else if (cleanSymbol && !/^[A-Z0-9.-]+$/.test(cleanSymbol)) nextErrors.assetSymbol = "El ticker solo admite A-Z, 0-9, punto y guion.";
    if (!Number.isFinite(qty) || qty <= 0) nextErrors.quantity = "La cantidad debe ser mayor que 0.";
    if (!Number.isFinite(avg) || avg < 0) nextErrors.averageBuyPrice = "El precio medio debe ser un numero valido >= 0.";
    if (!Number.isFinite(curr) || curr < 0) nextErrors.currentPrice = "El precio actual debe ser un numero valido >= 0.";
    if (Number.isNaN(parsedDate.getTime())) nextErrors.purchaseDate = "La fecha de compra es obligatoria.";
    else if (parsedDate > today) nextErrors.purchaseDate = "La fecha no puede estar en el futuro.";

    setErrors(nextErrors);
    return { isValid: Object.keys(nextErrors).length === 0, cleanName, cleanSymbol, qty, avg, curr };
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

    const payload = {
      user_id: userId,
      asset_name: validation.cleanName,
      asset_symbol: validation.cleanSymbol || null,
      asset_isin: assetIsin.trim() || null,
      asset_type: assetType,
      asset_currency: assetCurrency,
      asset_market: assetMarket,
      quantity: validation.qty,
      average_buy_price: validation.avg,
      current_price: validation.curr,
      purchase_date: purchaseDate
    };

    const query = editingId
      ? supabase.from("investments").update(payload).eq("id", editingId).eq("user_id", userId)
      : supabase.from("investments").insert(payload);

    const { error } = await query;

    if (error) {
      setMessage(error.message);
      showToast({ type: "error", text: editingId ? "No se pudo actualizar la posicion." : "No se pudo guardar la posicion." });
      setSaving(false);
      return;
    }

    resetForm();
    await loadInvestments(userId);
    showToast({ type: "success", text: editingId ? "Posicion actualizada." : "Posicion guardada correctamente." });
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
        updated?: Array<{ id: string; price: number; symbol: string | null }>;
        skipped?: Array<{ id: string; symbol: string | null; reason: string }>;
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

      if (skippedCount > 0) {
        const sample = data.skipped?.find((item) => item.symbol)?.symbol;
        setMessage(
          sample
            ? `Algunos tickers no devolvieron precio. Si son activos europeos, prueba con el ticker completo de Yahoo, por ejemplo SAN.MC, BMW.DE o VUSA.AS. Ejemplo detectado: ${sample}.`
            : "Algunos activos no devolvieron precio. Revisa que el ticker sea el de Yahoo Finance y que incluya sufijo de mercado si hace falta."
        );
      }
    } catch {
      showToast({ type: "error", text: "Error de red al actualizar precios." });
    } finally {
      setRefreshingPrices(false);
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

        <section ref={formRef} className={`panel rounded-[28px] p-5 text-white xl:col-span-5 ${editingId ? "ring-2 ring-teal-400/40" : ""}`}>
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
                          <p className="mt-1 text-xs text-slate-400">
                            {suggestion.symbol} · {ASSET_TYPE_LABELS[suggestion.assetType]} · {suggestion.market}
                            {suggestion.exchange ? ` · ${suggestion.exchange}` : ""}
                          </p>
                        </div>
                        <div className="text-right text-xs text-slate-300">
                          <p>{suggestion.currency ?? "Sin moneda"}</p>
                          <p className="mt-1 text-emerald-300">Elegir</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
              {errors.assetSymbol ? <span className="text-xs text-red-700">{errors.assetSymbol}</span> : null}
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-200">
                Cantidad
                <input className={inputClass(Boolean(errors.quantity))} type="number" min="0" step="0.00000001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                {errors.quantity ? <span className="text-xs text-red-700">{errors.quantity}</span> : null}
              </label>

              <label className="grid gap-2 text-sm text-slate-200">
                Fecha de compra
                <input className={inputClass(Boolean(errors.purchaseDate))} type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
                {errors.purchaseDate ? <span className="text-xs text-red-700">{errors.purchaseDate}</span> : null}
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-200">
                Precio medio ({assetCurrency})
                <input className={inputClass(Boolean(errors.averageBuyPrice))} type="number" min="0" step="0.0001" value={averageBuyPrice} onChange={(e) => setAverageBuyPrice(e.target.value)} />
                {errors.averageBuyPrice ? <span className="text-xs text-red-700">{errors.averageBuyPrice}</span> : null}
              </label>

              <label className="grid gap-2 text-sm text-slate-200">
                Precio actual ({assetCurrency})
                <input className={inputClass(Boolean(errors.currentPrice))} type="number" min="0" step="0.0001" value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} placeholder="Opcional" />
                {errors.currentPrice ? <span className="text-xs text-red-700">{errors.currentPrice}</span> : null}
              </label>
            </div>

            <button className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50" disabled={saving || loading} type="submit">
              {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Anadir activo"}
            </button>
          </form>
        </section>

        <section className="grid gap-4 xl:col-span-7 md:grid-cols-2">
          <article className="kpi-card rounded-[26px] p-6">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Valor total en EUR</p>
            <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(metrics.totalValueEur, "EUR")}</p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Suma del valor actual de tus posiciones, consolidada en EUR.</p>
          </article>
          <article className="kpi-card rounded-[26px] p-6">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Rentabilidad en EUR</p>
            <p className={`mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none ${profitEur >= 0 ? "text-emerald-300" : "text-red-300"}`}>
              {formatCurrencyByPreference(profitEur, "EUR")}
            </p>
            <p className={`mt-3 text-sm font-medium ${profitability === null ? "text-slate-300" : profitability >= 0 ? "text-emerald-300" : "text-red-300"}`}>
              {profitability === null ? "Sin porcentaje" : `${profitability >= 0 ? "+" : ""}${formatNumber(profitability, 2)}%`}
            </p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Resultado total de la cartera despues de convertir todas las posiciones.</p>
          </article>
          <article className="kpi-card rounded-[26px] p-6">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Precios conectados</p>
            <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{metrics.trackedPositions}</p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Activos con simbolo valido para actualizar precio automaticamente.</p>
          </article>
          <article className="kpi-card rounded-[26px] p-6">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Mayor posicion</p>
            <p className="mt-4 font-[var(--font-heading)] text-3xl font-semibold leading-tight text-white">{biggestPosition ? biggestPosition.asset_name : "Sin datos"}</p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">
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

          <div className="mt-6 grid gap-6">
            <div className="min-w-0 grid gap-3 md:grid-cols-2">
            {allocationByType.length > 0 ? (
              allocationByType.map((item) => (
                <article key={item.type} className="rounded-3xl border border-white/8 bg-white/5 p-4">
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

            <div className="min-w-0 overflow-hidden rounded-3xl border border-white/8 bg-white/5 p-4">
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
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Posiciones</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Tipos de activo</h2>
            </div>
            <p className="text-sm text-slate-400">Primero eliges el tipo de activo y luego abres los activos concretos dentro de ese grupo.</p>
          </div>

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

          {loading ? <p className="mt-6 text-sm text-slate-300">Cargando posiciones...</p> : null}
          {!loading && investments.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-white/8 bg-white/5 p-5">
              <p className="max-w-[40ch] text-sm leading-7 text-slate-300">Aun no tienes inversiones registradas.</p>
            </div>
          ) : null}
          {!loading && investments.length > 0 && groupedAssetTypes.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-white/8 bg-white/5 p-5">
              <p className="max-w-[40ch] text-sm leading-7 text-slate-300">No hay resultados con los filtros actuales.</p>
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
                    <p>Principal: <span className="font-medium text-white">{group.topAsset ?? "Sin datos"}</span></p>
                  </div>
                  <div className="ui-chip mt-5 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                    Abrir activos
                  </div>
                </button>
              ))}
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
                <div className="grid gap-3">
                  {selectedTypeAssets.map((row) => {
                    const fxRate = ratesToEur[row.asset_currency] ?? 1;

                    return (
                      <article key={row.id} className="rounded-3xl border border-white/8 bg-white/5 p-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="font-medium text-white">{row.asset_name}</p>
                            <p className="mt-1 text-sm text-slate-400">{row.asset_symbol ?? "Sin ticker"} · {row.asset_market ?? "AUTO"} · {row.asset_currency}</p>
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
          <aside className="fixed left-1/2 top-1/2 z-50 h-[min(88vh,760px)] w-[min(92vw,820px)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,#020817_0%,#071427_56%,#0a1d31_100%)] p-6 text-white shadow-[0_30px_80px_rgba(2,8,23,0.58)]">
            <div className="flex h-full flex-col">
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

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <article className="rounded-3xl border border-white/8 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Valor EUR</p>
                  <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-none text-white">{formatCurrencyByPreference(selectedAsset.currentValueEur, "EUR")}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-300">Valor consolidado de la posicion convertido a EUR.</p>
                </article>
                <article className="rounded-3xl border border-white/8 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Invertido EUR</p>
                  <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-none text-white">{formatCurrencyByPreference(selectedAsset.investedEur, "EUR")}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-300">Capital aportado a esta posicion desde la compra.</p>
                </article>
                <article className="rounded-3xl border border-white/8 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Plusvalia</p>
                  <p className={`mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-none ${selectedAsset.gainEur >= 0 ? "text-emerald-300" : "text-red-300"}`}>{formatCurrencyByPreference(selectedAsset.gainEur, "EUR")}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-300">Resultado acumulado de la posicion a precio actual.</p>
                </article>
                <article className="rounded-3xl border border-white/8 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Rentabilidad</p>
                  <p className={`mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-none ${selectedAsset.gainPct !== null && selectedAsset.gainPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {selectedAsset.gainPct === null ? "Sin datos" : `${selectedAsset.gainPct >= 0 ? "+" : ""}${formatNumber(selectedAsset.gainPct, 2)}%`}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-300">Porcentaje de rentabilidad sobre el capital invertido.</p>
                </article>
                <article className="rounded-3xl border border-white/8 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Peso cartera</p>
                  <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold leading-none text-white">{selectedAsset.weightPct.toFixed(1)}%</p>
                  <p className="mt-3 text-sm leading-6 text-slate-300">Porcentaje que ocupa este activo dentro de la cartera.</p>
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
                      plugins: { legend: { display: false } },
                      scales: {
                        x: { grid: { display: false }, ticks: { color: "#cbd5e1" } },
                        y: {
                          grid: { color: "rgba(148, 163, 184, 0.16)" },
                          ticks: { color: "#cbd5e1", callback: (value: string | number) => formatCurrencyByPreference(Number(value), "EUR") }
                        }
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}


