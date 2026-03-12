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
      <aside className="panel fixed left-4 top-4 z-20 hidden h-[calc(100vh-2rem)] w-64 overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,15,24,0.98)_0%,rgba(15,23,42,0.96)_52%,rgba(17,94,89,0.92)_100%)] text-white shadow-[0_30px_80px_rgba(15,23,42,0.38)] md:block">
        <div className="flex h-full flex-col p-4">
          <div className="mb-6 rounded-[22px] border border-white/10 bg-white/5 p-4">
            <p className="font-[var(--font-heading)] text-xs uppercase tracking-[0.28em] text-white/70">Control personal</p>
            <h1 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold leading-tight">Finanzas con foco y contexto</h1>
            <p className="mt-2 text-sm text-white/82">Todo tu sistema financiero en un lateral claro y siempre accesible.</p>
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
                      ? "border-white/16 bg-white/14 text-white shadow-[0_12px_30px_rgba(15,23,42,0.28)]"
                      : "border-white/8 bg-white/0 text-white/88 hover:border-white/20 hover:bg-white/8"
                  }`}
                >
                  <p className="font-medium">{item.label}</p>
                  <p className={`mt-1 text-xs ${active ? "text-emerald-100/90" : "text-white/58"}`}>{item.hint}</p>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-[22px] border border-white/10 bg-white/6 p-3">
            <Link href="/logout" className="block rounded-2xl border border-white/14 bg-white/10 px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-white/16">
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
