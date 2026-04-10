export type GuidanceCategory = "debt" | "savings" | "impulse" | "investments" | "fire";

export type GuidancePreferenceMap = Record<GuidanceCategory, boolean>;

export type FinancialGuidanceItem = {
  id: string;
  category: GuidanceCategory;
  tone: "warning" | "info" | "success";
  title: string;
  body: string;
  href: string;
  cta: string;
};

export type FinancialGuidanceInput = {
  savingsRate: number | null;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySavingsTarget: number;
  debtTotal: number;
  monthlyDebtPayment: number;
  debtPaymentRatio: number | null;
  netWorth: number;
  investmentsValue: number;
  priceCoveragePct: number;
  topInvestmentName: string | null;
  topInvestmentWeight: number;
  nonEurExposurePct: number;
  fireTarget: number;
  fireProgress: number;
  yearsToFire?: number | null;
  recentAverageMonthlySavings?: number | null;
  savingsMomentumPct?: number | null;
  fireDelayYears?: number | null;
  hasEmergencyBuffer?: boolean;
};

export const DEFAULT_GUIDANCE_PREFERENCES: GuidancePreferenceMap = {
  debt: true,
  savings: true,
  impulse: true,
  investments: true,
  fire: true
};

type ScoredGuidanceItem = FinancialGuidanceItem & {
  score: number;
};

function roundCoachYears(years: number) {
  if (!Number.isFinite(years) || years <= 0) return 0;
  return Math.max(1, Math.round(years));
}

function formatPct(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "0";
  }

  return value.toFixed(digits);
}

