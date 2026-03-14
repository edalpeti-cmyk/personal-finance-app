"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { formatCurrencyByPreference } from "@/lib/preferences-format";
import { AssetCurrency, convertToEur, FALLBACK_RATES_TO_EUR, SUPPORTED_ASSET_CURRENCIES } from "@/lib/currency-rates";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

type AssetType = "stock" | "etf" | "crypto" | "fund" | "commodity" | "cash" | "real_estate" | "loan";

type InvestmentRow = {
  id: string;
  asset_name: string;
  asset_symbol: string | null;
  asset_type: AssetType;
  asset_currency: AssetCurrency;
  quantity: number;
  average_buy_price: number;
  current_price: number | null;
  purchase_date: string | null;
};

type InvestmentFormErrors = {
  assetName?: string;
  assetSymbol?: string;
  quantity?: string;
  averageBuyPrice?: string;
  currentPrice?: string;
  purchaseDate?: string;
};

type ToastState = { type: "success" | "error"; text: string } | null;

const ASSET_TYPES: Array<{ value: AssetType; label: string }> = [
  { value: "stock", label: "Accion" },
  { value: "etf", label: "ETF" },
  { value: "crypto", label: "Criptomoneda" },
  { value: "fund", label: "Fondo de inversion" },
  { value: "commodity", label: "Materia prima" },
  { value: "cash", label: "Efectivo" },
  { value: "real_estate", label: "Inmobiliario" },
  { value: "loan", label: "Prestamo" }
];

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock: "Accion",
  etf: "ETF",
  crypto: "Criptomoneda",
  fund: "Fondo de inversion",
  commodity: "Materia prima",
  cash: "Efectivo",
  real_estate: "Inmobiliario",
  loan: "Prestamo"
};

function inputClass(hasError: boolean) {
  return `w-full rounded-2xl border bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition ${
    hasError ? "border-red-400 ring-2 ring-red-500/20" : "border-white/10 focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20"
  }`;
}

function formatNumber(value: number, digits: number) {
  return Number(value).toFixed(digits);
}

