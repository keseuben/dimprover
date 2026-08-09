"use client";

import AppLayout from "./AppLayout";
import { MainModuleCards } from "./DimproverModuleSwitch";
import { dimproverModuleRegistry, type DimproverModuleTone } from "./dimproverModuleRegistry";
import { ArrowRight, BadgeCheck, Blocks, CalendarClock, Database, FileText, FolderKanban, KeyRound, ListChecks, ShieldCheck, UsersRound } from "lucide-react";

type FeatureStatus = "mvp" | "next" | "later";

type ModuleFeature = {
  title: string;
  description: string;
  status?: FeatureStatus;
};

type ModulePlaceholderPageProps = {
  moduleId: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  introBadge?: string;
  features: ModuleFeature[];
  engines?: string[];
  nextTitle?: string;
  nextDescription?: string;
};

const toneStyles: Record<DimproverModuleTone, { hero: string; badge: string; soft: string; icon: string; dot: string }> = {
  green: { hero: "from-[#065F46] via-[#0F766E] to-[#0E7490]", badge: "border-emerald-200 bg-emerald-50 text-emerald-800", soft: "border-emerald-200 bg-emerald-50", icon: "text-emerald-800", dot: "bg-emerald-500" },
  blue: { hero: "from-[#075E72] via-[#0788A6] to-[#0A6B8D]", badge: "border-sky-200 bg-sky-50 text-sky-800", soft: "border-sky-200 bg-sky-50", icon: "text-sky-800", dot: "bg-sky-500" },
  orange: { hero: "from-[#7C2D12] via-[#C2410C] to-[#EA580C]", badge: "border-orange-200 bg-orange-50 text-orange-800", soft: "border-orange-200 bg-orange-50", icon: "text-orange-800", dot: "bg-orange-500" },
  teal: { hero: "from-[#064E3B] via-[#0F766E] to-[#0891B2]", badge: "border-teal-200 bg-teal-50 text-teal-800", soft: "border-teal-200 bg-teal-50", icon: "text-teal-800", dot: "bg-teal-500" },
  violet: { hero: "from-[#4C1D95] via-[#6D28D9] to-[#7C3AED]", badge: "border-violet-200 bg-violet-50 text-violet-800", soft: "border-violet-200 bg-violet-50", icon: "text-violet-800", dot: "bg-violet-500" },
  slate: { hero: "from-[#0F172A] via-[#334155] to-[#475569]", badge: "border-slate-200 bg-slate-50 text-slate-700", soft: "border-slate-200 bg-slate-50", icon: "text-slate-800", dot: "bg-slate-500" },
};

const statusLabel: Record<FeatureStatus, string> = {
  mvp: "MVP",
  next: "következő",
  later: "később",
};

const statusClass: Record<FeatureStatus, string> = {
  mvp: "border-emerald-200 bg-emerald-50 text-emerald-800",
  next: "border-cyan-200 bg-cyan-50 text-cyan-800",
  later: "border-slate-200 bg-slate-50 text-slate-500",
};

const engineIcons = [FolderKanban, FileText, ListChecks, CalendarClock, UsersRound, Database, ShieldCheck, KeyRound];

export default function ModulePlaceholderPage({
  moduleId,
  eyebrow,
  title,
  subtitle,
  introBadge = "Főmodul váz létrehozva",
  features,
  engines = ["Jogosultság", "Projekt", "Dokumentum / Drive", "Feladat / hibajegy", "Jegyzőkönyv", "PDF export"],
  nextTitle = "Jogosultság és menüszervezés",
  nextDescription = "A meglévő modulokat nem töröljük, hanem az új főmodulok alá soroljuk. A főmodulváltás jobb oldalon, a globális vezérlősávban érhető el.",
}: ModulePlaceholderPageProps) {
  const currentModule = dimproverModuleRegistry.find((item) => item.id === moduleId) ?? dimproverModuleRegistry[0];
  const tone = toneStyles[currentModule.tone];
  const resolvedTitle = title ?? currentModule.title;
  const resolvedSubtitle = subtitle ?? currentModule.description;
  const resolvedEyebrow = eyebrow ?? `DIMPROVER / ${currentModule.title}`;

  return (
    <AppLayout>
      <section className="min-h-screen bg-[#f6f9fc] px-8 pb-10 pt-0 text-slate-900">
        <div className={`-mx-8 border-b border-slate-200 bg-gradient-to-r ${tone.hero} px-8 py-8 text-white shadow-[0_18px_36px_rgba(8,47,73,0.16)]`}>
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/70">{resolvedEyebrow}</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight">{resolvedTitle}</h1>
              <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-white/88">{resolvedSubtitle}</p>
            </div>
            <div className="grid min-w-[360px] grid-cols-2 gap-2">
              <div className="border border-white/30 bg-white/12 px-4 py-3 backdrop-blur">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/70">Állapot</div>
                <div className="mt-1 text-sm font-black text-white">{currentModule.state === "soon" ? "Előkészítés" : "Elérhető"}</div>
              </div>
              <div className="border border-white/30 bg-white/12 px-4 py-3 backdrop-blur">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/70">Feature flag</div>
                <div className="mt-1 text-sm font-black text-white">{currentModule.featureFlag}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_360px]">
          <div className="border border-slate-200 bg-white p-6 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
            <div className={`inline-flex border-l-4 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] ${tone.badge}`}>{introBadge}</div>
            <h2 className="mt-5 text-2xl font-black text-slate-950">Főmodul munkaterület</h2>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">
              Ez az oldal az új DIMPROVER főmodul-struktúra szerint épül. A modul nem különálló sziget, hanem a közös modulmotorokra támaszkodik: jogosultság, projekt, Drive/dokumentum, ütemterv, feladat, jegyzőkönyv, Mappaőr, értesítés és PDF export.
            </p>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {features.map((item) => (
                <div key={item.title} className="border border-slate-200 bg-white p-4 shadow-[0_8px_18px_rgba(15,23,42,0.035)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center border ${tone.soft}`}><Blocks size={16} className={tone.icon} /></div>
                    {item.status && <span className={`border px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${statusClass[item.status]}`}>{statusLabel[item.status]}</span>}
                  </div>
                  <h3 className="mt-3 text-base font-black text-slate-950">{item.title}</h3>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="border border-slate-200 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Következő lépés</p>
              <h3 className="mt-2 text-xl font-black text-slate-950">{nextTitle}</h3>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">{nextDescription}</p>
              <button type="button" className={`mt-4 inline-flex items-center gap-2 border px-3 py-2 text-xs font-black uppercase tracking-[0.12em] ${tone.badge}`}>Részletek előkészítése <ArrowRight size={14} /></button>
            </div>

            <div className="border border-slate-200 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Közös motorok</p>
              <div className="mt-4 grid gap-2">
                {engines.map((engine, index) => {
                  const Icon = engineIcons[index % engineIcons.length] ?? BadgeCheck;
                  return (
                    <div key={engine} className="flex items-center gap-3 border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className={`flex h-7 w-7 items-center justify-center border ${tone.soft}`}><Icon size={14} className={tone.icon} /></span>
                      <span className="text-xs font-black text-slate-700">{engine}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-8 border-t border-slate-200 pt-6">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
            <span className={`h-2.5 w-2.5 ${tone.dot}`} /> Főmodulváltás
          </div>
          <MainModuleCards />
        </div>
      </section>
    </AppLayout>
  );
}
