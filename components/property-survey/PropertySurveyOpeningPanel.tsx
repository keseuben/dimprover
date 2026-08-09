"use client";

import { DoorOpen, Plus, Ruler, Trash2 } from "lucide-react";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import type { EnergyOpeningDetail, EnergyOpeningResult } from "@/components/energy/domain/energyOpeningTypes";
import { HoldActionButton } from "@/components/property-survey/HoldActionButton";
import {
  getWallSegmentOrientationLabel,
  getWallSegmentLengthMeters,
  surveyOpeningKindLabels,
  surveyWallBoundaryLabels,
  surveyWallSideLabels,
  type SurveyOpeningKind,
  type SurveyWallOpening,
  type SurveyWallSegment,
} from "@/components/property-survey/propertySurveyBuildingModel";

type PropertySurveyOpeningPanelProps = {
  rooms: SurveyRoom[];
  wallSegments: SurveyWallSegment[];
  openings: SurveyWallOpening[];
  activeWallSegmentId: string | null;
  activeOpeningId: string | null;
  northAngle: number;
  energyDetail?: EnergyOpeningDetail | null;
  energyResult?: EnergyOpeningResult | null;
  onWallSelect: (segmentId: string) => void;
  onOpeningSelect: (openingId: string) => void;
  onAdd: (wallSegmentId: string, kind?: SurveyOpeningKind) => void;
  onUpdate: (openingId: string, patch: Partial<SurveyWallOpening>) => void;
  onDelete: (openingId: string) => void;
  onMove: (openingId: string, offsetRatio: number) => void;
};

