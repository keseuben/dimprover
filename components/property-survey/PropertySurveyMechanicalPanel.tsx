"use client";

import { Fan, Flame, MapPinPlus, Move, Plus, Trash2, X } from "lucide-react";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import { HoldActionButton } from "@/components/property-survey/HoldActionButton";
import {
  surveyMechanicalKindLabels,
  type SurveyMechanicalDevice,
  type SurveyMechanicalKind,
  type SurveyMechanicalPlacementMode,
} from "@/components/property-survey/propertySurveyEnergyModel";
import type { PropertySurveyDraft } from "@/components/property-survey/propertySurveyWorkspaceTypes";

type Props = {
  mechanical: PropertySurveyDraft["mechanical"];
  rooms: SurveyRoom[];
  devices: SurveyMechanicalDevice[];
  activeDeviceId: string | null;
  placementMode: SurveyMechanicalPlacementMode;
  pendingKind: SurveyMechanicalKind;
  onSystemUpdate: (key: keyof PropertySurveyDraft["mechanical"], value: string) => void;
  onPendingKindChange: (kind: SurveyMechanicalKind) => void;
  onStartCreate: () => void;
  onStartMove: () => void;
  onCancelPlacement: () => void;
  onSelect: (deviceId: string) => void;
  onUpdate: (deviceId: string, patch: Partial<SurveyMechanicalDevice>) => void;
  onDelete: (deviceId: string) => void;
};

const inputClass = "h-11 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 text-sm font-bold text-[var(--survey-text)] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";
const textareaClass = "min-h-20 w-full resize-y rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 py-3 text-sm font-semibold text-[var(--survey-text)] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";
const labelClass = "mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-[var(--survey-muted)]";

