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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!userId) {
      setMessage("Debes iniciar sesion para anadir inversiones.");
      return;
    }

    const qty = Number(quantity);
    const avg = Number(averageBuyPrice);
    const curr = currentPrice ? Number(currentPrice) : avg;

    if (!assetName.trim()) {
      setMessage("El nombre del activo es obligatorio.");
      return;
    }

    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(avg) || avg < 0 || !Number.isFinite(curr) || curr < 0) {
      setMessage("Revisa cantidad y precios. Deben ser valores validos.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("investments").insert({
      user_id: userId,
      asset_name: assetName.trim(),
      asset_symbol: assetSymbol.trim() || null,
      asset_type: assetType,
      quantity: qty,
      average_buy_price: avg,
      current_price: curr,
      purchase_date: purchaseDate
    });

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setAssetName("");
    setAssetSymbol("");
    setQuantity("");
    setAverageBuyPrice("");
    setCurrentPrice("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));

    await loadInvestments(userId);
    setSaving(false);
  };

  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-6 md:grid-cols-2">
      <section className="rounded-lg border bg-white p-4">
        <h1 className="mb-4 text-2xl font-semibold">Portfolio Tracker</h1>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <label className="grid gap-1 text-sm">
            Tipo de activo
            <select className="rounded border p-2" value={assetType} onChange={(e) => setAssetType(e.target.value as AssetType)}>
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
              className="rounded border p-2"
              type="text"
              value={assetName}
              onChange={(e) => setAssetName(e.target.value)}
              placeholder="Ej: Apple, SP500 ETF, Bitcoin"
              required
            />
          </label>

          <label className="grid gap-1 text-sm">
            Ticker / Simbolo
            <input
              className="rounded border p-2"
              type="text"
              value={assetSymbol}
              onChange={(e) => setAssetSymbol(e.target.value.toUpperCase())}
              placeholder="Ej: AAPL, VOO, BTC"
            />
          </label>

          <label className="grid gap-1 text-sm">
            Cantidad
            <input
              className="rounded border p-2"
              type="number"
              step="0.00000001"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </label>

          <label className="grid gap-1 text-sm">
            Precio medio de compra
            <input
              className="rounded border p-2"
              type="number"
              step="0.0001"
              min="0"
              value={averageBuyPrice}
              onChange={(e) => setAverageBuyPrice(e.target.value)}
              required
            />
          </label>

          <label className="grid gap-1 text-sm">
            Precio actual
            <input
              className="rounded border p-2"
              type="number"
              step="0.0001"
              min="0"
              value={currentPrice}
              onChange={(e) => setCurrentPrice(e.target.value)}
              placeholder="Si lo dejas vacio, usa precio medio"
            />
          </label>

          <label className="grid gap-1 text-sm">
            Fecha de compra
            <input
              className="rounded border p-2"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              required
            />
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
