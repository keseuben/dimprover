"use client";

import { AlertTriangle, ArrowUpRight, CheckCircle2, Columns2, FileCheck2, Gauge, LayoutDashboard, Map, PanelTop, Ruler, Table2 } from "lucide-react";
import type { EnergyEnvelopeGeometryResult } from "@/components/energy/domain/energyGeometryTypes";
import type { EnergyOpeningSetResult } from "@/components/energy/domain/energyOpeningTypes";
import type { EnergyDemandSetResult } from "@/components/energy/domain/energyDemandTypes";
import type { WinWattFieldMapResult } from "@/components/energy/domain/energyWinWattTransferTypes";
import type { EnergyExpertTable } from "@/components/property-survey/propertySurveyExpertTables";
import { energyWorkspaceTabs, type EnergyWorkspaceTab } from "@/components/property-survey/energy/PropertySurveyEnergyWorkspace";

export type EnergyCentralViewMode = "plan" | "data" | "split";

type CommonProps = {
  geometry: EnergyEnvelopeGeometryResult;
  openings: EnergyOpeningSetResult;
  demand: EnergyDemandSetResult;
  winWatt: WinWattFieldMapResult;
  expertTables: EnergyExpertTable[];
  activeTab: EnergyWorkspaceTab;
  onSelectTab: (tab: EnergyWorkspaceTab) => void;
  onOpenWorkspace: (mode?: EnergyCentralViewMode) => void;
};

type BoardProps = CommonProps & {
  viewMode: EnergyCentralViewMode;
  onViewModeChange: (mode: EnergyCentralViewMode) => void;
  complete: boolean;
  levelName?: string;
};

