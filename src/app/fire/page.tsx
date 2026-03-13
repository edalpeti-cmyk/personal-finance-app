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
import SideNav from "@/components/side-nav";
import { useTheme } from "@/components/theme-provider";
import { formatCurrencyByPreference } from "@/lib/preferences-format";

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
  return `w-full rounded-2xl border bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition ${
    hasError ? "border-red-400 ring-2 ring-red-500/20" : "border-white/10 focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
  }`;
}

export default function FirePage() {
  const { currency } = useTheme();
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

    points.push({ year: 0, age, netWorth: Number(currentValue.toFixed(2)), contribution: 0, growth: 0 });

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
        borderColor: "#14b8a6",
        backgroundColor: "rgba(20, 184, 166, 0.14)",
        borderWidth: 3,
        tension: 0.24,
        fill: true
      },
      {
        label: "Capital FIRE",
        data: simulation.points.map(() => Number(fireNumber.toFixed(2))),
        borderColor: "#f97316",
        backgroundColor: "rgba(249, 115, 22, 0.10)",
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
        display: true,
        labels: { color: "#e2e8f0", usePointStyle: true }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#cbd5e1" } },
      y: { grid: { color: "rgba(148, 163, 184, 0.16)" }, ticks: { color: "#cbd5e1", callback: (value: string | number) => formatCurrencyByPreference(Number(value), currency) } }
    }
  };

  return (
    <>
      <SideNav />
      <main className="page-enter relative z-10 mx-auto grid max-w-6xl gap-6 p-6 md:pl-72 xl:grid-cols-12">
        <section className="panel rounded-[30px] p-6 text-white md:p-8 xl:col-span-7">
          <p className="text-xs uppercase tracking-[0.26em] text-emerald-300">Calculadora FIRE</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-white">Planifica tu independencia financiera</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">Calcula tu numero FIRE, estima cuantos anos te faltan y visualiza la evolucion esperada de tu patrimonio.</p>
        </section>

        <section className="rounded-[30px] border border-emerald-400/10 bg-[linear-gradient(180deg,rgba(7,19,35,0.98)_0%,rgba(9,29,48,0.98)_52%,rgba(10,63,70,0.92)_100%)] p-6 text-white shadow-[0_28px_72px_rgba(2,8,23,0.56)] xl:col-span-5">
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">Formula base</p>
          <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold text-white">Gastos anuales / 0.04</p>
          <p className="mt-3 text-sm leading-6 text-slate-200">Usamos la regla del 4% para estimar el capital necesario para vivir de tu patrimonio.</p>
        </section>

        <section className="panel rounded-[28px] p-6 text-white xl:col-span-5">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Parametros</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Tus datos</h2>

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm text-slate-200">
              Gastos anuales (EUR)
              <input className={inputClass(Boolean(errors.annualExpenses))} type="number" min="0" step="0.01" value={annualExpenses} onChange={(e) => setAnnualExpenses(e.target.value)} onBlur={() => validateField("annualExpenses")} />
              {errors.annualExpenses ? <span className="text-xs text-red-300">{errors.annualExpenses}</span> : null}
            </label>
            <label className="grid gap-2 text-sm text-slate-200">
              Patrimonio actual (EUR)
              <input className={inputClass(Boolean(errors.currentNetWorth))} type="number" min="0" step="0.01" value={currentNetWorth} onChange={(e) => setCurrentNetWorth(e.target.value)} onBlur={() => validateField("currentNetWorth")} />
              {errors.currentNetWorth ? <span className="text-xs text-red-300">{errors.currentNetWorth}</span> : null}
            </label>
            <label className="grid gap-2 text-sm text-slate-200">
              Ahorro/inversion anual (EUR)
              <input className={inputClass(Boolean(errors.annualContribution))} type="number" min="0" step="0.01" value={annualContribution} onChange={(e) => setAnnualContribution(e.target.value)} onBlur={() => validateField("annualContribution")} />
              {errors.annualContribution ? <span className="text-xs text-red-300">{errors.annualContribution}</span> : null}
            </label>
            <label className="grid gap-2 text-sm text-slate-200">
              Rentabilidad esperada anual (%)
              <input className={inputClass(Boolean(errors.expectedReturn))} type="number" step="0.1" value={expectedReturn} onChange={(e) => setExpectedReturn(e.target.value)} onBlur={() => validateField("expectedReturn")} />
              {errors.expectedReturn ? <span className="text-xs text-red-300">{errors.expectedReturn}</span> : null}
            </label>
            <label className="grid gap-2 text-sm text-slate-200">
              Edad actual
              <input className={inputClass(Boolean(errors.currentAge))} type="number" min="1" step="1" value={currentAge} onChange={(e) => setCurrentAge(e.target.value)} onBlur={() => validateField("currentAge")} />
              {errors.currentAge ? <span className="text-xs text-red-300">{errors.currentAge}</span> : null}
            </label>
          </div>
        </section>

        <section className="grid gap-4 xl:col-span-7 xl:grid-cols-3">
          <article className="kpi-card rounded-[26px] p-6 text-white xl:col-span-1">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Capital FIRE</p>
            <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-white">{formatCurrencyByPreference(fireNumber, currency)}</p>
            <p className="mt-3 text-sm text-slate-300">Objetivo total estimado.</p>
          </article>
          <article className="kpi-card rounded-[26px] p-6 text-white xl:col-span-1">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Anos hasta FIRE</p>
            <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-white">{simulation.yearsToFire === null ? `>${MAX_YEARS}` : simulation.yearsToFire}</p>
            <p className="mt-3 text-sm text-slate-300">Horizonte con tus datos actuales.</p>
          </article>
          <article className="kpi-card rounded-[26px] p-6 text-white xl:col-span-1">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Edad objetivo</p>
            <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-white">{simulation.yearsToFire === null ? "No definida" : `${Number(currentAge) + simulation.yearsToFire} anos`}</p>
            <p className="mt-3 text-sm text-slate-300">Edad aproximada para alcanzar FIRE.</p>
          </article>
        </section>

        <section className="panel rounded-[28px] p-6 text-white xl:col-span-12">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Grafico</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Crecimiento esperado</h2>
          <div className="mt-6 h-[320px]">
            {simulation.points.length > 0 ? <Line data={chartData} options={chartOptions} /> : <p className="text-sm text-slate-300">Introduce datos validos para ver la proyeccion.</p>}
          </div>
        </section>

        <section className="panel rounded-[28px] p-6 text-white xl:col-span-12">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Tabla</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Evolucion del patrimonio</h2>

          {simulation.points.length === 0 ? (
            <p className="mt-6 text-sm text-slate-300">Sin datos.</p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-slate-400">
                    <th className="px-3 py-2">Ano</th>
                    <th className="px-3 py-2">Edad</th>
                    <th className="px-3 py-2 text-right">Patrimonio</th>
                    <th className="px-3 py-2 text-right">Aporte anual</th>
                    <th className="px-3 py-2 text-right">Crecimiento anual</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.points.slice(0, 31).map((point) => (
                    <tr key={point.year} className="bg-white/5 shadow-sm">
                      <td className="rounded-l-2xl px-3 py-4 text-slate-300">{point.year}</td>
                      <td className="px-3 py-4 text-slate-300">{point.age}</td>
                      <td className="px-3 py-4 text-right font-medium text-white">{formatCurrencyByPreference(point.netWorth, currency)}</td>
                      <td className="px-3 py-4 text-right text-slate-300">{formatCurrencyByPreference(point.contribution, currency)}</td>
                      <td className="rounded-r-2xl px-3 py-4 text-right text-slate-300">{formatCurrencyByPreference(point.growth, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
