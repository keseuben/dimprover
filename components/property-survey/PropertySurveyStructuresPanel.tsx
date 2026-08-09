"use client";

import { useEffect, useState } from "react";
import { Layers3, RefreshCw } from "lucide-react";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import { PropertySurveyWallPanel } from "@/components/property-survey/PropertySurveyWallPanel";
import { PropertySurveyAssembliesEditor } from "@/components/property-survey/PropertySurveyAssembliesEditor";
import type { EnergyAssemblyThermalResult } from "@/components/energy/domain/energyAssemblyTypes";
import type { SurveyConstructionAssembly, SurveyThermalBoundarySettings } from "@/components/property-survey/propertySurveyEnergyModel";
import type { SurveyWallSegment } from "@/components/property-survey/propertySurveyBuildingModel";
import type { MaterialWorkspaceState } from "@/components/materials/domain/materialWorkspaceTypes";

type Props = {
  rooms: SurveyRoom[];
  activeRoom: SurveyRoom | null;
  wallSegments: SurveyWallSegment[];
  activeWallSegmentId: string | null;
  northAngle: number;
  thermalBoundary: SurveyThermalBoundarySettings;
  thermalEnabled: boolean;
  thermalSummary?: { totalMeters: number; segmentCount: number };
  assemblies: SurveyConstructionAssembly[];
  assemblyResults: EnergyAssemblyThermalResult[];
  materialWorkspace: MaterialWorkspaceState;
  onMaterialWorkspaceChange: (workspace: MaterialWorkspaceState) => void;
  onSelectWall: (segmentId: string) => void;
  onUpdateWall: (segmentId: string, patch: Partial<SurveyWallSegment>) => void;
  onSplitWall: (segmentId: string) => void;
  onDeleteWall: (segmentId: string) => void;
  onRebuildAutomatic: () => void;
  onUpdateThermalBoundary: (patch: Partial<SurveyThermalBoundarySettings>) => void;
  onFitThermalBoundary: () => void;
  onAddAssembly: (assembly: SurveyConstructionAssembly) => void;
  onUpdateAssembly: (assemblyId: string, patch: Partial<SurveyConstructionAssembly>) => void;
  onDeleteAssembly: (assemblyId: string) => void;
  onAssignRoomAssembly: (field: "floorAssemblyId" | "ceilingAssemblyId" | "plinthAssemblyId", assemblyId: string) => void;
};

type Tab = "wall" | "thermal" | "assemblies";

const inputClass = "h-11 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 text-sm font-bold text-[var(--survey-text)] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";
const labelClass = "mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-[var(--survey-muted)]";

