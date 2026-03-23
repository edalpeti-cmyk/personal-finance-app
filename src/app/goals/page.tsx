"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/supabase/use-auth-guard";
import AuthLoadingState from "@/components/auth-loading-state";
import EmptyStateCard from "@/components/empty-state-card";
import SectionHeader from "@/components/section-header";
import SideNav from "@/components/side-nav";
import { useTheme } from "@/components/theme-provider";
import { AssetCurrency, convertToEur, FALLBACK_RATES_TO_EUR } from "@/lib/currency-rates";
import { formatCurrencyByPreference, formatDateByPreference, formatMonthByPreference } from "@/lib/preferences-format";

type GoalType = "emergency_fund" | "retirement" | "house" | "car" | "travel" | "debt_payoff" | "other";
type GoalStatus = "active" | "paused" | "completed" | "cancelled";
type AssetType = "stock" | "etf" | "crypto" | "fund" | "commodity" | "cash" | "real_estate" | "loan";

type GoalRow = {
  id: string;
  goal_name: string;
  goal_type: GoalType;
  target_amount: number;
  current_amount: number;
  monthly_contribution: number | null;
  target_date: string | null;
  priority: number;
  status: GoalStatus;
  linked_category: string | null;
  linked_account: string | null;
  linked_investment_id: string | null;
  linked_asset_type: AssetType | null;
};
type SavingsTargetRow = {
  month: string;
  savings_target: number;
};
type IncomeRow = {
  amount: number;
  income_date: string;
};
type ExpenseRow = {
  amount: number;
  expense_date: string;
};
type GoalProgressHistoryRow = {
  goal_id: string;
  snapshot_month: string;
  current_amount: number;
  target_amount: number;
  progress_pct: number;
};
type InvestmentLinkRow = {
  id: string;
  asset_name: string;
  asset_symbol: string | null;
  asset_type: AssetType;
  quantity: number;
  current_price: number | null;
  average_buy_price: number;
  asset_currency: AssetCurrency;
};
type GoalInvestmentLinkRow = {
  goal_id: string;
  investment_id: string;
  allocation_pct: number;
};
type GoalAssetTypeLinkRow = {
  goal_id: string;
  asset_type: AssetType;
  allocation_pct: number;
};

type ToastState = { type: "success" | "error"; text: string } | null;

const GOAL_TYPES: Array<{ value: GoalType; label: string }> = [
  { value: "emergency_fund", label: "Fondo de emergencia" },
  { value: "retirement", label: "Jubilacion" },
  { value: "house", label: "Vivienda" },
  { value: "car", label: "Coche" },
  { value: "travel", label: "Viaje" },
  { value: "debt_payoff", label: "Pagar deuda" },
  { value: "other", label: "Otro" }
];

const GOAL_STATUSES: Array<{ value: GoalStatus; label: string }> = [
  { value: "active", label: "Activo" },
  { value: "paused", label: "Pausado" },
  { value: "completed", label: "Completado" },
  { value: "cancelled", label: "Cancelado" }
];
const ASSET_TYPE_OPTIONS: Array<{ value: AssetType; label: string }> = [
  { value: "stock", label: "Accion" },
  { value: "etf", label: "ETF" },
  { value: "crypto", label: "Criptomoneda" },
  { value: "fund", label: "Fondo de inversion" },
  { value: "commodity", label: "Materia prima" },
  { value: "cash", label: "Efectivo" },
  { value: "real_estate", label: "Inmobiliario" },
  { value: "loan", label: "Prestamo" }
];

function inputClass() {
  return "w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-sm text-slate-100 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20";
}

