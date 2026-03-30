"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_GUIDANCE_PREFERENCES, type GuidanceCategory, type GuidancePreferenceMap } from "@/lib/financial-guidance";

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
type ConnectivityItem = {
  id: string;
  tone: "warning" | "info" | "success";
  title: string;
  body: string;
  cta: string;
  href?: string;
};
type ConnectivityIncidentRow = {
  incident_key: string;
  title: string;
  details: string;
  status: "open" | "resolved";
  severity: "low" | "medium" | "high";
  recurrence_count: number;
  first_detected_at: string;
  last_detected_at: string;
  resolved_at: string | null;
};
type ConnectivityHistoryFilter = "all" | "open" | "resolved";
type IncomeRow = { income_date: string; amount: number };
type SavingsTargetRow = { month: string; savings_target: number };
type SnapshotRow = { snapshot_date: string };
type InvestmentStatusRow = { current_price: number | null; updated_at?: string | null };
type GoalAlertRuleKey = "low_goal_progress" | "overdue_goal" | "paused_priority_goal";
type GoalAlertRule = {
  key: GoalAlertRuleKey;
  label: string;
  description: string;
  enabled: boolean;
  threshold: number | null;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
};
type GoalAlertRuleRow = {
  alert_key: GoalAlertRuleKey;
  enabled: boolean;
  threshold: number | null;
};
type GoalSettingsRow = {
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  status: "active" | "paused" | "completed" | "cancelled";
  priority: number;
};
type GuidancePreferenceRow = {
  category_key: GuidanceCategory;
  enabled: boolean;
};
type CashBaselineSettingsRow = {
  baseline_amount: number;
  baseline_date: string;
};

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
const GOAL_ALERT_RULE_DEFAULTS: GoalAlertRule[] = [
  {
    key: "low_goal_progress",
    label: "Meta con poco avance",
    description: "Avisar si una meta activa sigue por debajo de este porcentaje de progreso.",
    enabled: true,
    threshold: 25,
    min: 0,
    max: 100,
    step: 1,
    suffix: "%"
  },
  {
    key: "overdue_goal",
    label: "Meta vencida",
    description: "Avisar si hay metas activas cuya fecha objetivo ya ha pasado.",
    enabled: true,
    threshold: null
  },
  {
    key: "paused_priority_goal",
    label: "Meta prioritaria pausada",
    description: "Avisar si una meta pausada tiene prioridad igual o superior al umbral.",
    enabled: true,
    threshold: 2,
    min: 1,
    max: 5,
    step: 1
  }
];

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

