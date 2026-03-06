export type FinancialSnapshot = {
  monthlyIncome: number;
  monthlyExpenses: number;
  annualIncome: number;
  annualExpenses: number;
  annualSavings: number;
  savingsRate: number | null;
  netWorth: number;
  fireTarget: number;
  fireProgress: number;
  topExpenseCategories: Array<{ category: string; amount: number }>;
};

export function generateRuleBasedInsights(snapshot: FinancialSnapshot): string[] {
  const insights: string[] = [];

  if (snapshot.savingsRate === null) {
    insights.push("Registra al menos una fuente de ingresos para calcular la tasa de ahorro de forma fiable.");
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

  if (snapshot.annualSavings <= 0) {
    insights.push("Tu ahorro anual es nulo o negativo. Ajusta presupuesto y aporta primero a un fondo de emergencia.");
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
