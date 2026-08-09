"use client";

import React from "react";
import DimproMotionBackdrop from "./DimproMotionBackdrop";

type ModulePageHeroProps = {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
};

export default function ModulePageHero({ eyebrow, title, description, actions, children }: ModulePageHeroProps) {
  return (
    <section className="relative mb-5 overflow-hidden border border-blue-200/70 bg-white/75 px-6 py-5 shadow-[0_10px_24px_rgba(37,99,235,0.10)] backdrop-blur-[2px]">
      <DimproMotionBackdrop mode="module" density="compact" className="opacity-95" />
      <div className="absolute inset-0 z-[1] bg-gradient-to-r from-white/76 via-white/46 to-white/18" />
      <div className="relative z-10 flex min-h-[116px] flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 xl:text-3xl">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-600">{description}</p>}
          {children}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </section>
  );
}
