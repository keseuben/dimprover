"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Check, ChevronDown, CircleAlert, Info, LockKeyhole } from "lucide-react";

export type EnergyFieldTone = "complete" | "warning" | "neutral" | "active";

const toneClasses: Record<EnergyFieldTone, string> = {
  complete: "border-emerald-300 bg-emerald-50 text-emerald-900",
  warning: "border-amber-300 bg-amber-50 text-amber-950",
  neutral: "border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-text)]",
  active: "border-cyan-300 bg-cyan-50 text-cyan-950",
};

export function EnergyFieldStatusBadge({ tone, children }: { tone: EnergyFieldTone; children: ReactNode }) {
  return <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.06em] ${toneClasses[tone]}`}>
    {tone === "complete" ? <Check size={12} /> : tone === "warning" ? <CircleAlert size={12} /> : null}
    {children}
  </span>;
}

export function EnergyFieldIntro({
  icon,
  eyebrow,
  title,
  description,
  status,
  statusTone = "neutral",
  children,
}: {
  icon: ReactNode;
  eyebrow?: string;
  title: string;
  description: string;
  status?: string;
  statusTone?: EnergyFieldTone;
  children?: ReactNode;
}) {
  return <div className={`rounded-2xl border p-4 ${toneClasses[statusTone]}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/80 text-cyan-800 shadow-sm">{icon}</span>
        <div className="min-w-0">
          {eyebrow ? <div className="text-[9px] font-black uppercase tracking-[0.12em] opacity-70">{eyebrow}</div> : null}
          <div className="mt-0.5 text-base font-black">{title}</div>
          <div className="mt-1 max-w-4xl text-xs font-semibold leading-5 opacity-80">{description}</div>
        </div>
      </div>
      {status ? <EnergyFieldStatusBadge tone={statusTone}>{status}</EnergyFieldStatusBadge> : null}
    </div>
    {children ? <div className="mt-3">{children}</div> : null}
  </div>;
}

export function EnergyAdvancedDetails({
  id,
  title = "Részletes műszaki adatok",
  description = "Ezeket a mezőket csak akkor nyisd meg, amikor a helyszíni alapadatok már rendelkezésre állnak.",
  defaultOpen = false,
  children,
}: {
  id: string;
  title?: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  useEffect(() => { if (defaultOpen && detailsRef.current) detailsRef.current.open = true; }, [defaultOpen]);
  return <details ref={detailsRef} data-energy-advanced={id} className="group rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)]">
    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-3 py-3 marker:hidden hover:bg-cyan-50/60">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] text-[var(--survey-muted)]"><LockKeyhole size={16} /></span>
        <div className="min-w-0">
          <div className="text-xs font-black text-[var(--survey-text)]">{title}</div>
          <div className="mt-0.5 text-[9px] font-semibold leading-4 text-[var(--survey-muted)]">{description}</div>
        </div>
      </div>
      <ChevronDown size={18} className="shrink-0 text-cyan-700 transition group-open:rotate-180" />
    </summary>
    <div className="border-t border-[var(--survey-border)] p-3">{children}</div>
  </details>;
}

export function EnergyFieldHelp({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warning" }) {
  return <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[10px] font-semibold leading-4 ${tone === "warning" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-cyan-200 bg-cyan-50 text-cyan-950"}`}>
    <Info size={15} className="mt-0.5 shrink-0" />
    <div>{children}</div>
  </div>;
}

export function EnergyRequiredLabel({ children, optional = false }: { children: ReactNode; optional?: boolean }) {
  return <span className="mb-1 flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-[0.08em] text-[var(--survey-muted)]">
    <span>{children}</span>
    <span className={`rounded-full px-1.5 py-0.5 text-[8px] ${optional ? "bg-slate-100 text-slate-500" : "bg-cyan-100 text-cyan-800"}`}>{optional ? "opcionális" : "szükséges"}</span>
  </span>;
}