export function PropertySurveyMechanicalPanel(props: Props) {
  const active = props.devices.find((device) => device.id === props.activeDeviceId) || null;
  return <div className="grid gap-4">
    <div className="rounded-2xl border border-blue-300 bg-blue-50 p-4 text-blue-950"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-700 text-white"><Fan size={19}/></span><div><div className="text-sm font-black">Gépészeti berendezések elhelyezése</div><div className="mt-1 text-xs font-semibold leading-5">Válassz berendezést, majd koppints arra a helyiségre és pontra, ahol ténylegesen található.</div></div></div>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2"><select className={inputClass} value={props.pendingKind} onChange={(event)=>props.onPendingKindChange(event.target.value as SurveyMechanicalKind)}>{Object.entries(surveyMechanicalKindLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>{props.placementMode?<button type="button" onClick={props.onCancelPlacement} className="survey-icon-button h-11 w-11"><X size={16}/></button>:<button type="button" onClick={props.onStartCreate} className="survey-icon-button h-11 w-11 border-blue-500 bg-blue-100 text-blue-800" aria-label="Gépészeti berendezés elhelyezése"><MapPinPlus size={18}/></button>}</div>
      {props.placementMode ? <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900">{props.placementMode === "create" ? "Koppints a berendezés helyére az alaprajzon." : "Koppints a berendezés új helyére."}</div> : null}
    </div>

    <div className="grid gap-2"><div className="flex items-center justify-between"><div><div className="text-sm font-black text-[var(--survey-text)]">Elhelyezett berendezések</div><div className="text-xs font-semibold text-[var(--survey-muted)]">{props.devices.length} db</div></div></div>{props.devices.length?props.devices.map((device)=>{const roomName=props.rooms.find((room)=>room.id===device.roomId)?.name||"Nincs helyiség";const selected=device.id===props.activeDeviceId;return <button key={device.id} type="button" onClick={()=>props.onSelect(device.id)} className={`rounded-xl border p-3 text-left ${selected?'border-blue-400 bg-blue-50 text-slate-950':'border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-text)]'}`}><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-800">{device.kind==='boiler'||device.kind==='radiator'||device.kind==='underfloorHeating'?<Flame size={17}/>:<Fan size={17}/>}</span><div className="min-w-0"><div className="truncate text-sm font-black">{device.name}</div><div className={`mt-1 truncate text-[10px] font-bold ${selected?'text-slate-600':'text-[var(--survey-muted)]'}`}>{roomName} · {surveyMechanicalKindLabels[device.kind]}</div></div></div></button>}) : <div className="rounded-xl border border-dashed border-[var(--survey-border)] p-4 text-center text-xs font-bold text-[var(--survey-muted)]">Még nincs alaprajzon elhelyezett berendezés.</div>}</div>

    {active ? <div className="grid gap-4 border-t border-[var(--survey-border)] pt-4">
      <div className="flex items-center justify-between gap-3"><div><div className="text-[10px] font-black uppercase text-blue-700">Aktív berendezés</div><div className="mt-1 text-lg font-black text-[var(--survey-text)]">{active.name}</div></div><button type="button" onClick={props.onStartMove} className="survey-action-secondary"><Move size={15}/> Hely módosítása</button></div>
      <label><span className={labelClass}>Típus</span><select className={inputClass} value={active.kind} onChange={(event)=>{const kind=event.target.value as SurveyMechanicalKind;props.onUpdate(active.id,{kind,name:surveyMechanicalKindLabels[kind],updatedAt:new Date().toISOString()})}}>{Object.entries(surveyMechanicalKindLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label><span className={labelClass}>Megnevezés</span><input className={inputClass} value={active.name} onChange={(event)=>props.onUpdate(active.id,{name:event.target.value,updatedAt:new Date().toISOString()})}/></label>
      <label><span className={labelClass}>Helyiség</span><select className={inputClass} value={active.roomId} onChange={(event)=>props.onUpdate(active.id,{roomId:event.target.value,updatedAt:new Date().toISOString()})}>{props.rooms.map((room)=><option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-3"><label><span className={labelClass}>Gyártó</span><input className={inputClass} value={active.manufacturer} onChange={(event)=>props.onUpdate(active.id,{manufacturer:event.target.value,updatedAt:new Date().toISOString()})}/></label><label><span className={labelClass}>Modell</span><input className={inputClass} value={active.model} onChange={(event)=>props.onUpdate(active.id,{model:event.target.value,updatedAt:new Date().toISOString()})}/></label></div>
      <label><span className={labelClass}>Teljesítmény / kapacitás</span><input className={inputClass} value={active.capacity} onChange={(event)=>props.onUpdate(active.id,{capacity:event.target.value,updatedAt:new Date().toISOString()})} placeholder="Pl. 24 kW, 120 l, 3,5 kW"/></label>
      <label><span className={labelClass}>Megjegyzés</span><textarea className={textareaClass} value={active.note} onChange={(event)=>props.onUpdate(active.id,{note:event.target.value,updatedAt:new Date().toISOString()})}/></label>
      <HoldActionButton tone="danger" durationMs={2000} icon={<Trash2 size={16}/>} label="Berendezés törlése · 2 mp" holdingLabel="Törléshez" ariaLabel={`${active.name} törléséhez tartsd nyomva 2 másodpercig`} onComplete={()=>props.onDelete(active.id)} className="w-full"/>
    </div> : null}

    <div className="grid gap-3 border-t border-[var(--survey-border)] pt-4"><div className="flex items-center gap-2 text-sm font-black text-[var(--survey-text)]"><Plus size={16}/> Épületgépészeti összesítő</div>
      <label><span className={labelClass}>Fűtési rendszer</span><select className={inputClass} value={props.mechanical.heating} onChange={(event)=>props.onSystemUpdate('heating',event.target.value)}><option value="">Nincs rögzítve</option><option>Központi fűtés</option><option>Helyiségenkénti fűtés</option><option>Távhő</option><option>Elektromos fűtés</option><option>Vegyes rendszer</option></select></label>
      <label><span className={labelClass}>Hőtermelő</span><input className={inputClass} value={props.mechanical.heatGenerator} onChange={(event)=>props.onSystemUpdate('heatGenerator',event.target.value)}/></label>
      <label><span className={labelClass}>Hőleadás</span><input className={inputClass} value={props.mechanical.heatEmission} onChange={(event)=>props.onSystemUpdate('heatEmission',event.target.value)}/></label>
      <label><span className={labelClass}>Használati meleg víz</span><input className={inputClass} value={props.mechanical.hotWater} onChange={(event)=>props.onSystemUpdate('hotWater',event.target.value)}/></label>
      <label><span className={labelClass}>Szellőzés</span><input className={inputClass} value={props.mechanical.ventilation} onChange={(event)=>props.onSystemUpdate('ventilation',event.target.value)}/></label>
      <label><span className={labelClass}>Hűtés</span><input className={inputClass} value={props.mechanical.cooling} onChange={(event)=>props.onSystemUpdate('cooling',event.target.value)}/></label>
      <label><span className={labelClass}>Megújuló energia</span><input className={inputClass} value={props.mechanical.renewable} onChange={(event)=>props.onSystemUpdate('renewable',event.target.value)}/></label>
    </div>
  </div>;
}