export function generateFinancialGuidance(
  input: FinancialGuidanceInput,
  preferences: GuidancePreferenceMap = DEFAULT_GUIDANCE_PREFERENCES
): FinancialGuidanceItem[] {
  const items: ScoredGuidanceItem[] = [];

  if (preferences.fire && input.fireTarget > 0 && (input.fireDelayYears ?? 0) >= 1) {
    const delayedYears = roundCoachYears(input.fireDelayYears ?? 0);
    items.push({
      id: "fire-delay-current-pace",
      category: "fire",
      tone: "warning",
      title: `A este ritmo, retrasas tu libertad financiera ${delayedYears} ano${delayedYears === 1 ? "" : "s"}`,
      body: input.recentAverageMonthlySavings && input.recentAverageMonthlySavings > 0
        ? `Tu ahorro objetivo del mes se ha quedado por debajo de tu ritmo reciente. Si sostuvieras tu media anterior, el horizonte FIRE mejoraria de forma visible.`
        : `Tu ritmo actual de aportacion no acompana del todo a tu plan FIRE. El retraso no viene de la cartera: viene de lo que consigues aportar con constancia.`,
      href: "/fire",
      cta: "Revisar plan FIRE",
      score: 100
    });
  }

  if (
    preferences.savings &&
    input.savingsMomentumPct !== null &&
    input.savingsMomentumPct !== undefined &&
    input.savingsMomentumPct >= 12
  ) {
    items.push({
      id: "savings-momentum-up",
      category: "savings",
      tone: "success",
      title: "Este mes mejoras claramente frente a tu ritmo reciente",
      body: `Tu ahorro objetivo actual va ${formatPct(input.savingsMomentumPct, 0)}% por encima de tu media reciente. Si lo mantienes varios meses, el progreso FIRE gana mucha mas traccion que intentando afinar la cartera.`,
      href: "/budgets",
      cta: "Consolidar ritmo",
      score: 88
    });
  }

  if (
    preferences.savings &&
    preferences.investments &&
    input.investmentsValue > 0 &&
    input.priceCoveragePct >= 80 &&
    input.savingsRate !== null &&
    input.savingsRate < 20
  ) {
    items.push({
      id: "bottleneck-is-savings",
      category: "savings",
      tone: "info",
      title: "Tu punto debil ahora mismo es el ahorro, no la inversion",
      body: `La cartera ya tiene una base suficientemente visible para leerla, pero tu tasa de ahorro sigue en ${formatPct(input.savingsRate, 1)}%. La mejora mas rentable ahora no es mover activos: es liberar mas capacidad de aportacion.`,
      href: "/budgets",
      cta: "Ajustar ahorro",
      score: 96
    });
  }

  if (preferences.debt && input.debtTotal > 0 && (input.debtPaymentRatio ?? 0) >= 20) {
    items.push({
      id: "debt-pressure",
      category: "debt",
      tone: "warning",
      title: "La deuda esta frenando mas tu avance que la rentabilidad",
      body: `La cuota mensual ya consume ${formatPct(input.debtPaymentRatio, 1)}% de tus ingresos. Antes de pedir mas a la cartera, compensa recuperar margen mensual.`,
      href: "/debts",
      cta: "Revisar deuda",
      score: 94
    });
  } else if (preferences.debt && input.debtTotal > 0) {
    items.push({
      id: "debt-plan",
      category: "debt",
      tone: "info",
      title: "Tu deuda esta controlada, pero conviene no perder el ritmo",
      body: `La carga mensual no parece desbordada, pero sigues teniendo ${input.debtTotal.toFixed(2)} EUR pendientes. Mantener amortizacion constante sigue siendo una palanca clara para tu patrimonio.`,
      href: "/debts",
      cta: "Seguir plan de deuda",
      score: 62
    });
  }

  if (preferences.savings && input.savingsRate === null) {
    items.push({
      id: "missing-income-context",
      category: "savings",
      tone: "info",
      title: "Sin ingresos del mes, el coach pierde precision",
      body: "Ahora mismo no puedo distinguir bien si el problema es gasto, ahorro o deuda. Registrar ingresos del mes hara que los insights sean mucho mas utiles.",
      href: "/budgets",
      cta: "Completar ingresos",
      score: 75
    });
  } else if (preferences.savings && input.savingsRate !== null && input.savingsRate < 15) {
    items.push({
      id: "low-savings-discipline",
      category: "savings",
      tone: "warning",
      title: "Tu margen de ahorro sigue demasiado justo",
      body: `Con una tasa del ${formatPct(input.savingsRate, 1)}%, cualquier desviacion pequena te complica mucho el mes. El siguiente salto no pasa por invertir mejor, sino por proteger margen.`,
      href: "/budgets",
      cta: "Revisar presupuesto",
      score: 90
    });
  }

  if (preferences.impulse && input.monthlyIncome > 0) {
    const expenseRatio = (input.monthlyExpenses / input.monthlyIncome) * 100;
    if (expenseRatio >= 85 && input.monthlySavingsTarget > 0) {
      items.push({
        id: "impulse-spending-risk",
        category: "impulse",
        tone: "warning",
        title: "Este mes vas con poco margen para compras impulsivas",
        body: "El gasto del mes se esta acercando demasiado a tus ingresos. Frenar unos dias el gasto variable puede proteger el ahorro mucho mas de lo que parece.",
        href: "/expenses",
        cta: "Revisar gastos",
        score: 84
      });
    }
  }

  if (preferences.investments && input.investmentsValue > 0) {
    if (input.priceCoveragePct < 80) {
      items.push({
        id: "price-coverage",
        category: "investments",
        tone: "info",
        title: "La cartera aun no esta lista para sacar conclusiones fuertes",
        body: `Solo el ${formatPct(input.priceCoveragePct, 1)}% de la cartera tiene precio actualizado. Antes de leer bien la evolucion, conviene cerrar esa base.`,
        href: "/investments",
        cta: "Actualizar precios",
        score: 70
      });
    } else if (input.topInvestmentName && input.topInvestmentWeight >= 25) {
      items.push({
        id: "portfolio-concentration",
        category: "investments",
        tone: "warning",
        title: "Ahora mismo una sola posicion manda demasiado en la cartera",
        body: `${input.topInvestmentName} ya pesa ${formatPct(input.topInvestmentWeight, 1)}% del total. Eso hace que una sola decision explique demasiado tu resultado.`,
        href: "/investments",
        cta: "Revisar concentracion",
        score: 82
      });
    } else if (input.nonEurExposurePct >= 35) {
      items.push({
        id: "fx-exposure",
        category: "investments",
        tone: "info",
        title: "Parte de tu resultado la esta moviendo la divisa",
        body: `El ${formatPct(input.nonEurExposurePct, 1)}% de la cartera esta fuera de EUR. Si notas bandazos, parte de la explicacion puede estar ahi y no en el activo.`,
        href: "/investments",
        cta: "Revisar divisa",
        score: 58
      });
    }
  }

  if (preferences.fire && input.fireTarget > 0 && (input.yearsToFire ?? null) !== null) {
    if ((input.fireProgress ?? 0) < 20 && (input.savingsRate ?? 0) >= 20) {
      items.push({
        id: "fire-early-stage",
        category: "fire",
        tone: "info",
        title: "Tu plan FIRE aun esta en fase de construccion",
        body: `Vas por el ${formatPct(input.fireProgress, 1)}% del objetivo. En esta fase, la constancia mensual importa mas que encontrar una gran jugada de inversion.`,
        href: "/fire",
        cta: "Revisar FIRE",
        score: 52
      });
    } else if ((input.fireProgress ?? 0) >= 50) {
      items.push({
        id: "fire-momentum",
        category: "fire",
        tone: "success",
        title: "Tu plan FIRE ya tiene inercia real",
        body: `Con un progreso del ${formatPct(input.fireProgress, 1)}%, ahora el trabajo fino esta en sostener ritmo y evitar decisiones que rompan la consistencia.`,
        href: "/fire",
        cta: "Mantener plan FIRE",
        score: 55
      });
    }
  }

  return items
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ score, ...item }) => item);
}
