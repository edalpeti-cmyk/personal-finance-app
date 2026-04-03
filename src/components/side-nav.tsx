"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/theme-provider";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", hint: "Resumen general", icon: "dashboard" },
  { href: "/review", label: "Revision", hint: "Cierre del mes", icon: "review" },
  { href: "/budgets", label: "Presupuestos", hint: "Control mensual", icon: "budgets" },
  { href: "/expenses", label: "Gastos", hint: "Registro y analisis", icon: "expenses" },
  { href: "/investments", label: "Inversiones", hint: "Portfolio tracker", icon: "investments" },
  { href: "/wealth", label: "Patrimonio", hint: "Inmuebles y bienes", icon: "wealth" },
  { href: "/debts", label: "Deuda", hint: "Prestamos y tarjetas", icon: "debts" },
  { href: "/fire", label: "FIRE", hint: "Independencia financiera", icon: "fire" },
  { href: "/goals", label: "Objetivos", hint: "Metas y progreso", icon: "goals" },
  { href: "/protected", label: "Inicio", hint: "Area privada", icon: "home" }
];

function NavIcon({ icon }: { icon: string }) {
  const className = "h-5 w-5 flex-none";
  const common = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  if (icon === "dashboard") return <svg {...common}><path d="M4 13h7V4H4z" /><path d="M13 20h7v-9h-7z" /><path d="M13 11h7V4h-7z" /><path d="M4 20h7v-5H4z" /></svg>;
  if (icon === "review") return <svg {...common}><path d="M8 6h12" /><path d="M8 12h12" /><path d="M8 18h12" /><path d="M4 6h.01" /><path d="M4 12h.01" /><path d="M4 18h.01" /></svg>;
  if (icon === "budgets") return <svg {...common}><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 0 1 0 7H6" /></svg>;
  if (icon === "expenses") return <svg {...common}><path d="m7 3-4 4 4 4" /><path d="M3 7h10a4 4 0 0 1 4 4v10" /><path d="m17 21 4-4-4-4" /><path d="M21 17H11a4 4 0 0 1-4-4V3" /></svg>;
  if (icon === "investments") return <svg {...common}><path d="M4 19 10 13 13 16 20 9" /><path d="m14 9 6 0 0 6" /></svg>;
  if (icon === "wealth") return <svg {...common}><path d="M3 10.5 12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /><path d="M9 20v-5h6v5" /></svg>;
  if (icon === "debts") return <svg {...common}><path d="M5 7h14" /><path d="M5 12h14" /><path d="M5 17h8" /><path d="M18 17h1" /><path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /></svg>;
  if (icon === "fire") return <svg {...common}><path d="M12 3s4 3 4 7a4 4 0 1 1-8 0c0-2 1-3 2-5" /><path d="M10 14c0 1.5 1 3 2 4 1-1 2-2.5 2-4 0-1.4-.7-2.4-2-3-1.3.6-2 1.6-2 3Z" /></svg>;
  if (icon === "goals") return <svg {...common}><path d="M12 3 4 7v5c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10V7l-8-4Z" /><path d="m9 12 2 2 4-4" /></svg>;
  if (icon === "home") return <svg {...common}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
  if (icon === "settings") return <svg {...common}><path d="M12 8.8A3.2 3.2 0 1 1 8.8 12 3.2 3.2 0 0 1 12 8.8Z" /><path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6Z" /></svg>;
  return null;
}

export default function SideNav() {
  const pathname = usePathname();
  const { toggleSettings } = useTheme();

  return (
    <>
      <aside className="sidebar-scroll fixed left-4 top-4 z-20 hidden h-[calc(100vh-2rem)] w-64 overflow-y-auto rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,#020817_0%,#041126_54%,#071a2e_100%)] text-white shadow-[0_30px_80px_rgba(2,8,23,0.58)] md:block">
        <div className="flex min-h-full flex-col p-4">
          <div className="mb-6 rounded-[22px] border border-emerald-400/10 bg-[linear-gradient(180deg,rgba(21,33,57,0.96)_0%,rgba(10,24,40,0.96)_100%)] p-4">
            <p className="font-[var(--font-heading)] text-xs uppercase tracking-[0.28em] text-white">Control personal</p>
            <h1 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold leading-tight">Finanzas con foco y contexto</h1>
            <p className="mt-2 text-sm text-white">Todo tu sistema financiero en un lateral claro y siempre accesible.</p>
          </div>

          <nav className="grid gap-2 text-sm">
            {ITEMS.map((item) => {
              const active = pathname === item.href;
              const link = (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-2xl border px-4 py-3 transition ${
                    active
                      ? "border-emerald-400/18 bg-[linear-gradient(90deg,rgba(8,55,60,0.96)_0%,rgba(8,74,67,0.88)_100%)] text-emerald-200 shadow-[0_12px_30px_rgba(0,0,0,0.34)]"
                      : "border-transparent bg-transparent text-white/92 hover:border-white/10 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <NavIcon icon={item.icon} />
                    <div>
                      <p className="font-medium">{item.label}</p>
                      <p className={`mt-1 text-xs ${active ? "text-white" : "text-white/45"}`}>{item.hint}</p>
                    </div>
                  </div>
                </Link>
              );

              if (item.href === "/protected") {
                return (
                  <>
                    <button
                      key="settings-button"
                      type="button"
                      onClick={toggleSettings}
                      className="rounded-2xl border border-transparent bg-transparent px-4 py-3 text-left text-white/92 transition hover:border-white/10 hover:bg-white/5"
                    >
                      <div className="flex items-start gap-3">
                        <NavIcon icon="settings" />
                        <div>
                          <p className="font-medium">Configuracion</p>
                          <p className="mt-1 text-xs text-white/45">Tema y apariencia</p>
                        </div>
                      </div>
                    </button>
                    {link}
                  </>
                );
              }

              return link;
            })}
          </nav>

          <div className="mt-auto pt-4">
            <Link href="/logout" className="block rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-white/10">
              Cerrar sesion
            </Link>
          </div>
        </div>
      </aside>

      <nav className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-30 md:hidden">
        <div className="flex gap-2 overflow-x-auto rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(4,17,38,0.94)_0%,rgba(7,23,42,0.98)_100%)] p-2 shadow-[0_-14px_40px_rgba(2,8,23,0.4)] backdrop-blur">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[82px] flex-col items-center gap-1 rounded-2xl px-3 py-2 text-center text-[11px] transition ${
                active ? "bg-emerald-500/14 text-emerald-200" : "bg-white/4 text-white/72"
              }`}
            >
              <NavIcon icon={item.icon} />
              <span className="leading-tight">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={toggleSettings}
          className="flex min-w-[82px] flex-col items-center gap-1 rounded-2xl bg-white/4 px-3 py-2 text-center text-[11px] text-white/72"
        >
          <NavIcon icon="settings" />
          <span className="leading-tight">Config.</span>
        </button>
        <Link href="/logout" className="flex min-w-[82px] flex-col items-center gap-1 rounded-2xl bg-amber-200/12 px-3 py-2 text-center text-[11px] text-amber-100">
          <svg className="h-5 w-5 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
          <span className="leading-tight">Salir</span>
        </Link>
        </div>
      </nav>
    </>
  );
}