export function PropertySurveyOpeningPanel({ rooms, wallSegments, openings, activeWallSegmentId, activeOpeningId, northAngle, energyDetail, energyResult, onWallSelect, onOpeningSelect, onAdd, onUpdate, onDelete, onMove }: PropertySurveyOpeningPanelProps) {
  const wall = wallSegments.find((segment) => segment.id === activeWallSegmentId) || wallSegments[0] || null;
  const room = rooms.find((item) => item.id === wall?.roomId) || null;
  const activeOpening = openings.find((opening) => opening.id === activeOpeningId) || (wall ? openings.find((opening) => opening.wallSegmentId === wall.id) : null) || null;
  const inputClass = "h-11 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 text-sm font-bold text-[var(--survey-text)] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";
  const labelClass = "mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-[var(--survey-muted)]";

  if (!wall || !room) return <div className="rounded-2xl border border-dashed border-blue-300 bg-blue-50 p-5 text-center text-blue-950"><DoorOpen className="mx-auto" size={28} /><div className="mt-3 text-sm font-black">Előbb válassz falat</div><div className="mt-1 text-xs font-semibold leading-5">Kattints az alaprajzon arra a falszakaszra, amelyre az ablakot vagy ajtót fel szeretnéd venni.</div></div>;

  const wallLength = getWallSegmentLengthMeters(room, wall);
  const orientation = getWallSegmentOrientationLabel(wall, northAngle);
  const wallOpenings = openings.filter((opening) => opening.wallSegmentId === wall.id);

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-blue-300 bg-blue-50 p-4 text-blue-950"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-700 text-white"><DoorOpen size={19} /></span><div><div className="text-sm font-black">Falhoz kötött nyílászárók</div><div className="mt-1 text-xs font-semibold leading-5">A tájolást a falszakasz oldala és az alaprajz északi szöge adja. Kézzel nem kell újra megadni.</div></div></div></div>

      <label><span className={labelClass}>Kijelölt falszakasz</span><select className={inputClass} value={wall.id} onChange={(event) => onWallSelect(event.target.value)}>{rooms.map((item) => <optgroup key={item.id} label={item.name}>{wallSegments.filter((segment) => segment.roomId === item.id).map((segment) => <option key={segment.id} value={segment.id}>{surveyWallSideLabels[segment.side]} · {getWallSegmentLengthMeters(item, segment).toFixed(2)} m · {surveyWallBoundaryLabels[segment.boundaryType]}</option>)}</optgroup>)}</select></label>
      <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3"><div className="text-[9px] font-black uppercase text-[var(--survey-muted)]">Falhossz</div><div className="mt-1 text-lg font-black text-[var(--survey-text)]">{wallLength.toFixed(2).replace(".", ",")} m</div></div><div className="rounded-xl border border-cyan-300 bg-cyan-50 p-3 text-slate-950"><div className="text-[9px] font-black uppercase text-cyan-800">Automatikus tájolás</div><div className="mt-1 text-lg font-black">{orientation.label} · {orientation.azimuth}°</div></div></div>
      <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => onAdd(wall.id, "window")} className="survey-action-primary"><Plus size={16} /> Ablak hozzáadása</button><button type="button" onClick={() => onAdd(wall.id, "door")} className="survey-action-secondary"><DoorOpen size={16} /> Ajtó hozzáadása</button></div>

      {wallOpenings.length ? <label><span className={labelClass}>Nyílászárók a kijelölt falon</span><select className={inputClass} value={activeOpening?.id || wallOpenings[0].id} onChange={(event) => onOpeningSelect(event.target.value)}>{wallOpenings.map((opening, index) => <option key={opening.id} value={opening.id}>{index + 1}. {opening.name} · {opening.widthMeters.toFixed(2)} × {opening.heightMeters.toFixed(2)} m</option>)}</select></label> : <div className="rounded-xl border border-dashed border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4 text-center text-xs font-bold text-[var(--survey-muted)]">Ezen a falszakaszon még nincs nyílászáró.</div>}

      {activeOpening && activeOpening.wallSegmentId === wall.id ? <>
        <label><span className={labelClass}>Típus</span><select className={inputClass} value={activeOpening.kind} onChange={(event) => onUpdate(activeOpening.id, { kind: event.target.value as SurveyOpeningKind, name: surveyOpeningKindLabels[event.target.value as SurveyOpeningKind], updatedAt: new Date().toISOString() })}>{Object.entries(surveyOpeningKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span className={labelClass}>Megnevezés</span><input className={inputClass} value={activeOpening.name} onChange={(event) => onUpdate(activeOpening.id, { name: event.target.value, updatedAt: new Date().toISOString() })} /></label>
        <div className="grid grid-cols-2 gap-3"><label><span className={labelClass}>Szélesség (m)</span><input type="number" min="0.1" max={wallLength} step="0.01" className={inputClass} value={activeOpening.widthMeters} onChange={(event) => onUpdate(activeOpening.id, { widthMeters: Number(event.target.value) || 0, updatedAt: new Date().toISOString() })} /></label><label><span className={labelClass}>Magasság (m)</span><input type="number" min="0.1" step="0.01" className={inputClass} value={activeOpening.heightMeters} onChange={(event) => onUpdate(activeOpening.id, { heightMeters: Number(event.target.value) || 0, updatedAt: new Date().toISOString() })} /></label></div>
        <div className="grid grid-cols-2 gap-3"><label><span className={labelClass}>Parapet (m)</span><input type="number" min="0" step="0.01" className={inputClass} value={activeOpening.sillHeightMeters} onChange={(event) => onUpdate(activeOpening.id, { sillHeightMeters: Number(event.target.value) || 0, updatedAt: new Date().toISOString() })} /></label><label><span className={labelClass}>Hely a falon (%)</span><input type="number" min="0" max="100" step="1" className={inputClass} value={Math.round(activeOpening.offsetRatio * 100)} onChange={(event) => onUpdate(activeOpening.id, { offsetRatio: Math.min(1, Math.max(0, Number(event.target.value) / 100)), updatedAt: new Date().toISOString() })} /></label></div>
        <label><span className={labelClass}>Elhelyezés a falon</span><input type="range" min="0" max="100" value={Math.round(activeOpening.offsetRatio * 100)} onChange={(event) => onMove(activeOpening.id, Number(event.target.value) / 100)} className="w-full accent-cyan-600" /></label>
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold leading-5 text-blue-900">Az alaprajzon az aktív nyílászárót közvetlenül is megfoghatod és végigtolhatod a kijelölt falszakaszon.</div>
        <label><span className={labelClass}>Keret</span><input className={inputClass} value={activeOpening.frame} onChange={(event) => onUpdate(activeOpening.id, { frame: event.target.value, updatedAt: new Date().toISOString() })} /></label>
        <label><span className={labelClass}>Üvegezés / szerkezet</span><input className={inputClass} value={activeOpening.glazing} onChange={(event) => onUpdate(activeOpening.id, { glazing: event.target.value, updatedAt: new Date().toISOString() })} /></label>
        <div className="grid grid-cols-2 gap-3"><label><span className={labelClass}>U-érték W/m²K</span><input className={inputClass} value={activeOpening.uValue} onChange={(event) => onUpdate(activeOpening.id, { uValue: event.target.value, updatedAt: new Date().toISOString() })} /></label><label><span className={labelClass}>Árnyékolás</span><input className={inputClass} value={activeOpening.shading} onChange={(event) => onUpdate(activeOpening.id, { shading: event.target.value, updatedAt: new Date().toISOString() })} /></label></div>
        <div className="rounded-xl border border-cyan-300 bg-cyan-50 p-3 text-xs font-bold leading-5 text-cyan-950"><Ruler className="mr-2 inline" size={15} />Automatikus energetikai tájolás: <strong>{orientation.label} ({orientation.azimuth}°)</strong>. A nyílászáró felülete: {(activeOpening.widthMeters * activeOpening.heightMeters).toFixed(2).replace(".", ",")} m².</div>
        <div data-opening-energy-summary={activeOpening.id} className={`rounded-xl border p-3 text-xs font-bold leading-5 ${energyResult?.blocked || energyResult?.compliance === "notCompliant" ? "border-rose-300 bg-rose-50 text-rose-950" : energyResult?.compliance === "compliant" ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
          <div className="text-[9px] font-black uppercase">Energetikai nyílászáróeredmény · {energyDetail?.calculationMode === "detailed" ? "részletes" : "deklarált"}</div>
          <div className="mt-1">Uw: <strong>{energyResult?.effectiveUwWm2K === null || energyResult?.effectiveUwWm2K === undefined ? "nincs számítva" : `${energyResult.effectiveUwWm2K.toFixed(3).replace(".", ",")} W/m²K`}</strong> · követelmény: <strong>{energyResult?.requirementMaximumUwWm2K === null || energyResult?.requirementMaximumUwWm2K === undefined ? "nem alkalmazott" : `${energyResult.requirementMaximumUwWm2K.toFixed(3).replace(".", ",")} W/m²K`}</strong></div>
          <div className="mt-1">Beépítési perem: {energyResult?.installationHeatLossCoefficientWK.toFixed(3).replace(".", ",") || "0,000"} W/K · állapot: {energyResult?.blocked ? "blokkolt" : energyResult?.compliance === "compliant" ? "megfelel" : energyResult?.compliance === "notCompliant" ? "nem felel meg" : "nem vizsgált"}.</div>
          <div className="mt-1 text-[9px] font-semibold">A részletes Uw-, Ψ- és χ-adatok az Energetika / Nyílászárók lapon szerkeszthetők.</div>
        </div>
        <HoldActionButton tone="danger" durationMs={2000} icon={<Trash2 size={16} />} label="Nyílászáró törlése · 2 mp" holdingLabel="Törléshez" ariaLabel={`${activeOpening.name} törléséhez tartsd nyomva 2 másodpercig`} onComplete={() => onDelete(activeOpening.id)} className="w-full" />
      </> : null}
    </div>
  );
}
