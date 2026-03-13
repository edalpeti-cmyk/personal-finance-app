"use client";

import { useTheme } from "@/components/theme-provider";
import { formatCurrencyByPreference, formatDateByPreference } from "@/lib/preferences-format";

export default function PreferencesPreviewCard() {
  const { theme, currency, dateFormat } = useTheme();

  return (
    <section className="mt-6 rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,24,44,0.98)_0%,rgba(11,28,52,0.96)_100%)] p-6 text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)]">
      <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Tus preferencias</p>
      <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">Vista previa activa</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white/8 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Tema</p>
          <p className="mt-2 text-lg font-semibold text-white">{theme === "dark" ? "Oscuro" : "Claro"}</p>
        </div>
        <div className="rounded-3xl border border-white/8 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Moneda</p>
          <p className="mt-2 text-lg font-semibold text-white">{formatCurrencyByPreference(2072.76, currency)}</p>
        </div>
        <div className="rounded-3xl border border-white/8 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Fecha</p>
          <p className="mt-2 text-lg font-semibold text-white">{formatDateByPreference("2026-03-13", dateFormat)}</p>
        </div>
      </div>
    </section>
  );
}
