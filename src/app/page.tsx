import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PreferencesPreviewCard from "@/components/preferences-preview-card";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  return (
    <main className="page-enter relative z-10 mx-auto max-w-5xl px-6 py-12">
      <section className="rounded-[32px] border border-white/6 bg-[linear-gradient(180deg,rgba(9,20,38,0.98)_0%,rgba(12,27,49,0.96)_100%)] p-8 text-white shadow-[0_24px_64px_rgba(2,8,23,0.5)] md:p-12">
        <p className="text-xs uppercase tracking-[0.28em] text-emerald-300">Plataforma personal</p>
        <h1 className="mt-4 font-[var(--font-heading)] text-5xl font-semibold tracking-tight text-white">Controla tu dinero con contexto real</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-white/72">
          Presupuesto, gastos, inversiones, progreso FIRE e insights en una sola app. La experiencia esta pensada para que entiendas tu situacion financiera de un vistazo.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          {data.user ? (
            <>
              <Link href="/dashboard" className="rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
                Ir al dashboard
              </Link>
              <Link href="/logout" className="rounded-full border border-white/10 bg-white/6 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10">
                Cerrar sesion
              </Link>
            </>
          ) : (
            <Link href="/login" className="rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
              Iniciar sesion o crear cuenta
            </Link>
          )}
        </div>
      </section>

      <section className="mt-6 grid gap-6 md:grid-cols-3">
        <article className="kpi-card rounded-[28px] p-6 text-white">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Presupuesto</p>
          <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-white">Control mensual</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">Sigue ingresos, gasto real y ahorro con comparativas mes a mes.</p>
        </article>
        <article className="kpi-card rounded-[28px] p-6 text-white">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Portfolio</p>
          <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-white">Seguimiento de activos</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">Acciones, ETFs, cripto, fondos y mas, con valoracion y rentabilidad.</p>
        </article>
        <article className="kpi-card rounded-[28px] p-6 text-white">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">FIRE</p>
          <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-white">Objetivo a largo plazo</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">Proyecciones de independencia financiera y evolucion del patrimonio.</p>
        </article>
      </section>

      {data.user ? (
        <section className="mt-6 rounded-[28px] border border-emerald-400/10 bg-[linear-gradient(180deg,rgba(7,19,35,0.98)_0%,rgba(9,29,48,0.98)_52%,rgba(10,63,70,0.92)_100%)] p-6 text-white shadow-[0_28px_72px_rgba(2,8,23,0.56)]">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-200/80">Sesion activa</p>
          <p className="mt-3 text-lg font-medium text-white">{data.user.email}</p>
          <p className="mt-3 text-sm text-white/76">Ya puedes entrar directamente en el area privada y trabajar con tus modulos financieros.</p>
        </section>
      ) : null}

      <PreferencesPreviewCard />
    </main>
  );
}
