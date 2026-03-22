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
