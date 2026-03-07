"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/budgets", label: "Presupuestos" },
  { href: "/expenses", label: "Gastos" },
  { href: "/investments", label: "Inversiones" },
  { href: "/fire", label: "FIRE" },
  { href: "/protected", label: "Inicio" }
];

export default function SideNav() {
  const pathname = usePathname();

  return (
    <>
      <aside className="fixed left-0 top-0 hidden h-screen w-56 border-r bg-white p-4 md:block">
        <p className="mb-4 text-lg font-semibold">Finanzas</p>
        <nav className="grid gap-2 text-sm">
          {ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded px-3 py-2 ${active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
              >
                {item.label}
              </Link>
            );
          })}
          <Link href="/logout" className="mt-4 rounded px-3 py-2 text-red-700 hover:bg-red-50">
            Cerrar sesion
          </Link>
        </nav>
      </aside>

      <nav className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b bg-white p-3 text-sm md:hidden">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded px-3 py-1 whitespace-nowrap ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {item.label}
            </Link>
          );
        })}
        <Link href="/logout" className="rounded bg-red-50 px-3 py-1 text-red-700 whitespace-nowrap">
          Salir
        </Link>
      </nav>
    </>
  );
}