export default function GoalsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { userId, authLoading } = useAuthGuard();
  const { currency, dateFormat } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [savingsTargets, setSavingsTargets] = useState<SavingsTargetRow[]>([]);
  const [progressHistory, setProgressHistory] = useState<GoalProgressHistoryRow[]>([]);
  const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  const [investmentLinks, setInvestmentLinks] = useState<InvestmentLinkRow[]>([]);
  const [goalInvestmentLinks, setGoalInvestmentLinks] = useState<GoalInvestmentLinkRow[]>([]);
  const [goalAssetTypeLinks, setGoalAssetTypeLinks] = useState<GoalAssetTypeLinkRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [goalName, setGoalName] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("emergency_fund");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("");
  const [monthlyContribution, setMonthlyContribution] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [priority, setPriority] = useState("2");
  const [status, setStatus] = useState<GoalStatus>("active");
  const [linkedCategory, setLinkedCategory] = useState("");
  const [linkedAccount, setLinkedAccount] = useState("");
  const [linkedInvestmentId, setLinkedInvestmentId] = useState("");
  const [selectedLinkedAssetTypes, setSelectedLinkedAssetTypes] = useState<AssetType[]>([]);
  const [selectedLinkedAssetTypeAllocations, setSelectedLinkedAssetTypeAllocations] = useState<Record<AssetType, string>>({} as Record<AssetType, string>);
  const [selectedLinkedInvestmentIds, setSelectedLinkedInvestmentIds] = useState<string[]>([]);
  const [selectedLinkedInvestmentAllocations, setSelectedLinkedInvestmentAllocations] = useState<Record<string, string>>({});
  const [assetTypesDropdownOpen, setAssetTypesDropdownOpen] = useState(false);
  const [investmentsDropdownOpen, setInvestmentsDropdownOpen] = useState(false);
  const [assetTypeSearch, setAssetTypeSearch] = useState("");
  const [investmentSearch, setInvestmentSearch] = useState("");
  const [snapshottingProgress, setSnapshottingProgress] = useState(false);
  const [selectedTimelineGoalId, setSelectedTimelineGoalId] = useState("");
  const [selectedTimelineYear, setSelectedTimelineYear] = useState(String(new Date().getFullYear()));
  const [contributionDrafts, setContributionDrafts] = useState<Record<string, string>>({});
  const [contributingGoalId, setContributingGoalId] = useState<string | null>(null);
  const assetTypesDropdownRef = useRef<HTMLDivElement | null>(null);
  const investmentsDropdownRef = useRef<HTMLDivElement | null>(null);

  const showToast = useCallback((nextToast: Exclude<ToastState, null>) => {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setGoalName("");
    setGoalType("emergency_fund");
    setTargetAmount("");
    setCurrentAmount("");
    setMonthlyContribution("");
    setTargetDate("");
    setPriority("2");
    setStatus("active");
    setLinkedCategory("");
    setLinkedAccount("");
    setLinkedInvestmentId("");
    setSelectedLinkedAssetTypes([]);
    setSelectedLinkedAssetTypeAllocations({} as Record<AssetType, string>);
    setSelectedLinkedInvestmentIds([]);
    setSelectedLinkedInvestmentAllocations({});
    setAssetTypesDropdownOpen(false);
    setInvestmentsDropdownOpen(false);
    setAssetTypeSearch("");
    setInvestmentSearch("");
  }, []);

  const loadGoals = useCallback(async (uid: string) => {
    setLoading(true);
    const [goalsResult, savingsResult, historyResult, incomeResult, expenseResult, investmentsResult, linksResult, assetTypeLinksResult] = await Promise.all([
      supabase
        .from("financial_goals")
        .select("id, goal_name, goal_type, target_amount, current_amount, monthly_contribution, target_date, priority, status, linked_category, linked_account, linked_investment_id, linked_asset_type")
        .eq("user_id", uid)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false }),
      supabase.from("monthly_savings_targets").select("month, savings_target").eq("user_id", uid),
      supabase.from("goal_progress_history").select("goal_id, snapshot_month, current_amount, target_amount, progress_pct").eq("user_id", uid).order("snapshot_month", { ascending: false }),
      supabase.from("income").select("amount, income_date").eq("user_id", uid),
      supabase.from("expenses").select("amount, expense_date").eq("user_id", uid),
      supabase.from("investments").select("id, asset_name, asset_symbol, asset_type, quantity, current_price, average_buy_price, asset_currency").eq("user_id", uid).order("asset_name", { ascending: true }),
      supabase.from("goal_investment_links").select("goal_id, investment_id, allocation_pct").eq("user_id", uid),
      supabase.from("goal_asset_type_links").select("goal_id, asset_type, allocation_pct").eq("user_id", uid)
    ]);

    const firstError = goalsResult.error ?? savingsResult.error ?? historyResult.error ?? incomeResult.error ?? expenseResult.error ?? investmentsResult.error ?? linksResult.error ?? assetTypeLinksResult.error;
    if (firstError) {
      setMessage(firstError.message);
      setLoading(false);
      return;
    }

    setGoals((goalsResult.data as GoalRow[]) ?? []);
    setSavingsTargets((savingsResult.data as SavingsTargetRow[]) ?? []);
    setProgressHistory((historyResult.data as GoalProgressHistoryRow[]) ?? []);
    setIncomeRows((incomeResult.data as IncomeRow[]) ?? []);
    setExpenseRows((expenseResult.data as ExpenseRow[]) ?? []);
    setInvestmentLinks((investmentsResult.data as InvestmentLinkRow[]) ?? []);
    setGoalInvestmentLinks((linksResult.data as GoalInvestmentLinkRow[]) ?? []);
    setGoalAssetTypeLinks((assetTypeLinksResult.data as GoalAssetTypeLinkRow[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (authLoading || !userId) return;
    void loadGoals(userId);
  }, [authLoading, loadGoals, userId]);

  const currentMonthSavingsTarget = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7);
    return savingsTargets.reduce((sum, row) => (row.month.slice(0, 7) === month ? sum + Number(row.savings_target || 0) : sum), 0);
  }, [savingsTargets]);
  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const currentMonthActualSavings = useMemo(() => {
    const income = incomeRows.reduce((sum, row) => (row.income_date.slice(0, 7) === currentMonth ? sum + Number(row.amount || 0) : sum), 0);
    const expenses = expenseRows.reduce((sum, row) => (row.expense_date.slice(0, 7) === currentMonth ? sum + Number(row.amount || 0) : sum), 0);
    return income - expenses;
  }, [currentMonth, expenseRows, incomeRows]);
  const savingsAvailableForAutomation = useMemo(
    () => Math.max(currentMonthActualSavings, 0),
    [currentMonthActualSavings]
  );
  const currentSnapshotMonth = useMemo(() => `${new Date().toISOString().slice(0, 7)}-01`, []);
  const latestHistoryByGoal = useMemo(() => {
    const map = new Map<string, GoalProgressHistoryRow[]>();
    for (const row of progressHistory) {
      const current = map.get(row.goal_id) ?? [];
      current.push(row);
      map.set(row.goal_id, current);
    }
    return map;
  }, [progressHistory]);
  const investmentValueById = useMemo(
    () =>
      Object.fromEntries(
        investmentLinks.map((row) => [
          row.id,
          convertToEur((Number(row.current_price ?? row.average_buy_price ?? 0) || 0) * (Number(row.quantity) || 0), row.asset_currency, FALLBACK_RATES_TO_EUR)
        ])
      ),
    [investmentLinks]
  );
  const linkedInvestmentConfigsByGoal = useMemo(() => {
    const map = new Map<string, Array<{ investment_id: string; allocation_pct: number }>>();
    for (const row of goalInvestmentLinks) {
      const current = map.get(row.goal_id) ?? [];
      current.push({ investment_id: row.investment_id, allocation_pct: Number(row.allocation_pct ?? 100) || 100 });
      map.set(row.goal_id, current);
    }
    for (const goal of goals) {
      if (goal.linked_investment_id) {
        const current = map.get(goal.id) ?? [];
        if (!current.some((item) => item.investment_id === goal.linked_investment_id)) {
          current.push({ investment_id: goal.linked_investment_id, allocation_pct: 100 });
          map.set(goal.id, current);
        }
      }
    }
    return map;
  }, [goalInvestmentLinks, goals]);
  const linkedInvestmentIdsByGoal = useMemo(
    () => new Map(Array.from(linkedInvestmentConfigsByGoal.entries()).map(([goalId, items]) => [goalId, items.map((item) => item.investment_id)])),
    [linkedInvestmentConfigsByGoal]
  );
  const linkedAssetTypeConfigsByGoal = useMemo(() => {
    const map = new Map<string, Array<{ asset_type: AssetType; allocation_pct: number }>>();
    for (const row of goalAssetTypeLinks) {
      const current = map.get(row.goal_id) ?? [];
      if (!current.some((item) => item.asset_type === row.asset_type)) {
        current.push({ asset_type: row.asset_type, allocation_pct: Number(row.allocation_pct ?? 100) || 100 });
      }
      map.set(row.goal_id, current);
    }
    for (const goal of goals) {
      if (goal.linked_asset_type) {
        const current = map.get(goal.id) ?? [];
        if (!current.some((item) => item.asset_type === goal.linked_asset_type)) {
          current.push({ asset_type: goal.linked_asset_type, allocation_pct: 100 });
          map.set(goal.id, current);
        }
      }
    }
    return map;
  }, [goalAssetTypeLinks, goals]);
  const linkedAssetTypesByGoal = useMemo(
    () => new Map(Array.from(linkedAssetTypeConfigsByGoal.entries()).map(([goalId, items]) => [goalId, items.map((item) => item.asset_type)])),
    [linkedAssetTypeConfigsByGoal]
  );
  const combinedCurrentByGoal = useMemo(() => {
    const map = new Map<string, { manual: number; linked: number; total: number }>();
    for (const goal of goals) {
      const selectedConfigs = linkedInvestmentConfigsByGoal.get(goal.id) ?? [];
      const selectedIds = new Set(selectedConfigs.map((item) => item.investment_id));
      const selectedAssetTypeConfigs = linkedAssetTypeConfigsByGoal.get(goal.id) ?? [];
      const linkedByIds = selectedConfigs.reduce((sum, item) => {
        const value = Number(investmentValueById[item.investment_id] ?? 0);
        return sum + value * (Math.max(0, Math.min(Number(item.allocation_pct ?? 100), 100)) / 100);
      }, 0);
      const linkedByType =
        selectedAssetTypeConfigs.length > 0
          ? selectedAssetTypeConfigs.reduce((sum, item) => {
              const typeTotal = investmentLinks
                .filter((investment) => investment.asset_type === item.asset_type && !selectedIds.has(investment.id))
                .reduce((typeSum, investment) => typeSum + Number(investmentValueById[investment.id] ?? 0), 0);
              return sum + typeTotal * (Math.max(0, Math.min(Number(item.allocation_pct ?? 100), 100)) / 100);
            }, 0)
          : 0;
      const manual = Number(goal.current_amount || 0);
      const linked = linkedByIds + linkedByType;
      map.set(goal.id, { manual, linked, total: manual + linked });
    }
    return map;
  }, [goals, investmentLinks, investmentValueById, linkedAssetTypeConfigsByGoal, linkedInvestmentConfigsByGoal]);
  const goalsWithComputedProgress = useMemo(
    () =>
      goals.map((goal) => {
        const current = combinedCurrentByGoal.get(goal.id) ?? { manual: Number(goal.current_amount || 0), linked: 0, total: Number(goal.current_amount || 0) };
        const progressPct = Number(goal.target_amount) > 0 ? Math.min((current.total / Number(goal.target_amount)) * 100, 100) : 0;
        return { ...goal, computedManualCurrent: current.manual, computedLinkedCurrent: current.linked, computedCurrentTotal: current.total, computedProgressPct: progressPct };
      }),
    [combinedCurrentByGoal, goals]
  );
  const activeGoals = useMemo(() => goalsWithComputedProgress.filter((goal) => goal.status === "active"), [goalsWithComputedProgress]);
  const completedGoals = useMemo(() => goalsWithComputedProgress.filter((goal) => goal.status === "completed"), [goalsWithComputedProgress]);
  const totalTarget = useMemo(() => activeGoals.reduce((sum, goal) => sum + Number(goal.target_amount || 0), 0), [activeGoals]);
  const totalCurrent = useMemo(() => activeGoals.reduce((sum, goal) => sum + Number(goal.computedCurrentTotal || 0), 0), [activeGoals]);
  const totalMonthlyContribution = useMemo(() => activeGoals.reduce((sum, goal) => sum + Number(goal.monthly_contribution || 0), 0), [activeGoals]);
  const monthlyCoveragePct = useMemo(
    () => (currentMonthSavingsTarget > 0 ? Math.min((totalMonthlyContribution / currentMonthSavingsTarget) * 100, 100) : 0),
    [currentMonthSavingsTarget, totalMonthlyContribution]
  );
  const unassignedMonthlySavings = useMemo(
    () => currentMonthSavingsTarget - totalMonthlyContribution,
    [currentMonthSavingsTarget, totalMonthlyContribution]
  );
  const suggestedAllocations = useMemo(() => {
    if (currentMonthSavingsTarget <= 0 || activeGoals.length === 0) return [];
    const weightedGoals = activeGoals.map((goal) => ({ goal, weight: 6 - Number(goal.priority || 3) }));
    const totalWeight = weightedGoals.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) return [];
    return weightedGoals.map(({ goal, weight }) => ({
      id: goal.id,
      name: goal.goal_name,
      amount: Number(((currentMonthSavingsTarget * weight) / totalWeight).toFixed(2))
    }));
  }, [activeGoals, currentMonthSavingsTarget]);
  const suggestedActualAllocations = useMemo(() => {
    if (savingsAvailableForAutomation <= 0 || activeGoals.length === 0) return [];
    const weightedGoals = activeGoals.map((goal) => ({ goal, weight: 6 - Number(goal.priority || 3) }));
    const totalWeight = weightedGoals.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) return [];
    return weightedGoals.map(({ goal, weight }) => ({
      id: goal.id,
      name: goal.goal_name,
      amount: Number(((savingsAvailableForAutomation * weight) / totalWeight).toFixed(2))
    }));
  }, [activeGoals, savingsAvailableForAutomation]);
  const availableTimelineYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    for (const row of progressHistory) years.add(new Date(`${row.snapshot_month}T00:00:00`).getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [progressHistory]);
  const timelineGoalOptions = useMemo(() => activeGoals, [activeGoals]);

  useEffect(() => {
    if (!selectedTimelineGoalId && activeGoals[0]) {
      setSelectedTimelineGoalId(activeGoals[0].id);
    } else if (selectedTimelineGoalId && !activeGoals.some((goal) => goal.id === selectedTimelineGoalId)) {
      setSelectedTimelineGoalId(activeGoals[0]?.id ?? "");
    }
  }, [activeGoals, selectedTimelineGoalId]);

  const selectedTimelineGoal = useMemo(
    () => activeGoals.find((goal) => goal.id === selectedTimelineGoalId) ?? null,
    [activeGoals, selectedTimelineGoalId]
  );
  const annualGoalTimeline = useMemo(() => {
    if (!selectedTimelineGoal) return [];
    const year = Number(selectedTimelineYear);
    const history = (latestHistoryByGoal.get(selectedTimelineGoal.id) ?? []).filter(
      (row) => new Date(`${row.snapshot_month}T00:00:00`).getFullYear() === year
    );
    const byMonth = new Map<number, GoalProgressHistoryRow>();
    for (const row of history) {
      const month = new Date(`${row.snapshot_month}T00:00:00`).getMonth();
      byMonth.set(month, row);
    }

    return Array.from({ length: 12 }, (_, monthIndex) => {
      const row = byMonth.get(monthIndex);
      const label = new Date(year, monthIndex, 1).toLocaleString("es-ES", { month: "short" });
      return {
        label,
        current: Number(row?.current_amount ?? 0),
        target: Number(row?.target_amount ?? selectedTimelineGoal.target_amount ?? 0),
        progressPct: Number(row?.progress_pct ?? 0),
        hasData: Boolean(row)
      };
    });
  }, [latestHistoryByGoal, selectedTimelineGoal, selectedTimelineYear]);
  const selectedAssetTypesLabel = useMemo(() => {
    if (selectedLinkedAssetTypes.length === 0) return "Sin tipos vinculados";
    if (selectedLinkedAssetTypes.length === 1) {
      const assetType = selectedLinkedAssetTypes[0];
      return ASSET_TYPE_OPTIONS.find((option) => option.value === assetType)?.label ?? assetType;
    }
    if (selectedLinkedAssetTypes.length <= 3) {
      return selectedLinkedAssetTypes
        .map((assetType) => ASSET_TYPE_OPTIONS.find((option) => option.value === assetType)?.label ?? assetType)
        .join(", ");
    }
    return `${selectedLinkedAssetTypes.length} tipos seleccionados`;
  }, [selectedLinkedAssetTypes]);
  const selectedInvestmentsLabel = useMemo(() => {
    if (selectedLinkedInvestmentIds.length === 0) return "Sin posiciones vinculadas";
    if (selectedLinkedInvestmentIds.length === 1) {
      const investment = investmentLinks.find((item) => item.id === selectedLinkedInvestmentIds[0]);
      return investment ? `${investment.asset_name}${investment.asset_symbol ? ` (${investment.asset_symbol})` : ""}` : "1 posicion seleccionada";
    }
    return `${selectedLinkedInvestmentIds.length} posiciones seleccionadas`;
  }, [investmentLinks, selectedLinkedInvestmentIds]);
  const filteredAssetTypeOptions = useMemo(() => {
    const query = assetTypeSearch.trim().toLowerCase();
    if (!query) return ASSET_TYPE_OPTIONS;
    return ASSET_TYPE_OPTIONS.filter((option) => option.label.toLowerCase().includes(query));
  }, [assetTypeSearch]);
  const filteredInvestmentLinks = useMemo(() => {
    const query = investmentSearch.trim().toLowerCase();
    if (!query) return investmentLinks;
    return investmentLinks.filter((investment) => {
      const haystack = `${investment.asset_name} ${investment.asset_symbol ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [investmentLinks, investmentSearch]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (assetTypesDropdownRef.current && target && !assetTypesDropdownRef.current.contains(target)) {
        setAssetTypesDropdownOpen(false);
      }
      if (investmentsDropdownRef.current && target && !investmentsDropdownRef.current.contains(target)) {
        setInvestmentsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setToast(null);

    if (!userId) {
      showToast({ type: "error", text: "Debes iniciar sesion para guardar objetivos." });
      return;
    }

    const parsedTarget = Number(targetAmount);
    const parsedCurrent = Number(currentAmount || 0);
    const parsedMonthly = monthlyContribution ? Number(monthlyContribution) : null;
    const parsedPriority = Number(priority);

    if (goalName.trim().length < 2) {
      showToast({ type: "error", text: "El objetivo necesita un nombre claro." });
      return;
    }
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      showToast({ type: "error", text: "El importe objetivo debe ser mayor que 0." });
      return;
    }
    if (!Number.isFinite(parsedCurrent) || parsedCurrent < 0) {
      showToast({ type: "error", text: "El importe actual debe ser 0 o mayor." });
      return;
    }
    if (parsedMonthly !== null && (!Number.isFinite(parsedMonthly) || parsedMonthly < 0)) {
      showToast({ type: "error", text: "La aportacion mensual debe ser 0 o mayor." });
      return;
    }
    if (!Number.isFinite(parsedPriority) || parsedPriority < 1 || parsedPriority > 5) {
      showToast({ type: "error", text: "La prioridad debe estar entre 1 y 5." });
      return;
    }

    setSaving(true);
    const payload = {
      user_id: userId,
      goal_name: goalName.trim(),
      goal_type: goalType,
      target_amount: parsedTarget,
      current_amount: parsedCurrent,
      monthly_contribution: parsedMonthly,
      target_date: targetDate || null,
      priority: parsedPriority,
      status,
      linked_category: linkedCategory.trim() || null,
      linked_account: linkedAccount.trim() || null,
      linked_investment_id: selectedLinkedInvestmentIds[0] || linkedInvestmentId || null,
      linked_asset_type: selectedLinkedAssetTypes[0] || null
    };

    const query = editingId
      ? supabase.from("financial_goals").update(payload).eq("id", editingId).eq("user_id", userId).select("id").single()
      : supabase.from("financial_goals").insert(payload).select("id").single();

    const { data, error } = await query;
    if (error) {
      setMessage(error.message);
      showToast({ type: "error", text: "No se pudo guardar el objetivo." });
      setSaving(false);
      return;
    }

    const goalId = editingId ?? data?.id;
    if (goalId) {
      await supabase.from("goal_investment_links").delete().eq("goal_id", goalId).eq("user_id", userId);
      await supabase.from("goal_asset_type_links").delete().eq("goal_id", goalId).eq("user_id", userId);
      if (selectedLinkedInvestmentIds.length > 0) {
        const { error: linksError } = await supabase.from("goal_investment_links").insert(
          selectedLinkedInvestmentIds.map((investmentId) => ({
            goal_id: goalId,
            investment_id: investmentId,
            allocation_pct: Math.max(0, Math.min(Number(selectedLinkedInvestmentAllocations[investmentId] || 100), 100)),
            user_id: userId
          }))
        );
        if (linksError) {
          setMessage(linksError.message);
          showToast({ type: "error", text: "El objetivo se guardo, pero fallo la vinculacion de posiciones." });
          setSaving(false);
          return;
        }
      }
      if (selectedLinkedAssetTypes.length > 0) {
        const { error: assetTypeLinksError } = await supabase.from("goal_asset_type_links").insert(
          selectedLinkedAssetTypes.map((assetType) => ({
            goal_id: goalId,
            asset_type: assetType,
            allocation_pct: Math.max(0, Math.min(Number(selectedLinkedAssetTypeAllocations[assetType] || 100), 100)),
            user_id: userId
          }))
        );
        if (assetTypeLinksError) {
          setMessage(assetTypeLinksError.message);
          showToast({ type: "error", text: "El objetivo se guardo, pero fallo la vinculacion de tipos de activo." });
          setSaving(false);
          return;
        }
      }
    }

    resetForm();
    await loadGoals(userId);
    showToast({ type: "success", text: editingId ? "Objetivo actualizado." : "Objetivo creado." });
    setSaving(false);
  };

  const handleEdit = (goal: GoalRow) => {
    setEditingId(goal.id);
    setGoalName(goal.goal_name);
    setGoalType(goal.goal_type);
    setTargetAmount(String(goal.target_amount));
    setCurrentAmount(String(goal.current_amount));
    setMonthlyContribution(goal.monthly_contribution === null ? "" : String(goal.monthly_contribution));
    setTargetDate(goal.target_date ?? "");
    setPriority(String(goal.priority));
    setStatus(goal.status);
    setLinkedCategory(goal.linked_category ?? "");
    setLinkedAccount(goal.linked_account ?? "");
    setLinkedInvestmentId(goal.linked_investment_id ?? "");
    const linkedAssetTypeConfigs = linkedAssetTypeConfigsByGoal.get(goal.id) ?? (goal.linked_asset_type ? [{ asset_type: goal.linked_asset_type, allocation_pct: 100 }] : []);
    setSelectedLinkedAssetTypes(linkedAssetTypeConfigs.map((item) => item.asset_type));
    setSelectedLinkedAssetTypeAllocations(
      Object.fromEntries(linkedAssetTypeConfigs.map((item) => [item.asset_type, String(Number(item.allocation_pct ?? 100) || 100)])) as Record<AssetType, string>
    );
    const linkedConfigs = linkedInvestmentConfigsByGoal.get(goal.id) ?? (goal.linked_investment_id ? [{ investment_id: goal.linked_investment_id, allocation_pct: 100 }] : []);
    setSelectedLinkedInvestmentIds(linkedConfigs.map((item) => item.investment_id));
    setSelectedLinkedInvestmentAllocations(
      Object.fromEntries(linkedConfigs.map((item) => [item.investment_id, String(Number(item.allocation_pct ?? 100) || 100)]))
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (!userId || !window.confirm("Se eliminara este objetivo. Deseas continuar?")) return;
    const { error } = await supabase.from("financial_goals").delete().eq("id", id).eq("user_id", userId);
    if (error) {
      showToast({ type: "error", text: "No se pudo borrar el objetivo." });
      return;
    }
    if (editingId === id) resetForm();
    await loadGoals(userId);
    showToast({ type: "success", text: "Objetivo eliminado." });
  };

  const applySavingsTargetDistribution = async () => {
    if (!userId) {
      showToast({ type: "error", text: "Debes iniciar sesion para repartir el ahorro objetivo." });
      return;
    }
    if (suggestedAllocations.length === 0) {
      showToast({ type: "error", text: "No hay ahorro objetivo mensual o no existen metas activas para repartir." });
      return;
    }

    setSaving(true);
    const updates = suggestedAllocations.map((item) =>
      supabase
        .from("financial_goals")
        .update({ monthly_contribution: item.amount })
        .eq("id", item.id)
        .eq("user_id", userId)
    );

    const results = await Promise.all(updates);
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      setMessage(firstError.message);
      showToast({ type: "error", text: "No se pudo repartir el ahorro objetivo entre las metas." });
      setSaving(false);
      return;
    }

    await loadGoals(userId);
    showToast({ type: "success", text: "Ahorro objetivo del mes repartido entre objetivos activos." });
    setSaving(false);
  };

  const applyActualSavingsDistribution = async () => {
    if (!userId) {
      showToast({ type: "error", text: "Debes iniciar sesion para repartir el ahorro real." });
      return;
    }
    if (suggestedActualAllocations.length === 0) {
      showToast({ type: "error", text: "No hay ahorro real positivo este mes o no existen metas activas." });
      return;
    }

    setSaving(true);
    const updates = suggestedActualAllocations.map((item) =>
      supabase
        .from("financial_goals")
        .update({ monthly_contribution: item.amount })
        .eq("id", item.id)
        .eq("user_id", userId)
    );

    const results = await Promise.all(updates);
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      setMessage(firstError.message);
      showToast({ type: "error", text: "No se pudo repartir el ahorro real del mes." });
      setSaving(false);
      return;
    }

    await loadGoals(userId);
    showToast({ type: "success", text: "Ahorro real del mes repartido entre objetivos activos." });
    setSaving(false);
  };

  const contributeToGoal = async (goal: GoalRow) => {
    if (!userId) {
      showToast({ type: "error", text: "Debes iniciar sesion para aportar a un objetivo." });
      return;
    }

    const raw = contributionDrafts[goal.id] ?? "";
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast({ type: "error", text: "La aportacion debe ser mayor que 0." });
      return;
    }

    setContributingGoalId(goal.id);
    const nextCurrent = Number(goal.current_amount || 0) + amount;
    const { error } = await supabase
      .from("financial_goals")
      .update({ current_amount: nextCurrent })
      .eq("id", goal.id)
      .eq("user_id", userId);

    if (error) {
      setMessage(error.message);
      showToast({ type: "error", text: "No se pudo registrar la aportacion." });
      setContributingGoalId(null);
      return;
    }

    const target = Number(goal.target_amount || 0);
    const linkedCurrent = combinedCurrentByGoal.get(goal.id)?.linked ?? 0;
    const totalCurrent = nextCurrent + linkedCurrent;
    const progress = target > 0 ? Math.min((totalCurrent / target) * 100, 100) : 0;
    await supabase.from("goal_progress_history").upsert(
      {
        goal_id: goal.id,
        user_id: userId,
        snapshot_month: currentSnapshotMonth,
        current_amount: totalCurrent,
        target_amount: target,
        progress_pct: Number(progress.toFixed(2))
      },
      { onConflict: "goal_id,snapshot_month" }
    );

    setContributionDrafts((current) => ({ ...current, [goal.id]: "" }));
    await loadGoals(userId);
    showToast({ type: "success", text: "Aportacion registrada en el objetivo." });
    setContributingGoalId(null);
  };

  const snapshotMonthlyGoalProgress = async () => {
    if (!userId) {
      showToast({ type: "error", text: "Debes iniciar sesion para guardar el progreso del mes." });
      return;
    }
    if (goalsWithComputedProgress.length === 0) {
      showToast({ type: "error", text: "No hay objetivos para guardar en el historico." });
      return;
    }

    setSnapshottingProgress(true);
    const rows = goalsWithComputedProgress.map((goal) => {
      const target = Number(goal.target_amount || 0);
      const current = Number(goal.computedCurrentTotal || 0);
      const progress = target > 0 ? Math.min((current / target) * 100, 100) : 0;
      return {
        goal_id: goal.id,
        user_id: userId,
        snapshot_month: currentSnapshotMonth,
        current_amount: current,
        target_amount: target,
        progress_pct: Number(progress.toFixed(2))
      };
    });

    const { error } = await supabase
      .from("goal_progress_history")
      .upsert(rows, { onConflict: "goal_id,snapshot_month" });

    if (error) {
      setMessage(error.message);
      showToast({ type: "error", text: "No se pudo guardar la foto mensual de objetivos." });
      setSnapshottingProgress(false);
      return;
    }

    await loadGoals(userId);
    showToast({ type: "success", text: "Progreso mensual de objetivos guardado." });
    setSnapshottingProgress(false);
  };

  if (authLoading) {
    return (
      <>
        <SideNav />
        <main className="mx-auto max-w-6xl p-6 md:pl-72">
          <AuthLoadingState title="Preparando objetivos" description="Estamos cargando tus metas financieras guardadas." />
        </main>
      </>
    );
  }

  return (
    <>
      <SideNav />
      <main className="page-enter relative z-10 mx-auto grid max-w-6xl gap-5 p-5 md:pl-72 xl:grid-cols-12">
        <section className="panel rounded-[30px] p-5 text-white md:p-7 xl:col-span-7">
          <p className="text-xs uppercase tracking-[0.26em] text-emerald-300">Objetivos financieros</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-white">Metas conectadas a tu plan</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">Define metas reales, asígnales prioridad y sigue si el ahorro mensual te acerca o no a ellas.</p>
        </section>

        <section className="rounded-[30px] border border-emerald-400/10 bg-[linear-gradient(180deg,rgba(7,19,35,0.98)_0%,rgba(9,29,48,0.98)_52%,rgba(10,63,70,0.92)_100%)] p-6 text-white shadow-[0_26px_60px_rgba(2,8,23,0.35)] xl:col-span-5">
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">Resumen activo</p>
          <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold text-white">{activeGoals.length}</p>
          <p className="mt-3 text-sm leading-6 text-slate-200">Objetivos activos ahora mismo, listos para entrar en tu revision mensual.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-white/6 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/54">Ahorro objetivo mensual</p>
              <p className="mt-2 text-2xl font-semibold">{formatCurrencyByPreference(currentMonthSavingsTarget, currency)}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/6 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/54">Cobertura de metas</p>
              <p className="mt-2 text-2xl font-semibold">{currentMonthSavingsTarget > 0 ? `${monthlyCoveragePct.toFixed(1)}%` : "Sin base"}</p>
            </div>
          </div>
        </section>

        {toast ? <section className={`rounded-[24px] p-4 text-sm xl:col-span-12 ${toast.type === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-red-200 bg-red-50 text-red-800"}`}>{toast.text}</section> : null}
        {message ? <section className="rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm text-red-800 xl:col-span-12">{message}</section> : null}

        <section className="panel rounded-[28px] p-5 text-white xl:col-span-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Formulario</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">{editingId ? "Editar objetivo" : "Nuevo objetivo"}</h2>
            </div>
            {editingId ? <button type="button" onClick={resetForm} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 hover:bg-white/10">Cancelar</button> : null}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4" noValidate>
            <label className="grid gap-2 text-sm text-slate-200"><span>Nombre</span><input className={inputClass()} value={goalName} onChange={(event) => setGoalName(event.target.value)} placeholder="Ej: Fondo de emergencia" /></label>
            <label className="grid gap-2 text-sm text-slate-200"><span>Tipo</span><select className={inputClass()} value={goalType} onChange={(event) => setGoalType(event.target.value as GoalType)}>{GOAL_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm text-slate-200"><span>Objetivo total</span><input className={inputClass()} type="number" min="0" step="0.01" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} /></label>
              <label className="grid gap-2 text-sm text-slate-200"><span>Importe actual</span><input className={inputClass()} type="number" min="0" step="0.01" value={currentAmount} onChange={(event) => setCurrentAmount(event.target.value)} /></label>
            </div>
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm text-slate-200"><span>Aportacion mensual</span><input className={inputClass()} type="number" min="0" step="0.01" value={monthlyContribution} onChange={(event) => setMonthlyContribution(event.target.value)} /></label>
              <label className="grid gap-2 text-sm text-slate-200"><span>Fecha objetivo</span><input className={inputClass()} type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label>
            </div>
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm text-slate-200"><span>Prioridad</span><select className={inputClass()} value={priority} onChange={(event) => setPriority(event.target.value)}>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="grid gap-2 text-sm text-slate-200"><span>Estado</span><select className={inputClass()} value={status} onChange={(event) => setStatus(event.target.value as GoalStatus)}>{GOAL_STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-200"><span>Categoria conectada</span><input className={inputClass()} value={linkedCategory} onChange={(event) => setLinkedCategory(event.target.value)} placeholder="Ej: Vivienda, Inversiones, Viajes" /></label>
              <label className="grid gap-2 text-sm text-slate-200"><span>Cuenta o espacio</span><input className={inputClass()} value={linkedAccount} onChange={(event) => setLinkedAccount(event.target.value)} placeholder="Ej: Cuenta ahorro, Broker principal" /></label>
            </div>
            <div className="grid gap-4">
              <div ref={assetTypesDropdownRef} className="relative grid gap-2 text-sm text-slate-200">
                <span>Tipo de activo conectado</span>
                <button
                  type="button"
                  onClick={() => {
                    setAssetTypesDropdownOpen((current) => !current);
                    setInvestmentsDropdownOpen(false);
                  }}
                  className={`${inputClass()} flex min-w-0 items-center justify-between text-left`}
                >
                  <span className="min-w-0 truncate">{selectedAssetTypesLabel}</span>
                  <span className="text-slate-400">{assetTypesDropdownOpen ? "▲" : "▼"}</span>
                </button>
                {assetTypesDropdownOpen ? (
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl shadow-slate-950/50">
                    <div className="sticky top-0 z-10 rounded-xl border border-white/10 bg-slate-950/95 p-2">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedLinkedAssetTypes(ASSET_TYPE_OPTIONS.map((option) => option.value))}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
                        >
                          Seleccionar todo
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLinkedAssetTypes([]);
                            setSelectedLinkedAssetTypeAllocations({} as Record<AssetType, string>);
                            setAssetTypeSearch("");
                          }}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
                        >
                          Limpiar
                        </button>
                      </div>
                      <input
                        className={inputClass()}
                        value={assetTypeSearch}
                        onChange={(event) => setAssetTypeSearch(event.target.value)}
                        placeholder="Buscar tipo de activo"
                      />
                    </div>
                    <div className="grid gap-1">
                      {filteredAssetTypeOptions.map((option) => {
                        const selected = selectedLinkedAssetTypes.includes(option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              {
                                setSelectedLinkedAssetTypes((current) =>
                                  current.includes(option.value)
                                    ? current.filter((item) => item !== option.value)
                                    : [...current, option.value]
                                );
                                setSelectedLinkedAssetTypeAllocations((current) => {
                                  if (selected) {
                                    const next = { ...current };
                                    delete next[option.value];
                                    return next;
                                  }
                                  return { ...current, [option.value]: current[option.value] ?? "100" };
                                });
                              }
                            }
                            className="flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/5"
                          >
                            <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${selected ? "border-emerald-300 bg-emerald-400/15 text-emerald-200" : "border-white/20 text-transparent"}`}>
                              ✓
                            </span>
                            <span>{option.label}</span>
                          </button>
                        );
                      })}
                      {filteredAssetTypeOptions.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-slate-400">No hay tipos que coincidan con la busqueda.</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <span className="text-xs text-slate-400">Abre el desplegable y marca los tipos que quieras vincular.</span>
                {selectedLinkedAssetTypes.length > 0 ? (
                  <div className="grid gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="flex flex-wrap gap-2">
                      {selectedLinkedAssetTypes.map((assetType) => (
                        <span
                          key={`asset-type-chip-${assetType}`}
                          className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100"
                        >
                          {ASSET_TYPE_OPTIONS.find((option) => option.value === assetType)?.label ?? assetType}
                        </span>
                      ))}
                    </div>
                    {selectedLinkedAssetTypes.map((assetType) => (
                      <div key={`asset-type-allocation-${assetType}`} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px] md:items-center">
                        <div>
                          <p className="text-sm text-white">
                            {ASSET_TYPE_OPTIONS.find((option) => option.value === assetType)?.label ?? assetType}
                          </p>
                          <p className="text-xs text-slate-400">Define que porcentaje de este tipo de activo cuenta para la meta.</p>
                        </div>
                        <label className="grid gap-1 text-xs text-slate-300">
                          <span>Porcentaje vinculado</span>
                          <div className="flex items-center gap-2">
                            <input
                              className={inputClass()}
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              value={selectedLinkedAssetTypeAllocations[assetType] ?? "100"}
                              onChange={(event) =>
                                setSelectedLinkedAssetTypeAllocations((current) => ({
                                  ...current,
                                  [assetType]: event.target.value
                                }))
                              }
                            />
                            <span className="text-sm text-slate-400">%</span>
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div ref={investmentsDropdownRef} className="relative grid gap-2 text-sm text-slate-200">
                <span>Posiciones conectadas</span>
                <button
                  type="button"
                  onClick={() => {
                    setInvestmentsDropdownOpen((current) => !current);
                    setAssetTypesDropdownOpen(false);
                  }}
                  className={`${inputClass()} flex min-w-0 items-center justify-between text-left`}
                >
                  <span className="min-w-0 truncate">{selectedInvestmentsLabel}</span>
                  <span className="text-slate-400">{investmentsDropdownOpen ? "▲" : "▼"}</span>
                </button>
                {investmentsDropdownOpen ? (
                  <div className="mt-2 max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl shadow-slate-950/50">
                    <div className="sticky top-0 z-10 rounded-xl border border-white/10 bg-slate-950/95 p-2">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const allIds = filteredInvestmentLinks.map((investment) => investment.id);
                            setSelectedLinkedInvestmentIds(allIds);
                            setSelectedLinkedInvestmentAllocations((current) => {
                              const next: Record<string, string> = {};
                              for (const id of allIds) {
                                next[id] = current[id] ?? "100";
                              }
                              return next;
                            });
                          }}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
                        >
                          Seleccionar todo
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLinkedInvestmentIds([]);
                            setSelectedLinkedInvestmentAllocations({});
                            setInvestmentSearch("");
                          }}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
                        >
                          Limpiar
                        </button>
                      </div>
                      <input
                        className={inputClass()}
                        value={investmentSearch}
                        onChange={(event) => setInvestmentSearch(event.target.value)}
                        placeholder="Buscar por nombre o simbolo"
                      />
                    </div>
                    <div className="grid gap-1">
                      {filteredInvestmentLinks.map((investment) => {
                        const selected = selectedLinkedInvestmentIds.includes(investment.id);
                        return (
                          <button
                            key={investment.id}
                            type="button"
                            onClick={() => {
                              setSelectedLinkedInvestmentIds((current) =>
                                current.includes(investment.id)
                                  ? current.filter((item) => item !== investment.id)
                                  : [...current, investment.id]
                              );
                              setSelectedLinkedInvestmentAllocations((current) => {
                                if (selected) {
                                  const next = { ...current };
                                  delete next[investment.id];
                                  return next;
                                }
                                return { ...current, [investment.id]: current[investment.id] ?? "100" };
                              });
                            }}
                            className="flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/5"
                          >
                            <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${selected ? "border-emerald-300 bg-emerald-400/15 text-emerald-200" : "border-white/20 text-transparent"}`}>
                              ✓
                            </span>
                            <span className="min-w-0 truncate">
                              {investment.asset_name}{investment.asset_symbol ? ` (${investment.asset_symbol})` : ""}
                            </span>
                          </button>
                        );
                      })}
                      {filteredInvestmentLinks.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-slate-400">No hay posiciones que coincidan con la busqueda.</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <span className="text-xs text-slate-400">Abre el desplegable y marca las posiciones que quieras vincular.</span>
                {selectedLinkedInvestmentIds.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedLinkedInvestmentIds.map((investmentId) => {
                      const investment = investmentLinks.find((item) => item.id === investmentId);
                      return (
                        <span
                          key={`investment-chip-${investmentId}`}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200"
                        >
                          {investment?.asset_name ?? "Posicion"}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                {selectedLinkedInvestmentIds.length > 0 ? (
                  <div className="grid gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                    {selectedLinkedInvestmentIds.map((investmentId) => {
                      const investment = investmentLinks.find((item) => item.id === investmentId);
                      return (
                        <div key={investmentId} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px] md:items-center">
                          <div>
                            <p className="text-sm text-white">
                              {investment?.asset_name ?? "Posicion"}{investment?.asset_symbol ? ` (${investment.asset_symbol})` : ""}
                            </p>
                            <p className="text-xs text-slate-400">Define que porcentaje de esta posicion cuenta para la meta.</p>
                          </div>
                          <label className="grid gap-1 text-xs text-slate-300">
                            <span>Porcentaje vinculado</span>
                            <div className="flex items-center gap-2">
                              <input
                                className={inputClass()}
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={selectedLinkedInvestmentAllocations[investmentId] ?? "100"}
                                onChange={(event) =>
                                  setSelectedLinkedInvestmentAllocations((current) => ({
                                    ...current,
                                    [investmentId]: event.target.value
                                  }))
                                }
                              />
                              <span className="text-sm text-slate-400">%</span>
                            </div>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
            <button className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50" disabled={saving} type="submit">{saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear objetivo"}</button>
          </form>
        </section>

        <section className="grid gap-3 xl:col-span-7 md:grid-cols-2">
          <article className="kpi-card rounded-[24px] p-4"><p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Capital objetivo</p><p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(totalTarget, currency)}</p><p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Suma de objetivos activos.</p></article>
          <article className="kpi-card rounded-[24px] p-4"><p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Capital ya asignado</p><p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(totalCurrent, currency)}</p><p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Importe actual acumulado de metas activas.</p></article>
          <article className="kpi-card rounded-[24px] p-4"><p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Aporte mensual</p><p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(totalMonthlyContribution, currency)}</p><p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Contribucion mensual comprometida.</p></article>
          <article className="kpi-card rounded-[24px] p-4"><p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Pendiente de asignar</p><p className={`mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none ${unassignedMonthlySavings >= 0 ? "text-white" : "text-red-300"}`}>{formatCurrencyByPreference(unassignedMonthlySavings, currency)}</p><p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Ahorro objetivo del mes que aun no esta repartido entre metas.</p></article>
        </section>

        <section className="panel rounded-[28px] p-5 text-white xl:col-span-12">
          <details className="group">
            <summary className="accordion-summary cursor-pointer list-none">
              <div className="accordion-summary-main">
                <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Plan automatico</p>
                <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Conectar metas con el ahorro del mes</h2>
              </div>
              <div className="accordion-summary-side">
                <span className="accordion-metric">{activeGoals.length} activas</span>
                <span className="accordion-chevron" aria-hidden="true">v</span>
              </div>
            </summary>
            <div className="accordion-content mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void snapshotMonthlyGoalProgress()}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={snapshottingProgress || goals.length === 0}
              >
                {snapshottingProgress ? "Guardando..." : "Guardar foto del mes"}
              </button>
              <button
                type="button"
                onClick={() => void applySavingsTargetDistribution()}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={saving || suggestedAllocations.length === 0}
              >
                Repartir ahorro objetivo
              </button>
              <button
                type="button"
                onClick={() => void applyActualSavingsDistribution()}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={saving || suggestedActualAllocations.length === 0}
              >
                Repartir ahorro real
              </button>
            </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[22px] border border-white/8 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Ahorro real del mes</p>
              <p className={`mt-2 text-2xl font-semibold ${currentMonthActualSavings >= 0 ? "text-white" : "text-red-300"}`}>{formatCurrencyByPreference(currentMonthActualSavings, currency)}</p>
            </article>
            <article className="rounded-[22px] border border-white/8 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Disponible para repartir</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatCurrencyByPreference(savingsAvailableForAutomation, currency)}</p>
            </article>
            <article className="rounded-[22px] border border-white/8 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Objetivos activos</p>
              <p className="mt-2 text-2xl font-semibold text-white">{activeGoals.length}</p>
            </article>
            <article className="rounded-[22px] border border-white/8 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Metas completadas</p>
              <p className="mt-2 text-2xl font-semibold text-white">{completedGoals.length}</p>
            </article>
          </div>
          {suggestedAllocations.length === 0 ? (
            <div className="mt-6">
              <EmptyStateCard
                eyebrow="Sin reparto"
                title="Falta base para repartir"
                description="Necesitas un ahorro objetivo mensual y al menos una meta activa para generar un reparto automatico."
                actionLabel="Definir ahorro en Presupuestos"
                actionHref="/budgets"
                compact
              />
            </div>
          ) : (
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {suggestedAllocations.map((item) => (
                <article key={item.id} className="rounded-[24px] border border-white/8 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Sugerencia mensual</p>
                  <h3 className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-white">{item.name}</h3>
                  <p className="mt-3 text-2xl font-semibold text-white">{formatCurrencyByPreference(item.amount, currency)}</p>
                </article>
              ))}
            </div>
          )}
          </details>
        </section>

        <section className="panel rounded-[28px] p-5 text-white xl:col-span-12">
          <details className="group">
            <summary className="accordion-summary cursor-pointer list-none">
              <div className="accordion-summary-main">
                <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Vista anual</p>
                <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Evolucion mes a mes de una meta</h2>
              </div>
              <div className="accordion-summary-side">
                <span className="accordion-metric">{availableTimelineYears.length} anos</span>
                <span className="accordion-chevron" aria-hidden="true">v</span>
              </div>
            </summary>
          <div className="accordion-content">
          {timelineGoalOptions.length === 0 ? (
            <div className="mt-6">
              <EmptyStateCard eyebrow="Sin metas" title="No hay metas activas para dibujar una vista anual" description="Crea una meta activa y guarda fotos mensuales para ver su evolucion." compact />
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm text-slate-200">
                  Meta
                  <select className={inputClass()} value={selectedTimelineGoalId} onChange={(event) => setSelectedTimelineGoalId(event.target.value)}>
                    {timelineGoalOptions.map((goal) => (
                      <option key={goal.id} value={goal.id}>{goal.goal_name}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm text-slate-200">
                  Ano
                  <select className={inputClass()} value={selectedTimelineYear} onChange={(event) => setSelectedTimelineYear(event.target.value)}>
                    {availableTimelineYears.map((year) => (
                      <option key={year} value={String(year)}>{year}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {annualGoalTimeline.map((item) => (
                  <article key={`${selectedTimelineGoalId}-${selectedTimelineYear}-${item.label}`} className="rounded-[22px] border border-white/8 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">{item.label}</p>
                      <span className="text-xs text-slate-400">{item.hasData ? `${item.progressPct.toFixed(1)}%` : "Sin foto"}</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e_0%,#14b8a6_100%)]" style={{ width: `${Math.min(item.progressPct, 100)}%` }} />
                    </div>
                    <p className="mt-3 text-sm text-slate-200">{formatCurrencyByPreference(item.current, currency)}</p>
                    <p className="mt-1 text-xs text-slate-400">Objetivo: {formatCurrencyByPreference(item.target, currency)}</p>
                  </article>
                ))}
              </div>
            </>
          )}
          </div>
          </details>
        </section>

        <section className="panel rounded-[28px] p-5 text-white xl:col-span-12">
          <SectionHeader eyebrow="Lista" title="Objetivos guardados" description="Puedes editar prioridad, progreso actual y fecha objetivo a medida que avance el plan." />
          {loading ? <p className="mt-6 text-sm text-slate-300">Cargando objetivos...</p> : null}
          {!loading && goals.length === 0 ? (
            <div className="mt-6">
              <EmptyStateCard eyebrow="Sin metas" title="Todavia no hay objetivos financieros" description="Crea tu primer objetivo para conectar presupuesto, ahorro y plan de largo plazo." actionLabel="Empieza con el formulario" actionHref="/goals" compact />
            </div>
          ) : null}
          {!loading && goals.length > 0 ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {goalsWithComputedProgress.map((goal) => {
                const progressPct = goal.computedProgressPct;
                const linkedConfigs = linkedInvestmentConfigsByGoal.get(goal.id) ?? [];
                return (
                  <article key={goal.id} className="rounded-[28px] border border-white/8 bg-white/5 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">{GOAL_TYPES.find((item) => item.value === goal.goal_type)?.label ?? goal.goal_type}</p>
                        <h3 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">{goal.goal_name}</h3>
                      </div>
                      <span className="ui-chip rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">{GOAL_STATUSES.find((item) => item.value === goal.status)?.label ?? goal.status}</span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e_0%,#14b8a6_100%)]" style={{ width: `${progressPct}%` }} /></div>
                    <div className="mt-4 grid gap-2 text-sm text-slate-300">
                      <p>Actual total: <span className="font-medium text-white">{formatCurrencyByPreference(goal.computedCurrentTotal, currency)}</span></p>
                      <p>Actual manual: <span className="font-medium text-white">{formatCurrencyByPreference(goal.computedManualCurrent, currency)}</span></p>
                      <p>Valor vinculado: <span className="font-medium text-white">{formatCurrencyByPreference(goal.computedLinkedCurrent, currency)}</span></p>
                      <p>Objetivo: <span className="font-medium text-white">{formatCurrencyByPreference(goal.target_amount, currency)}</span></p>
                      <p>Progreso: <span className="font-medium text-white">{progressPct.toFixed(1)}%</span></p>
                      <p>Prioridad: <span className="font-medium text-white">{goal.priority}</span></p>
                      <p>Aporte mensual: <span className="font-medium text-white">{formatCurrencyByPreference(goal.monthly_contribution ?? 0, currency)}</span></p>
                      <p>Fecha objetivo: <span className="font-medium text-white">{goal.target_date ? formatDateByPreference(goal.target_date, dateFormat) : "Sin fecha"}</span></p>
                      <p>Categoria: <span className="font-medium text-white">{goal.linked_category?.trim() || "Sin conectar"}</span></p>
                      <p>Cuenta: <span className="font-medium text-white">{goal.linked_account?.trim() || "Sin conectar"}</span></p>
                      <p>Tipos vinculados: <span className="font-medium text-white">{(linkedAssetTypeConfigsByGoal.get(goal.id) ?? (goal.linked_asset_type ? [{ asset_type: goal.linked_asset_type, allocation_pct: 100 }] : [])).length > 0 ? (linkedAssetTypeConfigsByGoal.get(goal.id) ?? (goal.linked_asset_type ? [{ asset_type: goal.linked_asset_type, allocation_pct: 100 }] : [])).map((item) => `${ASSET_TYPE_OPTIONS.find((option) => option.value === item.asset_type)?.label ?? item.asset_type} (${Number(item.allocation_pct ?? 100).toFixed(0)}%)`).join(", ") : "Sin tipo"}</span></p>
                      <p>Posiciones vinculadas: <span className="font-medium text-white">{linkedConfigs.length > 0 ? linkedConfigs.map((item) => `${investmentLinks.find((investment) => investment.id === item.investment_id)?.asset_name ?? "Posicion"} (${Number(item.allocation_pct ?? 100).toFixed(0)}%)`).join(", ") : "Sin posiciones"}</span></p>
                    </div>
                    <div className="mt-5 rounded-[22px] border border-white/8 bg-slate-950/35 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Evolucion mensual</p>
                      {((latestHistoryByGoal.get(goal.id) ?? []).length === 0) ? (
                        <p className="mt-3 text-sm leading-6 text-slate-300">Todavia no hay fotos mensuales guardadas para esta meta.</p>
                      ) : (
                        <div className="mt-3 grid gap-3">
                          {(latestHistoryByGoal.get(goal.id) ?? []).slice(0, 4).reverse().map((item) => (
                            <div key={`${goal.id}-${item.snapshot_month}`} className="grid gap-2">
                              <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
                                <span>{formatDateByPreference(item.snapshot_month, dateFormat)}</span>
                                <span>{Number(item.progress_pct).toFixed(1)}%</span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e_0%,#14b8a6_100%)]" style={{ width: `${Math.min(Number(item.progress_pct), 100)}%` }} />
                              </div>
                              <p className="text-xs text-slate-400">
                                {formatCurrencyByPreference(Number(item.current_amount), currency)} de {formatCurrencyByPreference(Number(item.target_amount), currency)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="mt-5 rounded-[22px] border border-white/8 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Aportacion directa</p>
                      <div className="mt-3 flex gap-2">
                        <input
                          className={inputClass()}
                          type="number"
                          min="0"
                          step="0.01"
                          value={contributionDrafts[goal.id] ?? ""}
                          onChange={(event) => setContributionDrafts((current) => ({ ...current, [goal.id]: event.target.value }))}
                          placeholder="Ej: 100"
                        />
                        <button
                          type="button"
                          onClick={() => void contributeToGoal(goal)}
                          disabled={contributingGoalId === goal.id}
                          className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
                        >
                          {contributingGoalId === goal.id ? "Guardando..." : "Aportar"}
                        </button>
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button type="button" onClick={() => handleEdit(goal)} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-white/10">Editar</button>
                      <button type="button" onClick={() => void handleDelete(goal.id)} className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-500/20">Borrar</button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </main>
    </>
  );
}
