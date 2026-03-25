export type FinancialSnapshot = {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySavingsTarget: number;
  annualIncome: number;
  annualExpenses: number;
  annualSavings: number;
  savingsRate: number | null;
  hasAnyIncome: boolean;
  hasCurrentMonthIncome: boolean;
  debtTotal: number;
  monthlyDebtPayment: number;
  debtToIncomeRatio: number | null;
  netWorth: number;
  investmentsValue: number;
  investmentCount: number;
  pricedInvestmentCount: number;
  priceCoveragePct: number;
  topInvestmentName: string | null;
  topInvestmentWeight: number;
  nonEurExposurePct: number;
  fireTarget: number;
  fireProgress: number;
  topExpenseCategories: Array<{ category: string; amount: number }>;
};

export function generateRuleBasedInsights(snapshot: FinancialSnapshot): string[] {
  const insights: string[] = [];

  if (snapshot.savingsRate === null) {
    insights.push(
      snapshot.hasAnyIncome
        ? "Ya tienes ingresos registrados, pero no hay ingresos en el mes actual para calcular la tasa de ahorro mensual con precision."
        : "Registra al menos una fuente de ingresos para calcular la tasa de ahorro de forma fiable."
    );
  } else if (snapshot.savingsRate < 20) {
    insights.push(
      `Tu tasa de ahorro es ${snapshot.savingsRate.toFixed(1)}%. Objetivo recomendado: 20%-30%. Prioriza recortar gastos variables este mes.`
    );
  } else if (snapshot.savingsRate >= 30) {
    insights.push(
      `Buena disciplina: tu tasa de ahorro es ${snapshot.savingsRate.toFixed(1)}%. Considera aumentar la inversion automatica mensual.`
    );
  }

  if (snapshot.topExpenseCategories.length > 0 && snapshot.monthlyExpenses > 0) {
    const top = snapshot.topExpenseCategories[0];
    const share = (top.amount / snapshot.monthlyExpenses) * 100;
    if (share >= 30) {
      insights.push(
        `La categoria ${top.category} concentra ${share.toFixed(0)}% del gasto mensual. Un recorte del 10% en esa categoria aceleraria tu avance FIRE.`
      );
    }
  }

  if (snapshot.annualSavings < 0) {
    insights.push("Tu ahorro anual objetivo es negativo. Revisa tu plan mensual y protege primero un fondo de emergencia.");
  } else if (snapshot.annualSavings === 0) {
    insights.push("Aun no has definido ahorro objetivo para este ano. Si fijas una cifra mensual, la IA podra darte recomendaciones mas utiles.");
  } else {
    const extraInvested = snapshot.annualSavings * 0.1;
    insights.push(
      `Si incrementas tu ahorro anual un 10% (+${extraInvested.toFixed(2)} EUR), reduciras el tiempo hacia independencia financiera.`
    );
  }

  if (snapshot.fireTarget > 0) {
    insights.push(
      `Tu progreso FIRE actual es ${snapshot.fireProgress.toFixed(1)}%. Mantener aportaciones consistentes es mas importante que intentar hacer market timing.`
    );
  }

  if (snapshot.debtTotal > 0) {
    if (snapshot.debtToIncomeRatio !== null && snapshot.debtToIncomeRatio >= 20) {
      insights.push(
        `La carga mensual de deuda absorbe ${snapshot.debtToIncomeRatio.toFixed(1)}% de tus ingresos del mes. Prioriza bajar esa presion antes de aumentar riesgo en cartera.`
      );
    } else {
      insights.push(
        `Tienes ${snapshot.debtTotal.toFixed(2)} EUR de deuda conectada al patrimonio y una cuota mensual de ${snapshot.monthlyDebtPayment.toFixed(2)} EUR. Mantenerla controlada protege tu patrimonio neto.`
      );
    }
  }

  if (snapshot.investmentsValue > 0) {
    if (snapshot.priceCoveragePct < 80) {
      insights.push(
        `Solo el ${snapshot.priceCoveragePct.toFixed(1)}% de tu cartera tiene precio actualizado. Antes de sacar conclusiones de rentabilidad, revisa los activos sin precio.`
      );
    } else if (snapshot.topInvestmentName && snapshot.topInvestmentWeight >= 25) {
      insights.push(
        `${snapshot.topInvestmentName} concentra ${snapshot.topInvestmentWeight.toFixed(1)}% de tu cartera. Vigila si esa posicion encaja con el riesgo que quieres asumir.`
      );
    } else if (snapshot.nonEurExposurePct >= 35) {
      insights.push(
        `El ${snapshot.nonEurExposurePct.toFixed(1)}% de tu cartera esta fuera de EUR. La divisa puede mover bastante tu resultado aunque el activo no cambie mucho.`
      );
    }
  }

  if (insights.length === 0) {
    insights.push("Sigue registrando movimientos para mejorar la precision de recomendaciones de ahorro e inversion.");
  }

  return insights.slice(0, 5);
}