export function PropertySurveyStructuresPanel(props: Props) {
  const [tab, setTab] = useState<Tab>("wall");
  useEffect(() => {
    if (!props.thermalEnabled && tab === "thermal") setTab("wall");
  }, [props.thermalEnabled, tab]);

  const wallAssemblies = props.assemblies.filter((item) => item.category === "wall");

  return <div className="grid gap-4">
    <div className={`grid ${props.thermalEnabled ? "grid-cols-3" : "grid-cols-2"} gap-2 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-2`}>
      {([['wall','Falszakasz'],...(props.thermalEnabled ? [['thermal','Hőhatár'] as const] : []),['assemblies','Rétegrendek']] as const).map(([value,label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`min-h-10 rounded-xl px-2 text-[10px] font-black uppercase tracking-[0.06em] ${tab === value ? "bg-cyan-100 text-cyan-900 ring-1 ring-cyan-400" : "text-[var(--survey-muted)] hover:bg-[var(--survey-panel)]"}`}>{label}</button>)}
    </div>

    {tab === "wall" ? <PropertySurveyWallPanel rooms={props.rooms} wallSegments={props.wallSegments} activeWallSegmentId={props.activeWallSegmentId} northAngle={props.northAngle} onSelect={props.onSelectWall} onUpdate={props.onUpdateWall} onSplit={props.onSplitWall} onDelete={props.onDeleteWall} onRebuildAutomatic={props.onRebuildAutomatic} assemblies={wallAssemblies} /> : null}

    {tab === "thermal" ? <div className="grid gap-4">
      <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-700 text-white"><Layers3 size={19} /></span><div><div className="text-sm font-black">Szerkeszthető energetikai hőhatár</div><div className="mt-1 text-xs font-semibold leading-5">Automatikusan a tényleges külső és fűtött–fűtetlen falszakaszokat követi. Kézi módban egyedi négyszögkontúr is megadható.</div></div></div></div>
      <label><span className={labelClass}>Hőhatár mód</span><select className={inputClass} value={props.thermalBoundary.mode} onChange={(event) => props.onUpdateThermalBoundary({ mode: event.target.value as SurveyThermalBoundarySettings["mode"], updatedAt: new Date().toISOString() })}><option value="heatedRooms">Automatikus – csak fűtött terek</option><option value="allRooms">Automatikus – minden helyiség</option><option value="manual">Kézi kontúr</option></select></label>
      <label><span className={labelClass}>Hőhatár ráhagyás / eltolás (cm)</span><input type="number" min="-200" max="500" step="1" className={inputClass} value={props.thermalBoundary.offsetCm} onChange={(event) => props.onUpdateThermalBoundary({ offsetCm: Number(event.target.value) || 0, updatedAt: new Date().toISOString() })} /></label>
      {props.thermalBoundary.mode === "manual" ? <div className="grid grid-cols-2 gap-3">
        <label><span className={labelClass}>Bal pozíció (m)</span><input type="number" step="0.01" className={inputClass} value={(props.thermalBoundary.manualX / 60).toFixed(2)} onChange={(event) => props.onUpdateThermalBoundary({ manualX: (Number(event.target.value) || 0) * 60, updatedAt: new Date().toISOString() })} /></label>
        <label><span className={labelClass}>Felső pozíció (m)</span><input type="number" step="0.01" className={inputClass} value={(props.thermalBoundary.manualY / 60).toFixed(2)} onChange={(event) => props.onUpdateThermalBoundary({ manualY: (Number(event.target.value) || 0) * 60, updatedAt: new Date().toISOString() })} /></label>
        <label><span className={labelClass}>Szélesség (m)</span><input type="number" min="0.1" step="0.01" className={inputClass} value={(props.thermalBoundary.manualWidth / 60).toFixed(2)} onChange={(event) => props.onUpdateThermalBoundary({ manualWidth: Math.max(6, (Number(event.target.value) || 0.1) * 60), updatedAt: new Date().toISOString() })} /></label>
        <label><span className={labelClass}>Magasság (m)</span><input type="number" min="0.1" step="0.01" className={inputClass} value={(props.thermalBoundary.manualHeight / 60).toFixed(2)} onChange={(event) => props.onUpdateThermalBoundary({ manualHeight: Math.max(6, (Number(event.target.value) || 0.1) * 60), updatedAt: new Date().toISOString() })} /></label>
      </div> : null}
      <button type="button" onClick={props.onFitThermalBoundary} className="survey-action-secondary"><RefreshCw size={16} /> Hőhatár igazítása az aktuális helyiségekhez</button>
      {props.thermalSummary ? <div className="grid grid-cols-2 gap-2"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-950"><div className="text-[9px] font-black uppercase">Hőhatár hossza</div><div className="mt-1 text-xl font-black">{props.thermalSummary.totalMeters.toFixed(2).replace(".", ",")} m</div></div><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-950"><div className="text-[9px] font-black uppercase">Falszakasz</div><div className="mt-1 text-xl font-black">{props.thermalSummary.segmentCount} db</div></div></div> : null}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs font-bold leading-5 text-emerald-900">A zöld szaggatott vonal közvetlenül az energetikai határoló falszakaszokat követi. Fűtött–fűtetlen kapcsolatnál csak a fűtött oldal közös fala kerül a hőhatárba.</div>
    </div> : null}

    {tab === "assemblies" ? <PropertySurveyAssembliesEditor activeRoom={props.activeRoom} assemblies={props.assemblies} assemblyResults={props.assemblyResults} materialWorkspace={props.materialWorkspace} onMaterialWorkspaceChange={props.onMaterialWorkspaceChange} onAddAssembly={props.onAddAssembly} onUpdateAssembly={props.onUpdateAssembly} onDeleteAssembly={props.onDeleteAssembly} onAssignRoomAssembly={props.onAssignRoomAssembly} /> : null}
  </div>;
}
