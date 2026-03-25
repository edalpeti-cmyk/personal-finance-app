"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/supabase/use-auth-guard";
import AuthLoadingState from "@/components/auth-loading-state";
import EmptyStateCard from "@/components/empty-state-card";
import SectionHeader from "@/components/section-header";
import SideNav from "@/components/side-nav";
import { useTheme } from "@/components/theme-provider";
import { AssetCurrency, convertToEur, FALLBACK_RATES_TO_EUR } from "@/lib/currency-rates";
import { formatCurrencyByPreference, formatDateByPreference } from "@/lib/preferences-format";

type DebtType = "credit_card" | "personal_loan" | "mortgage" | "credit_line" | "family_loan" | "auto_loan" | "other";
type DebtStatus = "active" | "paused" | "closed";

type DebtRow = {
  id: string;
  debt_name: string;
  debt_type: DebtType;
  lender: string | null;
  currency: AssetCurrency;
  original_amount: number;
  outstanding_balance: number;
  interest_rate: number;
  monthly_payment: number;
  start_date: string | null;
  target_end_date: string | null;
  status: DebtStatus;
  include_in_net_worth: boolean;
  notes: string | null;
};

type IncomeRow = {
  amount: number;
  income_date: string;
};
type BudgetRow = {
  category: string;
  budget_amount: number;
  month: string;
};
type DebtBudgetCategoryLinkRow = {
  debt_id: string;
  category: string;
};
type DebtBudgetApplicationRow = {
  debt_id: string;
  application_month: string;
  applied_amount: number;
};

type ToastState = { type: "success" | "error"; text: string } | null;

const DEBT_TYPES: Array<{ value: DebtType; label: string }> = [
  { value: "credit_card", label: "Tarjeta de credito" },
  { value: "personal_loan", label: "Prestamo personal" },
  { value: "mortgage", label: "Hipoteca" },
  { value: "credit_line", label: "Linea de credito" },
  { value: "family_loan", label: "Prestamo familiar" },
  { value: "auto_loan", label: "Financiacion coche" },
  { value: "other", label: "Otra deuda" }
];

const DEBT_STATUSES: Array<{ value: DebtStatus; label: string }> = [
  { value: "active", label: "Activa" },
  { value: "paused", label: "Pausada" },
  { value: "closed", label: "Cerrada" }
];

function inputClass() {
  return "w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-sm text-slate-100 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20";
}

