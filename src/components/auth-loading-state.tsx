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
    <section className="panel page-enter rounded-[28px] p-6 md:p-8">
      <div className="flex items-start gap-4">
        <div className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-700/10 text-teal-800">
          <div className="h-3 w-3 animate-pulse rounded-full bg-teal-600" />
        </div>
        <div>
          <p className="font-[var(--font-heading)] text-xs uppercase tracking-[0.24em] text-teal-700">Sesion</p>
          <h1 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-2 max-w-xl text-sm text-slate-600">{description}</p>
        </div>
      </div>
    </section>
  );
}
