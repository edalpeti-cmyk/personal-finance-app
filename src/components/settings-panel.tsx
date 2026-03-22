"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { createClient } from "@/lib/supabase/client";

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
  first_detected_at: string;
  last_detected_at: string;
  resolved_at: string | null;
};
type ConnectivityHistoryFilter = "all" | "open" | "resolved";
type IncomeRow = { income_date: string; amount: number };
type SavingsTargetRow = { month: string; savings_target: number };
type SnapshotRow = { snapshot_date: string };
type InvestmentStatusRow = { current_price: number | null };

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
  const [connectivityItems, setConnectivityItems] = useState<ConnectivityItem[]>([]);
  const [connectivityHistory, setConnectivityHistory] = useState<ConnectivityIncidentRow[]>([]);
  const [connectivityHistoryFilter, setConnectivityHistoryFilter] = useState<ConnectivityHistoryFilter>("all");
  const [connectivitySearchTerm, setConnectivitySearchTerm] = useState("");
  const [connectivityLoaded, setConnectivityLoaded] = useState(false);

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
    const loadConnectivityData = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setConnectivityLoaded(true);
        return;
      }

      const [incomeResult, savingsResult, snapshotsResult, investmentsResult, incidentsResult] = await Promise.all([
        supabase.from("income").select("income_date, amount").eq("user_id", user.id),
        supabase.from("monthly_savings_targets").select("month, savings_target").eq("user_id", user.id),
        supabase.from("net_worth_snapshots").select("snapshot_date").eq("user_id", user.id),
        supabase.from("investments").select("current_price").eq("user_id", user.id),
        supabase
          .from("connectivity_incidents")
          .select("incident_key, title, details, status, first_detected_at, last_detected_at, resolved_at")
          .eq("user_id", user.id)
          .order("last_detected_at", { ascending: false })
          .limit(8)
      ]);

      const now = new Date();
      const incomeRows = ((incomeResult.data as IncomeRow[] | null) ?? []);
      const savingsRows = ((savingsResult.data as SavingsTargetRow[] | null) ?? []);
      const snapshotRows = ((snapshotsResult.data as SnapshotRow[] | null) ?? []);
      const investmentRows = ((investmentsResult.data as InvestmentStatusRow[] | null) ?? []);
      const assetsWithoutCurrentPrice = investmentRows.filter((row) => row.current_price === null);
      const hasSnapshotToday = snapshotRows.some((row) => row.snapshot_date === new Date().toISOString().slice(0, 10));
      const hasCurrentMonthIncome = incomeRows.some((row) => isSameMonth(row.income_date, now));
      const hasCurrentMonthSavingsTarget = savingsRows.some((row) => isSameMonth(row.month, now));

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

      if (!incidentsResult.error && incidentsResult.data) {
        setConnectivityHistory((incidentsResult.data as ConnectivityIncidentRow[]) ?? []);
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
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${item.status === "open" ? "border border-amber-400/20 bg-amber-500/14 text-amber-200" : "border border-emerald-400/20 bg-emerald-500/14 text-emerald-200"}`}>
                          {item.status === "open" ? "Abierta" : "Resuelta"}
                        </span>
                      </div>
                      <p className="mt-3 text-[11px] text-white/46">
                        Detectada: {new Date(item.first_detected_at).toLocaleDateString(dateFormat === "us" ? "en-US" : "es-ES")} · Ultimo cambio: {new Date(item.last_detected_at).toLocaleDateString(dateFormat === "us" ? "en-US" : "es-ES")}
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
