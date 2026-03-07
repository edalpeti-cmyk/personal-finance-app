import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function ProtectedPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: 16 }}>
      <h1>Area protegida</h1>
      <p>Usuario autenticado: {data.user.email}</p>
      <p>
        <Link href="/dashboard">Ir al dashboard</Link>
      </p>
      <p>
        <Link href="/budgets">Ir a presupuesto mensual</Link>
      </p>
      <p>
        <Link href="/expenses">Ir al gestor de gastos</Link>
      </p>
      <p>
        <Link href="/investments">Ir al portfolio tracker</Link>
      </p>
      <p>
        <Link href="/fire">Ir a calculadora FIRE</Link>
      </p>
      <p>Aqui iria tu dashboard financiero.</p>
    </main>
  );
}
