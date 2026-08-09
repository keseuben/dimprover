"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { dimproverModuleRegistry, type DimproverModuleTone } from "./dimproverModuleRegistry";

const toneClasses: Record<DimproverModuleTone, {
  border: string;
  bar: string;
  text: string;
  soft: string;
  icon: string;
  dot: string;
  hover: string;
}> = {
  green: {
    border: "border-emerald-300/70",
    bar: "border-t-emerald-400",
    text: "text-emerald-700",
    soft: "bg-emerald-50/80",
    icon: "bg-emerald-100 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-500",
    hover: "hover:border-emerald-400 hover:shadow-[0_14px_34px_rgba(16,185,129,0.12)]",
  },
  blue: {
    border: "border-sky-300/80",
    bar: "border-t-sky-500",
    text: "text-sky-700",
    soft: "bg-sky-50/90",
    icon: "bg-sky-100 text-sky-700 ring-sky-200",
    dot: "bg-sky-500",
    hover: "hover:border-sky-500 hover:shadow-[0_14px_34px_rgba(14,165,233,0.14)]",
  },
  orange: {
    border: "border-orange-300/80",
    bar: "border-t-orange-400",
    text: "text-orange-700",
    soft: "bg-orange-50/75",
    icon: "bg-orange-100 text-orange-700 ring-orange-200",
    dot: "bg-orange-500",
    hover: "hover:border-orange-400 hover:shadow-[0_14px_34px_rgba(249,115,22,0.12)]",
  },
  teal: {
    border: "border-cyan-300/80",
    bar: "border-t-cyan-500",
    text: "text-cyan-700",
    soft: "bg-cyan-50/75",
    icon: "bg-cyan-100 text-cyan-700 ring-cyan-200",
    dot: "bg-cyan-500",
    hover: "hover:border-cyan-400 hover:shadow-[0_14px_34px_rgba(6,182,212,0.12)]",
  },
  violet: {
    border: "border-violet-300/80",
    bar: "border-t-violet-500",
    text: "text-violet-700",
    soft: "bg-violet-50/75",
    icon: "bg-violet-100 text-violet-700 ring-violet-200",
    dot: "bg-violet-500",
    hover: "hover:border-violet-400 hover:shadow-[0_14px_34px_rgba(139,92,246,0.12)]",
  },
  slate: {
    border: "border-slate-300/80",
    bar: "border-t-slate-500",
    text: "text-slate-700",
    soft: "bg-slate-50/80",
    icon: "bg-slate-100 text-slate-700 ring-slate-200",
    dot: "bg-slate-500",
    hover: "hover:border-slate-400 hover:shadow-[0_14px_34px_rgba(15,23,42,0.10)]",
  },
};

export function RightBoardModuleSwitch() {
  const current = dimproverModuleRegistry.find((item) => item.state === "active") ?? dimproverModuleRegistry[0];
  const currentTone = toneClasses[current.tone];
  const CurrentIcon = current.Icon;

  return (
    <details className="group rounded-xl border border-slate-300/35 bg-white/86 shadow-[0_10px_24px_rgba(15,23,42,0.045)] backdrop-blur">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${currentTone.icon}`}>
            <CurrentIcon size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Aktuális főmodul</span>
            <span className="block truncate text-sm font-black text-slate-900">{current.title}</span>
          </span>
        </span>
        <ChevronDown size={15} className="shrink-0 text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-1.5 border-t border-slate-200/80 p-2">
        {dimproverModuleRegistry.map((item) => {
          const Icon = item.Icon;
          const tone = toneClasses[item.tone];
          const disabled = item.state === "locked";
          const soon = item.state === "soon";
          const content = (
            <span className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition ${tone.border} ${tone.soft} ${disabled ? "opacity-45" : tone.hover}`}>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />
              <Icon size={16} className={`shrink-0 ${tone.text}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-black text-slate-900">{item.title}</span>
                <span className="block truncate text-[10px] font-semibold text-slate-500">{item.label}</span>
              </span>
              {soon && <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">hamarosan</span>}
            </span>
          );

          if (disabled) return <div key={item.id}>{content}</div>;
          return <Link key={item.id} href={item.href}>{content}</Link>;
        })}
      </div>
    </details>
  );
}

export function MainModuleCards() {
  return (
    <section className="relative z-[185] mt-6 border-t-4 border-sky-300/80 bg-white/78 p-5 shadow-[0_10px_24px_rgba(37,99,235,0.10)] backdrop-blur-[2px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-sky-700">DIMPROVER főmodulok</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Válassz munkaterületet</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">A közös modulmotorok több felületen, eltérő jogosultsággal működnek.</p>
        </div>
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-bold text-sky-800">Főmodulváltás: jobb oldali board tetején is elérhető</div>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {dimproverModuleRegistry.map((item) => {
          const Icon = item.Icon;
          const tone = toneClasses[item.tone];
          const soon = item.state === "soon";
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`group relative min-h-[190px] border ${tone.border} ${tone.bar} bg-white/92 p-5 shadow-[0_10px_26px_rgba(15,23,42,0.055)] transition ${tone.hover}`}
            >
              <span className="absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-slate-200" />
              <div className="flex items-start justify-between gap-4">
                <div className={`flex h-14 w-14 items-center justify-center rounded-xl ring-1 ${tone.icon}`}>
                  <Icon size={27} />
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${tone.soft} ${tone.text}`}>{soon ? "későbbi" : item.state === "active" ? "aktív" : "elérhető"}</span>
              </div>
              <h3 className={`mt-5 text-2xl font-black tracking-tight ${tone.text}`}>{item.title}</h3>
              <p className="mt-2 min-h-[42px] text-sm font-semibold leading-relaxed text-slate-600">{item.description}</p>
              <div className="mt-4 space-y-1.5 border-t border-slate-200 pt-4">
                {item.bullets.map((bullet) => (
                  <div key={bullet} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                    {bullet}
                  </div>
                ))}
              </div>
              <span className="absolute right-5 top-1/2 text-2xl font-light text-slate-400 transition group-hover:translate-x-1 group-hover:text-slate-700">→</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
