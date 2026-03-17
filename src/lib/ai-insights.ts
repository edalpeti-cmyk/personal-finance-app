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
  netWorth: number;
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

  if (insights.length === 0) {
    insights.push("Sigue registrando movimientos para mejorar la precision de recomendaciones de ahorro e inversion.");
  }

  return insights.slice(0, 5);
}
