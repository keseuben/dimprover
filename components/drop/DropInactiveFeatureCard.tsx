import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2, LockKeyhole } from "lucide-react";

export default function DropInactiveFeatureCard({
  icon: Icon,
  title,
  description,
  status,
  active,
  href = "/open",
  actionLabel = "Megnyitás",
  accent = "cyan",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  status: string;
  active: boolean;
  href?: string;
  actionLabel?: string;
  accent?: "cyan" | "blue" | "lime" | "slate";
}) {
  const accentClass = {
    cyan: "border-cyan-200 bg-cyan-50/80 text-cyan-800",
    blue: "border-blue-200 bg-blue-50/80 text-blue-800",
    lime: "border-lime-200 bg-lime-50/80 text-lime-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  }[accent];

  return (
    <article className="group relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent opacity-70" />
      <div className="flex items-start justify-between gap-4">
        <span className={`grid h-12 w-12 place-items-center rounded-2xl border ${accentClass}`}>
          <Icon size={23} aria-hidden="true" />
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-600"}`}>
          {active ? <CheckCircle2 size={12} aria-hidden="true" /> : <LockKeyhole size={12} aria-hidden="true" />}
          {status}
        </span>
      </div>
      <h2 className="mt-5 text-xl font-black text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      {active ? (
        <Link href={href} className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-cyan-900">
          {actionLabel}
        </Link>
      ) : (
        <button type="button" disabled aria-disabled="true" className="mt-5 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-black text-slate-400">
          Még nem aktiválható
        </button>
      )}
    </article>
  );
}