export default function InvestmentsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { userId, authLoading } = useAuthGuard();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [ratesToEur, setRatesToEur] = useState<Record<AssetCurrency, number>>(FALLBACK_RATES_TO_EUR);

  const [assetName, setAssetName] = useState("");
  const [assetSymbol, setAssetSymbol] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [assetCurrency, setAssetCurrency] = useState<AssetCurrency>("EUR");
  const [quantity, setQuantity] = useState("");
  const [averageBuyPrice, setAverageBuyPrice] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [errors, setErrors] = useState<InvestmentFormErrors>({});
  const formRef = useRef<HTMLElement | null>(null);

  const showToast = useCallback((nextToast: Exclude<ToastState, null>) => {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setAssetName("");
    setAssetSymbol("");
    setAssetType("stock");
    setAssetCurrency("EUR");
    setQuantity("");
    setAverageBuyPrice("");
    setCurrentPrice("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setErrors({});
  }, []);

  useEffect(() => {
    const loadRates = async () => {
      try {
        const response = await fetch("/api/fx-rates", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { rates?: Record<AssetCurrency, number> };
        if (data.rates) {
          setRatesToEur(data.rates);
        }
      } catch {
        // fallback remains active
      }
    };

    void loadRates();
  }, []);

  const loadInvestments = useCallback(
    async (uid: string) => {
      const { data, error } = await supabase
        .from("investments")
        .select("id, asset_name, asset_symbol, asset_type, asset_currency, quantity, average_buy_price, current_price, purchase_date")
        .eq("user_id", uid)
        .in("asset_type", ASSET_TYPES.map((type) => type.value))
        .order("purchase_date", { ascending: false });

      if (error) {
        setMessage(error.message);
        return;
      }

      setInvestments((data as InvestmentRow[]) ?? []);
    },
    [supabase]
  );

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      if (authLoading || !userId) {
        return;
      }

      await loadInvestments(userId);
      setLoading(false);
    };

    void init();
  }, [authLoading, loadInvestments, userId]);

  const metrics = useMemo(() => {
    return investments.reduce(
      (acc, row) => {
        const qty = Number(row.quantity) || 0;
        const avg = Number(row.average_buy_price) || 0;
        const current = Number(row.current_price ?? row.average_buy_price) || 0;
        const invested = convertToEur(qty * avg, row.asset_currency, ratesToEur);
        const currentValue = convertToEur(qty * current, row.asset_currency, ratesToEur);

        acc.totalValueEur += currentValue;
        acc.investedCapitalEur += invested;
        acc.trackedPositions += current > 0 && row.asset_symbol ? 1 : 0;
        return acc;
      },
      { totalValueEur: 0, investedCapitalEur: 0, trackedPositions: 0 }
    );
  }, [investments, ratesToEur]);

  const profitEur = metrics.totalValueEur - metrics.investedCapitalEur;
  const profitability = metrics.investedCapitalEur > 0 ? (profitEur / metrics.investedCapitalEur) * 100 : null;

  const evolution = useMemo(() => {
    const byMonth = new Map<string, { invested: number; current: number }>();

    for (const row of investments) {
      const date = row.purchase_date ? new Date(`${row.purchase_date}T00:00:00`) : new Date();
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const qty = Number(row.quantity) || 0;
      const avg = Number(row.average_buy_price) || 0;
      const current = Number(row.current_price ?? row.average_buy_price) || 0;
      const previous = byMonth.get(key) ?? { invested: 0, current: 0 };

      previous.invested += convertToEur(qty * avg, row.asset_currency, ratesToEur);
      previous.current += convertToEur(qty * current, row.asset_currency, ratesToEur);
      byMonth.set(key, previous);
    }

    const labels: string[] = [];
    const investedData: number[] = [];
    const currentData: number[] = [];
    let runningInvested = 0;
    let runningCurrent = 0;

    for (const key of Array.from(byMonth.keys()).sort()) {
      const values = byMonth.get(key);
      if (!values) continue;
      runningInvested += values.invested;
      runningCurrent += values.current;
      labels.push(key);
      investedData.push(Number(runningInvested.toFixed(2)));
      currentData.push(Number(runningCurrent.toFixed(2)));
    }

    return { labels, investedData, currentData };
  }, [investments, ratesToEur]);

  const chartData = {
    labels: evolution.labels,
    datasets: [
      {
        label: "Capital invertido (EUR)",
        data: evolution.investedData,
        borderColor: "#0f766e",
        backgroundColor: "rgba(15, 118, 110, 0.12)",
        borderWidth: 3,
        tension: 0.28
      },
      {
        label: "Valor actual (EUR)",
        data: evolution.currentData,
        borderColor: "#1d4ed8",
        backgroundColor: "rgba(29, 78, 216, 0.12)",
        borderWidth: 3,
        tension: 0.28
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: { usePointStyle: true, color: "#e2e8f0" }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#cbd5e1" } },
      y: {
        ticks: { color: "#cbd5e1", callback: (value: string | number) => formatCurrencyByPreference(Number(value), "EUR") },
        grid: { color: "rgba(148, 163, 184, 0.16)" }
      }
    }
  };

  const validateForm = () => {
    const nextErrors: InvestmentFormErrors = {};
    const cleanName = assetName.trim();
    const cleanSymbol = assetSymbol.trim();
    const qty = Number(quantity);
    const avg = Number(averageBuyPrice);
    const curr = currentPrice ? Number(currentPrice) : avg;
    const parsedDate = new Date(`${purchaseDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (cleanName.length < 2 || cleanName.length > 80) nextErrors.assetName = "El nombre debe tener entre 2 y 80 caracteres.";
    if (cleanSymbol.length > 15) nextErrors.assetSymbol = "El ticker no puede superar 15 caracteres.";
    else if (cleanSymbol && !/^[A-Z0-9.-]+$/.test(cleanSymbol)) nextErrors.assetSymbol = "El ticker solo admite A-Z, 0-9, punto y guion.";
    if (!Number.isFinite(qty) || qty <= 0) nextErrors.quantity = "La cantidad debe ser mayor que 0.";
    if (!Number.isFinite(avg) || avg < 0) nextErrors.averageBuyPrice = "El precio medio debe ser un numero valido >= 0.";
    if (!Number.isFinite(curr) || curr < 0) nextErrors.currentPrice = "El precio actual debe ser un numero valido >= 0.";
    if (Number.isNaN(parsedDate.getTime())) nextErrors.purchaseDate = "La fecha de compra es obligatoria.";
    else if (parsedDate > today) nextErrors.purchaseDate = "La fecha no puede estar en el futuro.";

    setErrors(nextErrors);
    return { isValid: Object.keys(nextErrors).length === 0, cleanName, cleanSymbol, qty, avg, curr };
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setToast(null);

    if (!userId) {
      setMessage("Debes iniciar sesion para gestionar inversiones.");
      return;
    }

    const validation = validateForm();
    if (!validation.isValid) {
      showToast({ type: "error", text: "Revisa los campos marcados antes de guardar." });
      return;
    }

    setSaving(true);

    const payload = {
      user_id: userId,
      asset_name: validation.cleanName,
      asset_symbol: validation.cleanSymbol || null,
      asset_type: assetType,
      asset_currency: assetCurrency,
      quantity: validation.qty,
      average_buy_price: validation.avg,
      current_price: validation.curr,
      purchase_date: purchaseDate
    };

    const query = editingId
      ? supabase.from("investments").update(payload).eq("id", editingId).eq("user_id", userId)
      : supabase.from("investments").insert(payload);

    const { error } = await query;

    if (error) {
      setMessage(error.message);
      showToast({ type: "error", text: editingId ? "No se pudo actualizar la posicion." : "No se pudo guardar la posicion." });
      setSaving(false);
      return;
    }

    resetForm();
    await loadInvestments(userId);
    showToast({ type: "success", text: editingId ? "Posicion actualizada." : "Posicion guardada correctamente." });
    setSaving(false);
  };

  const handleEdit = (row: InvestmentRow) => {
    setEditingId(row.id);
    setAssetName(row.asset_name);
    setAssetSymbol(row.asset_symbol ?? "");
    setAssetType(row.asset_type);
    setAssetCurrency(row.asset_currency ?? "EUR");
    setQuantity(String(row.quantity));
    setAverageBuyPrice(String(row.average_buy_price));
    setCurrentPrice(row.current_price === null ? "" : String(row.current_price));
    setPurchaseDate(row.purchase_date ?? new Date().toISOString().slice(0, 10));
    setErrors({});
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast({ type: "success", text: "Modo edicion activado para esta posicion." });
  };

  const handleDelete = async (id: string) => {
    if (!userId || !window.confirm("Se eliminara esta posicion. Deseas continuar?")) {
      return;
    }

    const { error } = await supabase.from("investments").delete().eq("id", id).eq("user_id", userId);
    if (error) {
      showToast({ type: "error", text: "No se pudo eliminar la posicion." });
      return;
    }

    if (editingId === id) {
      resetForm();
    }

    await loadInvestments(userId);
    showToast({ type: "success", text: "Posicion eliminada." });
  };

  const handleRefreshPrices = async (investmentId?: string) => {
    setRefreshingPrices(true);
    setMessage(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch("/api/investments/refresh-prices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify(investmentId ? { investmentId } : {})
      });

      if (!response.ok) {
        showToast({ type: "error", text: "No se pudieron actualizar los precios ahora mismo." });
        setRefreshingPrices(false);
        return;
      }

      const data = (await response.json()) as {
        updated?: Array<{ id: string; price: number }>;
        skipped?: Array<{ id: string; reason: string }>;
      };

      await loadInvestments(userId as string);
      const updatedCount = data.updated?.length ?? 0;
      const skippedCount = data.skipped?.length ?? 0;
      showToast({
        type: updatedCount > 0 ? "success" : "error",
        text:
          updatedCount > 0
            ? `Precios actualizados: ${updatedCount}.${skippedCount > 0 ? ` Sin cambios: ${skippedCount}.` : ""}`
            : "No hubo precios disponibles para actualizar."
      });
    } catch {
      showToast({ type: "error", text: "Error de red al actualizar precios." });
    } finally {
      setRefreshingPrices(false);
    }
  };

  if (authLoading) {
    return (
      <>
        <SideNav />
        <main className="mx-auto max-w-6xl p-6 md:pl-72">
          <AuthLoadingState title="Preparando inversiones" description="Estamos validando tu sesion antes de abrir tu cartera." />
        </main>
      </>
    );
  }

  return (
    <>
      <SideNav />
      <main className="page-enter relative z-10 mx-auto grid max-w-6xl gap-6 p-6 md:pl-72 xl:grid-cols-12">
        <section className="panel rounded-[30px] p-6 text-white md:p-8 xl:col-span-7">
          <p className="text-xs uppercase tracking-[0.26em] text-emerald-300">Portfolio tracker</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-white">Cartera con seguimiento real</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
            Anade activos, elige la moneda de cada posicion y calcula automaticamente el valor total convertido a EUR.
          </p>
        </section>

        <section className="rounded-[30px] border border-emerald-400/10 bg-[linear-gradient(180deg,rgba(7,19,35,0.98)_0%,rgba(9,29,48,0.98)_52%,rgba(10,63,70,0.92)_100%)] p-6 text-white shadow-[0_26px_60px_rgba(2,8,23,0.35)] xl:col-span-5">
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">Estado actual</p>
          <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold text-white">{formatCurrencyByPreference(metrics.totalValueEur, "EUR")}</p>
          <p className="mt-3 text-sm leading-6 text-slate-200">Valor total convertido automaticamente a EUR segun la moneda elegida en cada posicion.</p>
          <button
            type="button"
            onClick={() => void handleRefreshPrices()}
            disabled={refreshingPrices || investments.length === 0}
            className="mt-6 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshingPrices ? "Actualizando precios..." : "Actualizar precios reales"}
          </button>
        </section>

        {toast ? (
          <section className={`rounded-[24px] p-4 text-sm md:col-span-12 ${toast.type === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-red-200 bg-red-50 text-red-800"}`}>
            {toast.text}
          </section>
        ) : null}

        {message ? <section className="rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm text-red-800 md:col-span-12">{message}</section> : null}

        <section ref={formRef} className={`panel rounded-[28px] p-6 text-white xl:col-span-5 ${editingId ? "ring-2 ring-teal-400/40" : ""}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Formulario</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">{editingId ? "Editar posicion" : "Nueva posicion"}</h2>
            </div>
            {editingId ? (
              <button type="button" onClick={resetForm} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 hover:bg-white/10">
                Cancelar edicion
              </button>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4" noValidate>
            <label className="grid gap-2 text-sm text-slate-200">
              Tipo de activo
              <select className={inputClass(false)} value={assetType} onChange={(e) => setAssetType(e.target.value as AssetType)}>
                {ASSET_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              Moneda del activo
              <select className={inputClass(false)} value={assetCurrency} onChange={(e) => setAssetCurrency(e.target.value as AssetCurrency)}>
                {SUPPORTED_ASSET_CURRENCIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              Nombre
              <input className={inputClass(Boolean(errors.assetName))} value={assetName} onChange={(e) => setAssetName(e.target.value)} maxLength={80} />
              {errors.assetName ? <span className="text-xs text-red-700">{errors.assetName}</span> : null}
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              Ticker / simbolo
              <input className={inputClass(Boolean(errors.assetSymbol))} value={assetSymbol} onChange={(e) => setAssetSymbol(e.target.value.toUpperCase())} maxLength={15} />
              {errors.assetSymbol ? <span className="text-xs text-red-700">{errors.assetSymbol}</span> : null}
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-200">
                Cantidad
                <input className={inputClass(Boolean(errors.quantity))} type="number" min="0" step="0.00000001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                {errors.quantity ? <span className="text-xs text-red-700">{errors.quantity}</span> : null}
              </label>

              <label className="grid gap-2 text-sm text-slate-200">
                Fecha de compra
                <input className={inputClass(Boolean(errors.purchaseDate))} type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
                {errors.purchaseDate ? <span className="text-xs text-red-700">{errors.purchaseDate}</span> : null}
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-200">
                Precio medio ({assetCurrency})
                <input className={inputClass(Boolean(errors.averageBuyPrice))} type="number" min="0" step="0.0001" value={averageBuyPrice} onChange={(e) => setAverageBuyPrice(e.target.value)} />
                {errors.averageBuyPrice ? <span className="text-xs text-red-700">{errors.averageBuyPrice}</span> : null}
              </label>

              <label className="grid gap-2 text-sm text-slate-200">
                Precio actual ({assetCurrency})
                <input className={inputClass(Boolean(errors.currentPrice))} type="number" min="0" step="0.0001" value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} placeholder="Opcional" />
                {errors.currentPrice ? <span className="text-xs text-red-700">{errors.currentPrice}</span> : null}
              </label>
            </div>

            <button className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50" disabled={saving || loading} type="submit">
              {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Anadir activo"}
            </button>
          </form>
        </section>

        <section className="grid gap-4 xl:col-span-7 xl:grid-cols-3">
          <article className="kpi-card rounded-[26px] p-6">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Valor total en EUR</p>
            <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-white">{formatCurrencyByPreference(metrics.totalValueEur, "EUR")}</p>
            <p className="mt-3 text-sm text-slate-300">Suma del valor actual de todas tus posiciones convertida a EUR.</p>
          </article>
          <article className="kpi-card rounded-[26px] p-6">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Rentabilidad en EUR</p>
            <p className={`mt-3 font-[var(--font-heading)] text-3xl font-semibold ${profitEur >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {formatCurrencyByPreference(profitEur, "EUR")}
            </p>
            <p className="mt-3 text-sm text-slate-300">Rentabilidad consolidada tras convertir todas las posiciones.</p>
          </article>
          <article className="kpi-card rounded-[26px] p-6">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Precios conectados</p>
            <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-white">{metrics.trackedPositions}</p>
            <p className="mt-3 text-sm text-slate-300">Posiciones con simbolo aptas para refresco automatico.</p>
          </article>
        </section>

        <section className="panel rounded-[28px] p-6 text-white xl:col-span-12">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Evolucion</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Crecimiento del portfolio en EUR</h2>
            </div>
          </div>
          <div className="mt-6 h-[320px]">
            {evolution.labels.length > 0 ? (
              <Line data={chartData} options={chartOptions} />
            ) : (
              <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-white/15 bg-white/5 text-sm text-slate-300">
                Aun no hay suficiente historico para dibujar la evolucion.
              </div>
            )}
          </div>
        </section>

        <section className="panel rounded-[28px] p-6 text-white xl:col-span-12">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Posiciones</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Listado editable</h2>
            </div>
            <p className="text-sm text-slate-400">Cada posicion mantiene su moneda y el total se consolida automaticamente en EUR.</p>
          </div>

          {loading ? <p className="mt-6 text-sm text-slate-300">Cargando posiciones...</p> : null}
          {!loading && investments.length === 0 ? <p className="mt-6 text-sm text-slate-300">Aun no tienes inversiones registradas.</p> : null}

          {!loading && investments.length > 0 ? (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-slate-400">
                    <th className="px-3 py-2">Activo</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Ticker</th>
                    <th className="px-3 py-2">Moneda</th>
                    <th className="px-3 py-2 text-right">Cantidad</th>
                    <th className="px-3 py-2 text-right">P. medio</th>
                    <th className="px-3 py-2 text-right">P. actual</th>
                    <th className="px-3 py-2 text-right">Valor EUR</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {investments.map((row) => {
                    const current = Number(row.current_price ?? row.average_buy_price);
                    const valueEur = convertToEur(Number(row.quantity) * current, row.asset_currency, ratesToEur);

                    return (
                      <tr key={row.id} className="rounded-2xl bg-white/5 shadow-sm">
                        <td className="rounded-l-2xl px-3 py-4 font-medium text-white">{row.asset_name}</td>
                        <td className="px-3 py-4 text-slate-300">{ASSET_TYPE_LABELS[row.asset_type]}</td>
                        <td className="px-3 py-4 text-slate-300">{row.asset_symbol ?? "-"}</td>
                        <td className="px-3 py-4 text-slate-300">{row.asset_currency}</td>
                        <td className="px-3 py-4 text-right text-slate-300">{formatNumber(row.quantity, 6)}</td>
                        <td className="px-3 py-4 text-right text-slate-300">{formatNumber(row.average_buy_price, 4)}</td>
                        <td className="px-3 py-4 text-right text-slate-300">{formatNumber(current, 4)}</td>
                        <td className="px-3 py-4 text-right font-medium text-slate-100">{formatCurrencyByPreference(valueEur, "EUR")}</td>
                        <td className="rounded-r-2xl px-3 py-4">
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => handleEdit(row)} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-white/10">
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRefreshPrices(row.id)}
                              disabled={refreshingPrices || !row.asset_symbol}
                              className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Precio
                            </button>
                            <button type="button" onClick={() => void handleDelete(row.id)} className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-500/20">
                              Borrar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </main>
    </>
  );
}
