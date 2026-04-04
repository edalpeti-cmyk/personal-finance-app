"use client";

export type KpiIconType =
  | "savingsRate"
  | "annualSavings"
  | "emergencyFund"
  | "debtPayment"
  | "fireTarget"
  | "wealth"
  | "netWorth"
  | "fireIncluded"
  | "debt"
  | "plannedContribution"
  | "connection"
  | "interest"
  | "ratio"
  | "timeline"
  | "age";

export default function KpiIcon({ type, className = "h-4 w-4 flex-none text-emerald-200/80" }: { type: KpiIconType; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };

  if (type === "savingsRate") return <svg {...common}><path d="M4 16 10 10 13 13 20 6" /><path d="m14 6 6 0 0 6" /></svg>;
  if (type === "annualSavings") return <svg {...common}><path d="M12 2v20" /><path d="M17 6H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 0 1 0 7H6" /></svg>;
  if (type === "emergencyFund") return <svg {...common}><path d="M12 3 4 7v5c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10V7l-8-4Z" /><path d="m9 12 2 2 4-4" /></svg>;
  if (type === "debtPayment") return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h2" /></svg>;
  if (type === "fireTarget") return <svg {...common}><path d="M12 3s4 3 4 7a4 4 0 1 1-8 0c0-2 1-3 2-5" /><path d="M10 14c0 1.5 1 3 2 4 1-1 2-2.5 2-4 0-1.4-.7-2.4-2-3-1.3.6-2 1.6-2 3Z" /></svg>;
  if (type === "wealth") return <svg {...common}><path d="M3 10.5 12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /><path d="M9 20v-5h6v5" /></svg>;
  if (type === "netWorth") return <svg {...common}><path d="M4 13h7V4H4z" /><path d="M13 20h7v-9h-7z" /><path d="M13 11h7V4h-7z" /><path d="M4 20h7v-5H4z" /></svg>;
  if (type === "fireIncluded") return <svg {...common}><path d="M12 3 4 7v5c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10V7l-8-4Z" /><path d="M12 9v5" /><path d="M12 17h.01" /></svg>;
  if (type === "debt") return <svg {...common}><path d="M5 7h14" /><path d="M5 12h14" /><path d="M5 17h8" /><path d="M18 17h1" /><path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /></svg>;
  if (type === "plannedContribution") return <svg {...common}><path d="M12 2v20" /><path d="M17 6H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 0 1 0 7H6" /><path d="m18 3 3 3-3 3" /></svg>;
  if (type === "connection") return <svg {...common}><path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5" /><path d="M14 11a5 5 0 0 0-7.07 0L5.5 12.43a5 5 0 1 0 7.07 7.07L14 19" /></svg>;
  if (type === "interest") return <svg {...common}><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 0 1 0 7H6" /><path d="M4 4 20 20" /></svg>;
  if (type === "ratio") return <svg {...common}><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8 16 16 8" /></svg>;
  if (type === "timeline") return <svg {...common}><path d="M4 19 10 13 13 16 20 9" /><path d="m14 9 6 0 0 6" /></svg>;
  return <svg {...common}><path d="M12 2a10 10 0 1 0 10 10" /><path d="M12 6v6l4 2" /></svg>;
}
