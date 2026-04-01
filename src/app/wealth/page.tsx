"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/supabase/use-auth-guard";
import AuthLoadingState from "@/components/auth-loading-state";
import EmptyStateCard from "@/components/empty-state-card";
import SectionHeader from "@/components/section-header";
import SideNav from "@/components/side-nav";
import { useTheme } from "@/components/theme-provider";
import { AssetCurrency, convertToEur, FALLBACK_RATES_TO_EUR } from "@/lib/currency-rates";
import { formatCurrencyByPreference, formatDateByPreference } from "@/lib/preferences-format";

type WealthAssetCategory = "real_estate" | "vehicle" | "business" | "collectible" | "other_asset";

type WealthAssetRow = {
  id: string;
  asset_name: string;
  asset_category: WealthAssetCategory;
  asset_subtype: string | null;
  currency: AssetCurrency;
  purchase_value: number;
  current_estimated_value: number;
  ownership_pct: number;
  linked_debt_id: string | null;
  include_in_net_worth: boolean;
  include_in_fire: boolean;
  valuation_date: string | null;
  notes: string | null;
};

type DebtOptionRow = {
  id: string;
  debt_name: string;
  outstanding_balance: number;
  currency: AssetCurrency | null;
  status: "active" | "paused" | "closed";
};

type ToastState = { type: "success" | "error"; text: string } | null;

const ASSET_CATEGORIES: Array<{ value: WealthAssetCategory; label: string }> = [
  { value: "real_estate", label: "Inmueble" },
  { value: "vehicle", label: "Vehiculo" },
  { value: "business", label: "Negocio" },
  { value: "collectible", label: "Coleccionable" },
  { value: "other_asset", label: "Otro bien" }
];
const WEALTH_FORM_OPEN_KEY = "wealth-form-open";

function inputClass() {
  return "w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-sm text-slate-100 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20";
}

