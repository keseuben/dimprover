"use client";

import { AlertTriangle, Minus, Plus, RefreshCw, Scissors, Scaling, Trash2 } from "lucide-react";
import { HoldActionButton } from "@/components/property-survey/HoldActionButton";
import { getAssemblyTotalThicknessCm, type SurveyConstructionAssembly } from "@/components/property-survey/propertySurveyEnergyModel";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import {
  getRoomSideLengthMeters,
  getWallSegmentOrientationLabel,
  getWallSegmentLengthMeters,
  normalizeRatio,
  surveyWallBoundaryLabels,
  surveyWallSideLabels,
  type SurveyWallBoundaryType,
  type SurveyWallSegment,
} from "@/components/property-survey/propertySurveyBuildingModel";

type PropertySurveyWallPanelProps = {
  rooms: SurveyRoom[];
  wallSegments: SurveyWallSegment[];
  activeWallSegmentId: string | null;
  northAngle: number;
  onSelect: (segmentId: string) => void;
  onUpdate: (segmentId: string, patch: Partial<SurveyWallSegment>) => void;
  onSplit: (segmentId: string) => void;
  onDelete: (segmentId: string) => void;
  onRebuildAutomatic: () => void;
  assemblies?: SurveyConstructionAssembly[];
};

export function PropertySurveyWallPanel({ rooms, wallSegments, activeWallSegmentId, northAngle, onSelect, onUpdate, onSplit, onDelete, onRebuildAutomatic, assemblies = [] }: PropertySurveyWallPanelProps) {
  const active = wallSegments.find((segment) => segment.id === activeWallSegmentId) || wallSegments[0] || null;
  const room = rooms.find((item) => item.id === active?.roomId) || null;
  const sameSideSegments = active ? wallSegments.filter((segment) => segment.roomId === active.roomId && segment.side === active.side).sort((left, right) => left.startRatio - right.startRatio) : [];
  const inputClass = "h-11 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 text-sm font-bold text-[var(--survey-text)] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";
  const labelClass = "mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-[var(--survey-muted)]";

  if (!active || !room) {
    return <div className="rounded-2xl border border-dashed border-orange-300 bg-orange-50 p-5 text-center text-orange-950"><Scaling className="mx-auto" size={28} /><div className="mt-3 text-sm font-black">Válassz falszakaszt az alaprajzon</div><div className="mt-1 text-xs font-semibold leading-5">Kattints egy helyiség valamelyik oldalára. Ezután beállítható a falvastagság, faltípus és a határolási mód.</div></div>;
  }

  const sideLength = getRoomSideLengthMeters(room, active.side);
  const segmentLength = getWallSegmentLengthMeters(room, active);
  const startMeters = active.startRatio * sideLength;
  const orientation = getWallSegmentOrientationLabel(active, northAngle);
  const canDelete = sameSideSegments.length > 1;
  const segmentIndex = sameSideSegments.findIndex((segment) => segment.id === active.id);
  const isFirstSegment = segmentIndex === 0;
  const isLastSegment = segmentIndex === sameSideSegments.length - 1;

  function updateStart(value: number) {
    const startRatio = normalizeRatio(value / Math.max(sideLength, 0.01));
    const maximumStart = Math.max(0, active.endRatio - 0.03);
    onUpdate(active.id, { startRatio: Math.min(startRatio, maximumStart), updatedAt: new Date().toISOString() });
  }

  function updateLength(value: number) {
    const endRatio = normalizeRatio(active.startRatio + value / Math.max(sideLength, 0.01));
    onUpdate(active.id, { endRatio: Math.max(active.startRatio + 0.03, endRatio), updatedAt: new Date().toISOString() });
  }

  function nudgeLength(deltaMeters: number) {
    const nextLength = Math.max(0.05, Math.min(sideLength, segmentLength + deltaMeters));
    if (!isLastSegment) {
      updateLength(nextLength);
      return;
    }
    if (!isFirstSegment) updateStart(Math.max(0, startMeters - deltaMeters));
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-orange-300 bg-orange-50 p-4 text-orange-950">
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-600 text-white"><Scaling size={19} /></span><div><div className="text-sm font-black">Falszakasz-alapú szerkesztés</div><div className="mt-1 text-xs font-semibold leading-5">Egy helyiségoldal több részre osztható. Így külön rögzíthető a külső, belső vagy fűtetlen térrel határos falhossz.</div></div></div>
      </div>

      <div>
        <span className={labelClass}>Aktív falszakasz</span>
        <select className={inputClass} value={active.id} onChange={(event) => onSelect(event.target.value)}>
          {rooms.map((item) => {
            const items = wallSegments.filter((segment) => segment.roomId === item.id).sort((left, right) => left.side.localeCompare(right.side) || left.startRatio - right.startRatio);
            return <optgroup key={item.id} label={item.name}>{items.map((segment, index) => <option key={segment.id} value={segment.id}>{surveyWallSideLabels[segment.side]} · {index + 1}. szakasz · {getWallSegmentLengthMeters(item, segment).toFixed(2)} m</option>)}</optgroup>;
          })}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3"><div className="text-[9px] font-black uppercase text-[var(--survey-muted)]">Teljes oldalhossz</div><div className="mt-1 text-lg font-black text-[var(--survey-text)]">{sideLength.toFixed(2).replace(".", ",")} m</div></div>
        <div className="rounded-xl border border-cyan-300 bg-cyan-50 p-3 text-slate-950"><div className="text-[9px] font-black uppercase text-cyan-800">Szakasz / tájolás</div><div className="mt-1 text-lg font-black">{segmentLength.toFixed(2).replace(".", ",")} m · {orientation.label}</div><div className="text-[9px] font-bold text-slate-600">{orientation.azimuth}° azimut</div></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label><span className={labelClass}>Szakasz kezdete (m)</span><input type="number" min="0" max={sideLength} step="0.01" disabled={isFirstSegment} className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`} value={Number(startMeters.toFixed(2))} onChange={(event) => updateStart(Number(event.target.value) || 0)} /></label>
        <label><span className={labelClass}>Szakasz hossza (m)</span><input type="number" min="0.05" max={sideLength - startMeters} step="0.01" disabled={isLastSegment} className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`} value={Number(segmentLength.toFixed(2))} onChange={(event) => updateLength(Number(event.target.value) || 0.05)} /></label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => nudgeLength(-0.1)} disabled={isFirstSegment && isLastSegment} className="survey-action-secondary disabled:opacity-40"><Minus size={15} /> 10 cm-rel rövidebb</button>
        <button type="button" onClick={() => nudgeLength(0.1)} disabled={isFirstSegment && isLastSegment} className="survey-action-secondary disabled:opacity-40"><Plus size={15} /> 10 cm-rel hosszabb</button>
      </div>
      <div className="rounded-lg border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 py-2 text-[10px] font-semibold leading-4 text-[var(--survey-muted)]">A helyiségek mozgatásakor és méretváltozásakor a külső és belső falszakaszok automatikusan újraszámolódnak. A ±10 cm-es gombok a kézi szakaszhatárt finomítják. Egyetlen teljes oldal hosszát a helyiség hossz- vagy keresztméretével lehet módosítani.</div>

      <label><span className={labelClass}>Határolási mód</span><select className={inputClass} value={active.boundaryType} onChange={(event) => onUpdate(active.id, { boundaryType: event.target.value as SurveyWallBoundaryType, updatedAt: new Date().toISOString() })}>{Object.entries(surveyWallBoundaryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span className={labelClass}>Faltípus / rétegrend</span><input className={inputClass} value={active.wallType} onChange={(event) => onUpdate(active.id, { wallType: event.target.value, updatedAt: new Date().toISOString() })} placeholder="Pl. 38 cm tömör tégla + 10 cm EPS" /></label>
      <label><span className={labelClass}>Falrétegrend</span><select className={inputClass} value={active.assemblyId || ""} onChange={(event) => { const assembly = assemblies.find((item) => item.id === event.target.value); onUpdate(active.id, { assemblyId: event.target.value || undefined, wallType: assembly?.name || active.wallType, thicknessCm: assembly ? getAssemblyTotalThicknessCm(assembly) : active.thicknessCm, updatedAt: new Date().toISOString() }); }}><option value="">Nincs rétegrend hozzárendelve</option>{assemblies.map((assembly) => <option key={assembly.id} value={assembly.id}>{assembly.name} · {getAssemblyTotalThicknessCm(assembly).toFixed(1)} cm</option>)}</select></label>
      <label><span className={labelClass}>Falvastagság (cm)</span><input type="number" min="3" max="150" step="0.5" className={inputClass} value={active.thicknessCm} onChange={(event) => onUpdate(active.id, { thicknessCm: Number(event.target.value) || 0, updatedAt: new Date().toISOString() })} /></label>

      {active.boundaryType === "internal" ? <label><span className={labelClass}>Kapcsolódó helyiség</span><select className={inputClass} value={active.adjacentRoomId || ""} onChange={(event) => onUpdate(active.id, { adjacentRoomId: event.target.value || undefined, updatedAt: new Date().toISOString() })}><option value="">Nincs kiválasztva</option>{rooms.filter((item) => item.id !== room.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}

      {active.boundaryType === "external" ? <div className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-900"><AlertTriangle size={17} className="mt-0.5 shrink-0" /><span>Ez a {segmentLength.toFixed(2).replace(".", ",")} m hosszú szakasz bekerülhet az energetikai külső határoló falhosszba. A nyílászárók felületét később ebből a falszakaszból lehet levonni.</span></div> : null}

      <button type="button" onClick={onRebuildAutomatic} className="survey-action-secondary"><RefreshCw size={16} /> Falhatárok ellenőrzése és újraszámítása</button>
      <div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => onSplit(active.id)} disabled={segmentLength < 0.2} className="survey-action-secondary disabled:opacity-40"><Scissors size={16} /> Szakasz felezése</button><HoldActionButton tone="danger" durationMs={2000} compact disabled={!canDelete} icon={<Trash2 size={16} />} label="Összevonás · 2 mp" holdingLabel="Összevonáshoz" ariaLabel="A falszakasz összevonásához tartsd nyomva 2 másodpercig" onComplete={() => onDelete(active.id)} className="w-full" /></div>
      <label><span className={labelClass}>Megjegyzés</span><textarea className="min-h-20 w-full resize-y rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 py-3 text-sm font-semibold text-[var(--survey-text)] outline-none" value={active.note} onChange={(event) => onUpdate(active.id, { note: event.target.value, updatedAt: new Date().toISOString() })} /></label>
    </div>
  );
}
