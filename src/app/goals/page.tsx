"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/supabase/use-auth-guard";
import AuthLoadingState from "@/components/auth-loading-state";
import EmptyStateCard from "@/components/empty-state-card";
import SectionHeader from "@/components/section-header";
import SideNav from "@/components/side-nav";
import { useTheme } from "@/components/theme-provider";
import { formatCurrencyByPreference, formatDateByPreference } from "@/lib/preferences-format";

type GoalType = "emergency_fund" | "retirement" | "house" | "car" | "travel" | "debt_payoff" | "other";
type GoalStatus = "active" | "paused" | "completed" | "cancelled";

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
  const [editingId, setEditingId] = useState<string | null>(null);

  const [goalName, setGoalName] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("emergency_fund");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("");
  const [monthlyContribution, setMonthlyContribution] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [priority, setPriority] = useState("2");
  const [status, setStatus] = useState<GoalStatus>("active");

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
  }, []);

  const loadGoals = useCallback(async (uid: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("financial_goals")
      .select("id, goal_name, goal_type, target_amount, current_amount, monthly_contribution, target_date, priority, status")
      .eq("user_id", uid)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setGoals((data as GoalRow[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (authLoading || !userId) return;
    void loadGoals(userId);
  }, [authLoading, loadGoals, userId]);

  const activeGoals = useMemo(() => goals.filter((goal) => goal.status === "active"), [goals]);
  const completedGoals = useMemo(() => goals.filter((goal) => goal.status === "completed"), [goals]);
  const totalTarget = useMemo(() => activeGoals.reduce((sum, goal) => sum + Number(goal.target_amount || 0), 0), [activeGoals]);
  const totalCurrent = useMemo(() => activeGoals.reduce((sum, goal) => sum + Number(goal.current_amount || 0), 0), [activeGoals]);
  const totalMonthlyContribution = useMemo(() => activeGoals.reduce((sum, goal) => sum + Number(goal.monthly_contribution || 0), 0), [activeGoals]);

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
      status
    };

    const query = editingId
      ? supabase.from("financial_goals").update(payload).eq("id", editingId).eq("user_id", userId)
      : supabase.from("financial_goals").insert(payload);

    const { error } = await query;
    if (error) {
      setMessage(error.message);
      showToast({ type: "error", text: "No se pudo guardar el objetivo." });
      setSaving(false);
      return;
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
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-200"><span>Objetivo total</span><input className={inputClass()} type="number" min="0" step="0.01" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} /></label>
              <label className="grid gap-2 text-sm text-slate-200"><span>Importe actual</span><input className={inputClass()} type="number" min="0" step="0.01" value={currentAmount} onChange={(event) => setCurrentAmount(event.target.value)} /></label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-200"><span>Aportacion mensual</span><input className={inputClass()} type="number" min="0" step="0.01" value={monthlyContribution} onChange={(event) => setMonthlyContribution(event.target.value)} /></label>
              <label className="grid gap-2 text-sm text-slate-200"><span>Fecha objetivo</span><input className={inputClass()} type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-200"><span>Prioridad</span><select className={inputClass()} value={priority} onChange={(event) => setPriority(event.target.value)}>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="grid gap-2 text-sm text-slate-200"><span>Estado</span><select className={inputClass()} value={status} onChange={(event) => setStatus(event.target.value as GoalStatus)}>{GOAL_STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            </div>
            <button className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50" disabled={saving} type="submit">{saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear objetivo"}</button>
          </form>
        </section>

        <section className="grid gap-3 xl:col-span-7 md:grid-cols-2">
          <article className="kpi-card rounded-[24px] p-4"><p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Capital objetivo</p><p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(totalTarget, currency)}</p><p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Suma de objetivos activos.</p></article>
          <article className="kpi-card rounded-[24px] p-4"><p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Capital ya asignado</p><p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(totalCurrent, currency)}</p><p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Importe actual acumulado de metas activas.</p></article>
          <article className="kpi-card rounded-[24px] p-4"><p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Aporte mensual</p><p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(totalMonthlyContribution, currency)}</p><p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Contribucion mensual comprometida.</p></article>
          <article className="kpi-card rounded-[24px] p-4"><p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Completados</p><p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{completedGoals.length}</p><p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Objetivos ya cerrados.</p></article>
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
              {goals.map((goal) => {
                const progressPct = goal.target_amount > 0 ? Math.min((Number(goal.current_amount || 0) / Number(goal.target_amount)) * 100, 100) : 0;
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
                      <p>Actual: <span className="font-medium text-white">{formatCurrencyByPreference(goal.current_amount, currency)}</span></p>
                      <p>Objetivo: <span className="font-medium text-white">{formatCurrencyByPreference(goal.target_amount, currency)}</span></p>
                      <p>Progreso: <span className="font-medium text-white">{progressPct.toFixed(1)}%</span></p>
                      <p>Prioridad: <span className="font-medium text-white">{goal.priority}</span></p>
                      <p>Aporte mensual: <span className="font-medium text-white">{formatCurrencyByPreference(goal.monthly_contribution ?? 0, currency)}</span></p>
                      <p>Fecha objetivo: <span className="font-medium text-white">{goal.target_date ? formatDateByPreference(goal.target_date, dateFormat) : "Sin fecha"}</span></p>
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
