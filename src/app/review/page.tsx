"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/supabase/use-auth-guard";
import AuthLoadingState from "@/components/auth-loading-state";
import EmptyStateCard from "@/components/empty-state-card";
import SectionHeader from "@/components/section-header";
import SideNav from "@/components/side-nav";
import { useTheme } from "@/components/theme-provider";
import { AssetCurrency, convertToEur, FALLBACK_RATES_TO_EUR } from "@/lib/currency-rates";
import { formatCurrencyByPreference, formatMonthByPreference } from "@/lib/preferences-format";

type IncomeRow = { amount: number; income_date: string };
type ExpenseRow = { amount: number; category: string; expense_date: string };
type BudgetRow = { category: string; budget_amount: number; month: string };
type SavingsTargetRow = { month: string; savings_target: number };
type InvestmentRow = {
  asset_name: string;
  current_price: number | null;
  average_buy_price: number;
  quantity: number;
  asset_currency: AssetCurrency | null;
};
type FireSettingsRow = {
  annual_expenses: number;
  annual_contribution: number;
};
type GoalRow = {
  id: string;
  goal_name: string;
  goal_type: string;
  target_amount: number;
  current_amount: number;
  monthly_contribution: number | null;
  status: string;
  priority: number;
  linked_category: string | null;
  linked_account: string | null;
};

type ReviewAction = {
  id: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  tone: "warning" | "info" | "success";
};

type ReviewTaskRow = {
  task_key: string;
  completed: boolean;
};

type ReviewStep = {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  detail: string;
  status: "ready" | "attention";
  href: string;
  cta: string;
};

type ReviewConclusion = {
  tone: "positive" | "warning" | "attention";
  title: string;
  summary: string;
  decision: string;
  href: string;
  cta: string;
};

type ReviewClosureRow = {
  review_month: string;
  status: "open" | "closed";
  conclusion_title: string | null;
  conclusion_summary: string | null;
  manual_note: string | null;
  closed_at: string | null;
};
type GoalProgressHistoryRow = {
  goal_id: string;
  snapshot_month: string;
  current_amount: number;
  target_amount: number;
  progress_pct: number;
};

function isSameMonth(dateString: string, month: string) {
  return dateString.slice(0, 7) === month;
}

