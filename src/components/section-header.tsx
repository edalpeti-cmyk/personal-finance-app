import type { ReactNode } from "react";
import KpiIcon, { type KpiIconType } from "@/components/kpi-icon";

type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  aside?: ReactNode;
  icon?: KpiIconType;
};

export default function SectionHeader({ eyebrow, title, description, aside, icon }: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">{eyebrow}</p>
        <div className="mt-2 flex items-center gap-2">
          {icon ? <KpiIcon type={icon} className="h-5 w-5 flex-none text-emerald-200/80" /> : null}
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-white">{title}</h2>
        </div>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{description}</p> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}
