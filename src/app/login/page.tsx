"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

    router.push("/protected");
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
    <main style={{ maxWidth: 480, margin: "40px auto", padding: 16 }}>
      <h1>Login / Registro</h1>
      <form onSubmit={onLogin} style={{ display: "grid", gap: 12 }}>
        <input
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? "Procesando..." : "Iniciar sesion"}
        </button>
      </form>

      <button onClick={onSignup} disabled={loading} style={{ marginTop: 12 }}>
        Crear cuenta
      </button>

      {message ? <p style={{ marginTop: 12 }}>{message}</p> : null}
    </main>
  );
}