function isCurrentMonth(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

export default function DebtsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { userId, authLoading } = useAuthGuard();
  const { currency, dateFormat } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([]);
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>([]);
  const [debtBudgetCategoryLinks, setDebtBudgetCategoryLinks] = useState<DebtBudgetCategoryLinkRow[]>([]);
  const [debtBudgetApplications, setDebtBudgetApplications] = useState<DebtBudgetApplicationRow[]>([]);
  const [budgetCategories, setBudgetCategories] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [debtName, setDebtName] = useState("");
  const [debtType, setDebtType] = useState<DebtType>("credit_card");
  const [lender, setLender] = useState("");
  const [debtCurrency, setDebtCurrency] = useState<AssetCurrency>("EUR");
  const [originalAmount, setOriginalAmount] = useState("");
  const [outstandingBalance, setOutstandingBalance] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [monthlyPayment, setMonthlyPayment] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetEndDate, setTargetEndDate] = useState("");
  const [status, setStatus] = useState<DebtStatus>("active");
  const [notes, setNotes] = useState("");
  const [selectedLinkedBudgetCategories, setSelectedLinkedBudgetCategories] = useState<string[]>([]);
  const [budgetCategoriesDropdownOpen, setBudgetCategoriesDropdownOpen] = useState(false);
  const [budgetCategorySearch, setBudgetCategorySearch] = useState("");
  const [applyingBudgetDebtId, setApplyingBudgetDebtId] = useState<string | null>(null);
  const budgetCategoriesDropdownRef = useRef<HTMLDivElement | null>(null);

  const showToast = useCallback((nextToast: Exclude<ToastState, null>) => {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const loadData = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setMessage(null);

    const [debtResult, incomeResult, budgetsResult, debtBudgetLinksResult, debtBudgetApplicationsResult] = await Promise.all([
      supabase.from("debts").select("*").eq("user_id", userId).order("status", { ascending: true }).order("debt_name", { ascending: true }),
      supabase.from("income").select("amount, income_date").eq("user_id", userId),
      supabase.from("monthly_budgets").select("category, budget_amount, month").eq("user_id", userId),
      supabase.from("debt_budget_category_links").select("debt_id, category").eq("user_id", userId),
      supabase.from("debt_budget_applications").select("debt_id, application_month, applied_amount").eq("user_id", userId)
    ]);

    if (debtResult.error || incomeResult.error || budgetsResult.error || debtBudgetLinksResult.error || debtBudgetApplicationsResult.error) {
      setMessage(debtResult.error?.message || incomeResult.error?.message || budgetsResult.error?.message || debtBudgetLinksResult.error?.message || debtBudgetApplicationsResult.error?.message || "No se pudo cargar la deuda.");
      setLoading(false);
      return;
    }

    setDebts((debtResult.data as DebtRow[] | null) ?? []);
    setIncomeRows((incomeResult.data as IncomeRow[] | null) ?? []);
    setBudgetRows((budgetsResult.data as BudgetRow[] | null) ?? []);
    setBudgetCategories(
      Array.from(new Set((((budgetsResult.data as BudgetRow[] | null) ?? []).map((row) => row.category.trim()).filter(Boolean)))).sort((a, b) => a.localeCompare(b, "es"))
    );
    setDebtBudgetCategoryLinks((debtBudgetLinksResult.data as DebtBudgetCategoryLinkRow[] | null) ?? []);
    setDebtBudgetApplications((debtBudgetApplicationsResult.data as DebtBudgetApplicationRow[] | null) ?? []);
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    if (authLoading || !userId) return;
    void loadData();
  }, [authLoading, loadData, userId]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setDebtName("");
    setDebtType("credit_card");
    setLender("");
    setDebtCurrency("EUR");
    setOriginalAmount("");
    setOutstandingBalance("");
    setInterestRate("");
    setMonthlyPayment("");
    setStartDate("");
    setTargetEndDate("");
    setStatus("active");
    setNotes("");
    setSelectedLinkedBudgetCategories([]);
    setBudgetCategoriesDropdownOpen(false);
    setBudgetCategorySearch("");
  }, []);

  const debtMetrics = useMemo(() => {
    const activeDebts = debts.filter((row) => row.status !== "closed" && row.include_in_net_worth);
    const debtTotal = activeDebts.reduce((sum, row) => sum + convertToEur(Number(row.outstanding_balance || 0), row.currency, FALLBACK_RATES_TO_EUR), 0);
    const monthlyBurden = activeDebts.reduce((sum, row) => sum + convertToEur(Number(row.monthly_payment || 0), row.currency, FALLBACK_RATES_TO_EUR), 0);
    const weightedInterestBase = activeDebts.reduce((sum, row) => sum + convertToEur(Number(row.outstanding_balance || 0), row.currency, FALLBACK_RATES_TO_EUR), 0);
    const weightedInterest = activeDebts.reduce((sum, row) => {
      const balanceEur = convertToEur(Number(row.outstanding_balance || 0), row.currency, FALLBACK_RATES_TO_EUR);
      return sum + balanceEur * Number(row.interest_rate || 0);
    }, 0);
    const currentMonthIncome = incomeRows.filter((row) => isCurrentMonth(row.income_date)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const paymentToIncomeRatio = currentMonthIncome > 0 ? (monthlyBurden / currentMonthIncome) * 100 : null;

    return {
      activeCount: activeDebts.length,
      debtTotal,
      disconnectedDebtTotal: debts
        .filter((row) => row.status !== "closed" && !row.include_in_net_worth)
        .reduce((sum, row) => sum + convertToEur(Number(row.outstanding_balance || 0), row.currency, FALLBACK_RATES_TO_EUR), 0),
      combinedDebtTotal: debts
        .filter((row) => row.status !== "closed")
        .reduce((sum, row) => sum + convertToEur(Number(row.outstanding_balance || 0), row.currency, FALLBACK_RATES_TO_EUR), 0),
      monthlyBurden,
      weightedInterest: weightedInterestBase > 0 ? weightedInterest / weightedInterestBase : 0,
      paymentToIncomeRatio
    };
  }, [debts, incomeRows]);
  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const currentApplicationMonth = useMemo(() => `${currentMonth}-01`, [currentMonth]);
  const currentMonthBudgetByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of budgetRows) {
      if (row.month.slice(0, 7) !== currentMonth) continue;
      const category = row.category.trim();
      if (!category) continue;
      map.set(category, (map.get(category) ?? 0) + Number(row.budget_amount || 0));
    }
    return map;
  }, [budgetRows, currentMonth]);
  const linkedBudgetCategoriesByDebt = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of debtBudgetCategoryLinks) {
      const current = map.get(row.debt_id) ?? [];
      if (!current.includes(row.category)) current.push(row.category);
      map.set(row.debt_id, current);
    }
    return map;
  }, [debtBudgetCategoryLinks]);
  const linkedBudgetAmountByDebt = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of debts) {
      const categories = linkedBudgetCategoriesByDebt.get(row.id) ?? [];
      const total = categories.reduce((sum, category) => sum + Number(currentMonthBudgetByCategory.get(category) ?? 0), 0);
      map.set(row.id, total);
    }
    return map;
  }, [currentMonthBudgetByCategory, debts, linkedBudgetCategoriesByDebt]);
  const currentMonthDebtBudgetApplications = useMemo(() => {
    const map = new Map<string, DebtBudgetApplicationRow>();
    for (const row of debtBudgetApplications) {
      if (row.application_month.slice(0, 7) !== currentMonth) continue;
      map.set(row.debt_id, row);
    }
    return map;
  }, [currentMonth, debtBudgetApplications]);
  const selectedBudgetCategoriesLabel = useMemo(() => {
    if (selectedLinkedBudgetCategories.length === 0) return "Sin partidas conectadas";
    if (selectedLinkedBudgetCategories.length <= 2) return selectedLinkedBudgetCategories.join(", ");
    return `${selectedLinkedBudgetCategories.length} partidas seleccionadas`;
  }, [selectedLinkedBudgetCategories]);
  const filteredBudgetCategories = useMemo(() => {
    const query = budgetCategorySearch.trim().toLowerCase();
    if (!query) return budgetCategories;
    return budgetCategories.filter((category) => category.toLowerCase().includes(query));
  }, [budgetCategories, budgetCategorySearch]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (budgetCategoriesDropdownRef.current && target && !budgetCategoriesDropdownRef.current.contains(target)) {
        setBudgetCategoriesDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId) return;

    const parsedOriginal = Number(originalAmount || 0);
    const parsedOutstanding = Number(outstandingBalance || 0);
    const parsedInterest = Number(interestRate || 0);
    const parsedMonthly = Number(monthlyPayment || 0);

    if (!debtName.trim()) {
      setMessage("Introduce un nombre para la deuda.");
      return;
    }

    if (![parsedOriginal, parsedOutstanding, parsedInterest, parsedMonthly].every((value) => Number.isFinite(value) && value >= 0)) {
      setMessage("Revisa importes, cuota e interes.");
      return;
    }

    setSaving(true);
    setMessage(null);

    const payload = {
      user_id: userId,
      debt_name: debtName.trim(),
      debt_type: debtType,
      lender: lender.trim() || null,
      currency: debtCurrency,
      original_amount: parsedOriginal,
      outstanding_balance: parsedOutstanding,
      interest_rate: parsedInterest,
      monthly_payment: parsedMonthly,
      start_date: startDate || null,
      target_end_date: targetEndDate || null,
      status,
      notes: notes.trim() || null,
      include_in_net_worth: editingId ? debts.find((row) => row.id === editingId)?.include_in_net_worth ?? true : true
    };

    const result = editingId
      ? await supabase.from("debts").update(payload).eq("id", editingId).eq("user_id", userId).select("id")
      : await supabase.from("debts").insert(payload).select("id");

    setSaving(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    const debtId = editingId ?? (Array.isArray(result.data) ? result.data[0]?.id : undefined);
    if (debtId) {
      await supabase.from("debt_budget_category_links").delete().eq("debt_id", debtId).eq("user_id", userId);
      if (selectedLinkedBudgetCategories.length > 0) {
        const { error: debtBudgetLinksError } = await supabase.from("debt_budget_category_links").insert(
          selectedLinkedBudgetCategories.map((category) => ({
            debt_id: debtId,
            category,
            user_id: userId
          }))
        );
        if (debtBudgetLinksError) {
          setMessage(debtBudgetLinksError.message);
          showToast({ type: "error", text: "La deuda se guardo, pero fallo la vinculacion con partidas del presupuesto." });
          return;
        }
      }
    }

    showToast({
      type: "success",
      text: editingId ? "Deuda actualizada correctamente." : "Deuda registrada correctamente."
    });
    resetForm();
    await loadData();
  };

  const handleEdit = (row: DebtRow) => {
    setEditingId(row.id);
    setDebtName(row.debt_name);
    setDebtType(row.debt_type);
    setLender(row.lender ?? "");
    setDebtCurrency(row.currency);
    setOriginalAmount(String(row.original_amount ?? ""));
    setOutstandingBalance(String(row.outstanding_balance ?? ""));
    setInterestRate(String(row.interest_rate ?? ""));
    setMonthlyPayment(String(row.monthly_payment ?? ""));
    setStartDate(row.start_date ?? "");
    setTargetEndDate(row.target_end_date ?? "");
    setStatus(row.status);
    setNotes(row.notes ?? "");
    setSelectedLinkedBudgetCategories(linkedBudgetCategoriesByDebt.get(row.id) ?? []);
    setBudgetCategoriesDropdownOpen(false);
    setBudgetCategorySearch("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (!userId || !window.confirm("Se eliminara esta deuda. Deseas continuar?")) return;
    const { error } = await supabase.from("debts").delete().eq("id", id).eq("user_id", userId);
    if (error) {
      setMessage(error.message);
      return;
    }
    showToast({ type: "success", text: "Deuda eliminada." });
    if (editingId === id) resetForm();
    await loadData();
  };

  const handleToggleNetWorthConnection = async (row: DebtRow) => {
    if (!userId) return;

    const { error } = await supabase
      .from("debts")
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
        ? "La deuda vuelve a contar en el patrimonio neto."
        : "La deuda deja de descontar patrimonio neto."
    });
    await loadData();
  };
  const handleApplyPlannedContribution = async (row: DebtRow) => {
    if (!userId) return;

    const plannedContribution = Number(linkedBudgetAmountByDebt.get(row.id) ?? 0);
    const existingApplication = currentMonthDebtBudgetApplications.get(row.id);
    if (plannedContribution <= 0) {
      showToast({ type: "error", text: "No hay aportacion planificada este mes para esta deuda." });
      return;
    }
    if (existingApplication) {
      showToast({ type: "error", text: "Esta aportacion planificada ya se aplico este mes." });
      return;
    }

    setApplyingBudgetDebtId(row.id);
    setMessage(null);

    const appliedAmount = Math.min(plannedContribution, Number(row.outstanding_balance || 0));
    const nextOutstanding = Math.max(Number(row.outstanding_balance || 0) - appliedAmount, 0);

    const { error: updateDebtError } = await supabase
      .from("debts")
      .update({ outstanding_balance: Number(nextOutstanding.toFixed(2)) })
      .eq("id", row.id)
      .eq("user_id", userId);

    if (updateDebtError) {
      setMessage(updateDebtError.message);
      setApplyingBudgetDebtId(null);
      return;
    }

    const { error: applicationError } = await supabase
      .from("debt_budget_applications")
      .upsert(
        {
          debt_id: row.id,
          user_id: userId,
          application_month: currentApplicationMonth,
          applied_amount: Number(appliedAmount.toFixed(2))
        },
        { onConflict: "debt_id,application_month" }
      );

    if (applicationError) {
      setMessage(applicationError.message);
      setApplyingBudgetDebtId(null);
      return;
    }

    showToast({
      type: "success",
      text: appliedAmount < plannedContribution
        ? "Aportacion aplicada. La deuda ha llegado a 0 y el resto queda sin usar."
        : "Aportacion planificada aplicada a la deuda."
    });
    await loadData();
    setApplyingBudgetDebtId(null);
  };

  if (authLoading || loading) {
    return (
      <>
        <SideNav />
        <main className="mx-auto max-w-6xl p-6 md:pl-72">
          <AuthLoadingState title="Preparando deuda" description="Estamos cargando tus prestamos, tarjetas e hipotecas." />
        </main>
      </>
    );
  }

  return (
    <>
      <SideNav />
      <main className="page-enter relative z-10 mx-auto grid max-w-6xl gap-5 p-5 md:pl-72 xl:grid-cols-12">
        <section className="panel rounded-[30px] p-5 text-white md:p-7 xl:col-span-7">
          <p className="text-xs uppercase tracking-[0.26em] text-emerald-300">Deuda</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-white">Controla lo que resta a tu patrimonio</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
            Registra tarjetas, prestamos e hipotecas para que el patrimonio neto, FIRE y la revision mensual hablen con los datos reales.
          </p>
        </section>

        <section className="rounded-[30px] border border-emerald-400/10 bg-[linear-gradient(180deg,rgba(7,19,35,0.98)_0%,rgba(9,29,48,0.98)_52%,rgba(10,63,70,0.92)_100%)] p-6 text-white shadow-[0_28px_72px_rgba(2,8,23,0.56)] xl:col-span-5">
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">Resumen</p>
          <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold text-white">{formatCurrencyByPreference(debtMetrics.debtTotal, currency)}</p>
          <p className="mt-3 text-sm leading-6 text-slate-200">Saldo pendiente total de tus deudas activas o pausadas conectadas al patrimonio neto.</p>
        </section>

        {toast ? (
          <section className={`rounded-[24px] p-4 text-sm md:col-span-2 xl:col-span-12 ${toast.type === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-red-200 bg-red-50 text-red-800"}`}>
            {toast.text}
          </section>
        ) : null}

        {message ? <section className="rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm text-red-800 md:col-span-2 xl:col-span-12">{message}</section> : null}

        <section className="panel rounded-[28px] p-5 text-white xl:col-span-5">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Formulario</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">{editingId ? "Editar deuda" : "Nueva deuda"}</h2>
          <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-2 text-sm text-slate-200">
              Nombre
              <input className={inputClass()} value={debtName} onChange={(event) => setDebtName(event.target.value)} placeholder="Ej: Hipoteca BBVA, Tarjeta Visa" />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-200">
                Tipo
                <select className={inputClass()} value={debtType} onChange={(event) => setDebtType(event.target.value as DebtType)}>
                  {DEBT_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm text-slate-200">
                Estado
                <select className={inputClass()} value={status} onChange={(event) => setStatus(event.target.value as DebtStatus)}>
                  {DEBT_STATUSES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-200">
                Entidad o acreedor
                <input className={inputClass()} value={lender} onChange={(event) => setLender(event.target.value)} placeholder="Ej: Santander, familiar" />
              </label>
              <label className="grid gap-2 text-sm text-slate-200">
                Moneda
                <select className={inputClass()} value={debtCurrency} onChange={(event) => setDebtCurrency(event.target.value as AssetCurrency)}>
                  {["EUR", "USD", "GBP", "DKK"].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-200">
                Importe original
                <input className={inputClass()} type="number" min="0" step="0.01" value={originalAmount} onChange={(event) => setOriginalAmount(event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm text-slate-200">
                Saldo pendiente
                <input className={inputClass()} type="number" min="0" step="0.01" value={outstandingBalance} onChange={(event) => setOutstandingBalance(event.target.value)} />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-200">
                Interes anual (%)
                <input className={inputClass()} type="number" min="0" max="100" step="0.01" value={interestRate} onChange={(event) => setInterestRate(event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm text-slate-200">
                Cuota mensual
                <input className={inputClass()} type="number" min="0" step="0.01" value={monthlyPayment} onChange={(event) => setMonthlyPayment(event.target.value)} />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-200">
                Fecha de inicio
                <input className={inputClass()} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm text-slate-200">
                Fecha objetivo
                <input className={inputClass()} type="date" value={targetEndDate} onChange={(event) => setTargetEndDate(event.target.value)} />
              </label>
            </div>
            <label className="grid gap-2 text-sm text-slate-200">
              Notas
              <textarea className={`${inputClass()} min-h-24 resize-y`} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional" />
            </label>
            <div ref={budgetCategoriesDropdownRef} className="relative grid gap-2 text-sm text-slate-200">
              <span>Partidas del presupuesto conectadas</span>
              <button
                type="button"
                onClick={() => setBudgetCategoriesDropdownOpen((current) => !current)}
                className={`${inputClass()} flex min-w-0 items-center justify-between text-left`}
              >
                <span className="min-w-0 truncate">{selectedBudgetCategoriesLabel}</span>
                <span className="text-slate-400">{budgetCategoriesDropdownOpen ? "▲" : "▼"}</span>
              </button>
              {budgetCategoriesDropdownOpen ? (
                <div className="mt-2 max-h-64 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl shadow-slate-950/50">
                  <div className="sticky top-0 z-10 rounded-xl border border-white/10 bg-slate-950/95 p-2">
                    <div className="mb-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedLinkedBudgetCategories(filteredBudgetCategories)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
                      >
                        Seleccionar todo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedLinkedBudgetCategories([]);
                          setBudgetCategorySearch("");
                        }}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
                      >
                        Limpiar
                      </button>
                    </div>
                    <input
                      className={inputClass()}
                      value={budgetCategorySearch}
                      onChange={(event) => setBudgetCategorySearch(event.target.value)}
                      placeholder="Buscar partida del presupuesto"
                    />
                  </div>
                  <div className="grid gap-1">
                    {filteredBudgetCategories.map((budgetCategory) => {
                      const selected = selectedLinkedBudgetCategories.includes(budgetCategory);
                      return (
                        <button
                          key={budgetCategory}
                          type="button"
                          onClick={() =>
                            setSelectedLinkedBudgetCategories((current) =>
                              current.includes(budgetCategory)
                                ? current.filter((item) => item !== budgetCategory)
                                : [...current, budgetCategory]
                            )
                          }
                          className="flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/5"
                        >
                          <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${selected ? "border-emerald-300 bg-emerald-400/15 text-emerald-200" : "border-white/20 text-transparent"}`}>
                            ✓
                          </span>
                          <span>{budgetCategory}</span>
                        </button>
                      );
                    })}
                    {filteredBudgetCategories.length === 0 ? <div className="px-3 py-2 text-sm text-slate-400">No hay partidas que coincidan con la busqueda.</div> : null}
                  </div>
                </div>
              ) : null}
              <span className="text-xs text-slate-400">Estas partidas se trataran como aportacion planificada mensual a la deuda y tambien se heredaran en metas conectadas a ella.</span>
              {selectedLinkedBudgetCategories.length > 0 ? (
                <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                  {selectedLinkedBudgetCategories.map((budgetCategory) => (
                    <span key={`debt-budget-category-chip-${budgetCategory}`} className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">
                      {budgetCategory}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50" disabled={saving} type="submit">
                {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear deuda"}
              </button>
              {editingId ? (
                <button type="button" onClick={resetForm} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-100 hover:bg-white/10">
                  Cancelar edicion
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="grid gap-4 xl:col-span-7 md:grid-cols-2">
          <article className="kpi-card rounded-[26px] p-6 text-white">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Deuda total</p>
            <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(debtMetrics.debtTotal, currency)}</p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Saldo pendiente consolidado de las deudas abiertas.</p>
          </article>
          <article className="kpi-card rounded-[26px] p-6 text-white">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Cuota mensual</p>
            <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{formatCurrencyByPreference(debtMetrics.monthlyBurden, currency)}</p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Carga fija mensual actual de toda la deuda activa o pausada.</p>
          </article>
          <article className="kpi-card rounded-[26px] p-6 text-white">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Aporte planificado</p>
            <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">
              {formatCurrencyByPreference(
                debts
                  .filter((row) => row.status !== "closed")
                  .reduce((sum, row) => sum + Number(linkedBudgetAmountByDebt.get(row.id) ?? 0), 0),
                currency
              )}
            </p>
            <p className="mt-4 max-w-[28ch] text-sm leading-6 text-slate-300">Suma de partidas del presupuesto conectadas directamente a deudas este mes.</p>
          </article>
          <article className="kpi-card rounded-[26px] p-6 text-white">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Conectadas y no conectadas</p>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Conectadas</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatCurrencyByPreference(debtMetrics.debtTotal, currency)}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">No conectadas</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatCurrencyByPreference(debtMetrics.disconnectedDebtTotal, currency)}</p>
              </div>
              <div className="rounded-2xl border border-emerald-400/10 bg-emerald-500/5 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-200">Total combinado</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatCurrencyByPreference(debtMetrics.combinedDebtTotal, currency)}</p>
              </div>
            </div>
            <p className="mt-4 max-w-[28ch] text-sm leading-6 text-slate-300">Te ayuda a distinguir lo que ya descuenta patrimonio neto de lo que has dejado fuera.</p>
          </article>
          <article className="kpi-card rounded-[26px] p-6 text-white">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Interes medio</p>
            <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">{debtMetrics.weightedInterest.toFixed(2)}%</p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Media ponderada segun el saldo pendiente de cada deuda.</p>
          </article>
          <article className="kpi-card rounded-[26px] p-6 text-white">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Cuota / ingresos</p>
            <p className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-none text-white">
              {debtMetrics.paymentToIncomeRatio === null ? "Sin base" : `${debtMetrics.paymentToIncomeRatio.toFixed(1)}%`}
            </p>
            <p className="mt-4 max-w-[24ch] text-sm leading-6 text-slate-300">Ratio entre cuota mensual total e ingresos del mes actual.</p>
          </article>
        </section>

        <section className="panel rounded-[28px] p-5 text-white xl:col-span-12">
          <SectionHeader eyebrow="Detalle" title="Tus deudas registradas" description="Aqui tienes el saldo pendiente, la cuota y el calendario estimado de cada posicion de deuda." />

          {debts.length === 0 ? (
            <div className="mt-5">
              <EmptyStateCard
                eyebrow="Sin deuda"
                title="Todavia no has registrado prestamos ni tarjetas"
                description="Cuando anadas deuda, el dashboard, FIRE y la revision mensual pasaran a usar patrimonio neto real."
                actionLabel="Crear primera deuda"
                actionHref="/debts"
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-4">
              {debts.map((row) => {
                const outstandingEur = convertToEur(Number(row.outstanding_balance || 0), row.currency, FALLBACK_RATES_TO_EUR);
                const monthlyEur = convertToEur(Number(row.monthly_payment || 0), row.currency, FALLBACK_RATES_TO_EUR);
                const plannedContribution = Number(linkedBudgetAmountByDebt.get(row.id) ?? 0);
                const linkedBudgetCategories = linkedBudgetCategoriesByDebt.get(row.id) ?? [];
                const appliedBudgetContribution = Number(currentMonthDebtBudgetApplications.get(row.id)?.applied_amount ?? 0);
                const plannedAlreadyApplied = currentMonthDebtBudgetApplications.has(row.id);
                const progressPct = Number(row.original_amount || 0) > 0
                  ? Math.max(0, Math.min(((Number(row.original_amount) - Number(row.outstanding_balance || 0)) / Number(row.original_amount)) * 100, 100))
                  : 0;

                return (
                  <article key={row.id} className="rounded-[24px] border border-white/8 bg-white/5 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">{DEBT_TYPES.find((item) => item.value === row.debt_type)?.label ?? row.debt_type}</p>
                        <h3 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">{row.debt_name}</h3>
                        <p className="mt-2 text-sm text-slate-300">
                          {row.lender?.trim() || "Sin entidad"} · {row.status === "active" ? "Activa" : row.status === "paused" ? "Pausada" : "Cerrada"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleApplyPlannedContribution(row)}
                          disabled={applyingBudgetDebtId === row.id || plannedContribution <= 0 || plannedAlreadyApplied || row.status === "closed"}
                          className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {applyingBudgetDebtId === row.id ? "Aplicando..." : plannedAlreadyApplied ? "Aplicada este mes" : "Aplicar aportacion planificada"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleNetWorthConnection(row)}
                          className={`rounded-full border px-3 py-1.5 text-xs transition ${
                            row.include_in_net_worth
                              ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                              : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                          }`}
                        >
                          {row.include_in_net_worth ? "Conectada al patrimonio" : "No conectada al patrimonio"}
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
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Saldo pendiente</p>
                        <p className="mt-2 text-lg font-semibold text-white">{formatCurrencyByPreference(outstandingEur, currency)}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatCurrencyByPreference(Number(row.outstanding_balance || 0), row.currency)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-slate-950/50 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Cuota mensual</p>
                        <p className="mt-2 text-lg font-semibold text-white">{formatCurrencyByPreference(monthlyEur, currency)}</p>
                        <p className="mt-1 text-xs text-slate-500">{row.interest_rate.toFixed(2)}% TIN</p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-slate-950/50 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Amortizado</p>
                        <p className="mt-2 text-lg font-semibold text-white">{progressPct.toFixed(1)}%</p>
                        <p className="mt-1 text-xs text-slate-500">Original: {formatCurrencyByPreference(Number(row.original_amount || 0), row.currency)}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
                      <p>Inicio: <span className="font-medium text-white">{row.start_date ? formatDateByPreference(row.start_date, dateFormat) : "Sin fecha"}</span></p>
                      <p>Objetivo fin: <span className="font-medium text-white">{row.target_end_date ? formatDateByPreference(row.target_end_date, dateFormat) : "Sin fecha"}</span></p>
                      <p>Patrimonio neto: <span className="font-medium text-white">{row.include_in_net_worth ? "Conectada" : "Ignorada"}</span></p>
                      <p>Aportacion planificada: <span className="font-medium text-white">{formatCurrencyByPreference(plannedContribution, currency)}</span></p>
                      <p>Aportacion aplicada este mes: <span className="font-medium text-white">{formatCurrencyByPreference(appliedBudgetContribution, currency)}</span></p>
                      <p>Partidas presupuesto: <span className="font-medium text-white">{linkedBudgetCategories.length > 0 ? linkedBudgetCategories.join(", ") : "Sin partidas"}</span></p>
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
