"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function inputClass() {
  return "w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const onLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const nextPath =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next") || "/dashboard"
        : "/dashboard";

    router.push(nextPath);
    router.refresh();
  };

  const onSignup = async () => {
    setLoading(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Cuenta creada. Revisa tu email para confirmar.");
    }

    setLoading(false);
  };

  return (
    <main className="page-enter relative z-10 mx-auto grid min-h-screen max-w-5xl items-center gap-6 px-6 py-12 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-[32px] border border-white/6 bg-[linear-gradient(180deg,rgba(9,20,38,0.98)_0%,rgba(12,27,49,0.96)_100%)] p-8 text-white shadow-[0_24px_64px_rgba(2,8,23,0.5)] md:p-10">
        <p className="text-xs uppercase tracking-[0.28em] text-emerald-300">Acceso seguro</p>
        <h1 className="mt-4 font-[var(--font-heading)] text-5xl font-semibold tracking-tight text-white">Entra en tu centro financiero</h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-white/72">
          Inicia sesion para acceder al dashboard, gestionar tus gastos y revisar tu progreso hacia la libertad financiera.
        </p>
      </section>

      <section className="panel rounded-[32px] p-6 text-white shadow-[0_18px_40px_rgba(2,8,23,0.42)] md:p-8">
        <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">Login / Registro</p>
        <h2 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-white">Tu cuenta</h2>

        <form onSubmit={onLogin} className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm text-slate-200">
            Email
            <input className={inputClass()} type="email" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="grid gap-2 text-sm text-slate-200">
            Contrasena
            <input className={inputClass()} type="password" placeholder="********" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button type="submit" disabled={loading} className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? "Procesando..." : "Iniciar sesion"}
          </button>
        </form>

        <button onClick={onSignup} disabled={loading} className="mt-3 w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">
          Crear cuenta
        </button>

        {message ? (
          <p className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">{message}</p>
        ) : null}
      </section>
    </main>
  );
}
