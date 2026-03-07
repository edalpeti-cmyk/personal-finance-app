import { redirect } from "next/navigation";
import SideNav from "@/components/side-nav";
import { createClient } from "@/lib/supabase/server";

export default async function ProtectedPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  return (
    <>
      <SideNav />
      <main className="mx-auto max-w-3xl p-6 md:pl-60">
        <h1 className="mb-2 text-2xl font-semibold">Area protegida</h1>
        <p>Usuario autenticado: {data.user.email}</p>
      </main>
    </>
  );
}
