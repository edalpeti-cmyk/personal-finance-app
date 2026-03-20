type EmptyStateCardProps = {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel?: string;
  compact?: boolean;
};

export default function EmptyStateCard({
  eyebrow,
  title,
  description,
  actionLabel,
  compact = false
}: EmptyStateCardProps) {
  return (
    <div className={`rounded-[24px] border border-white/8 bg-white/5 ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-300">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
            <path d="M12 7v5" />
            <path d="M12 16h.01" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">{eyebrow}</p>
          <h3 className={`mt-2 font-[var(--font-heading)] font-semibold text-white ${compact ? "text-xl" : "text-2xl"}`}>{title}</h3>
          <p className="mt-3 max-w-[44ch] text-sm leading-6 text-slate-300">{description}</p>
          {actionLabel ? (
            <div className="ui-chip mt-4 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
              {actionLabel}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
