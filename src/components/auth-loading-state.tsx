"use client";

type AuthLoadingStateProps = {
  title?: string;
  description?: string;
};

export default function AuthLoadingState({
  title = "Comprobando sesion",
  description = "Estamos validando tu acceso para mostrar los datos financieros."
}: AuthLoadingStateProps) {
  return (
    <section className="rounded-lg border bg-white p-6">
      <div className="flex items-center gap-3">
        <div className="h-3 w-3 animate-pulse rounded-full bg-teal-600" />
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-600">{description}</p>
        </div>
      </div>
    </section>
  );
}
