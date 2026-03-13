"use client";

import { useTheme } from "@/components/theme-provider";

function ThemeOption({
  active,
  label,
  description,
  onClick
}: {
  active: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
        active
          ? "border-emerald-400/30 bg-emerald-500/14 text-white shadow-[0_14px_28px_rgba(0,0,0,0.24)]"
          : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
      }`}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className={`mt-1 text-xs ${active ? "text-emerald-100" : "text-slate-400"}`}>{description}</p>
    </button>
  );
}

export default function SettingsPanel() {
  const { theme, setTheme, settingsOpen, setSettingsOpen } = useTheme();

  return (
    <>
      {settingsOpen ? (
        <button
          type="button"
          aria-label="Cerrar configuracion"
          onClick={() => setSettingsOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-[2px]"
        />
      ) : null}

      <aside
        className={`fixed right-4 top-4 z-40 h-[calc(100vh-2rem)] w-[min(92vw,360px)] rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,#020817_0%,#071427_56%,#0a1d31_100%)] p-5 text-white shadow-[0_30px_80px_rgba(2,8,23,0.58)] transition duration-300 ${
          settingsOpen ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-[108%] opacity-0"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">Configuracion</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold">Ajustes visuales</h2>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
            >
              Cerrar
            </button>
          </div>

          <div className="mt-8 grid gap-3">
            <ThemeOption
              active={theme === "dark"}
              label="Tema oscuro"
              description="El aspecto fintech oscuro que ya estas usando."
              onClick={() => setTheme("dark")}
            />
            <ThemeOption
              active={theme === "light"}
              label="Tema claro"
              description="Un modo mas luminoso con la misma estructura y contraste."
              onClick={() => setTheme("light")}
            />
          </div>

          <div className="mt-8 rounded-[24px] border border-white/8 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Estado</p>
            <p className="mt-2 text-sm text-slate-200">
              Tema activo: <span className="font-semibold text-white">{theme === "dark" ? "Oscuro" : "Claro"}</span>
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
