"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/theme-provider";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", hint: "Resumen general" },
  { href: "/budgets", label: "Presupuestos", hint: "Control mensual" },
  { href: "/expenses", label: "Gastos", hint: "Registro y analisis" },
  { href: "/investments", label: "Inversiones", hint: "Portfolio tracker" },
  { href: "/fire", label: "FIRE", hint: "Independencia financiera" },
  { href: "/protected", label: "Inicio", hint: "Area privada" }
];

export default function SideNav() {
  const pathname = usePathname();
  const { toggleSettings } = useTheme();

  return (
    <>
      <aside className="fixed left-4 top-4 z-20 hidden h-[calc(100vh-2rem)] w-64 overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,#020817_0%,#041126_54%,#071a2e_100%)] text-white shadow-[0_30px_80px_rgba(2,8,23,0.58)] md:block">
        <div className="flex h-full flex-col p-4">
          <div className="mb-6 rounded-[22px] border border-emerald-400/10 bg-[linear-gradient(180deg,rgba(21,33,57,0.96)_0%,rgba(10,24,40,0.96)_100%)] p-4">
            <p className="font-[var(--font-heading)] text-xs uppercase tracking-[0.28em] text-white">Control personal</p>
            <h1 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold leading-tight">Finanzas con foco y contexto</h1>
            <p className="mt-2 text-sm text-white">Todo tu sistema financiero en un lateral claro y siempre accesible.</p>
          </div>

          <nav className="grid gap-2 text-sm">
            {ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-2xl border px-4 py-3 transition ${
                    active
                      ? "border-emerald-400/18 bg-[linear-gradient(90deg,rgba(8,55,60,0.96)_0%,rgba(8,74,67,0.88)_100%)] text-emerald-200 shadow-[0_12px_30px_rgba(0,0,0,0.34)]"
                      : "border-transparent bg-transparent text-white/92 hover:border-white/10 hover:bg-white/5"
                  }`}
                >
                  <p className="font-medium">{item.label}</p>
                  <p className={`mt-1 text-xs ${active ? "text-white" : "text-white/45"}`}>{item.hint}</p>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto grid gap-3 rounded-[22px] border border-white/8 bg-white/4 p-3">
            <button
              type="button"
              onClick={toggleSettings}
              className="block rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-white/10"
            >
              Configuracion
            </button>
            <Link href="/logout" className="block rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-white/10">
              Cerrar sesion
            </Link>
          </div>
        </div>
      </aside>

      <nav className="sticky top-0 z-20 flex gap-2 overflow-x-auto border-b border-black/5 bg-[rgba(248,245,239,0.92)] p-3 backdrop-blur md:hidden">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm transition ${
                active ? "bg-slate-900 text-white" : "bg-white/80 text-slate-700 shadow-sm"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        <button type="button" onClick={toggleSettings} className="whitespace-nowrap rounded-full bg-slate-900 px-4 py-2 text-sm text-white">
          Configuracion
        </button>
        <Link href="/logout" className="whitespace-nowrap rounded-full bg-amber-100 px-4 py-2 text-sm text-amber-900">
          Salir
        </Link>
      </nav>
    </>
  );
}
