export type ExpenseAnalysisInput = {
  amount: number | string;
  category: string;
  expense_date: string;
};

export type MonthlyExpenseAnalysis = {
  currentMonthTotal: number;
  previousMonthTotal: number;
  topCategory: { name: string; total: number } | null;
  changeAmount: number;
  changePercentage: number | null;
  recommendations: string[];
};

export function analyzeMonthlyExpenses(
  expenses: ExpenseAnalysisInput[],
  referenceDate: Date = new Date()
): MonthlyExpenseAnalysis {
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth();

  const previousDate = new Date(refYear, refMonth - 1, 1);
  const previousYear = previousDate.getFullYear();
  const previousMonth = previousDate.getMonth();

  let currentMonthTotal = 0;
  let previousMonthTotal = 0;
  const categoryTotals = new Map<string, number>();

  for (const expense of expenses) {
    const amount = Number(expense.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    const date = new Date(`${expense.expense_date}T00:00:00`);
    const year = date.getFullYear();
    const month = date.getMonth();

    if (year === refYear && month === refMonth) {
      currentMonthTotal += amount;
      const key = expense.category?.trim() || "Sin categoria";
      categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + amount);
    }

    if (year === previousYear && month === previousMonth) {
      previousMonthTotal += amount;
    }
  }

  let topCategory: { name: string; total: number } | null = null;
  for (const [name, total] of categoryTotals.entries()) {
    if (!topCategory || total > topCategory.total) {
      topCategory = { name, total };
    }
  }

  const changeAmount = currentMonthTotal - previousMonthTotal;
  const changePercentage = previousMonthTotal > 0 ? (changeAmount / previousMonthTotal) * 100 : null;

  const recommendations: string[] = [];

  if (currentMonthTotal === 0) {
    recommendations.push("No hay gastos en el mes actual. Registra movimientos para obtener recomendaciones precisas.");
  }

  if (topCategory && currentMonthTotal > 0) {
    const topShare = topCategory.total / currentMonthTotal;
    if (topShare >= 0.35) {
      recommendations.push(
        `La categoria ${topCategory.name} concentra ${(topShare * 100).toFixed(0)}% del gasto. Prueba un recorte del 10% en esa categoria.`
      );
    }
  }

  if (changePercentage !== null && changePercentage > 10) {
    recommendations.push(
      `Tus gastos subieron ${changePercentage.toFixed(1)}% frente al mes anterior. Define un limite semanal para evitar desvio.`
    );
  }

  const subscriptionsTotal = categoryTotals.get("Suscripciones") ?? 0;
  if (subscriptionsTotal > 0) {
    recommendations.push("Revisa suscripciones activas y cancela las que no uses este mes.");
  }

  if (recommendations.length === 0) {
    recommendations.push("Mantienes un gasto estable. Puedes automatizar un traspaso a ahorro al inicio de cada mes.");
  }

  return {
    currentMonthTotal,
    previousMonthTotal,
    topCategory,
    changeAmount,
    changePercentage,
    recommendations
  };
}
