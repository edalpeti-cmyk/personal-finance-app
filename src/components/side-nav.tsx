"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
    <>
      <aside className="panel fixed left-4 top-4 z-20 hidden h-[calc(100vh-2rem)] w-64 overflow-hidden rounded-[28px] border border-white/50 bg-[rgba(24,34,34,0.92)] text-white md:block">
        <div className="flex h-full flex-col p-4">
          <div className="mb-6 rounded-[22px] border border-white/10 bg-white/5 p-4">
            <p className="font-[var(--font-heading)] text-xs uppercase tracking-[0.28em] text-emerald-200/80">Control personal</p>
            <h1 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold leading-tight">Finanzas con foco y contexto</h1>
            <p className="mt-2 text-sm text-slate-300">Todo tu sistema financiero en un lateral claro y siempre accesible.</p>
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
                      ? "border-emerald-300/40 bg-emerald-300/18 text-white shadow-[0_12px_30px_rgba(16,185,129,0.18)]"
                      : "border-white/8 bg-white/0 text-slate-200 hover:border-white/20 hover:bg-white/6"
                  }`}
                >
                  <p className="font-medium">{item.label}</p>
                  <p className={`mt-1 text-xs ${active ? "text-emerald-100/90" : "text-slate-400"}`}>{item.hint}</p>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-[22px] border border-amber-200/12 bg-white/5 p-3">
            <Link href="/logout" className="block rounded-2xl bg-amber-50 px-4 py-3 text-center text-sm font-medium text-slate-900 transition hover:bg-white">
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
        <Link href="/logout" className="whitespace-nowrap rounded-full bg-amber-100 px-4 py-2 text-sm text-amber-900">
          Salir
        </Link>
      </nav>
    </>
  );
}