export default function WealthPage() {
  const supabase = useMemo(() => createClient(), []);
  const { userId, authLoading } = useAuthGuard();
  const { currency, dateFormat } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [assets, setAssets] = useState<WealthAssetRow[]>([]);
  const [debts, setDebts] = useState<DebtOptionRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(true);

  const [assetName, setAssetName] = useState("");
  const [assetCategory, setAssetCategory] = useState<WealthAssetCategory>("real_estate");
  const [assetSubtype, setAssetSubtype] = useState("");
  const [assetCurrency, setAssetCurrency] = useState<AssetCurrency>("EUR");
  const [purchaseValue, setPurchaseValue] = useState("");
  const [currentEstimatedValue, setCurrentEstimatedValue] = useState("");
  const [ownershipPct, setOwnershipPct] = useState("100");
  const [linkedDebtId, setLinkedDebtId] = useState("");
  const [includeInNetWorth, setIncludeInNetWorth] = useState(true);
  const [includeInFire, setIncludeInFire] = useState(false);
  const [valuationDate, setValuationDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const showToast = useCallback((nextToast: Exclude<ToastState, null>) => {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setMessage(null);

    const [assetsResult, debtsResult] = await Promise.all([
      supabase.from("wealth_assets").select("*").eq("user_id", userId).order("asset_name", { ascending: true }),
      supabase.from("debts").select("id, debt_name, outstanding_balance, currency, status").eq("user_id", userId).neq("status", "closed").order("debt_name", { ascending: true })
    ]);

    if (assetsResult.error || debtsResult.error) {
      setMessage(assetsResult.error?.message || debtsResult.error?.message || "No se pudo cargar el patrimonio.");
      setLoading(false);
      return;
    }

    setAssets((assetsResult.data as WealthAssetRow[]) ?? []);
    setDebts((debtsResult.data as DebtOptionRow[]) ?? []);
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    if (authLoading || !userId) return;
    void loadData();
  }, [authLoading, loadData, userId]);

  useEffect(() => {
    const stored = window.localStorage.getItem(WEALTH_FORM_OPEN_KEY);
    if (stored) {
      setFormOpen(stored === "true");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(WEALTH_FORM_OPEN_KEY, String(formOpen));
  }, [formOpen]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setAssetName("");
    setAssetCategory("real_estate");
    setAssetSubtype("");
    setAssetCurrency("EUR");
    setPurchaseValue("");
    setCurrentEstimatedValue("");
    setOwnershipPct("100");
    setLinkedDebtId("");
    setIncludeInNetWorth(true);
    setIncludeInFire(false);
    setValuationDate(new Date().toISOString().slice(0, 10));
    setNotes("");
  }, []);

  const metrics = useMemo(() => {
    const totalGross = assets.reduce(
      (sum, row) => sum + convertToEur(Number(row.current_estimated_value || 0) * (Number(row.ownership_pct || 0) / 100), row.currency, FALLBACK_RATES_TO_EUR),
      0
    );
    const netWorthIncluded = assets
      .filter((row) => row.include_in_net_worth)
      .reduce(
        (sum, row) => sum + convertToEur(Number(row.current_estimated_value || 0) * (Number(row.ownership_pct || 0) / 100), row.currency, FALLBACK_RATES_TO_EUR),
        0
      );
    const fireIncluded = assets
      .filter((row) => row.include_in_fire)
      .reduce(
        (sum, row) => sum + convertToEur(Number(row.current_estimated_value || 0) * (Number(row.ownership_pct || 0) / 100), row.currency, FALLBACK_RATES_TO_EUR),
        0
      );

    return { totalGross, netWorthIncluded, fireIncluded };
  }, [assets]);

  const debtById = useMemo(() => new Map(debts.map((row) => [row.id, row])), [debts]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId) return;

    const parsedPurchase = Number(purchaseValue || 0);
    const parsedCurrent = Number(currentEstimatedValue || 0);
    const parsedOwnership = Number(ownershipPct || 0);

    if (!assetName.trim()) {
      setMessage("Introduce un nombre para el bien.");
      return;
    }

    if (![parsedPurchase, parsedCurrent, parsedOwnership].every((value) => Number.isFinite(value) && value >= 0)) {
      setMessage("Revisa valor de compra, valor actual y porcentaje de propiedad.");
      return;
    }

    if (parsedOwnership <= 0 || parsedOwnership > 100) {
      setMessage("El porcentaje de propiedad debe estar entre 0 y 100.");
      return;
    }

    setSaving(true);
    setMessage(null);

    const payload = {
      user_id: userId,
      asset_name: assetName.trim(),
      asset_category: assetCategory,
      asset_subtype: assetSubtype.trim() || null,
      currency: assetCurrency,
      purchase_value: parsedPurchase,
      current_estimated_value: parsedCurrent,
      ownership_pct: parsedOwnership,
      linked_debt_id: linkedDebtId || null,
      include_in_net_worth: includeInNetWorth,
      include_in_fire: includeInFire,
      valuation_date: valuationDate || null,
      notes: notes.trim() || null
    };

    const result = editingId
      ? await supabase.from("wealth_assets").update(payload).eq("id", editingId).eq("user_id", userId)
      : await supabase.from("wealth_assets").insert(payload);

    setSaving(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    showToast({ type: "success", text: editingId ? "Bien patrimonial actualizado." : "Bien patrimonial registrado." });
    resetForm();
    await loadData();
  };

  const handleEdit = (row: WealthAssetRow) => {
    setFormOpen(true);
    setEditingId(row.id);
    setAssetName(row.asset_name);
    setAssetCategory(row.asset_category);
    setAssetSubtype(row.asset_subtype ?? "");
    setAssetCurrency(row.currency);
    setPurchaseValue(String(row.purchase_value ?? ""));
    setCurrentEstimatedValue(String(row.current_estimated_value ?? ""));
    setOwnershipPct(String(row.ownership_pct ?? 100));
    setLinkedDebtId(row.linked_debt_id ?? "");
    setIncludeInNetWorth(row.include_in_net_worth);
    setIncludeInFire(row.include_in_fire);
    setValuationDate(row.valuation_date ?? new Date().toISOString().slice(0, 10));
    setNotes(row.notes ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (!userId || !window.confirm("Se eliminara este bien patrimonial. Deseas continuar?")) return;
    const { error } = await supabase.from("wealth_assets").delete().eq("id", id).eq("user_id", userId);
    if (error) {
      setMessage(error.message);
      return;
    }
    showToast({ type: "success", text: "Bien patrimonial eliminado." });
    if (editingId === id) resetForm();
    await loadData();
  };

  const handleToggleNetWorth = async (row: WealthAssetRow) => {
    if (!userId) return;

    const { error } = await supabase
      .from("wealth_assets")
      .update({ include_in_net_worth: !row.include_in_net_worth })
      .eq("id", row.id)
      .eq("user_id", userId);

    if (error) {
      setMessage(error.message);
      return;
    }

    showToast({
      type: "success",
      text: !row.include_in_net_worth
        ? "El bien vuelve a contar en el patrimonio neto."
        : "El bien deja de contar en el patrimonio neto."
    });
    await loadData();
  };

  const handleToggleFire = async (row: WealthAssetRow) => {
    if (!userId) return;

    const { error } = await supabase
      .from("wealth_assets")
      .update({ include_in_fire: !row.include_in_fire })
      .eq("id", row.id)
      .eq("user_id", userId);

    if (error) {
      setMessage(error.message);
      return;
    }

    showToast({
      type: "success",
      text: !row.include_in_fire
        ? "El bien vuelve a contar en la base FIRE."
        : "El bien deja de contar en la base FIRE."
    });
    await loadData();
  };

  if (authLoading || loading) {
    return (
      <>
        <SideNav />
        <main className="mx-auto max-w-6xl p-6 md:pl-72">
          <AuthLoadingState title="Preparando patrimonio" description="Estamos cargando inmuebles, vehiculos y otros bienes vinculados a tu patrimonio." />
        </main>
      </>
    );
  }

  return (
    <>
      <SideNav />
      <main className="page-enter relative z-10 mx-auto grid max-w-6xl gap-5 p-5 md:pl-72 xl:grid-cols-12">
        <section className="panel rounded-[30px] p-5 text-white md:p-7 xl:col-span-7">
          <p className="text-xs uppercase tracking-[0.26em] text-emerald-300">Patrimonio</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-white">Registra los bienes que completan tu foto real</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
            Anade inmuebles, vehiculos y otros bienes relevantes para que el patrimonio neto deje de depender solo de caja, inversiones y deuda.
          </p>
        </section>

        <section className="rounded-[30px] border border-emerald-400/10 bg-[linear-gradient(180deg,rgba(7,19,35,0.98)_0%,rgba(9,29,48,0.98)_52%,rgba(10,63,70,0.92)_100%)] p-6 text-white shadow-[0_28px_72px_rgba(2,8,23,0.56)] xl:col-span-5">
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">Resumen</p>
          <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold text-white">{formatCurrencyByPreference(metrics.netWorthIncluded, currency)}</p>
          <p className="mt-3 text-sm leading-6 text-slate-200">Valor actual de los bienes marcados para contar dentro del patrimonio neto.</p>
        </section>

        {toast ? <section className={`rounded-[24px] p-4 text-sm xl:col-span-12 ${toast.type === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-red-200 bg-red-50 text-red-800"}`}>{toast.text}</section> : null}
        {message ? <section className="rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm text-red-800 xl:col-span-12">{message}</section> : null}

        <section className="panel rounded-[28px] p-5 text-white self-start xl:col-span-5">
          <details className="group" open={formOpen} onToggle={(event) => setFormOpen(event.currentTarget.open)}>
            <summary className="accordion-summary cursor-pointer list-none !flex-col !items-start !gap-3">
              <div className="accordion-summary-main w-full min-w-0">
                <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Formulario</p>
                <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">{editingId ? "Editar bien" : "Nuevo bien"}</h2>
              </div>
              <div className="accordion-summary-side !w-full !justify-between">
                <span className="accordion-metric">{editingId ? "Edicion" : "Alta"}</span>
                <span className="accordion-chevron" aria-hidden="true">v</span>
              </div>
            </summary>
            <form className="accordion-content mt-6 grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-2 text-sm text-slate-200">
              Nombre
              <input className={inputClass()} value={assetName} onChange={(event) => setAssetName(event.target.value)} placeholder="Ej: Vivienda Madrid, Coche familiar" />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-200">
                Tipo
                <select className={inputClass()} value={assetCategory} onChange={(event) => setAssetCategory(event.target.value as WealthAssetCategory)}>
                  {ASSET_CATEGORIES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm text-slate-200">
                Subtipo
                <input className={inputClass()} value={assetSubtype} onChange={(event) => setAssetSubtype(event.target.value)} placeholder="Ej: Vivienda habitual, Plaza garaje" />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-200">
                Moneda
                <select className={inputClass()} value={assetCurrency} onChange={(event) => setAssetCurrency(event.target.value as AssetCurrency)}>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="DKK">DKK</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm text-slate-200">
                % propiedad
                <input className={inputClass()} type="number" min="0" max="100" step="0.01" value={ownershipPct} onChange={(event) => setOwnershipPct(event.target.value)} />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-200">
                Valor de compra
                <input className={inputClass()} type="number" min="0" step="0.01" value={purchaseValue} onChange={(event) => setPurchaseValue(event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm text-slate-200">
                Valor actual estimado
                <input className={inputClass()} type="number" min="0" step="0.01" value={currentEstimatedValue} onChange={(event) => setCurrentEstimatedValue(event.target.value)} />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-200">
                Deuda vinculada
                <select className={inputClass()} value={linkedDebtId} onChange={(event) => setLinkedDebtId(event.target.value)}>
                  <option value="">Sin deuda vinculada</option>
                  {debts.map((row) => (
                    <option key={row.id} value={row.id}>{row.debt_name}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm text-slate-200">
                Fecha de valoracion
                <input className={inputClass()} type="date" value={valuationDate} onChange={(event) => setValuationDate(event.target.value)} />
              </label>
            </div>
            <label className="grid gap-2 text-sm text-slate-200">
              Notas
              <textarea className={`${inputClass()} min-h-[88px]`} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            <div className="grid gap-3 rounded-3xl border border-white/8 bg-white/5 p-4 text-sm text-slate-200">
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={includeInNetWorth} onChange={(event) => setIncludeInNetWorth(event.target.checked)} />
                <span>Contar en patrimonio neto</span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={includeInFire} onChange={(event) => setIncludeInFire(event.target.checked)} />
                <span>Contar tambien en FIRE</span>
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50" disabled={saving} type="submit">
                {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear bien"}
              </button>
              {editingId ? (
                <button type="button" onClick={resetForm} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-100 hover:bg-white/10">
                  Cancelar
                </button>
              ) : null}
            </div>
            </form>
          </details>
        </section>

        <section className="grid gap-4 xl:col-span-7 md:grid-cols-3">
          <article className="kpi-card rounded-[26px] p-6 text-white">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Valor bruto</p>
            <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(metrics.totalGross, currency)}</p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Suma de todos los bienes registrados con su porcentaje de propiedad.</p>
          </article>
          <article className="kpi-card rounded-[26px] p-6 text-white">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Patrimonio neto</p>
            <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(metrics.netWorthIncluded, currency)}</p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Bienes que has decidido incluir dentro del patrimonio neto.</p>
          </article>
          <article className="kpi-card rounded-[26px] p-6 text-white">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Incluidos en FIRE</p>
            <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(metrics.fireIncluded, currency)}</p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Bienes que tambien quieres considerar en la base FIRE.</p>
          </article>
        </section>

        <section className="panel rounded-[28px] p-5 text-white xl:col-span-12">
          <SectionHeader eyebrow="Detalle" title="Tus bienes patrimoniales" description="Valor bruto, deuda vinculada y valor neto estimado de cada bien." />
          {assets.length === 0 ? (
            <div className="mt-6">
              <EmptyStateCard
                eyebrow="Sin bienes"
                title="Todavia no has registrado inmuebles ni otros bienes"
                description="Cuando anadas bienes, el dashboard, la revision mensual y FIRE podran reflejar mejor tu patrimonio real."
                actionLabel="Crear primer bien"
                actionHref="/wealth"
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-4">
              {assets.map((row) => {
                const currentValueEur = convertToEur(Number(row.current_estimated_value || 0) * (Number(row.ownership_pct || 0) / 100), row.currency, FALLBACK_RATES_TO_EUR);
                const purchaseValueEur = convertToEur(Number(row.purchase_value || 0) * (Number(row.ownership_pct || 0) / 100), row.currency, FALLBACK_RATES_TO_EUR);
                const linkedDebt = row.linked_debt_id ? debtById.get(row.linked_debt_id) ?? null : null;
                const linkedDebtEur = linkedDebt ? convertToEur(Number(linkedDebt.outstanding_balance || 0), linkedDebt.currency, FALLBACK_RATES_TO_EUR) : 0;
                const netEquity = Math.max(currentValueEur - linkedDebtEur, 0);
                return (
                  <article key={row.id} className="rounded-[24px] border border-white/8 bg-white/5 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">{ASSET_CATEGORIES.find((item) => item.value === row.asset_category)?.label ?? row.asset_category}</p>
                        <h3 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">{row.asset_name}</h3>
                        <p className="mt-2 text-sm text-slate-300">
                          {row.asset_subtype?.trim() || "Sin subtipo"} · {row.ownership_pct.toFixed(0)}% propiedad
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleToggleNetWorth(row)}
                          className={`rounded-full border px-3 py-1.5 text-xs transition ${row.include_in_net_worth ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20" : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"}`}
                        >
                          {row.include_in_net_worth ? "Conectado al patrimonio" : "Fuera de patrimonio"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleFire(row)}
                          className={`rounded-full border px-3 py-1.5 text-xs transition ${row.include_in_fire ? "border-sky-400/20 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20" : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"}`}
                        >
                          {row.include_in_fire ? "Conectado a FIRE" : "Fuera de FIRE"}
                        </button>
                        <button type="button" onClick={() => handleEdit(row)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white hover:bg-white/10">
                          Editar
                        </button>
                        <button type="button" onClick={() => void handleDelete(row.id)} className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/20">
                          Eliminar
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-white/8 bg-slate-950/50 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Valor actual</p>
                        <p className="mt-2 text-lg font-semibold text-white">{formatCurrencyByPreference(currentValueEur, currency)}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatCurrencyByPreference(Number(row.current_estimated_value || 0), row.currency)} bruto</p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-slate-950/50 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Valor compra</p>
                        <p className="mt-2 text-lg font-semibold text-white">{formatCurrencyByPreference(purchaseValueEur, currency)}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatCurrencyByPreference(Number(row.purchase_value || 0), row.currency)} bruto</p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-slate-950/50 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Valor neto</p>
                        <p className="mt-2 text-lg font-semibold text-white">{formatCurrencyByPreference(netEquity, currency)}</p>
                        <p className="mt-1 text-xs text-slate-500">{linkedDebt ? `Deuda vinculada: ${linkedDebt.debt_name}` : "Sin deuda vinculada"}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
                      <p>Fecha de valoracion: <span className="font-medium text-white">{row.valuation_date ? formatDateByPreference(row.valuation_date, dateFormat) : "Sin fecha"}</span></p>
                      <p>Deuda vinculada: <span className="font-medium text-white">{linkedDebt ? `${linkedDebt.debt_name} (${formatCurrencyByPreference(linkedDebtEur, currency)})` : "Ninguna"}</span></p>
                    </div>
                    {row.notes ? <p className="mt-3 text-sm leading-6 text-slate-300">{row.notes}</p> : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