function number(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return value.toLocaleString("hu-HU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function EnergyWorkspaceSummaryBoard({ geometry, openings, demand, winWatt, expertTables, activeTab, onSelectTab, onOpenWorkspace, viewMode, onViewModeChange, complete, levelName }: BoardProps) {
  const errorCount = geometry.validationMessages.filter((item) => item.blocking).length
    + openings.validationMessages.filter((item) => item.blocking).length
    + demand.validationMessages.filter((item) => item.blocking).length
    + winWatt.totals.blockedFieldCount;

  return <div className="grid min-w-0 gap-4" data-energy-summary-board>
    <div className="flex items-center justify-between gap-3">
      <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[9px] font-black uppercase ${complete ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>{complete ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{complete ? "Rendben" : "Hiányos"}</span>
      <span className="text-[9px] font-black uppercase text-[var(--survey-muted)]">{levelName || "Aktív szint"}</span>
    </div>

    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-2" data-energy-summary-navigation>
      {energyWorkspaceTabs.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" data-energy-board-tab={item.id} onClick={() => { onSelectTab(item.id); onOpenWorkspace("data"); }} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-[8px] font-black uppercase ${activeTab === item.id ? "bg-cyan-100 text-cyan-900 ring-1 ring-cyan-400" : "text-[var(--survey-muted)] hover:bg-[var(--survey-panel)]"}`}><Icon size={14} /> <span className="leading-3">{item.label}</span></button>; })}
    </div>

    <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-3 text-cyan-950">
      <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-700 text-white"><LayoutDashboard size={17} /></span><div><div className="text-sm font-black">Részletes adatok a központi munkafelületen</div><div className="mt-1 text-[10px] font-semibold leading-4">A jobb board csak navigációt és rövid állapotot mutat. A teljes űrlapok és táblák külön adatnézetben nyílnak meg.</div></div></div>
      <button type="button" data-energy-open-central-workspace onClick={() => onOpenWorkspace("data")} className="survey-action-primary mt-3 w-full"><ArrowUpRight size={15} /> Megnyitás a munkafelületen</button>
    </div>

    <div className="grid grid-cols-3 gap-2" data-energy-board-view-switch>
      {([
        ["plan", "Rajz", Map],
        ["data", "Adatok", PanelTop],
        ["split", "Osztott", Columns2],
      ] as const).map(([id, label, Icon]) => <button key={id} type="button" data-energy-central-view={id} onClick={() => onViewModeChange(id)} className={`flex min-h-10 items-center justify-center gap-1 rounded-xl border px-2 text-[8px] font-black uppercase ${viewMode === id ? "border-cyan-400 bg-cyan-100 text-cyan-900" : "border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-muted)]"}`}><Icon size={13} /> {label}</button>)}
    </div>

    <div className="grid grid-cols-2 gap-2">
      <MiniMetric label="Lehűlő felület" value={`${number(geometry.totals.thermalEnvelopeAreaSquareMeters)} m²`} />
      <MiniMetric label="Kond. térfogat" value={`${number(geometry.totals.conditionedVolumeCubicMeters)} m³`} />
      <MiniMetric label="Nyílászáró" value={`${openings.totals.openingCount} db · ${number(openings.totals.totalOpeningAreaSquareMeters)} m²`} />
      <MiniMetric label="Fűtési igény" value={demand.enabled ? `${number(demand.totals.designHeatingPowerKw, 2)} kW` : "Nincs bekapcsolva"} />
      <MiniMetric label="Szakértői táblák" value={`${expertTables.length} adatcsoport`} />
      <MiniMetric label="WinWatt átadás" value={`${winWatt.totals.blockedFieldCount} blokkolt`} warning={winWatt.totals.blockedFieldCount > 0} />
    </div>

    <div className={`rounded-2xl border p-3 ${errorCount ? "border-rose-300 bg-rose-50 text-rose-950" : "border-emerald-300 bg-emerald-50 text-emerald-950"}`}>
      <div className="flex items-center gap-2 text-xs font-black">{errorCount ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}{errorCount ? `${errorCount} javítandó vagy blokkoló tétel` : "Nincs blokkoló tétel"}</div>
      <div className="mt-1 text-[9px] font-semibold leading-4">A részletes üzenetek az Állapot és WinWatt átadás munkalapon érhetők el.</div>
    </div>
  </div>;
}

export function EnergyWorkspaceQuickCards({ geometry, openings, demand, winWatt, expertTables, activeTab, onSelectTab, onOpenWorkspace }: CommonProps) {
  const cards: Array<{ id: EnergyWorkspaceTab; label: string; value: string; detail: string; icon: typeof Gauge; warning?: boolean }> = [
    { id: "geometry", label: "Geometria", value: `${number(geometry.totals.thermalEnvelopeAreaSquareMeters)} m²`, detail: `${number(geometry.totals.conditionedVolumeCubicMeters)} m³ kondicionált térfogat`, icon: Ruler, warning: geometry.blocked },
    { id: "openings", label: "Nyílászárók", value: `${openings.totals.openingCount} db`, detail: `${number(openings.totals.totalOpeningAreaSquareMeters)} m² · ${openings.totals.blockedOpeningCount} blokkolt`, icon: LayoutDashboard, warning: openings.totals.blockedOpeningCount > 0 },
    { id: "demand", label: "Zónaterhelés", value: demand.enabled ? `${number(demand.totals.designHeatingPowerKw, 2)} kW` : "Kikapcsolva", detail: `${demand.totals.calculatedZoneCount}/${demand.totals.zoneCount} számított zóna`, icon: Gauge, warning: demand.blocked },
    { id: "tables", label: "Szakértői táblák", value: `${expertTables.length} db`, detail: "WinWatt-logikájú adatcsoportok", icon: Table2 },
    { id: "transfer", label: "WinWatt átadás", value: `${winWatt.totals.mappedFieldCount} mező`, detail: `${winWatt.totals.blockedFieldCount} blokkolt · ${winWatt.totals.reviewFieldCount} ellenőrzendő`, icon: FileCheck2, warning: winWatt.totals.blockedFieldCount > 0 },
  ];

  return <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-energy-quick-cards>
    {cards.map((card) => { const Icon = card.icon; return <button key={card.id} type="button" data-energy-quick-card={card.id} onClick={() => { onSelectTab(card.id); onOpenWorkspace("data"); }} title={`A teljes ${card.label.toLowerCase()} munkalap megnyitása`} className={`group relative min-w-[150px] flex-1 rounded-2xl border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${activeTab === card.id ? "border-cyan-400 bg-cyan-50 text-cyan-950" : card.warning ? "border-amber-300 bg-amber-50 text-amber-950" : "border-[var(--survey-border)] bg-[var(--survey-panel)] text-[var(--survey-text)]"}`}>
      <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-[9px] font-black uppercase"><Icon size={14} />{card.label}</span><ArrowUpRight size={13} /></div>
      <div className="mt-2 text-base font-black">{card.value}</div>
      <div className="mt-1 text-[9px] font-semibold leading-4 text-[var(--survey-muted)]">{card.detail}</div>
      <span className="pointer-events-none absolute left-2 right-2 top-[calc(100%+6px)] z-50 hidden rounded-xl bg-slate-950 px-3 py-2 text-[9px] font-semibold leading-4 text-white shadow-xl group-hover:block">Kattintásra a teljes {card.label.toLowerCase()} munkalap nyílik meg. Tableten koppintással működik.</span>
    </button>; })}
  </div>;
}

function MiniMetric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className={`min-w-0 rounded-xl border p-3 ${warning ? "border-amber-300 bg-amber-50 text-amber-950" : "border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-text)]"}`}><div className="text-[8px] font-black uppercase text-[var(--survey-muted)]">{label}</div><div className="mt-1 break-words text-sm font-black leading-5">{value}</div></div>;
}
