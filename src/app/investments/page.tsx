"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

type AssetType = "stock" | "etf" | "crypto" | "fund" | "commodity" | "cash" | "real_estate" | "loan";

type InvestmentRow = {
  id: string;
  asset_name: string;
  asset_symbol: string | null;
  asset_type: AssetType;
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
  return `rounded border p-2 ${hasError ? "border-red-600" : "border-slate-300"}`;
}

export default function InvestmentsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);

  const [assetName, setAssetName] = useState("");
  const [assetSymbol, setAssetSymbol] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [quantity, setQuantity] = useState("");
  const [averageBuyPrice, setAverageBuyPrice] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [errors, setErrors] = useState<InvestmentFormErrors>({});
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadInvestments = useCallback(
    async (uid: string) => {
      const { data, error } = await supabase
        .from("investments")
        .select("id, asset_name, asset_symbol, asset_type, quantity, average_buy_price, current_price, purchase_date")
        .eq("user_id", uid)
        .in("asset_type", ASSET_TYPES.map((type) => type.value))
        .order("purchase_date", { ascending: true });

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
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        setMessage("No hay sesion activa. Inicia sesion para gestionar inversiones.");
        setLoading(false);
        return;
      }

      setUserId(data.user.id);
      await loadInvestments(data.user.id);
      setLoading(false);
    };

    void init();
  }, [loadInvestments, supabase]);

  const metrics = useMemo(() => {
    const totals = investments.reduce(
      (acc, row) => {
        const qty = Number(row.quantity) || 0;
        const avg = Number(row.average_buy_price) || 0;
        const current = Number(row.current_price ?? row.average_buy_price) || 0;
        const invested = qty * avg;
        const currentValue = qty * current;

        acc.invested += invested;
        acc.currentValue += currentValue;
        return acc;
      },
      { invested: 0, currentValue: 0 }
    );

    const profit = totals.currentValue - totals.invested;
    const profitability = totals.invested > 0 ? (profit / totals.invested) * 100 : null;

    return {
      totalValue: totals.currentValue,
      investedCapital: totals.invested,
      profit,
      profitability
    };
  }, [investments]);

  const evolution = useMemo(() => {
    const byMonth = new Map<string, { invested: number; current: number }>();

    for (const row of investments) {
      const date = row.purchase_date ? new Date(`${row.purchase_date}T00:00:00`) : new Date();
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const qty = Number(row.quantity) || 0;
      const avg = Number(row.average_buy_price) || 0;
      const current = Number(row.current_price ?? row.average_buy_price) || 0;

      const prev = byMonth.get(key) ?? { invested: 0, current: 0 };
      prev.invested += qty * avg;
      prev.current += qty * current;
      byMonth.set(key, prev);
    }

    const sortedKeys = Array.from(byMonth.keys()).sort();
    let runningInvested = 0;
    let runningCurrent = 0;

    const labels: string[] = [];
    const investedData: number[] = [];
    const currentData: number[] = [];

    for (const key of sortedKeys) {
      const values = byMonth.get(key);
      if (!values) continue;
      runningInvested += values.invested;
      runningCurrent += values.current;
      labels.push(key);
      investedData.push(Number(runningInvested.toFixed(2)));
      currentData.push(Number(runningCurrent.toFixed(2)));
    }

    return { labels, investedData, currentData };
  }, [investments]);

  const chartData = {
    labels: evolution.labels,
    datasets: [
      {
        label: "Capital invertido acumulado",
        data: evolution.investedData,
        borderColor: "#1d4ed8",
        backgroundColor: "rgba(29, 78, 216, 0.15)",
        borderWidth: 2,
        tension: 0.2
      },
      {
        label: "Valor actual acumulado",
        data: evolution.currentData,
        borderColor: "#16a34a",
        backgroundColor: "rgba(22, 163, 74, 0.15)",
        borderWidth: 2,
        tension: 0.2
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

  const validateForm = () => {
    const nextErrors: InvestmentFormErrors = {};

    const cleanName = assetName.trim();
    if (cleanName.length < 2 || cleanName.length > 80) {
      nextErrors.assetName = "El nombre debe tener entre 2 y 80 caracteres.";
    }

    const cleanSymbol = assetSymbol.trim();
    if (cleanSymbol.length > 15) {
      nextErrors.assetSymbol = "El ticker no puede superar 15 caracteres.";
    } else if (cleanSymbol && !/^[A-Z0-9.-]+$/.test(cleanSymbol)) {
      nextErrors.assetSymbol = "El ticker solo admite A-Z, 0-9, punto y guion.";
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      nextErrors.quantity = "La cantidad debe ser mayor que 0.";
    } else if (qty > 1_000_000_000) {
      nextErrors.quantity = "La cantidad es demasiado alta.";
    }

    const avg = Number(averageBuyPrice);
    if (!Number.isFinite(avg) || avg < 0) {
      nextErrors.averageBuyPrice = "El precio medio debe ser un numero valido >= 0.";
    } else if (avg > 1_000_000_000) {
      nextErrors.averageBuyPrice = "El precio medio es demasiado alto.";
    }

    const curr = currentPrice ? Number(currentPrice) : avg;
    if (!Number.isFinite(curr) || curr < 0) {
      nextErrors.currentPrice = "El precio actual debe ser un numero valido >= 0.";
    } else if (curr > 1_000_000_000) {
      nextErrors.currentPrice = "El precio actual es demasiado alto.";
    }

    const parsedDate = new Date(`${purchaseDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (Number.isNaN(parsedDate.getTime())) {
      nextErrors.purchaseDate = "La fecha de compra es obligatoria.";
    } else if (parsedDate > today) {
      nextErrors.purchaseDate = "La fecha de compra no puede estar en el futuro.";
    }

    setErrors(nextErrors);

    return {
      isValid: Object.keys(nextErrors).length === 0,
      qty,
      avg,
      curr,
      cleanName,
      cleanSymbol
    };
  };

  const validateField = (field: keyof InvestmentFormErrors) => {
    const cleanName = assetName.trim();
    const cleanSymbol = assetSymbol.trim();
    const qty = Number(quantity);
    const avg = Number(averageBuyPrice);
    const curr = currentPrice ? Number(currentPrice) : avg;
    const parsedDate = new Date(`${purchaseDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let error: string | undefined;

    if (field === "assetName") {
      if (cleanName.length < 2 || cleanName.length > 80) {
        error = "El nombre debe tener entre 2 y 80 caracteres.";
      }
    }

    if (field === "assetSymbol") {
      if (cleanSymbol.length > 15) error = "El ticker no puede superar 15 caracteres.";
      else if (cleanSymbol && !/^[A-Z0-9.-]+$/.test(cleanSymbol)) {
        error = "El ticker solo admite A-Z, 0-9, punto y guion.";
      }
    }

    if (field === "quantity") {
      if (!Number.isFinite(qty) || qty <= 0) error = "La cantidad debe ser mayor que 0.";
      else if (qty > 1_000_000_000) error = "La cantidad es demasiado alta.";
    }

    if (field === "averageBuyPrice") {
      if (!Number.isFinite(avg) || avg < 0) error = "El precio medio debe ser un numero valido >= 0.";
      else if (avg > 1_000_000_000) error = "El precio medio es demasiado alto.";
    }

    if (field === "currentPrice") {
      if (!Number.isFinite(curr) || curr < 0) error = "El precio actual debe ser un numero valido >= 0.";
      else if (curr > 1_000_000_000) error = "El precio actual es demasiado alto.";
    }

    if (field === "purchaseDate") {
      if (Number.isNaN(parsedDate.getTime())) error = "La fecha de compra es obligatoria.";
      else if (parsedDate > today) error = "La fecha de compra no puede estar en el futuro.";
    }

    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setToast(null);

    if (!userId) {
      setMessage("Debes iniciar sesion para anadir inversiones.");
      return;
    }

    const validation = validateForm();
    if (!validation.isValid) {
      setToast({ type: "error", text: "Revisa los campos marcados en rojo." });
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("investments").insert({
      user_id: userId,
      asset_name: validation.cleanName,
      asset_symbol: validation.cleanSymbol || null,
      asset_type: assetType,
      quantity: validation.qty,
      average_buy_price: validation.avg,
      current_price: validation.curr,
      purchase_date: purchaseDate
    });

    if (error) {
      setMessage(error.message);
      setToast({ type: "error", text: "No se pudo guardar la inversion." });
      setSaving(false);
      return;
    }

    setAssetName("");
    setAssetSymbol("");
    setQuantity("");
    setAverageBuyPrice("");
    setCurrentPrice("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setErrors({});
    setToast({ type: "success", text: "Inversion guardada correctamente." });
    window.setTimeout(() => setToast(null), 3000);

    await loadInvestments(userId);
    setSaving(false);
  };

  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-6 md:grid-cols-2">
      <section className="rounded-lg border bg-white p-4">
        <h1 className="mb-4 text-2xl font-semibold">Portfolio Tracker</h1>
        {toast ? (
          <p className={`mb-3 rounded p-2 text-sm ${toast.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {toast.text}
          </p>
        ) : null}
        <form onSubmit={handleSubmit} className="grid gap-3" noValidate>
          <label className="grid gap-1 text-sm">
            Tipo de activo
            <select className={inputClass(false)} value={assetType} onChange={(e) => setAssetType(e.target.value as AssetType)}>
              {ASSET_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            Nombre
            <input
              className={inputClass(Boolean(errors.assetName))}
              type="text"
              value={assetName}
              onChange={(e) => setAssetName(e.target.value)}
              onBlur={() => validateField("assetName")}
              placeholder="Ej: Apple, SP500 ETF, Bitcoin"
              required
              maxLength={80}
            />
            {errors.assetName ? <span className="text-xs text-red-700">{errors.assetName}</span> : null}
          </label>

          <label className="grid gap-1 text-sm">
            Ticker / Simbolo
            <input
              className={inputClass(Boolean(errors.assetSymbol))}
              type="text"
              value={assetSymbol}
              onChange={(e) => setAssetSymbol(e.target.value.toUpperCase())}
              onBlur={() => validateField("assetSymbol")}
              placeholder="Ej: AAPL, VOO, BTC"
              maxLength={15}
            />
            {errors.assetSymbol ? <span className="text-xs text-red-700">{errors.assetSymbol}</span> : null}
          </label>

          <label className="grid gap-1 text-sm">
            Cantidad
            <input
              className={inputClass(Boolean(errors.quantity))}
              type="number"
              step="0.00000001"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onBlur={() => validateField("quantity")}
              required
            />
            {errors.quantity ? <span className="text-xs text-red-700">{errors.quantity}</span> : null}
          </label>

          <label className="grid gap-1 text-sm">
            Precio medio de compra
            <input
              className={inputClass(Boolean(errors.averageBuyPrice))}
              type="number"
              step="0.0001"
              min="0"
              value={averageBuyPrice}
              onChange={(e) => setAverageBuyPrice(e.target.value)}
              onBlur={() => validateField("averageBuyPrice")}
              required
            />
            {errors.averageBuyPrice ? <span className="text-xs text-red-700">{errors.averageBuyPrice}</span> : null}
          </label>

          <label className="grid gap-1 text-sm">
            Precio actual
            <input
              className={inputClass(Boolean(errors.currentPrice))}
              type="number"
              step="0.0001"
              min="0"
              value={currentPrice}
              onChange={(e) => setCurrentPrice(e.target.value)}
              onBlur={() => validateField("currentPrice")}
              placeholder="Si lo dejas vacio, usa precio medio"
            />
            {errors.currentPrice ? <span className="text-xs text-red-700">{errors.currentPrice}</span> : null}
          </label>

          <label className="grid gap-1 text-sm">
            Fecha de compra
            <input
              className={inputClass(Boolean(errors.purchaseDate))}
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              onBlur={() => validateField("purchaseDate")}
              required
            />
            {errors.purchaseDate ? <span className="text-xs text-red-700">{errors.purchaseDate}</span> : null}
          </label>

          <button className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50" disabled={saving || loading} type="submit">
            {saving ? "Guardando..." : "Anadir activo"}
          </button>
        </form>

        {message ? <p className="mt-3 text-sm text-red-700">{message}</p> : null}
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-4 text-xl font-semibold">Resumen del portfolio</h2>
        <div className="grid gap-2 text-sm">
          <p>
            <strong>Valor total:</strong> {metrics.totalValue.toFixed(2)} EUR
          </p>
          <p>
            <strong>Capital invertido:</strong> {metrics.investedCapital.toFixed(2)} EUR
          </p>
          <p>
            <strong>Rentabilidad:</strong> {metrics.profit.toFixed(2)} EUR
            {metrics.profitability !== null ? ` (${metrics.profitability.toFixed(2)}%)` : ""}
          </p>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4 md:col-span-2">
        <h2 className="mb-4 text-xl font-semibold">Grafico de evolucion</h2>
        {evolution.labels.length > 0 ? <Line data={chartData} options={chartOptions} /> : <p>Aun no hay datos para el grafico.</p>}
      </section>

      <section className="rounded-lg border bg-white p-4 md:col-span-2">
        <h2 className="mb-4 text-xl font-semibold">Posiciones</h2>
        {loading ? <p>Cargando...</p> : null}
        {!loading && investments.length === 0 ? <p>Aun no tienes inversiones registradas.</p> : null}
        {!loading && investments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="p-2">Tipo</th>
                  <th className="p-2">Activo</th>
                  <th className="p-2">Ticker</th>
                  <th className="p-2 text-right">Cantidad</th>
                  <th className="p-2 text-right">P. medio</th>
                  <th className="p-2 text-right">P. actual</th>
                  <th className="p-2 text-right">Valor actual</th>
                </tr>
              </thead>
              <tbody>
                {investments.map((row) => {
                  const current = Number(row.current_price ?? row.average_buy_price);
                  const value = Number(row.quantity) * current;

                  return (
                    <tr key={row.id} className="border-b">
                      <td className="p-2">{ASSET_TYPE_LABELS[row.asset_type]}</td>
                      <td className="p-2">{row.asset_name}</td>
                      <td className="p-2">{row.asset_symbol ?? "-"}</td>
                      <td className="p-2 text-right">{Number(row.quantity).toFixed(6)}</td>
                      <td className="p-2 text-right">{Number(row.average_buy_price).toFixed(4)}</td>
                      <td className="p-2 text-right">{current.toFixed(4)}</td>
                      <td className="p-2 text-right">{value.toFixed(2)} EUR</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}