function mergeGoalAlertRules(rows: GoalAlertRuleRow[] | null | undefined) {
  return GOAL_ALERT_RULE_DEFAULTS.map((rule) => {
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

function ThemeOption({
  active,
  label,
  description,
  onClick
}: {
  active: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
        active
          ? "border-emerald-400/30 bg-emerald-500/14 text-white shadow-[0_14px_28px_rgba(0,0,0,0.24)]"
          : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
      }`}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className={`mt-1 text-xs ${active ? "text-emerald-100" : "text-slate-400"}`}>{description}</p>
    </button>
  );
}

function SettingOption({
  active,
  label,
  description,
  onClick
}: {
  active: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
        active ? "border-emerald-400/30 bg-emerald-500/14 text-white" : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
      }`}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className={`mt-1 text-xs ${active ? "text-emerald-100" : "text-slate-400"}`}>{description}</p>
    </button>
  );
}

export default function SettingsPanel() {
  const supabase = useMemo(() => createClient(), []);
  const {
    theme,
    setTheme,
    currency,
    setCurrency,
    dateFormat,
    setDateFormat,
    showLocalValues,
    setShowLocalValues,
    reduceMotion,
    setReduceMotion,
    settingsOpen,
    setSettingsOpen
  } = useTheme();
  const [alertRules, setAlertRules] = useState<DashboardAlertRule[]>(DASHBOARD_ALERT_RULE_DEFAULTS);
  const [alertRulesLoaded, setAlertRulesLoaded] = useState(false);
  const [savingAlertRuleKey, setSavingAlertRuleKey] = useState<DashboardAlertRuleKey | null>(null);
  const [alertSettingsMessage, setAlertSettingsMessage] = useState<string | null>(null);
  const [goalAlertRules, setGoalAlertRules] = useState<GoalAlertRule[]>(GOAL_ALERT_RULE_DEFAULTS);
  const [goalAlertRulesLoaded, setGoalAlertRulesLoaded] = useState(false);
  const [savingGoalAlertRuleKey, setSavingGoalAlertRuleKey] = useState<GoalAlertRuleKey | null>(null);
  const [goalAlertSettingsMessage, setGoalAlertSettingsMessage] = useState<string | null>(null);
  const [connectivityItems, setConnectivityItems] = useState<ConnectivityItem[]>([]);
  const [connectivityHistory, setConnectivityHistory] = useState<ConnectivityIncidentRow[]>([]);
  const [connectivityHistoryFilter, setConnectivityHistoryFilter] = useState<ConnectivityHistoryFilter>("all");
  const [connectivitySearchTerm, setConnectivitySearchTerm] = useState("");
  const [connectivityLoaded, setConnectivityLoaded] = useState(false);
  const [lastPriceUpdateAt, setLastPriceUpdateAt] = useState<string | null>(null);
  const [goalAlertsPreview, setGoalAlertsPreview] = useState<Array<{ id: GoalAlertRuleKey; tone: "warning" | "info"; title: string; body: string }>>([]);
  const [guidancePreferences, setGuidancePreferences] = useState<GuidancePreferenceMap>(DEFAULT_GUIDANCE_PREFERENCES);
  const [guidancePreferencesLoaded, setGuidancePreferencesLoaded] = useState(false);
  const [savingGuidanceCategory, setSavingGuidanceCategory] = useState<GuidanceCategory | null>(null);
  const [guidanceSettingsMessage, setGuidanceSettingsMessage] = useState<string | null>(null);
  const [cashBaselineAmount, setCashBaselineAmount] = useState("");
  const [cashBaselineDate, setCashBaselineDate] = useState("");
  const [cashBaselineLoaded, setCashBaselineLoaded] = useState(false);
  const [savingCashBaseline, setSavingCashBaseline] = useState(false);
  const [cashBaselineMessage, setCashBaselineMessage] = useState<string | null>(null);

  const previewDate = dateFormat === "us" ? "03/13/2026" : "13/03/2026";
  const previewMoney =
    currency === "USD"
      ? "$2,072.76"
      : currency === "GBP"
        ? "GBP 2,072.76"
        : currency === "DKK"
          ? "kr. 15.456,80"
          : "2.072,76 EUR";

  useEffect(() => {
    const loadAlertRules = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setAlertRulesLoaded(true);
        return;
      }

      const { data, error } = await supabase
        .from("dashboard_alert_rules")
        .select("alert_key, enabled, threshold")
        .eq("user_id", user.id);

      if (!error && data) {
        setAlertRules(mergeAlertRules(data as DashboardAlertRulesRow[]));
      }

      setAlertRulesLoaded(true);
    };

    void loadAlertRules();
  }, [supabase]);

  useEffect(() => {
    const loadGuidancePreferences = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setGuidancePreferencesLoaded(true);
        return;
      }

      const { data, error } = await supabase
        .from("financial_guidance_preferences")
        .select("category_key, enabled")
        .eq("user_id", user.id);

      if (!error && data) {
        const next = { ...DEFAULT_GUIDANCE_PREFERENCES };
        for (const row of data as GuidancePreferenceRow[]) {
          next[row.category_key] = row.enabled;
        }
        setGuidancePreferences(next);
      }

      setGuidancePreferencesLoaded(true);
    };

    void loadGuidancePreferences();
  }, [supabase]);

  useEffect(() => {
    const loadGoalAlertRules = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setGoalAlertRulesLoaded(true);
        return;
      }

      const { data, error } = await supabase
        .from("goal_alert_rules")
        .select("alert_key, enabled, threshold")
        .eq("user_id", user.id);

      if (!error && data) {
        setGoalAlertRules(mergeGoalAlertRules(data as GoalAlertRuleRow[]));
      }

      setGoalAlertRulesLoaded(true);
    };

    void loadGoalAlertRules();
  }, [supabase]);

  useEffect(() => {
    const loadCashBaseline = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setCashBaselineLoaded(true);
        return;
      }

      const { data, error } = await supabase
        .from("cash_baseline_settings")
        .select("baseline_amount, baseline_date")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!error && data) {
        const row = data as CashBaselineSettingsRow;
        setCashBaselineAmount(String(Number(row.baseline_amount ?? 0)));
        setCashBaselineDate(row.baseline_date ?? "");
      }

      setCashBaselineLoaded(true);
    };

    void loadCashBaseline();
  }, [supabase]);

  useEffect(() => {
    const loadConnectivityData = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setConnectivityLoaded(true);
        return;
      }

      const [incomeResult, savingsResult, snapshotsResult, investmentsResult, incidentsResult, goalsResult] = await Promise.all([
        supabase.from("income").select("income_date, amount").eq("user_id", user.id),
        supabase.from("monthly_savings_targets").select("month, savings_target").eq("user_id", user.id),
        supabase.from("net_worth_snapshots").select("snapshot_date").eq("user_id", user.id),
        supabase.from("investments").select("current_price, updated_at").eq("user_id", user.id),
        supabase
          .from("connectivity_incidents")
          .select("incident_key, title, details, status, severity, recurrence_count, first_detected_at, last_detected_at, resolved_at")
          .eq("user_id", user.id)
          .order("last_detected_at", { ascending: false })
          .limit(12),
        supabase.from("financial_goals").select("target_amount, current_amount, target_date, status, priority").eq("user_id", user.id)
      ]);

      const now = new Date();
      const incomeRows = ((incomeResult.data as IncomeRow[] | null) ?? []);
      const savingsRows = ((savingsResult.data as SavingsTargetRow[] | null) ?? []);
      const snapshotRows = ((snapshotsResult.data as SnapshotRow[] | null) ?? []);
      const investmentRows = ((investmentsResult.data as InvestmentStatusRow[] | null) ?? []);
      const goalRows = ((goalsResult.data as GoalSettingsRow[] | null) ?? []);
      const assetsWithoutCurrentPrice = investmentRows.filter((row) => row.current_price === null);
      const hasSnapshotToday = snapshotRows.some((row) => row.snapshot_date === new Date().toISOString().slice(0, 10));
      const hasCurrentMonthIncome = incomeRows.some((row) => isSameMonth(row.income_date, now));
      const hasCurrentMonthSavingsTarget = savingsRows.some((row) => isSameMonth(row.month, now));
      const latestInvestmentUpdate = investmentRows
        .map((row) => row.updated_at)
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => b.localeCompare(a))[0] ?? null;
      setLastPriceUpdateAt(latestInvestmentUpdate);

      setConnectivityItems([
        {
          id: "prices",
          tone: assetsWithoutCurrentPrice.length > 0 ? "warning" : "success",
          title: "Precios de mercado",
          body:
            assetsWithoutCurrentPrice.length > 0
              ? `${assetsWithoutCurrentPrice.length} activo(s) siguen sin precio actual guardado.`
              : "Toda la cartera abierta tiene precio actual disponible.",
          cta: "Abrir Inversiones",
          href: "/investments"
        },
        {
          id: "snapshot",
          tone: hasSnapshotToday ? "success" : snapshotRows.length > 0 ? "warning" : "info",
          title: "Snapshot diario",
          body: hasSnapshotToday
            ? "Ya hay snapshot guardado hoy para el historico de patrimonio."
            : snapshotRows.length > 0
              ? "Hoy aun no se ha guardado snapshot diario."
              : "Todavia no hay snapshots guardados para construir historico real.",
          cta: "Volver al dashboard",
          href: "/dashboard"
        },
        {
          id: "monthly-data",
          tone: hasCurrentMonthIncome && hasCurrentMonthSavingsTarget ? "success" : "warning",
          title: "Datos del mes",
          body:
            hasCurrentMonthIncome && hasCurrentMonthSavingsTarget
              ? "El mes actual ya tiene ingresos y ahorro objetivo definidos."
              : "Falta completar ingresos o ahorro objetivo del mes actual.",
          cta: "Revisar Presupuestos",
          href: "/budgets"
        },
        {
          id: "imports",
          tone: investmentRows.length > 0 ? "info" : "warning",
          title: "Importacion y cartera",
          body:
            investmentRows.length > 0
              ? `Tienes ${investmentRows.length} posiciones registradas. Puedes importar o refrescar la cartera cuando lo necesites.`
              : "La cartera aun esta vacia. Puedes crear posiciones a mano o importar desde CSV.",
          cta: "Gestionar cartera",
          href: "/investments"
        }
      ]);

      const nowIsoDate = new Date().toISOString().slice(0, 10);
      const lowProgressThreshold = Number(goalAlertRules.find((rule) => rule.key === "low_goal_progress")?.threshold ?? 25);
      const pausedPriorityThreshold = Number(goalAlertRules.find((rule) => rule.key === "paused_priority_goal")?.threshold ?? 2);
      const nextGoalAlerts: Array<{ id: GoalAlertRuleKey; tone: "warning" | "info"; title: string; body: string }> = [];

      if (goalAlertRules.find((rule) => rule.key === "low_goal_progress")?.enabled) {
        const lowProgressCount = goalRows.filter((goal) => {
          if (goal.status !== "active" || Number(goal.target_amount || 0) <= 0) return false;
          const progressPct = (Number(goal.current_amount || 0) / Number(goal.target_amount || 0)) * 100;
          return progressPct < lowProgressThreshold;
        }).length;

        if (lowProgressCount > 0) {
          nextGoalAlerts.push({
            id: "low_goal_progress",
            tone: "info",
            title: "Metas con poco avance",
            body: `${lowProgressCount} meta(s) activas siguen por debajo del ${lowProgressThreshold}% de progreso.`
          });
        }
      }

      if (goalAlertRules.find((rule) => rule.key === "overdue_goal")?.enabled) {
        const overdueCount = goalRows.filter((goal) => goal.status === "active" && goal.target_date && goal.target_date < nowIsoDate).length;
        if (overdueCount > 0) {
          nextGoalAlerts.push({
            id: "overdue_goal",
            tone: "warning",
            title: "Metas vencidas",
            body: `${overdueCount} meta(s) activas ya han superado su fecha objetivo.`
          });
        }
      }

      if (goalAlertRules.find((rule) => rule.key === "paused_priority_goal")?.enabled) {
        const pausedPriorityCount = goalRows.filter(
          (goal) => goal.status === "paused" && Number(goal.priority || 99) <= pausedPriorityThreshold
        ).length;
        if (pausedPriorityCount > 0) {
          nextGoalAlerts.push({
            id: "paused_priority_goal",
            tone: "info",
            title: "Metas prioritarias pausadas",
            body: `${pausedPriorityCount} meta(s) pausadas tienen prioridad ${pausedPriorityThreshold} o superior.`
          });
        }
      }

      setGoalAlertsPreview(nextGoalAlerts);

      if (!incidentsResult.error && incidentsResult.data) {
        setConnectivityHistory((incidentsResult.data as ConnectivityIncidentRow[]) ?? []);
      }

      const openItems = [
        ...(assetsWithoutCurrentPrice.length > 0
          ? [
              {
                incident_key: "prices",
                title: "Precios de mercado",
                details: `${assetsWithoutCurrentPrice.length} activo(s) siguen sin precio actual guardado.`,
                severity: assetsWithoutCurrentPrice.length >= 3 ? "high" : "medium"
              }
            ]
          : []),
        ...(!hasSnapshotToday && snapshotRows.length > 0
          ? [
              {
                incident_key: "snapshot",
                title: "Snapshot diario",
                details: "Hoy aun no se ha guardado snapshot diario.",
                severity: "medium"
              }
            ]
          : []),
        ...(!(hasCurrentMonthIncome && hasCurrentMonthSavingsTarget)
          ? [
              {
                incident_key: "monthly-data",
                title: "Datos del mes",
                details: "Falta completar ingresos o ahorro objetivo del mes actual.",
                severity: "medium"
              }
            ]
          : []),
        ...(investmentRows.length === 0
          ? [
              {
                incident_key: "imports",
                title: "Importacion y cartera",
                details: "La cartera aun esta vacia. Puedes crear posiciones a mano o importar desde CSV.",
                severity: "low"
              }
            ]
          : [])
      ];

      if (openItems.length > 0) {
        for (const item of openItems) {
          const existing = ((incidentsResult.data as ConnectivityIncidentRow[] | null) ?? []).find((row) => row.incident_key === item.incident_key);
          await supabase.from("connectivity_incidents").upsert(
            {
              user_id: user.id,
              incident_key: item.incident_key,
              title: item.title,
              details: item.details,
              status: "open",
              severity: item.severity,
              recurrence_count: existing ? Number(existing.recurrence_count ?? 0) + 1 : 1,
              first_detected_at: existing?.first_detected_at ?? new Date().toISOString(),
              last_detected_at: new Date().toISOString(),
              resolved_at: null
            },
            { onConflict: "user_id,incident_key" }
          );
        }
      }

      setConnectivityLoaded(true);
    };

    if (settingsOpen) {
      void loadConnectivityData();
    }
  }, [settingsOpen, supabase]);

  const filteredConnectivityHistory = useMemo(() => {
    const search = connectivitySearchTerm.trim().toLowerCase();

    return connectivityHistory.filter((item) => {
      const matchesFilter = connectivityHistoryFilter === "all" || item.status === connectivityHistoryFilter;
      const matchesSearch = !search || item.title.toLowerCase().includes(search) || item.details.toLowerCase().includes(search);
      return matchesFilter && matchesSearch;
    });
  }, [connectivityHistory, connectivityHistoryFilter, connectivitySearchTerm]);

  const updateGuidancePreference = async (category: GuidanceCategory, enabled: boolean) => {
    const current = guidancePreferences[category];
    setGuidancePreferences((prev) => ({ ...prev, [category]: enabled }));
    setGuidanceSettingsMessage(null);

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      setGuidancePreferences((prev) => ({ ...prev, [category]: current }));
      setGuidanceSettingsMessage("No hemos podido validar tu sesion para guardar consejos personalizados.");
      return;
    }

    setSavingGuidanceCategory(category);
    const { error } = await supabase.from("financial_guidance_preferences").upsert(
      {
        user_id: user.id,
        category_key: category,
        enabled
      },
      { onConflict: "user_id,category_key" }
    );

    if (error) {
      setGuidancePreferences((prev) => ({ ...prev, [category]: current }));
      setGuidanceSettingsMessage("No hemos podido guardar esta preferencia de consejos. Intentalo otra vez.");
    }

    setSavingGuidanceCategory((value) => (value === category ? null : value));
  };

  const updateAlertRule = async (
    ruleKey: DashboardAlertRuleKey,
    patch: Partial<Pick<DashboardAlertRule, "enabled" | "threshold">>
  ) => {
    const currentRule = alertRules.find((rule) => rule.key === ruleKey);
    if (!currentRule) {
      return;
    }

    const nextRule = { ...currentRule, ...patch };
    setAlertRules((current) => current.map((rule) => (rule.key === ruleKey ? nextRule : rule)));
    setAlertSettingsMessage(null);

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      setAlertRules((current) => current.map((rule) => (rule.key === ruleKey ? currentRule : rule)));
      setAlertSettingsMessage("No hemos podido validar tu sesion para guardar alertas.");
      return;
    }

    setSavingAlertRuleKey(ruleKey);
    const { error } = await supabase.from("dashboard_alert_rules").upsert(
      {
        user_id: user.id,
        alert_key: ruleKey,
        enabled: nextRule.enabled,
        threshold: nextRule.threshold
      },
      { onConflict: "user_id,alert_key" }
    );

    if (error) {
      setAlertRules((current) => current.map((rule) => (rule.key === ruleKey ? currentRule : rule)));
      setAlertSettingsMessage("No hemos podido guardar esta regla. Intentalo otra vez.");
    }

    setSavingAlertRuleKey((current) => (current === ruleKey ? null : current));
  };

  const updateGoalAlertRule = async (
    ruleKey: GoalAlertRuleKey,
    patch: Partial<Pick<GoalAlertRule, "enabled" | "threshold">>
  ) => {
    const currentRule = goalAlertRules.find((rule) => rule.key === ruleKey);
    if (!currentRule) {
      return;
    }

    const nextRule = { ...currentRule, ...patch };
    setGoalAlertRules((current) => current.map((rule) => (rule.key === ruleKey ? nextRule : rule)));
    setGoalAlertSettingsMessage(null);

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      setGoalAlertRules((current) => current.map((rule) => (rule.key === ruleKey ? currentRule : rule)));
      setGoalAlertSettingsMessage("No hemos podido validar tu sesion para guardar alertas de objetivos.");
      return;
    }

    setSavingGoalAlertRuleKey(ruleKey);
    const { error } = await supabase.from("goal_alert_rules").upsert(
      {
        user_id: user.id,
        alert_key: ruleKey,
        enabled: nextRule.enabled,
        threshold: nextRule.threshold
      },
      { onConflict: "user_id,alert_key" }
    );

    if (error) {
      setGoalAlertRules((current) => current.map((rule) => (rule.key === ruleKey ? currentRule : rule)));
      setGoalAlertSettingsMessage("No hemos podido guardar esta regla de objetivos. Intentalo otra vez.");
    }

    setSavingGoalAlertRuleKey((current) => (current === ruleKey ? null : current));
  };

  const saveCashBaseline = async () => {
    setCashBaselineMessage(null);

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      setCashBaselineMessage("No hemos podido validar tu sesion para guardar la referencia de caja.");
      return;
    }

    if (!cashBaselineDate) {
      setCashBaselineMessage("Necesitas indicar la fecha desde la que la caja empieza a ser fiable.");
      return;
    }

    const parsedAmount = Number(cashBaselineAmount || 0);
    if (!Number.isFinite(parsedAmount)) {
      setCashBaselineMessage("El saldo inicial de caja no es valido.");
      return;
    }

    setSavingCashBaseline(true);
    const { error } = await supabase.from("cash_baseline_settings").upsert(
      {
        user_id: user.id,
        baseline_amount: parsedAmount,
        baseline_date: cashBaselineDate
      },
      { onConflict: "user_id" }
    );

    if (error) {
      setCashBaselineMessage("No hemos podido guardar la referencia de caja. Intentalo otra vez.");
    } else {
      setCashBaselineMessage("Referencia de caja guardada.");
    }

    setSavingCashBaseline(false);
  };

  return (
    <>
      {settingsOpen ? (
        <button
          type="button"
          aria-label="Cerrar configuracion"
          onClick={() => setSettingsOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-[2px]"
        />
      ) : null}

      <aside
        className={`fixed right-4 top-4 z-40 h-[calc(100vh-2rem)] w-[min(92vw,360px)] rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,#020817_0%,#071427_56%,#0a1d31_100%)] p-5 text-white shadow-[0_30px_80px_rgba(2,8,23,0.58)] transition duration-300 ${
          settingsOpen ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-[108%] opacity-0"
        }`}
      >
        <div className="flex h-full flex-col overflow-y-auto pr-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">Configuracion</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold">Ajustes visuales</h2>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
            >
              Cerrar
            </button>
          </div>

          <div className="mt-8 grid gap-3">
            <ThemeOption
              active={theme === "dark"}
              label="Tema oscuro"
              description="El aspecto fintech oscuro que ya estas usando."
              onClick={() => setTheme("dark")}
            />
            <ThemeOption
              active={theme === "light"}
              label="Tema claro"
              description="Un modo mas luminoso con la misma estructura y contraste."
              onClick={() => setTheme("light")}
            />
          </div>

          <div className="mt-8">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Moneda</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <SettingOption active={currency === "EUR"} label="EUR" description="Euro" onClick={() => setCurrency("EUR")} />
              <SettingOption active={currency === "USD"} label="USD" description="Dolar" onClick={() => setCurrency("USD")} />
              <SettingOption active={currency === "GBP"} label="GBP" description="Libra" onClick={() => setCurrency("GBP")} />
              <SettingOption active={currency === "DKK"} label="DKK" description="Corona danesa" onClick={() => setCurrency("DKK")} />
            </div>
          </div>

          <div className="mt-8">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Formato de fecha</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <SettingOption active={dateFormat === "es"} label="DD/MM/AAAA" description="Estilo espanol" onClick={() => setDateFormat("es")} />
              <SettingOption active={dateFormat === "us"} label="MM/DD/AAAA" description="Estilo americano" onClick={() => setDateFormat("us")} />
            </div>
          </div>

          <div className="mt-8">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Cartera</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <SettingOption
                active={showLocalValues}
                label="Valor local visible"
                description="Muestra moneda local y valor consolidado a EUR."
                onClick={() => setShowLocalValues(true)}
              />
              <SettingOption
                active={!showLocalValues}
                label="Solo total en EUR"
                description="Simplifica la tabla dejando solo el consolidado."
                onClick={() => setShowLocalValues(false)}
              />
            </div>
          </div>

          <div className="mt-8">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Movimiento</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <SettingOption
                active={!reduceMotion}
                label="Animaciones suaves"
                description="Mantiene transiciones y microinteracciones activas."
                onClick={() => setReduceMotion(false)}
              />
              <SettingOption
                active={reduceMotion}
                label="Reducir movimiento"
                description="Reduce animaciones para una lectura mas estable."
                onClick={() => setReduceMotion(true)}
              />
            </div>
          </div>

          <div className="mt-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Referencia de caja</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Define el saldo real con el que empezaste a usar la app y la fecha desde la que la caja debe empezar a calcularse.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
                {cashBaselineLoaded ? "Sincronizado" : "Cargando..."}
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Saldo inicial</span>
                <input
                  type="number"
                  step="0.01"
                  value={cashBaselineAmount}
                  onChange={(event) => setCashBaselineAmount(event.target.value)}
                  placeholder="Ej: 2500"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-300/40"
                />
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Fecha de inicio</span>
                <input
                  type="date"
                  value={cashBaselineDate}
                  onChange={(event) => setCashBaselineDate(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-300/40"
                />
              </label>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs leading-5 text-slate-400">
                Desde esa fecha, la caja del dashboard se calculara como saldo inicial mas ingresos menos gastos posteriores.
              </p>
              <button
                type="button"
                onClick={() => void saveCashBaseline()}
                disabled={savingCashBaseline}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10 disabled:opacity-60"
              >
                {savingCashBaseline ? "Guardando..." : "Guardar referencia"}
              </button>
            </div>
            {cashBaselineMessage ? <p className="mt-3 text-xs text-emerald-300">{cashBaselineMessage}</p> : null}
          </div>

          <div className="mt-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Consejos personalizados</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Activa o pausa las familias de consejos que apareceran en Dashboard y Revision mensual.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
                {guidancePreferencesLoaded ? "Sincronizado" : "Cargando..."}
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              {([
                ["debt", "Deuda", "Carga mensual, presion financiera y capacidad de amortizacion."],
                ["savings", "Ahorro", "Disciplina de ahorro y alineacion con tu plan mensual."],
                ["impulse", "Compras por impulso", "Senales de poco margen entre gasto e ingresos."],
                ["investments", "Inversiones", "Concentracion, cobertura de precios y exposicion divisa."],
                ["fire", "FIRE", "Consejos de consistencia y avance del plan de independencia."]
              ] as Array<[GuidanceCategory, string, string]>).map(([category, label, description]) => (
                <article key={category} className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void updateGuidancePreference(category, !guidancePreferences[category])}
                      className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                        guidancePreferences[category]
                          ? "border border-emerald-400/20 bg-emerald-500/14 text-emerald-100"
                          : "border border-white/10 bg-white/5 text-slate-300"
                      }`}
                    >
                      {guidancePreferences[category] ? "Activa" : "Pausada"}
                    </button>
                  </div>
                  {savingGuidanceCategory === category ? <p className="mt-3 text-[11px] text-emerald-300">Guardando...</p> : null}
                </article>
              ))}
            </div>
            {guidanceSettingsMessage ? <p className="mt-3 text-xs text-amber-300">{guidanceSettingsMessage}</p> : null}
          </div>

          <div className="mt-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Alertas del dashboard</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Ajusta aqui que senales quieres ver y con que umbral para que el dashboard te avise solo de lo importante.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
                {alertRulesLoaded ? "Sincronizado" : "Cargando..."}
              </span>
            </div>
            <div className="mt-4 grid gap-3">
              {alertRules.map((rule) => (
                <article key={rule.key} className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{rule.label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{rule.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void updateAlertRule(rule.key, { enabled: !rule.enabled })}
                      className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                        rule.enabled
                          ? "border border-emerald-400/20 bg-emerald-500/14 text-emerald-100"
                          : "border border-white/10 bg-white/5 text-slate-300"
                      }`}
                    >
                      {rule.enabled ? "Activa" : "Pausada"}
                    </button>
                  </div>
                  {rule.threshold !== null ? (
                    <label className="mt-3 block">
                      <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Umbral</span>
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
                          className="w-28 rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-300/40"
                        />
                        <span className="text-xs text-slate-400">{rule.suffix ?? ""}</span>
                        {savingAlertRuleKey === rule.key ? <span className="text-[11px] text-emerald-300">Guardando...</span> : null}
                      </div>
                    </label>
                  ) : (
                    <p className="mt-3 text-[11px] text-slate-500">
                      {savingAlertRuleKey === rule.key ? "Guardando cambios..." : "Sin umbral numerico configurable."}
                    </p>
                  )}
                </article>
              ))}
            </div>
            {alertSettingsMessage ? <p className="mt-3 text-xs text-amber-300">{alertSettingsMessage}</p> : null}
          </div>

          <div className="mt-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Conectividad e importacion</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Aqui centralizamos el estado operativo de precios, snapshots, datos del mes e incidencias recientes.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
                {connectivityLoaded ? "Sincronizado" : "Cargando..."}
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              {connectivityItems.map((item) => (
                <article key={item.id} className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                  <p className={`text-xs uppercase tracking-[0.18em] ${item.tone === "warning" ? "text-amber-300" : item.tone === "success" ? "text-emerald-300" : "text-sky-300"}`}>
                    {item.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{item.body}</p>
                  {item.href ? (
                    <a href={item.href} className="mt-3 inline-flex text-xs font-medium text-emerald-300 transition hover:text-emerald-200">
                      {item.cta}
                    </a>
                  ) : (
                    <p className="mt-3 text-xs font-medium text-emerald-300">{item.cta}</p>
                  )}
                </article>
              ))}
            </div>

            <div className="mt-4 rounded-[22px] border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Ultima actualizacion de precios</p>
              <p className="mt-2 text-sm text-slate-200">
                {lastPriceUpdateAt
                  ? new Date(lastPriceUpdateAt).toLocaleString(dateFormat === "us" ? "en-US" : "es-ES")
                  : "Aun no hay una marca de actualizacion disponible."}
              </p>
            </div>

            <div className="mt-4 rounded-[22px] border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-sky-300">Historial de incidencias</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Busca rapido incidencias abiertas o resueltas para ver si algo se repite.</p>
                  </div>
                </div>
                <input
                  type="search"
                  value={connectivitySearchTerm}
                  onChange={(event) => setConnectivitySearchTerm(event.target.value)}
                  placeholder="Buscar incidencia"
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-300/40"
                />
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "all", label: "Todas" },
                    { value: "open", label: "Abiertas" },
                    { value: "resolved", label: "Resueltas" }
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setConnectivityHistoryFilter(item.value as ConnectivityHistoryFilter)}
                      className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                        connectivityHistoryFilter === item.value
                          ? "border border-emerald-400/20 bg-emerald-500/14 text-emerald-100"
                          : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {filteredConnectivityHistory.length > 0 ? (
                  filteredConnectivityHistory.map((item) => (
                    <article key={`${item.incident_key}-${item.last_detected_at}`} className="rounded-[18px] border border-white/8 bg-slate-950/20 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-white">{item.title}</p>
                          <p className="mt-1 text-xs leading-5 text-white/60">{item.details}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${item.status === "open" ? "border border-amber-400/20 bg-amber-500/14 text-amber-200" : "border border-emerald-400/20 bg-emerald-500/14 text-emerald-200"}`}>
                            {item.status === "open" ? "Abierta" : "Resuelta"}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                            item.severity === "high"
                              ? "border border-red-400/20 bg-red-500/14 text-red-200"
                              : item.severity === "medium"
                                ? "border border-amber-400/20 bg-amber-500/14 text-amber-200"
                                : "border border-sky-400/20 bg-sky-500/14 text-sky-200"
                          }`}>
                            {item.severity === "high" ? "Alta" : item.severity === "medium" ? "Media" : "Baja"}
                          </span>
                        </div>
                      </div>
                      <p className="mt-3 text-[11px] text-white/46">
                        Detectada: {new Date(item.first_detected_at).toLocaleDateString(dateFormat === "us" ? "en-US" : "es-ES")} · Ultimo cambio: {new Date(item.last_detected_at).toLocaleDateString(dateFormat === "us" ? "en-US" : "es-ES")} · Recurrencia: {item.recurrence_count}
                      </p>
                    </article>
                  ))
                ) : (
                  <article className="rounded-[18px] border border-white/8 bg-slate-950/20 p-3">
                    <p className="text-sm leading-6 text-slate-300">
                      {connectivityHistory.length === 0
                        ? "Todavia no hay incidencias registradas. Este historial se ira llenando cuando aparezcan señales operativas."
                        : "No hay incidencias para el filtro actual."}
                    </p>
                  </article>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Alertas de objetivos</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Ajusta aqui las reglas que vigilan el avance de tus metas y veras una vista previa con las incidencias actuales.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
                {goalAlertRulesLoaded ? "Sincronizado" : "Cargando..."}
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              {goalAlertRules.map((rule) => (
                <article key={rule.key} className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{rule.label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{rule.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void updateGoalAlertRule(rule.key, { enabled: !rule.enabled })}
                      className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                        rule.enabled
                          ? "border border-emerald-400/20 bg-emerald-500/14 text-emerald-100"
                          : "border border-white/10 bg-white/5 text-slate-300"
                      }`}
                    >
                      {rule.enabled ? "Activa" : "Pausada"}
                    </button>
                  </div>
                  {rule.threshold !== null ? (
                    <label className="mt-3 block">
                      <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Umbral</span>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          min={rule.min}
                          max={rule.max}
                          step={rule.step ?? 1}
                          value={rule.threshold}
                          onChange={(event) => {
                            const rawValue = Number(event.target.value);
                            const fallback = GOAL_ALERT_RULE_DEFAULTS.find((item) => item.key === rule.key)?.threshold ?? 0;
                            void updateGoalAlertRule(rule.key, {
                              threshold: Number.isFinite(rawValue) ? rawValue : fallback
                            });
                          }}
                          className="w-28 rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-300/40"
                        />
                        <span className="text-xs text-slate-400">{rule.suffix ?? ""}</span>
                        {savingGoalAlertRuleKey === rule.key ? <span className="text-[11px] text-emerald-300">Guardando...</span> : null}
                      </div>
                    </label>
                  ) : (
                    <p className="mt-3 text-[11px] text-slate-500">
                      {savingGoalAlertRuleKey === rule.key ? "Guardando cambios..." : "Sin umbral numerico configurable."}
                    </p>
                  )}
                </article>
              ))}
            </div>

            {goalAlertSettingsMessage ? <p className="mt-3 text-xs text-amber-300">{goalAlertSettingsMessage}</p> : null}

            <div className="mt-4 rounded-[22px] border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-sky-300">Vista previa de incidencias</p>
              <div className="mt-3 space-y-3">
                {goalAlertsPreview.length > 0 ? (
                  goalAlertsPreview.map((alert) => (
                    <article key={alert.id} className="rounded-[18px] border border-white/8 bg-slate-950/20 p-3">
                      <p className={`text-xs uppercase tracking-[0.18em] ${alert.tone === "warning" ? "text-amber-300" : "text-sky-300"}`}>{alert.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{alert.body}</p>
                    </article>
                  ))
                ) : (
                  <article className="rounded-[18px] border border-emerald-400/12 bg-slate-950/20 p-3">
                    <p className="text-sm leading-6 text-slate-300">Ahora mismo no hay alertas de objetivos activas con tu configuracion actual.</p>
                  </article>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[24px] border border-white/8 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Vista previa</p>
            <p className="mt-2 text-sm text-slate-200">
              Tema: <span className="font-semibold text-white">{theme === "dark" ? "Oscuro" : "Claro"}</span>
            </p>
            <p className="mt-2 text-sm text-slate-200">
              Moneda: <span className="font-semibold text-white">{previewMoney}</span>
            </p>
            <p className="mt-2 text-sm text-slate-200">
              Fecha: <span className="font-semibold text-white">{previewDate}</span>
            </p>
            <p className="mt-2 text-sm text-slate-200">
              Cartera: <span className="font-semibold text-white">{showLocalValues ? "Moneda local + EUR" : "Solo EUR"}</span>
            </p>
            <p className="mt-2 text-sm text-slate-200">
              Movimiento: <span className="font-semibold text-white">{reduceMotion ? "Reducido" : "Suave"}</span>
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
