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
  hasEmergencyBuffer?: boolean;
};

export const DEFAULT_GUIDANCE_PREFERENCES: GuidancePreferenceMap = {
  debt: true,
  savings: true,
  impulse: true,
  investments: true,
  fire: true
};

export function generateFinancialGuidance(
  input: FinancialGuidanceInput,
  preferences: GuidancePreferenceMap = DEFAULT_GUIDANCE_PREFERENCES
): FinancialGuidanceItem[] {
  const items: FinancialGuidanceItem[] = [];

  if (preferences.debt && input.debtTotal > 0) {
    if ((input.debtPaymentRatio ?? 0) >= 20) {
      items.push({
        id: "debt-pressure",
        category: "debt",
        tone: "warning",
        title: "La deuda ya pesa sobre el mes",
        body: `La cuota mensual absorbe ${input.debtPaymentRatio?.toFixed(1) ?? "0"}% de tus ingresos. Bajar esa presion te dara mas margen para ahorrar e invertir mejor.`,
        href: "/debts",
        cta: "Revisar deuda"
      });
    } else {
      items.push({
        id: "debt-plan",
        category: "debt",
        tone: "info",
        title: "Conviene mantener un plan claro de amortizacion",
        body: `Tienes deuda registrada por un total de ${input.debtTotal.toFixed(2)} EUR. Si mantienes una reduccion constante, el patrimonio neto gana traccion mas rapido.`,
        href: "/debts",
        cta: "Ver plan de deuda"
      });
    }
  }

  if (preferences.savings) {
    if (input.savingsRate === null) {
      items.push({
        id: "missing-income-context",
        category: "savings",
        tone: "info",
        title: "Falta contexto para medir el ahorro",
        body: "Sin ingresos del mes actual no podemos leer bien la disciplina de ahorro. Registrar ese dato mejorara mucho los consejos.",
        href: "/budgets",
        cta: "Completar ahorro"
      });
    } else if (input.savingsRate < 20) {
      items.push({
        id: "low-savings-discipline",
        category: "savings",
        tone: "warning",
        title: "Tu ahorro del mes va justo",
        body: `La tasa de ahorro actual es ${input.savingsRate.toFixed(1)}%. Antes de aumentar objetivos, conviene asegurar un margen mas estable en gastos variables.`,
        href: "/budgets",
        cta: "Ajustar presupuesto"
      });
    } else if (input.savingsRate >= 30) {
      items.push({
        id: "strong-savings-discipline",
        category: "savings",
        tone: "success",
        title: "La disciplina de ahorro acompana bien",
        body: `Con una tasa del ${input.savingsRate.toFixed(1)}%, ya tienes base para automatizar mejor objetivos o amortizacion de deuda.`,
        href: "/goals",
        cta: "Alinear objetivos"
      });
    }
  }

  if (preferences.impulse && input.monthlyIncome > 0) {
    const variableSpendRatio = (input.monthlyExpenses / input.monthlyIncome) * 100;
    if (variableSpendRatio >= 85 && input.monthlySavingsTarget > 0) {
      items.push({
        id: "impulse-spending-risk",
        category: "impulse",
        tone: "warning",
        title: "Hay poco margen entre gasto e ingresos",
        body: "Cuando el gasto mensual se acerca demasiado a los ingresos, suele ser buena idea frenar compras pequenas no planificadas durante unos dias.",
        href: "/expenses",
        cta: "Revisar gastos"
      });
    }
  }

  if (preferences.investments && input.investmentsValue > 0) {
    if (input.priceCoveragePct < 80) {
      items.push({
        id: "price-coverage",
        category: "investments",
        tone: "info",
        title: "La cartera aun no tiene cobertura completa",
        body: `Solo el ${input.priceCoveragePct.toFixed(1)}% de la cartera tiene precio actualizado. Antes de sacar conclusiones de rentabilidad, conviene completar esa base.`,
        href: "/investments",
        cta: "Actualizar precios"
      });
    } else if (input.topInvestmentName && input.topInvestmentWeight >= 25) {
      items.push({
        id: "portfolio-concentration",
        category: "investments",
        tone: "warning",
        title: "Una posicion concentra demasiado peso",
        body: `${input.topInvestmentName} ya representa ${input.topInvestmentWeight.toFixed(1)}% de la cartera. Revisa si ese nivel de concentracion encaja con tu riesgo.`,
        href: "/investments",
        cta: "Ver cartera"
      });
    } else if (input.nonEurExposurePct >= 35) {
      items.push({
        id: "fx-exposure",
        category: "investments",
        tone: "info",
        title: "La divisa puede mover parte del resultado",
        body: `El ${input.nonEurExposurePct.toFixed(1)}% de la cartera esta fuera de EUR. La moneda puede explicar parte de la volatilidad aunque el activo cambie poco.`,
        href: "/investments",
        cta: "Revisar divisa"
      });
    }
  }

  if (preferences.fire && input.fireTarget > 0) {
    if (input.fireProgress < 20 && (input.savingsRate ?? 0) >= 20) {
      items.push({
        id: "fire-early-stage",
        category: "fire",
        tone: "info",
        title: "El progreso FIRE aun esta en fase inicial",
        body: `Vas por el ${input.fireProgress.toFixed(1)}% del objetivo FIRE. La palanca principal sigue siendo constancia en ahorro y aportaciones, no movimientos bruscos.`,
        href: "/fire",
        cta: "Revisar FIRE"
      });
    } else if (input.fireProgress >= 50) {
      items.push({
        id: "fire-momentum",
        category: "fire",
        tone: "success",
        title: "Tu plan FIRE ya tiene traccion visible",
        body: `Con un progreso del ${input.fireProgress.toFixed(1)}%, ahora compensa mantener ritmo y evitar decisiones impulsivas que rompan el plan.`,
        href: "/fire",
        cta: "Seguir plan FIRE"
      });
    }
  }

  return items.slice(0, 3);
}
