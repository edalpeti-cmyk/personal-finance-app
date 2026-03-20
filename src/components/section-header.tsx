import type { ReactNode } from "react";

type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  aside?: ReactNode;
};

export default function SectionHeader({ eyebrow, title, description, aside }: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">{eyebrow}</p>
        <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">{title}</h2>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{description}</p> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}
