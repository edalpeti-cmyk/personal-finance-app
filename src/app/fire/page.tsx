"use client";

import { useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

type ProjectionPoint = {
  year: number;
  age: number;
  netWorth: number;
  contribution: number;
  growth: number;
};

type FireFormErrors = {
  annualExpenses?: string;
  currentNetWorth?: string;
  annualContribution?: string;
  expectedReturn?: string;
  currentAge?: string;
};

const MAX_YEARS = 60;

function inputClass(hasError: boolean) {
  return `rounded border p-2 ${hasError ? "border-red-600" : "border-slate-300"}`;
}

export default function FirePage() {
  const [annualExpenses, setAnnualExpenses] = useState("24000");
  const [currentNetWorth, setCurrentNetWorth] = useState("30000");
  const [annualContribution, setAnnualContribution] = useState("12000");
  const [expectedReturn, setExpectedReturn] = useState("6");
  const [currentAge, setCurrentAge] = useState("30");
  const [errors, setErrors] = useState<FireFormErrors>({});

  const validateField = (field: keyof FireFormErrors) => {
    const next: FireFormErrors = {};

    const expenses = Number(annualExpenses);
    const netWorth = Number(currentNetWorth);
    const contribution = Number(annualContribution);
    const expected = Number(expectedReturn);
    const age = Number(currentAge);

    if (field === "annualExpenses") {
      if (!Number.isFinite(expenses) || expenses <= 0) next.annualExpenses = "Introduce un gasto anual mayor que 0.";
      else if (expenses > 10_000_000) next.annualExpenses = "Valor demasiado alto.";
    }

    if (field === "currentNetWorth") {
      if (!Number.isFinite(netWorth) || netWorth < 0) next.currentNetWorth = "El patrimonio debe ser >= 0.";
    }

    if (field === "annualContribution") {
      if (!Number.isFinite(contribution) || contribution < 0) next.annualContribution = "El ahorro anual debe ser >= 0.";
    }

    if (field === "expectedReturn") {
      if (!Number.isFinite(expected) || expected < -20 || expected > 30) {
        next.expectedReturn = "Usa un valor entre -20% y 30%.";
      }
    }

    if (field === "currentAge") {
      if (!Number.isFinite(age) || age < 18 || age > 100) {
        next.currentAge = "Introduce una edad entre 18 y 100 anos.";
      }
    }

    setErrors((prev) => ({ ...prev, [field]: next[field] }));
  };

  const fireNumber = useMemo(() => {
    const expenses = Number(annualExpenses);
    if (!Number.isFinite(expenses) || expenses <= 0) return 0;
    return expenses / 0.04;
  }, [annualExpenses]);

  const simulation = useMemo(() => {
    const netWorth = Number(currentNetWorth);
    const contribution = Number(annualContribution);
    const rate = Number(expectedReturn) / 100;
    const age = Number(currentAge);

    if (
      !Number.isFinite(netWorth) ||
      !Number.isFinite(contribution) ||
      !Number.isFinite(rate) ||
      !Number.isFinite(age) ||
      netWorth < 0 ||
      contribution < 0 ||
      age <= 0 ||
      fireNumber <= 0
    ) {
      return { yearsToFire: null as number | null, points: [] as ProjectionPoint[] };
    }

    const points: ProjectionPoint[] = [];
    let currentValue = netWorth;

    points.push({
      year: 0,
      age,
      netWorth: Number(currentValue.toFixed(2)),
      contribution: 0,
      growth: 0
    });

    let yearsToFire: number | null = currentValue >= fireNumber ? 0 : null;

    for (let year = 1; year <= MAX_YEARS; year++) {
      const growth = currentValue * rate;
      currentValue = currentValue + growth + contribution;

      points.push({
        year,
        age: age + year,
        netWorth: Number(currentValue.toFixed(2)),
        contribution: Number(contribution.toFixed(2)),
        growth: Number(growth.toFixed(2))
      });

      if (yearsToFire === null && currentValue >= fireNumber) {
        yearsToFire = year;
      }
    }

    return { yearsToFire, points };
  }, [currentNetWorth, annualContribution, expectedReturn, currentAge, fireNumber]);

  const chartData = {
    labels: simulation.points.map((p) => `Ano ${p.year}`),
    datasets: [
      {
        label: "Patrimonio proyectado",
        data: simulation.points.map((p) => p.netWorth),
        borderColor: "#0f766e",
        backgroundColor: "rgba(15, 118, 110, 0.15)",
        borderWidth: 2,
        tension: 0.2
      },
      {
        label: "Capital FIRE",
        data: simulation.points.map(() => Number(fireNumber.toFixed(2))),
        borderColor: "#b91c1c",
        backgroundColor: "rgba(185, 28, 28, 0.12)",
        borderWidth: 2,
        borderDash: [6, 6],
        pointRadius: 0,
        tension: 0
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        display: true
      }
    }
  };

  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-6 md:grid-cols-2">
      <section className="rounded-lg border bg-white p-4">
        <h1 className="mb-4 text-2xl font-semibold">Calculadora FIRE</h1>
        <p className="mb-4 text-sm text-slate-600">capital necesario = gastos anuales / 0.04</p>

        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            Gastos anuales (EUR)
            <input
              className={inputClass(Boolean(errors.annualExpenses))}
              type="number"
              min="0"
              step="0.01"
              value={annualExpenses}
              onChange={(e) => setAnnualExpenses(e.target.value)}
              onBlur={() => validateField("annualExpenses")}
            />
            {errors.annualExpenses ? <span className="text-xs text-red-700">{errors.annualExpenses}</span> : null}
          </label>

          <label className="grid gap-1 text-sm">
            Patrimonio actual (EUR)
            <input
              className={inputClass(Boolean(errors.currentNetWorth))}
              type="number"
              min="0"
              step="0.01"
              value={currentNetWorth}
              onChange={(e) => setCurrentNetWorth(e.target.value)}
              onBlur={() => validateField("currentNetWorth")}
            />
            {errors.currentNetWorth ? <span className="text-xs text-red-700">{errors.currentNetWorth}</span> : null}
          </label>

          <label className="grid gap-1 text-sm">
            Ahorro/inversion anual (EUR)
            <input
              className={inputClass(Boolean(errors.annualContribution))}
              type="number"
              min="0"
              step="0.01"
              value={annualContribution}
              onChange={(e) => setAnnualContribution(e.target.value)}
              onBlur={() => validateField("annualContribution")}
            />
            {errors.annualContribution ? <span className="text-xs text-red-700">{errors.annualContribution}</span> : null}
          </label>

          <label className="grid gap-1 text-sm">
            Rentabilidad esperada anual (%)
            <input
              className={inputClass(Boolean(errors.expectedReturn))}
              type="number"
              step="0.1"
              value={expectedReturn}
              onChange={(e) => setExpectedReturn(e.target.value)}
              onBlur={() => validateField("expectedReturn")}
            />
            {errors.expectedReturn ? <span className="text-xs text-red-700">{errors.expectedReturn}</span> : null}
          </label>

          <label className="grid gap-1 text-sm">
            Edad actual
            <input
              className={inputClass(Boolean(errors.currentAge))}
              type="number"
              min="1"
              step="1"
              value={currentAge}
              onChange={(e) => setCurrentAge(e.target.value)}
              onBlur={() => validateField("currentAge")}
            />
            {errors.currentAge ? <span className="text-xs text-red-700">{errors.currentAge}</span> : null}
          </label>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-4 text-xl font-semibold">Resultados</h2>
        <div className="grid gap-2 text-sm">
          <p>
            <strong>Capital necesario (FIRE):</strong> {fireNumber.toFixed(2)} EUR
          </p>
          <p>
            <strong>Anos hasta independencia financiera:</strong>{" "}
            {simulation.yearsToFire === null ? `Mas de ${MAX_YEARS} anos (con los datos actuales)` : simulation.yearsToFire}
          </p>
          {simulation.yearsToFire !== null ? (
            <p>
              <strong>Edad estimada FIRE:</strong> {Number(currentAge) + simulation.yearsToFire} anos
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4 md:col-span-2">
        <h2 className="mb-4 text-xl font-semibold">Grafico de crecimiento</h2>
        {simulation.points.length > 0 ? <Line data={chartData} options={chartOptions} /> : <p>Introduce datos validos para ver la proyeccion.</p>}
      </section>

      <section className="rounded-lg border bg-white p-4 md:col-span-2">
        <h2 className="mb-4 text-xl font-semibold">Evolucion del patrimonio</h2>
        {simulation.points.length === 0 ? (
          <p>Sin datos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="p-2">Ano</th>
                  <th className="p-2">Edad</th>
                  <th className="p-2 text-right">Patrimonio</th>
                  <th className="p-2 text-right">Aporte anual</th>
                  <th className="p-2 text-right">Crecimiento anual</th>
                </tr>
              </thead>
              <tbody>
                {simulation.points.slice(0, 31).map((point) => (
                  <tr key={point.year} className="border-b">
                    <td className="p-2">{point.year}</td>
                    <td className="p-2">{point.age}</td>
                    <td className="p-2 text-right">{point.netWorth.toFixed(2)} EUR</td>
                    <td className="p-2 text-right">{point.contribution.toFixed(2)} EUR</td>
                    <td className="p-2 text-right">{point.growth.toFixed(2)} EUR</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}