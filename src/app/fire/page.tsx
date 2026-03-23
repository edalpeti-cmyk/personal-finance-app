"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/supabase/use-auth-guard";
import AuthLoadingState from "@/components/auth-loading-state";
import SideNav from "@/components/side-nav";
import EmptyStateCard from "@/components/empty-state-card";
import SectionHeader from "@/components/section-header";
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

type FireSettings = {
  annualExpenses: string;
  currentNetWorth: string;
  annualContribution: string;
  expectedReturn: string;
  currentAge: string;
};

type FireSettingsRow = {
  annual_expenses: number;
  current_net_worth: number;
  annual_contribution: number;
  expected_return: number;
  current_age: number;
};

const MAX_YEARS = 60;
const FIRE_SETTINGS_KEY = "personal-finance-fire-settings";
const FIRE_TABLE_OPEN_KEY = "fire-table-open";

function inputClass(hasError: boolean) {
  return `w-full rounded-2xl border bg-slate-950/80 px-4 py-2.5 text-sm text-slate-100 outline-none transition ${
    hasError ? "border-red-400 ring-2 ring-red-500/20" : "border-white/10 focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
  }`;
}

export default function FirePage() {
  const supabase = useMemo(() => createClient(), []);
  const { userId, authLoading } = useAuthGuard();
  const { currency } = useTheme();
  const [annualExpenses, setAnnualExpenses] = useState("24000");
  const [currentNetWorth, setCurrentNetWorth] = useState("30000");
  const [annualContribution, setAnnualContribution] = useState("12000");
  const [expectedReturn, setExpectedReturn] = useState("6");
  const [currentAge, setCurrentAge] = useState("30");
  const [errors, setErrors] = useState<FireFormErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [tableOpen, setTableOpen] = useState(false);

  useEffect(() => {
    const storedTableOpen = window.localStorage.getItem(FIRE_TABLE_OPEN_KEY);
    if (storedTableOpen) {
      setTableOpen(storedTableOpen === "true");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(FIRE_TABLE_OPEN_KEY, String(tableOpen));
  }, [tableOpen]);

  useEffect(() => {
    const loadSettings = async () => {
      if (authLoading || !userId) {
        return;
      }

      const { data, error } = await supabase
        .from("fire_settings")
        .select("annual_expenses, current_net_worth, annual_contribution, expected_return, current_age")
        .eq("user_id", userId)
        .maybeSingle();

      if (!error && data) {
        const row = data as FireSettingsRow;
        setAnnualExpenses(String(row.annual_expenses));
        setCurrentNetWorth(String(row.current_net_worth));
        setAnnualContribution(String(row.annual_contribution));
        setExpectedReturn(String(row.expected_return));
        setCurrentAge(String(row.current_age));
        setLoading(false);
        return;
      }

      const raw = window.localStorage.getItem(FIRE_SETTINGS_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<FireSettings>;
          if (typeof parsed.annualExpenses === "string") setAnnualExpenses(parsed.annualExpenses);
          if (typeof parsed.currentNetWorth === "string") setCurrentNetWorth(parsed.currentNetWorth);
          if (typeof parsed.annualContribution === "string") setAnnualContribution(parsed.annualContribution);
          if (typeof parsed.expectedReturn === "string") setExpectedReturn(parsed.expectedReturn);
          if (typeof parsed.currentAge === "string") setCurrentAge(parsed.currentAge);
        } catch {
          // ignore invalid local data
        }
      }

      setLoading(false);
    };

    void loadSettings();
  }, [authLoading, supabase, userId]);

  useEffect(() => {
    const payload: FireSettings = {
      annualExpenses,
      currentNetWorth,
      annualContribution,
      expectedReturn,
      currentAge
    };
    window.localStorage.setItem(FIRE_SETTINGS_KEY, JSON.stringify(payload));
  }, [annualContribution, annualExpenses, currentAge, currentNetWorth, expectedReturn]);

  const handleSaveSettings = async (event: FormEvent) => {
    event.preventDefault();
    setSaveMessage(null);

    if (!userId) {
      setSaveMessage("No hay sesion activa para guardar la configuracion FIRE.");
      return;
    }

    const expenses = Number(annualExpenses);
    const netWorth = Number(currentNetWorth);
    const contribution = Number(annualContribution);
    const expected = Number(expectedReturn);
    const age = Number(currentAge);

    if (
      !Number.isFinite(expenses) ||
      expenses <= 0 ||
      !Number.isFinite(netWorth) ||
      netWorth < 0 ||
      !Number.isFinite(contribution) ||
      contribution < 0 ||
      !Number.isFinite(expected) ||
      expected < -20 ||
      expected > 30 ||
      !Number.isFinite(age) ||
      age < 18 ||
      age > 100
    ) {
      setSaveMessage("Revisa los campos FIRE antes de guardar.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("fire_settings").upsert(
      {
        user_id: userId,
        annual_expenses: expenses,
        current_net_worth: netWorth,
        annual_contribution: contribution,
        expected_return: expected,
        current_age: age
      },
      { onConflict: "user_id" }
    );

    setSaving(false);
    setSaveMessage(error ? error.message : "Configuracion FIRE guardada en Supabase.");
  };

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

  if (authLoading || loading) {
    return (
      <>
        <SideNav />
        <main className="mx-auto max-w-6xl p-6 md:pl-72">
          <AuthLoadingState title="Preparando calculadora FIRE" description="Estamos cargando tu configuracion FIRE guardada." />
        </main>
      </>
    );
  }

  return (
    <>
      <SideNav />
      <main className="page-enter relative z-10 mx-auto grid max-w-6xl gap-5 p-5 md:pl-72 xl:grid-cols-12">
        <section className="panel rounded-[30px] p-5 text-white md:p-7 xl:col-span-7">
          <p className="text-xs uppercase tracking-[0.26em] text-emerald-300">Calculadora FIRE</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-white">Planifica tu independencia financiera</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">Calcula tu numero FIRE y el horizonte estimado con tu configuracion actual.</p>
        </section>

        <section className="rounded-[30px] border border-emerald-400/10 bg-[linear-gradient(180deg,rgba(7,19,35,0.98)_0%,rgba(9,29,48,0.98)_52%,rgba(10,63,70,0.92)_100%)] p-6 text-white shadow-[0_28px_72px_rgba(2,8,23,0.56)] xl:col-span-5">
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">Formula base</p>
          <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold text-white">Gastos anuales / 0.04</p>
          <p className="mt-3 text-sm leading-6 text-slate-200">Base compartida con el dashboard.</p>
        </section>

        <section className="panel rounded-[28px] p-5 text-white xl:col-span-5">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Parametros</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Tus datos</h2>
          <form className="mt-6 grid gap-4" onSubmit={handleSaveSettings}>
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
            <button className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50" disabled={saving} type="submit">
              {saving ? "Guardando..." : "Guardar configuracion FIRE"}
            </button>
            {saveMessage ? <p className="text-sm text-slate-300">{saveMessage}</p> : null}
          </form>
        </section>

        <section className="grid gap-4 xl:col-span-7 md:grid-cols-2">
          <article className="kpi-card rounded-[26px] p-6 text-white">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Capital FIRE</p>
            <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(fireNumber, currency)}</p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Objetivo total estimado para alcanzar FIRE.</p>
          </article>
          <article className="kpi-card rounded-[26px] p-6 text-white">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Anos hasta FIRE</p>
            <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{simulation.yearsToFire === null ? `>${MAX_YEARS}` : simulation.yearsToFire}</p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Horizonte estimado con tus datos actuales.</p>
          </article>
          <article className="kpi-card rounded-[26px] p-6 text-white md:col-span-2">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Edad objetivo</p>
            <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{simulation.yearsToFire === null ? "No definida" : `${Number(currentAge) + simulation.yearsToFire} anos`}</p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Edad aproximada para alcanzar tu objetivo FIRE.</p>
          </article>
        </section>

        <section className="panel rounded-[28px] p-5 text-white xl:col-span-12">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Grafico</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Crecimiento esperado</h2>
          <div className="mt-6 h-[320px]">
            {simulation.points.length > 0 ? <Line data={chartData} options={chartOptions} /> : <p className="text-sm text-slate-300">Introduce datos validos para ver la proyeccion.</p>}
          </div>
        </section>

        {simulation.points.length > 0 ? (
          <section className="panel rounded-[28px] p-5 text-white xl:col-span-12">
            <details className="group" open={tableOpen} onToggle={(event) => setTableOpen(event.currentTarget.open)}>
              <summary className="list-none cursor-pointer">
                <div className="accordion-summary">
                  <div className="accordion-summary-main">
                    <SectionHeader eyebrow="Tabla" title="Evolucion del patrimonio" />
                  </div>
                  <div className="accordion-summary-side">
                    <span className="accordion-metric">{Math.min(simulation.points.length, 31)} anos</span>
                    <span className="accordion-chevron" aria-hidden="true">v</span>
                  </div>
                </div>
              </summary>
              <div className="accordion-content table-scroll mt-6">
                <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="sticky-col-header px-3 py-2">Ano</th>
                      <th className="px-3 py-2">Edad</th>
                      <th className="px-3 py-2 text-right">Patrimonio</th>
                      <th className="px-3 py-2 text-right">Aporte anual</th>
                      <th className="px-3 py-2 text-right">Crecimiento anual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulation.points.slice(0, 31).map((point) => (
                      <tr key={point.year} className="bg-white/5 shadow-sm">
                        <td className="sticky-col rounded-l-2xl px-3 py-4 text-slate-300">{point.year}</td>
                        <td className="px-3 py-4 text-slate-300">{point.age}</td>
                        <td className="px-3 py-4 text-right font-medium text-white">{formatCurrencyByPreference(point.netWorth, currency)}</td>
                        <td className="px-3 py-4 text-right text-slate-300">{formatCurrencyByPreference(point.contribution, currency)}</td>
                        <td className="rounded-r-2xl px-3 py-4 text-right text-slate-300">{formatCurrencyByPreference(point.growth, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        ) : (
          <section className="panel rounded-[28px] p-5 text-white xl:col-span-12">
            <SectionHeader eyebrow="Proyeccion" title="Evolucion del patrimonio" />
            <div className="mt-6">
              <EmptyStateCard
                eyebrow="Proyeccion"
                title="Faltan datos para proyectar FIRE"
                description="Completa gastos anuales, patrimonio actual y aportacion anual para generar la tabla de evolucion."
                actionLabel="Rellena el formulario superior"
                actionHref="/fire"
                compact
              />
            </div>
          </section>
        )}
      </main>
    </>
  );
}