function previousMonth(month: string) {
  const [year, rawMonth] = month.split("-").map(Number);
  const date = new Date(year, rawMonth - 1, 1);
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthToDate(month: string) {
  return `${month}-01`;
}

export default function ReviewPage() {
  const supabase = useMemo(() => createClient(), []);
  const { userId, authLoading } = useAuthGuard();
  const { currency, dateFormat } = useTheme();

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>([]);
  const [savingsTargets, setSavingsTargets] = useState<SavingsTargetRow[]>([]);
  const [investmentRows, setInvestmentRows] = useState<InvestmentRow[]>([]);
  const [fireSettings, setFireSettings] = useState<FireSettingsRow | null>(null);
  const [goalRows, setGoalRows] = useState<GoalRow[]>([]);
  const [completedTaskKeys, setCompletedTaskKeys] = useState<string[]>([]);
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState("income");
  const [reviewClosures, setReviewClosures] = useState<ReviewClosureRow[]>([]);
  const [closingMonth, setClosingMonth] = useState(false);
  const [goalProgressHistory, setGoalProgressHistory] = useState<GoalProgressHistoryRow[]>([]);
  const [monthlyNote, setMonthlyNote] = useState("");
  const [savingMonthlyNote, setSavingMonthlyNote] = useState(false);

  const loadReviewData = useCallback(async (uid: string) => {
    setLoading(true);
    setMessage(null);

    const [incomeResult, expenseResult, budgetResult, savingsResult, investmentsResult, fireResult, goalsResult, tasksResult, closuresResult, goalHistoryResult] = await Promise.all([
      supabase.from("income").select("amount, income_date").eq("user_id", uid).order("income_date", { ascending: false }),
      supabase.from("expenses").select("amount, category, expense_date").eq("user_id", uid).order("expense_date", { ascending: false }),
      supabase.from("monthly_budgets").select("category, budget_amount, month").eq("user_id", uid),
      supabase.from("monthly_savings_targets").select("month, savings_target").eq("user_id", uid),
      supabase.from("investments").select("asset_name, current_price, average_buy_price, quantity, asset_currency").eq("user_id", uid),
      supabase.from("fire_settings").select("annual_expenses, annual_contribution").eq("user_id", uid).maybeSingle(),
      supabase.from("financial_goals").select("id, goal_name, goal_type, target_amount, current_amount, monthly_contribution, status, priority, linked_category, linked_account").eq("user_id", uid).in("status", ["active", "paused"]).order("priority", { ascending: true }),
      supabase.from("monthly_review_tasks").select("task_key, completed").eq("user_id", uid).eq("review_month", monthToDate(selectedMonth)),
      supabase.from("monthly_review_closures").select("review_month, status, conclusion_title, conclusion_summary, manual_note, closed_at").eq("user_id", uid).order("review_month", { ascending: false }).limit(6),
      supabase.from("goal_progress_history").select("goal_id, snapshot_month, current_amount, target_amount, progress_pct").eq("user_id", uid).order("snapshot_month", { ascending: false })
    ]);

    const firstError = [incomeResult.error, expenseResult.error, budgetResult.error, savingsResult.error, investmentsResult.error, fireResult.error, goalsResult.error, tasksResult.error, closuresResult.error, goalHistoryResult.error].find(Boolean);
    if (firstError) {
      setMessage(firstError.message);
      setLoading(false);
      return;
    }

    setIncomeRows((incomeResult.data as IncomeRow[]) ?? []);
    setExpenseRows((expenseResult.data as ExpenseRow[]) ?? []);
    setBudgetRows((budgetResult.data as BudgetRow[]) ?? []);
    setSavingsTargets((savingsResult.data as SavingsTargetRow[]) ?? []);
    setInvestmentRows((investmentsResult.data as InvestmentRow[]) ?? []);
    setFireSettings((fireResult.data as FireSettingsRow | null) ?? null);
    setGoalRows((goalsResult.data as GoalRow[]) ?? []);
    setCompletedTaskKeys(
      (((tasksResult.data as ReviewTaskRow[] | null) ?? []).filter((row) => row.completed).map((row) => row.task_key))
    );
    setReviewClosures((closuresResult.data as ReviewClosureRow[]) ?? []);
    const matchingClosure = ((closuresResult.data as ReviewClosureRow[] | null) ?? []).find((row) => row.review_month.slice(0, 7) === selectedMonth);
    setMonthlyNote(matchingClosure?.manual_note ?? "");
    setGoalProgressHistory((goalHistoryResult.data as GoalProgressHistoryRow[]) ?? []);
    setLoading(false);
  }, [selectedMonth, supabase]);

  useEffect(() => {
    if (authLoading || !userId) return;
    void loadReviewData(userId);
  }, [authLoading, loadReviewData, userId]);

  const previousSelectedMonth = useMemo(() => previousMonth(selectedMonth), [selectedMonth]);

  const reviewMetrics = useMemo(() => {
    const currentIncome = incomeRows.filter((row) => isSameMonth(row.income_date, selectedMonth)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const previousIncome = incomeRows.filter((row) => isSameMonth(row.income_date, previousSelectedMonth)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const currentExpenses = expenseRows.filter((row) => isSameMonth(row.expense_date, selectedMonth)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const previousExpenses = expenseRows.filter((row) => isSameMonth(row.expense_date, previousSelectedMonth)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const currentSavingsTarget = savingsTargets.filter((row) => isSameMonth(row.month, selectedMonth)).reduce((sum, row) => sum + Number(row.savings_target || 0), 0);
    const previousSavingsTarget = savingsTargets.filter((row) => isSameMonth(row.month, previousSelectedMonth)).reduce((sum, row) => sum + Number(row.savings_target || 0), 0);
    const actualSavings = currentIncome - currentExpenses;
    const previousActualSavings = previousIncome - previousExpenses;
    const savingsDeltaVsTarget = actualSavings - currentSavingsTarget;

    const currentBudgets = budgetRows.filter((row) => isSameMonth(row.month, selectedMonth));
    const currentExpenseByCategory = new Map<string, number>();
    for (const expense of expenseRows.filter((row) => isSameMonth(row.expense_date, selectedMonth))) {
      currentExpenseByCategory.set(expense.category, (currentExpenseByCategory.get(expense.category) ?? 0) + Number(expense.amount || 0));
    }

    const overspent = currentBudgets
      .map((row) => {
        const actual = currentExpenseByCategory.get(row.category) ?? 0;
        return { category: row.category, budget: Number(row.budget_amount), actual, delta: actual - Number(row.budget_amount) };
      })
      .filter((row) => row.delta > 0)
      .sort((a, b) => b.delta - a.delta);

    const investmentValue = investmentRows.reduce((sum, row) => {
      const unit = Number(row.current_price ?? row.average_buy_price ?? 0);
      return sum + convertToEur(unit * Number(row.quantity || 0), row.asset_currency, FALLBACK_RATES_TO_EUR);
    }, 0);
    const pricesConnected = investmentRows.filter((row) => row.current_price !== null).length;
    const cashPosition = incomeRows.reduce((sum, row) => sum + Number(row.amount || 0), 0) - expenseRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const totalNetWorth = cashPosition + investmentValue;
    const fireTarget = fireSettings ? Number(fireSettings.annual_expenses || 0) / 0.04 : 0;
    const fireProgress = fireTarget > 0 ? (totalNetWorth / fireTarget) * 100 : 0;

    const activeGoals = goalRows.filter((row) => row.status === "active");
    const topGoals = [...activeGoals]
      .map((goal) => ({
        ...goal,
        progressPct: goal.target_amount > 0 ? Math.min((Number(goal.current_amount || 0) / Number(goal.target_amount)) * 100, 100) : 0
      }))
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 3);

    return {
      currentIncome,
      previousIncome,
      currentExpenses,
      previousExpenses,
      currentSavingsTarget,
      previousSavingsTarget,
      actualSavings,
      previousActualSavings,
      savingsDeltaVsTarget,
      overspent,
      pricesConnected,
      investmentCount: investmentRows.length,
      totalNetWorth,
      fireTarget,
      fireProgress,
      topGoals,
      activeGoalsCount: activeGoals.length
    };
  }, [budgetRows, expenseRows, fireSettings, goalRows, incomeRows, investmentRows, previousSelectedMonth, savingsTargets, selectedMonth]);

  const reviewActions = useMemo<Array<ReviewAction & { completed: boolean }>>(() => {
    const actions: ReviewAction[] = [];

    if (reviewMetrics.currentIncome <= 0) {
      actions.push({ id: "missing-income", title: "Faltan ingresos del mes", body: "Sin ingresos registrados la revision del mes pierde contexto y la tasa de ahorro no es fiable.", href: "/budgets", cta: "Registrar ingresos", tone: "warning" });
    }
    if (reviewMetrics.currentSavingsTarget <= 0) {
      actions.push({ id: "missing-savings-target", title: "Ahorro objetivo pendiente", body: "Define una cifra objetivo para comparar el plan con el ahorro real del mes.", href: "/budgets", cta: "Definir ahorro objetivo", tone: "warning" });
    }
    if (reviewMetrics.investmentCount > reviewMetrics.pricesConnected) {
      actions.push({ id: "prices-pending", title: "Precios de cartera pendientes", body: `${reviewMetrics.investmentCount - reviewMetrics.pricesConnected} posiciones siguen sin precio actual.`, href: "/investments", cta: "Actualizar cartera", tone: "info" });
    }
    if (reviewMetrics.activeGoalsCount === 0) {
      actions.push({ id: "goals-empty", title: "Todavia no hay objetivos activos", body: "Añadir metas te ayuda a convertir la revision mensual en decisiones de ahorro reales.", href: "/goals", cta: "Crear objetivo", tone: "info" });
    }
    if (reviewMetrics.fireTarget <= 0) {
      actions.push({ id: "fire-missing", title: "Configuracion FIRE incompleta", body: "Si guardas tu plan FIRE, la revision mensual gana contexto de largo plazo.", href: "/fire", cta: "Completar FIRE", tone: "info" });
    }
    if (actions.length === 0) {
      actions.push({ id: "stable-month", title: "Revision bien encaminada", body: "Este mes ya tiene ingresos, ahorro objetivo, cartera actualizada y objetivos activos.", href: "/dashboard", cta: "Volver al dashboard", tone: "success" });
    }

    return actions.slice(0, 4).map((action) => ({
      ...action,
      completed: completedTaskKeys.includes(action.id)
    }));
  }, [completedTaskKeys, reviewMetrics]);

  const toggleReviewTask = useCallback(async (taskId: string, completed: boolean) => {
    if (!userId) return;

    setTogglingTaskId(taskId);
    const payload = {
      user_id: userId,
      review_month: monthToDate(selectedMonth),
      task_key: taskId,
      completed,
      completed_at: completed ? new Date().toISOString() : null
    };

    const { error } = await supabase
      .from("monthly_review_tasks")
      .upsert(payload, { onConflict: "user_id,review_month,task_key" });

    if (error) {
      setMessage(error.message);
      setTogglingTaskId(null);
      return;
    }

    setCompletedTaskKeys((current) =>
      completed ? Array.from(new Set([...current, taskId])) : current.filter((item) => item !== taskId)
    );
    setTogglingTaskId(null);
  }, [selectedMonth, supabase, userId]);

  const reviewSteps = useMemo<ReviewStep[]>(() => {
    const budgetStatus: ReviewStep["status"] =
      reviewMetrics.currentIncome > 0 && reviewMetrics.currentSavingsTarget > 0 ? "ready" : "attention";
    const portfolioStatus: ReviewStep["status"] =
      reviewMetrics.investmentCount === 0 || reviewMetrics.pricesConnected === reviewMetrics.investmentCount ? "ready" : "attention";
    const goalsStatus: ReviewStep["status"] = reviewMetrics.activeGoalsCount > 0 ? "ready" : "attention";
    const fireStatus: ReviewStep["status"] = reviewMetrics.fireTarget > 0 ? "ready" : "attention";

    return [
      {
        id: "income",
        eyebrow: "Paso 1",
        title: "Confirma el marco del mes",
        summary: reviewMetrics.currentIncome > 0
          ? `Ingresos registrados: ${formatCurrencyByPreference(reviewMetrics.currentIncome, currency)}`
          : "Aun faltan ingresos registrados en el mes seleccionado.",
        detail: "Sin ingresos y ahorro objetivo, el resto de la revision pierde contexto. Empieza por dejar bien cerrada esta base.",
        status: budgetStatus,
        href: "/budgets",
        cta: reviewMetrics.currentIncome > 0 ? "Revisar ingresos y ahorro" : "Registrar ingresos"
      },
      {
        id: "budget",
        eyebrow: "Paso 2",
        title: "Valida desviaciones del presupuesto",
        summary: reviewMetrics.overspent.length > 0
          ? `${reviewMetrics.overspent.length} categoria(s) ya van por encima del presupuesto.`
          : "No hay categorias excedidas en este mes.",
        detail: "Aqui decides si el mes esta bajo control o si necesitas ajustar categorias antes de cerrar la foto mensual.",
        status: reviewMetrics.overspent.length > 0 ? "attention" : "ready",
        href: "/budgets",
        cta: "Abrir presupuestos"
      },
      {
        id: "portfolio",
        eyebrow: "Paso 3",
        title: "Actualiza la cartera",
        summary: reviewMetrics.investmentCount === 0
          ? "No hay cartera registrada este mes."
          : `${reviewMetrics.pricesConnected}/${reviewMetrics.investmentCount} posiciones tienen precio actual.`,
        detail: "La revision queda mucho mas fiable si todas las posiciones tienen precio reciente y el patrimonio refleja la foto real.",
        status: portfolioStatus,
        href: "/investments",
        cta: "Abrir inversiones"
      },
      {
        id: "goals",
        eyebrow: "Paso 4",
        title: "Alinea el ahorro con tus metas",
        summary: reviewMetrics.activeGoalsCount > 0
          ? `${reviewMetrics.activeGoalsCount} objetivo(s) activos conectados al plan.`
          : "Todavia no hay metas activas vinculadas al ahorro.",
        detail: "Si el ahorro del mes no aterriza en objetivos concretos, la revision se queda en diagnostico y no en decision.",
        status: goalsStatus,
        href: "/goals",
        cta: reviewMetrics.activeGoalsCount > 0 ? "Revisar objetivos" : "Crear objetivo"
      },
      {
        id: "fire",
        eyebrow: "Paso 5",
        title: "Cierra con perspectiva FIRE",
        summary: reviewMetrics.fireTarget > 0
          ? `Progreso actual: ${reviewMetrics.fireProgress.toFixed(1)}% del objetivo FIRE.`
          : "Aun no hay una base FIRE guardada para contextualizar el mes.",
        detail: "Este ultimo paso conecta el cierre operativo del mes con tu plan de largo plazo para que el dashboard y la revision hablen el mismo idioma.",
        status: fireStatus,
        href: "/fire",
        cta: reviewMetrics.fireTarget > 0 ? "Revisar FIRE" : "Completar FIRE"
      }
    ];
  }, [currency, reviewMetrics]);

  useEffect(() => {
    if (!reviewSteps.some((step) => step.id === selectedStepId)) {
      setSelectedStepId(reviewSteps[0]?.id ?? "income");
    }
  }, [reviewSteps, selectedStepId]);

  const selectedStep = useMemo(
    () => reviewSteps.find((step) => step.id === selectedStepId) ?? reviewSteps[0] ?? null,
    [reviewSteps, selectedStepId]
  );
  const selectedStepIndex = selectedStep ? reviewSteps.findIndex((step) => step.id === selectedStep.id) : -1;
  const completedStepCount = reviewSteps.filter((step) => step.status === "ready").length;
  const reviewConclusion = useMemo<ReviewConclusion>(() => {
    if (reviewMetrics.currentIncome <= 0) {
      return {
        tone: "attention",
        title: "Mes sin base suficiente",
        summary: "Sin ingresos del mes registrados no merece la pena sacar conclusiones fuertes porque el cierre queda incompleto.",
        decision: "Primero registra ingresos y luego vuelve a revisar ahorro, presupuesto y FIRE con contexto real.",
        href: "/budgets",
        cta: "Completar ingresos"
      };
    }

    if (reviewMetrics.currentSavingsTarget <= 0) {
      return {
        tone: "attention",
        title: "Falta un objetivo de ahorro",
        summary: "Ya hay movimiento real del mes, pero sigues sin una cifra objetivo contra la que comparar el resultado.",
        decision: "Define el ahorro objetivo del mes antes de valorar si el cierre ha sido bueno o flojo.",
        href: "/budgets",
        cta: "Definir ahorro objetivo"
      };
    }

    if (reviewMetrics.overspent.length > 0) {
      return {
        tone: "warning",
        title: "Mes con desviaciones claras",
        summary: `${reviewMetrics.overspent.length} categoria(s) han superado el presupuesto y estan empujando el cierre fuera del plan.`,
        decision: "Revisa esas categorias primero y decide si corriges gasto, aumentas presupuesto o reasignas ahorro.",
        href: "/budgets",
        cta: "Corregir presupuesto"
      };
    }

    if (reviewMetrics.investmentCount > reviewMetrics.pricesConnected) {
      return {
        tone: "warning",
        title: "La foto de cartera aun no esta cerrada",
        summary: "Tu patrimonio del mes todavia puede estar infravalorado o incompleto porque faltan precios en parte de la cartera.",
        decision: "Actualiza precios antes de dar por bueno el cierre mensual y el progreso FIRE.",
        href: "/investments",
        cta: "Actualizar cartera"
      };
    }

    if (reviewMetrics.actualSavings < reviewMetrics.currentSavingsTarget) {
      return {
        tone: "warning",
        title: "Mes estable, pero por debajo del ahorro objetivo",
        summary: "No hay grandes desviaciones de presupuesto, pero el ahorro real no ha llegado a la cifra que te habias marcado.",
        decision: "Mantén el cierre, pero ajusta aportaciones, objetivos o gasto del proximo mes para recuperar tracción.",
        href: "/goals",
        cta: "Revisar metas"
      };
    }

    return {
      tone: "positive",
      title: "Mes bien cerrado",
      summary: "Ingresos, ahorro objetivo, presupuesto y cartera tienen una foto coherente para este mes.",
      decision: "Puedes dar el cierre por bueno y usarlo como base para el siguiente mes y para tu seguimiento FIRE.",
      href: "/dashboard",
      cta: "Volver al dashboard"
    };
  }, [reviewMetrics]);
  const currentMonthClosure = useMemo(
    () => reviewClosures.find((item) => item.review_month.slice(0, 7) === selectedMonth) ?? null,
    [reviewClosures, selectedMonth]
  );
  const goalProgressByGoal = useMemo(() => {
    const map = new Map<string, GoalProgressHistoryRow[]>();
    for (const row of goalProgressHistory) {
      const current = map.get(row.goal_id) ?? [];
      current.push(row);
      map.set(row.goal_id, current);
    }
    return map;
  }, [goalProgressHistory]);
  const goalMonthlyAdvance = useMemo(() => {
    return reviewMetrics.topGoals.map((goal) => {
      const history = (goalProgressByGoal.get(goal.id) ?? [])
        .slice()
        .sort((a, b) => a.snapshot_month.localeCompare(b.snapshot_month));
      const latestBeforeCurrent = [...history]
        .reverse()
        .find((item) => item.snapshot_month.slice(0, 7) < selectedMonth);
      const currentAmount = Number(goal.current_amount || 0);
      const targetAmount = Number(goal.target_amount || 0);
      const currentPct = targetAmount > 0 ? Math.min((currentAmount / targetAmount) * 100, 100) : 0;
      const deltaAmount = latestBeforeCurrent ? currentAmount - Number(latestBeforeCurrent.current_amount || 0) : null;
      const deltaPct = latestBeforeCurrent ? currentPct - Number(latestBeforeCurrent.progress_pct || 0) : null;

      return {
        ...goal,
        currentPct,
        deltaAmount,
        deltaPct,
        hasHistory: Boolean(latestBeforeCurrent),
        baselineMonth: latestBeforeCurrent?.snapshot_month ?? null
      };
    });
  }, [goalProgressByGoal, reviewMetrics.topGoals, selectedMonth]);

  const toggleMonthlyClosure = useCallback(async () => {
    if (!userId) return;

    setClosingMonth(true);
    const nextClosed = currentMonthClosure?.status !== "closed";
    const nextStatus: ReviewClosureRow["status"] = nextClosed ? "closed" : "open";
    const payload = {
      user_id: userId,
      review_month: monthToDate(selectedMonth),
      status: nextStatus,
      conclusion_title: reviewConclusion.title,
      conclusion_summary: reviewConclusion.summary,
      manual_note: monthlyNote.trim() || null,
      closed_at: nextClosed ? new Date().toISOString() : null
    };

    const { error } = await supabase
      .from("monthly_review_closures")
      .upsert(payload, { onConflict: "user_id,review_month" });

    if (error) {
      setMessage(error.message);
      setClosingMonth(false);
      return;
    }

    setReviewClosures((current) => {
      const next = current.filter((item) => item.review_month.slice(0, 7) !== selectedMonth);
      return [
        {
          review_month: monthToDate(selectedMonth),
          status: nextStatus,
          conclusion_title: reviewConclusion.title,
          conclusion_summary: reviewConclusion.summary,
          manual_note: monthlyNote.trim() || null,
          closed_at: nextClosed ? new Date().toISOString() : null
        },
        ...next
      ].sort((a, b) => b.review_month.localeCompare(a.review_month)).slice(0, 6);
    });
    setClosingMonth(false);
  }, [currentMonthClosure?.status, monthlyNote, reviewConclusion.summary, reviewConclusion.title, selectedMonth, supabase, userId]);

  const saveMonthlyNote = useCallback(async () => {
    if (!userId) return;

    setSavingMonthlyNote(true);
    const payload = {
      user_id: userId,
      review_month: monthToDate(selectedMonth),
      status: currentMonthClosure?.status ?? "open",
      conclusion_title: currentMonthClosure?.conclusion_title ?? reviewConclusion.title,
      conclusion_summary: currentMonthClosure?.conclusion_summary ?? reviewConclusion.summary,
      manual_note: monthlyNote.trim() || null,
      closed_at: currentMonthClosure?.closed_at ?? null
    };

    const { error } = await supabase
      .from("monthly_review_closures")
      .upsert(payload, { onConflict: "user_id,review_month" });

    if (error) {
      setMessage(error.message);
      setSavingMonthlyNote(false);
      return;
    }

    setReviewClosures((current) => {
      const next = current.filter((item) => item.review_month.slice(0, 7) !== selectedMonth);
      return [
        {
          review_month: monthToDate(selectedMonth),
          status: payload.status,
          conclusion_title: payload.conclusion_title,
          conclusion_summary: payload.conclusion_summary,
          manual_note: payload.manual_note,
          closed_at: payload.closed_at
        },
        ...next
      ].sort((a, b) => b.review_month.localeCompare(a.review_month)).slice(0, 6);
    });
    setSavingMonthlyNote(false);
  }, [currentMonthClosure?.closed_at, currentMonthClosure?.conclusion_summary, currentMonthClosure?.conclusion_title, currentMonthClosure?.status, monthlyNote, reviewConclusion.summary, reviewConclusion.title, selectedMonth, supabase, userId]);

  if (authLoading) {
    return (
      <>
        <SideNav />
        <main className="mx-auto max-w-6xl p-6 md:pl-72">
          <AuthLoadingState title="Preparando revision mensual" description="Estamos reuniendo tus datos para montar el cierre del mes." />
        </main>
      </>
    );
  }

  return (
    <>
      <SideNav />
      <main className="page-enter relative z-10 mx-auto grid max-w-6xl gap-5 p-5 md:pl-72 xl:grid-cols-12">
        <section className="panel rounded-[30px] p-5 text-white md:p-7 xl:col-span-8">
          <p className="text-xs uppercase tracking-[0.26em] text-emerald-300">Revision mensual</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-white">Cierra el mes con una lectura clara</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
            Reune ingresos, gasto real, ahorro objetivo, cartera, FIRE y objetivos activos en una sola vista para decidir el siguiente paso sin ir saltando de pantalla.
          </p>
        </section>

        <section className="rounded-[30px] border border-emerald-400/10 bg-[linear-gradient(180deg,rgba(7,19,35,0.98)_0%,rgba(9,29,48,0.98)_52%,rgba(10,63,70,0.92)_100%)] p-6 text-white shadow-[0_26px_60px_rgba(2,8,23,0.35)] xl:col-span-4">
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">Mes en revision</p>
          <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold text-white">{formatMonthByPreference(selectedMonth, dateFormat)}</p>
          <label className="mt-4 grid gap-2 text-sm text-slate-200">
            Cambiar mes
            <input className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-sm text-slate-100 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20" type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
          </label>
        </section>

        {message ? <section className="rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm text-red-800 xl:col-span-12">{message}</section> : null}

        {loading ? <section className="panel rounded-[28px] p-5 text-white xl:col-span-12"><p className="text-sm text-slate-300">Cargando revision del mes...</p></section> : null}

        {!loading ? (
          <>
            <section className="panel rounded-[28px] p-5 text-white xl:col-span-12">
              <SectionHeader
                eyebrow="Cierre guiado"
                title="Sigue un paso a paso para cerrar el mes"
                description="La revision ya no es solo una pantalla de lectura: ahora te guía desde la base operativa hasta la perspectiva FIRE."
                aside={<span className="ui-chip rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">{completedStepCount}/{reviewSteps.length} pasos listos</span>}
              />

              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e_0%,#14b8a6_100%)] transition-all" style={{ width: `${(completedStepCount / Math.max(reviewSteps.length, 1)) * 100}%` }} />
              </div>

              <div className="mt-5 grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="grid gap-3">
                  {reviewSteps.map((step, index) => (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setSelectedStepId(step.id)}
                      className={`rounded-[24px] border p-4 text-left transition ${
                        selectedStepId === step.id
                          ? "border-emerald-300/30 bg-emerald-400/10 shadow-[0_12px_30px_rgba(15,118,110,0.15)]"
                          : "border-white/8 bg-white/5 hover:bg-white/8"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">{step.eyebrow}</p>
                          <h3 className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-white">{step.title}</h3>
                        </div>
                        <span className={`ui-chip rounded-full border px-3 py-1.5 text-[11px] ${step.status === "ready" ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200" : "border-amber-300/20 bg-amber-400/10 text-amber-200"}`}>
                          {step.status === "ready" ? "Listo" : "Revisar"}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-300">{step.summary}</p>
                      <p className="mt-3 text-xs text-slate-500">Paso {index + 1} de {reviewSteps.length}</p>
                    </button>
                  ))}
                </div>

                {selectedStep ? (
                  <article className="rounded-[28px] border border-white/8 bg-white/5 p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">{selectedStep.eyebrow}</p>
                    <h3 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-white">{selectedStep.title}</h3>
                    <p className="mt-4 text-sm leading-7 text-slate-300">{selectedStep.detail}</p>
                    <div className="mt-5 rounded-[22px] border border-white/8 bg-slate-950/40 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Lectura rapida</p>
                      <p className="mt-2 text-lg font-medium text-white">{selectedStep.summary}</p>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <Link href={selectedStep.href} className="rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-400">
                        {selectedStep.cta}
                      </Link>
                      {selectedStepIndex > 0 ? (
                        <button type="button" onClick={() => setSelectedStepId(reviewSteps[selectedStepIndex - 1].id)} className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white transition hover:bg-white/10">
                          Paso anterior
                        </button>
                      ) : null}
                      {selectedStepIndex >= 0 && selectedStepIndex < reviewSteps.length - 1 ? (
                        <button type="button" onClick={() => setSelectedStepId(reviewSteps[selectedStepIndex + 1].id)} className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white transition hover:bg-white/10">
                          Siguiente paso
                        </button>
                      ) : null}
                    </div>
                  </article>
                ) : null}
              </div>
            </section>

            <section className="grid gap-3 xl:col-span-12 md:grid-cols-2 xl:grid-cols-4">
              <article className="kpi-card rounded-[24px] p-4"><p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Ingresos</p><p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(reviewMetrics.currentIncome, currency)}</p><p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Mes anterior: {formatCurrencyByPreference(reviewMetrics.previousIncome, currency)}</p></article>
              <article className="kpi-card rounded-[24px] p-4"><p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Gasto real</p><p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(reviewMetrics.currentExpenses, currency)}</p><p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Mes anterior: {formatCurrencyByPreference(reviewMetrics.previousExpenses, currency)}</p></article>
              <article className="kpi-card rounded-[24px] p-4"><p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Ahorro objetivo</p><p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(reviewMetrics.currentSavingsTarget, currency)}</p><p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Mes anterior: {formatCurrencyByPreference(reviewMetrics.previousSavingsTarget, currency)}</p></article>
              <article className="kpi-card rounded-[24px] p-4"><p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Ahorro real</p><p className={`mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none ${reviewMetrics.actualSavings >= 0 ? "text-emerald-300" : "text-red-300"}`}>{formatCurrencyByPreference(reviewMetrics.actualSavings, currency)}</p><p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Mes anterior: {formatCurrencyByPreference(reviewMetrics.previousActualSavings, currency)}</p></article>
            </section>

            <section className="panel rounded-[28px] p-5 text-white xl:col-span-7">
              <SectionHeader eyebrow="Lectura del mes" title="Donde merece la pena mirar primero" description="Una capa de interpretacion rapida antes de entrar en tablas y formularios." />
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <article className="rounded-[24px] border border-white/8 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-400">Desviacion frente al objetivo</p><p className={`mt-3 font-[var(--font-heading)] text-3xl font-semibold ${reviewMetrics.savingsDeltaVsTarget >= 0 ? "text-emerald-300" : "text-red-300"}`}>{formatCurrencyByPreference(reviewMetrics.savingsDeltaVsTarget, currency)}</p><p className="mt-2 text-sm leading-6 text-slate-300">Diferencia entre ahorro real del mes y ahorro objetivo marcado.</p></article>
                <article className="rounded-[24px] border border-white/8 bg-white/5 p-4"> <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Categoria con mas tension</p>{reviewMetrics.overspent[0] ? (<><p className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-white">{reviewMetrics.overspent[0].category}</p><p className="mt-2 text-sm leading-6 text-slate-300">Exceso de {formatCurrencyByPreference(reviewMetrics.overspent[0].delta, currency)} sobre presupuesto.</p></>) : (<p className="mt-3 text-sm leading-6 text-slate-300">No hay categorias por encima del presupuesto en este mes.</p>)}</article>
                <article className="rounded-[24px] border border-white/8 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-400">Cobertura de cartera</p><p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-white">{reviewMetrics.investmentCount === 0 ? "Sin cartera" : `${reviewMetrics.pricesConnected}/${reviewMetrics.investmentCount}`}</p><p className="mt-2 text-sm leading-6 text-slate-300">Posiciones con precio actual guardado frente al total de activos.</p></article>
                <article className="rounded-[24px] border border-white/8 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-400">Progreso FIRE</p><p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-white">{reviewMetrics.fireTarget > 0 ? `${reviewMetrics.fireProgress.toFixed(1)}%` : "Sin base"}</p><p className="mt-2 text-sm leading-6 text-slate-300">Patrimonio total frente al objetivo FIRE guardado.</p></article>
              </div>
            </section>

            <section className="panel rounded-[28px] p-5 text-white xl:col-span-5">
              <SectionHeader eyebrow="Checklist" title="Siguiente accion recomendada" description="Atajos rapidos para cerrar el mes sin perder tiempo." />
              <div className="mt-5 grid gap-3">
                {reviewActions.map((action) => (
                  <article key={action.id} className={`rounded-[24px] border p-4 ${action.completed ? "border-emerald-400/20 bg-emerald-500/10" : "border-white/8 bg-white/5"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className={`text-xs uppercase tracking-[0.18em] ${action.tone === "warning" ? "text-amber-300" : action.tone === "success" ? "text-emerald-300" : "text-sky-300"}`}>{action.title}</p>
                      <button
                        type="button"
                        onClick={() => void toggleReviewTask(action.id, !action.completed)}
                        disabled={togglingTaskId === action.id}
                        className={`ui-chip rounded-full border px-3 py-1.5 text-[11px] transition ${
                          action.completed
                            ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-200"
                            : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                        } disabled:opacity-60`}
                      >
                        {togglingTaskId === action.id ? "Guardando..." : action.completed ? "Hecho" : "Marcar hecha"}
                      </button>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{action.body}</p>
                    <Link href={action.href} className="ui-chip mt-4 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10">{action.cta}</Link>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel rounded-[28px] p-5 text-white xl:col-span-12">
              <SectionHeader
                eyebrow="Conclusion del mes"
                title="Diagnostico final y siguiente decision"
                description="Una lectura final para saber si el mes se puede dar por cerrado o si conviene actuar antes."
                aside={
                  <button
                    type="button"
                    onClick={() => void toggleMonthlyClosure()}
                    disabled={closingMonth}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${
                      currentMonthClosure?.status === "closed"
                        ? "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                        : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                    }`}
                  >
                    {closingMonth ? "Guardando..." : currentMonthClosure?.status === "closed" ? "Reabrir mes" : "Cerrar mes"}
                  </button>
                }
              />
              <div className="mt-5 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
                <article className={`rounded-[26px] border p-5 ${
                  reviewConclusion.tone === "positive"
                    ? "border-emerald-300/20 bg-emerald-500/10"
                    : reviewConclusion.tone === "warning"
                      ? "border-amber-300/20 bg-amber-500/10"
                      : "border-red-300/20 bg-red-500/10"
                }`}>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-200">Estado del cierre</p>
                  <h3 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-white">{reviewConclusion.title}</h3>
                  <p className="mt-4 text-sm leading-7 text-slate-200">{reviewConclusion.summary}</p>
                </article>

                <article className="rounded-[26px] border border-white/8 bg-white/5 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Decision recomendada</p>
                  <p className="mt-3 text-base leading-7 text-slate-200">{reviewConclusion.decision}</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link href={reviewConclusion.href} className="rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-400">
                      {reviewConclusion.cta}
                    </Link>
                    <button
                      type="button"
                      onClick={() => setSelectedStepId(reviewSteps.find((step) => step.status === "attention")?.id ?? reviewSteps[0]?.id ?? "income")}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white transition hover:bg-white/10"
                    >
                      Ir al paso clave
                    </button>
                  </div>
                  {currentMonthClosure?.status === "closed" ? (
                    <p className="mt-4 text-sm text-emerald-200">
                      Este mes ya esta marcado como cerrado.
                    </p>
                  ) : null}
                </article>
              </div>
              <div className="mt-4 rounded-[26px] border border-white/8 bg-white/5 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Nota manual del mes</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Guarda un comentario corto con el contexto del cierre, decisiones o aprendizajes del mes.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveMonthlyNote()}
                    disabled={savingMonthlyNote}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10 disabled:opacity-60"
                  >
                    {savingMonthlyNote ? "Guardando..." : "Guardar nota"}
                  </button>
                </div>
                <textarea
                  className="mt-4 min-h-[120px] w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
                  value={monthlyNote}
                  onChange={(event) => setMonthlyNote(event.target.value)}
                  placeholder="Ej: Este mes el mayor desvio vino de vivienda, pero el ahorro real sigue dentro de un rango razonable. El mes que viene toca revisar cartera y reforzar fondo de emergencia."
                />
              </div>
            </section>

            <section className="panel rounded-[28px] p-5 text-white xl:col-span-12">
              <SectionHeader eyebrow="Historico" title="Ultimos cierres mensuales" description="Un registro rapido para ver que meses ya has dado por cerrados y con que diagnostico." />
              {reviewClosures.length === 0 ? (
                <div className="mt-6">
                  <EmptyStateCard
                    eyebrow="Sin cierres"
                    title="Todavia no has cerrado ningun mes"
                    description="Cuando cierres un mes desde esta pantalla, aparecera aqui con su estado y resumen."
                    compact
                  />
                </div>
              ) : (
                <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {reviewClosures.map((closure) => (
                    <article key={closure.review_month} className="rounded-[24px] border border-white/8 bg-white/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">
                            {formatMonthByPreference(closure.review_month.slice(0, 7), dateFormat)}
                          </p>
                          <h3 className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-white">
                            {closure.conclusion_title ?? "Cierre mensual"}
                          </h3>
                        </div>
                        <span className={`ui-chip rounded-full border px-3 py-1.5 text-[11px] ${
                          closure.status === "closed"
                            ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
                            : "border-white/10 bg-white/5 text-slate-300"
                        }`}>
                          {closure.status === "closed" ? "Cerrado" : "Abierto"}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-300">
                        {closure.conclusion_summary ?? "Sin resumen guardado."}
                      </p>
                      {closure.manual_note ? (
                        <p className="mt-3 text-sm leading-6 text-slate-400">
                          Nota: {closure.manual_note}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="panel rounded-[28px] p-5 text-white xl:col-span-7">
              <details className="group">
                <summary className="accordion-summary cursor-pointer list-none">
                  <div className="accordion-summary-main">
                    <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Desviaciones</p>
                    <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Categorias a revisar</h2>
                  </div>
                  <div className="accordion-summary-side">
                    <span className="accordion-metric">{reviewMetrics.overspent.length} alertas</span>
                    <span className="accordion-chevron" aria-hidden="true">v</span>
                  </div>
                </summary>
              {reviewMetrics.overspent.length === 0 ? (
                <div className="mt-6">
                  <EmptyStateCard eyebrow="Mes estable" title="No hay categorias excedidas" description="De momento no hay categorias por encima del presupuesto del mes seleccionado." actionLabel="Revisar presupuestos" actionHref="/budgets" compact />
                </div>
              ) : (
                <div className="table-scroll mt-6"><table className="min-w-full border-separate border-spacing-y-2 text-sm"><thead><tr className="text-left text-slate-400"><th className="sticky-col-header px-3 py-2">Categoria</th><th className="px-3 py-2 text-right">Presupuesto</th><th className="px-3 py-2 text-right">Real</th><th className="px-3 py-2 text-right">Exceso</th></tr></thead><tbody>{reviewMetrics.overspent.map((row) => (<tr key={row.category} className="bg-white/5 shadow-sm"><td className="sticky-col rounded-l-2xl px-3 py-4 font-medium text-white">{row.category}</td><td className="px-3 py-4 text-right text-slate-300">{formatCurrencyByPreference(row.budget, currency)}</td><td className="px-3 py-4 text-right text-slate-300">{formatCurrencyByPreference(row.actual, currency)}</td><td className="rounded-r-2xl px-3 py-4 text-right font-medium text-red-300">{formatCurrencyByPreference(row.delta, currency)}</td></tr>))}</tbody></table></div>
              )}
              </details>
            </section>

            <section className="panel rounded-[28px] p-5 text-white xl:col-span-5">
              <details className="group">
                <summary className="accordion-summary cursor-pointer list-none">
                  <div className="accordion-summary-main">
                    <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Objetivos activos</p>
                    <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Metas conectadas al plan</h2>
                  </div>
                  <div className="accordion-summary-side">
                    <span className="accordion-metric">{reviewMetrics.topGoals.length} metas</span>
                    <span className="accordion-chevron" aria-hidden="true">v</span>
                  </div>
                </summary>
              {reviewMetrics.topGoals.length === 0 ? (
                <div className="mt-6">
                  <EmptyStateCard eyebrow="Sin objetivos" title="Todavia no hay metas activas" description="Crea objetivos como fondo de emergencia, viaje o vivienda para enlazar ahorro y progreso real." actionLabel="Crear objetivos" actionHref="/goals" compact />
                </div>
              ) : (
                <div className="mt-5 grid gap-3">{reviewMetrics.topGoals.map((goal) => (<article key={goal.id} className="rounded-[24px] border border-white/8 bg-white/5 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.18em] text-emerald-300">{goal.goal_type}</p><h3 className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-white">{goal.goal_name}</h3></div><p className="text-sm text-slate-300">Prioridad {goal.priority}</p></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e_0%,#14b8a6_100%)]" style={{ width: `${Math.min(goal.progressPct, 100)}%` }} /></div><div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2"><p>Actual: <span className="font-medium text-white">{formatCurrencyByPreference(goal.current_amount, currency)}</span></p><p>Objetivo: <span className="font-medium text-white">{formatCurrencyByPreference(goal.target_amount, currency)}</span></p><p>Progreso: <span className="font-medium text-white">{goal.progressPct.toFixed(1)}%</span></p><p>Aporte mensual: <span className="font-medium text-white">{formatCurrencyByPreference(goal.monthly_contribution ?? 0, currency)}</span></p><p>Categoria: <span className="font-medium text-white">{goal.linked_category?.trim() || "Sin conectar"}</span></p><p>Cuenta: <span className="font-medium text-white">{goal.linked_account?.trim() || "Sin conectar"}</span></p></div></article>))}</div>
              )}
              </details>
            </section>

            <section className="panel rounded-[28px] p-5 text-white xl:col-span-12">
              <details className="group">
                <summary className="accordion-summary cursor-pointer list-none">
                  <div className="accordion-summary-main">
                    <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Avance de metas</p>
                    <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Que ha cambiado este mes en tus objetivos</h2>
                  </div>
                  <div className="accordion-summary-side">
                    <span className="accordion-metric">{goalMonthlyAdvance.length} con avance</span>
                    <span className="accordion-chevron" aria-hidden="true">v</span>
                  </div>
                </summary>
              {goalMonthlyAdvance.length === 0 ? (
                <div className="mt-6">
                  <EmptyStateCard
                    eyebrow="Sin avance"
                    title="No hay metas con seguimiento mensual"
                    description="Guarda una foto del mes en Objetivos para empezar a medir avance real entre meses."
                    actionLabel="Abrir objetivos"
                    actionHref="/goals"
                    compact
                  />
                </div>
              ) : (
                <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {goalMonthlyAdvance.map((goal) => (
                    <article key={`advance-${goal.id}`} className="rounded-[24px] border border-white/8 bg-white/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">{goal.goal_type}</p>
                          <h3 className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-white">{goal.goal_name}</h3>
                        </div>
                        <span className="ui-chip rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-300">
                          {goal.currentPct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e_0%,#14b8a6_100%)]" style={{ width: `${Math.min(goal.currentPct, 100)}%` }} />
                      </div>
                      <div className="mt-4 grid gap-2 text-sm text-slate-300">
                        <p>Actual: <span className="font-medium text-white">{formatCurrencyByPreference(goal.current_amount, currency)}</span></p>
                        <p>Objetivo: <span className="font-medium text-white">{formatCurrencyByPreference(goal.target_amount, currency)}</span></p>
                        <p>
                          Avance mensual:{" "}
                          <span className={`font-medium ${goal.deltaAmount === null ? "text-white" : goal.deltaAmount >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                            {goal.deltaAmount === null ? "Sin base" : formatCurrencyByPreference(goal.deltaAmount, currency)}
                          </span>
                        </p>
                        <p>
                          Delta progreso:{" "}
                          <span className={`font-medium ${goal.deltaPct === null ? "text-white" : goal.deltaPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                            {goal.deltaPct === null ? "Sin base" : `${goal.deltaPct >= 0 ? "+" : ""}${goal.deltaPct.toFixed(1)}%`}
                          </span>
                        </p>
                        <p>Base comparativa: <span className="font-medium text-white">{goal.baselineMonth ? formatMonthByPreference(goal.baselineMonth.slice(0, 7), dateFormat) : "Sin snapshot previa"}</span></p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              </details>
            </section>
          </>
        ) : null}
      </main>
    </>
  );
}
