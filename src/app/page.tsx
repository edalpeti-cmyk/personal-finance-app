import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: 16 }}>
      <h1>Personal Finance App</h1>
      <p>Base de proyecto con autenticacion Supabase.</p>
      {data.user ? (
        <>
          <p>Sesion activa como: {data.user.email}</p>
          <p>
            <Link href="/protected">Ir a zona protegida</Link>
          </p>
          <p>
            <Link href="/logout">Cerrar sesion</Link>
          </p>
        </>
      ) : (
        <p>
          <Link href="/login">Iniciar sesion / Crear cuenta</Link>
        </p>
      )}
    </main>
  );
}
