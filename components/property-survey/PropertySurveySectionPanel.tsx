"use client";

import { Ruler, ScanLine, Trash2, Triangle, X } from "lucide-react";
import { HoldActionButton } from "@/components/property-survey/HoldActionButton";
import {
  surveyRoofShapeLabels,
  surveySectionKindLabels,
  type SurveyRoofShape,
  type SurveySectionDrawingConstraint,
  type SurveySectionInternalWallPosition,
  type SurveySectionKind,
  type SurveySectionLine,
} from "@/components/property-survey/propertySurveySectionModel";
import type { PropertySurveyMode } from "@/components/property-survey/propertySurveyWorkspaceTypes";

const inputClass = "h-10 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 text-xs font-black text-[var(--survey-text)] outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";

function numberValue(value: string, fallback = 0) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function SectionPreview({ line, spanMeters, internalWalls }: { line: SurveySectionLine; spanMeters: number; internalWalls: SurveySectionInternalWallPosition[] }) {
  const width = 320;
  const height = 190;
  const left = 34;
  const right = width - 34;
  const floorY = 158;
  const maxHeight = Math.max(1, line.ridgeHeightMeters, line.topSurfaceHeightMeters, line.eavesHeightMeters, line.clearHeightMeters);
  const scaleY = 112 / maxHeight;
  const eavesY = floorY - line.eavesHeightMeters * scaleY;
  const ridgeY = floorY - line.ridgeHeightMeters * scaleY;
  const clearY = floorY - line.clearHeightMeters * scaleY;
  const leftKneeY = floorY - line.leftKneeWallHeightMeters * scaleY;
  const rightKneeY = floorY - line.rightKneeWallHeightMeters * scaleY;
  const center = width / 2;

  const floorThicknessPx = Math.max(3, line.floorSlabThicknessCm / 100 * scaleY);
  const ceilingThicknessPx = Math.max(3, line.ceilingSlabThicknessCm / 100 * scaleY);

  const roofPath = line.roofShape === "flat"
    ? `M ${left} ${eavesY} L ${right} ${eavesY}`
    : line.roofShape === "singleSlope"
      ? `M ${left} ${eavesY} L ${right} ${ridgeY}`
      : `M ${left} ${eavesY} L ${center} ${ridgeY} L ${right} ${eavesY}`;

  const windowOnLeft = line.roofWindowSide === "left";
  const windowBaseX = windowOnLeft ? 93 : 227;
  const windowY = Math.min(eavesY - 8, Math.max(ridgeY + 22, (eavesY + ridgeY) / 2));

  return <div className="overflow-hidden rounded-2xl border border-cyan-200 bg-white p-2 text-slate-950">
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" aria-label={`${line.serial} metszeti előnézet`}>
      <defs>
        <pattern id={`section-grid-${line.id}`} width="16" height="16" patternUnits="userSpaceOnUse"><path d="M 16 0 L 0 0 0 16" fill="none" stroke="#e2e8f0" strokeWidth="1" /></pattern>
      </defs>
      <rect x="0" y="0" width={width} height={height} rx="14" fill={`url(#section-grid-${line.id})`} />
      <rect data-section-floor-slab="true" x={left} y={floorY} width={right - left} height={floorThicknessPx} fill="#ccfbf1" stroke="#0f766e" strokeWidth="1.2" />
      <rect data-section-ceiling-slab="true" x={left} y={clearY - ceilingThicknessPx} width={right - left} height={ceilingThicknessPx} fill="#ccfbf1" stroke="#0f766e" strokeWidth="1.2" />
      {internalWalls.map((wall) => {
        const x = left + wall.ratio * (right - left);
        const wallWidth = Math.max(3, wall.thicknessCm / 100 / Math.max(0.1, spanMeters) * (right - left));
        return <rect key={wall.wallSegmentId} data-section-internal-wall={wall.wallSegmentId} x={x - wallWidth / 2} y={clearY} width={wallWidth} height={floorY - clearY} fill="#cbd5e1" stroke="#475569" strokeWidth="1" />;
      })}
      <line x1={left - 12} y1={floorY} x2={right + 12} y2={floorY} stroke="#0f172a" strokeWidth="4" />
      <line x1={left} y1={floorY} x2={left} y2={line.roofShape === "gable" ? leftKneeY : eavesY} stroke="#0f172a" strokeWidth="5" />
      <line x1={right} y1={floorY} x2={right} y2={line.roofShape === "gable" ? rightKneeY : eavesY} stroke="#0f172a" strokeWidth="5" />
      {line.roofShape === "gable" ? <>
        <line x1={left} y1={leftKneeY} x2={center} y2={ridgeY} stroke="#0f172a" strokeWidth="5" />
        <line x1={center} y1={ridgeY} x2={right} y2={rightKneeY} stroke="#0f172a" strokeWidth="5" />
      </> : <path d={roofPath} fill="none" stroke="#0f172a" strokeWidth="5" />}
      <line x1={left} y1={clearY} x2={right} y2={clearY} stroke="#0891b2" strokeWidth="2" strokeDasharray="7 5" />
      {line.roofWindowCount > 0 && line.roofWindowSide !== "none" && line.roofShape !== "flat" ? <g transform={`translate(${windowBaseX} ${windowY}) rotate(${windowOnLeft ? -32 : 32})`}><rect x="-15" y="-7" width="30" height="14" rx="2" fill="#dbeafe" stroke="#2563eb" strokeWidth="3" /><line x1="0" y1="-7" x2="0" y2="7" stroke="#60a5fa" /></g> : null}
      <g fill="#0f172a" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="9">
        <text x={left} y={floorY + 17}>±0,00 m</text>
        <text x={right} y={Math.max(14, ridgeY - 8)} textAnchor="end">gerinc {line.ridgeHeightMeters.toFixed(2).replace(".", ",")} m</text>
        <text x={right} y={eavesY - 7} textAnchor="end">eresz {line.eavesHeightMeters.toFixed(2).replace(".", ",")} m</text>
        <text x={center} y={clearY - 6} textAnchor="middle" fill="#0e7490">belmagasság {line.clearHeightMeters.toFixed(2).replace(".", ",")} m</text>
        <text x={left + 4} y={floorY + floorThicknessPx + 11} fill="#0f766e">padló {line.floorSlabThicknessCm.toFixed(0)} cm</text>
        <text x={left + 4} y={clearY - ceilingThicknessPx - 5} fill="#0f766e">födém {line.ceilingSlabThicknessCm.toFixed(0)} cm</text>
        {internalWalls.length ? <text x={right} y={floorY + floorThicknessPx + 11} textAnchor="end" fill="#475569">belső fal: {internalWalls.length} db</text> : null}
        <text x={center} y={184} textAnchor="middle">metszeti hossz: {spanMeters.toFixed(2).replace(".", ",")} m</text>
      </g>
    </svg>
  </div>;
}

type Props = {
  surveyMode: PropertySurveyMode;
  lines: SurveySectionLine[];
  activeLine: SurveySectionLine | null;
  activeLineLengthMeters: number;
  internalWalls: SurveySectionInternalWallPosition[];
  drawingMode: boolean;
  drawingConstraint: SurveySectionDrawingConstraint;
  onDrawingConstraintChange: (constraint: SurveySectionDrawingConstraint) => void;
  onDrawingStart: () => void;
  onDrawingCancel: () => void;
  onSelect: (lineId: string) => void;
  onUpdate: (lineId: string, patch: Partial<SurveySectionLine>) => void;
  onDelete: (lineId: string) => void;
};

export function PropertySurveySectionPanel(props: Props) {
  const line = props.activeLine;
  const updateNumber = (key: keyof SurveySectionLine, value: string, minimum = 0, maximum = Number.POSITIVE_INFINITY) => {
    if (!line) return;
    props.onUpdate(line.id, { [key]: Math.min(maximum, Math.max(minimum, numberValue(value))) } as Partial<SurveySectionLine>);
  };

  return <div className="grid gap-4">
    <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-4 text-slate-950">
      <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-700 text-white"><ScanLine size={19} /></span><div><div className="text-sm font-black">Közös metszeti felmérés</div><div className="mt-1 text-xs font-semibold leading-5 text-slate-700">Metszetvonal energetikai, felújítási, épület-, csarnok- és gyorsfelmérésben is készíthető. A metszetben a metszetvonal által érintett belső falak automatikusan megjelennek, továbbá rögzíthető a padló- és födémvastagság, térdfal, tetősík, felső sík, gerinc és tetőablak.</div></div></div>
      <div className="mt-3 rounded-xl border border-cyan-200 bg-white p-2">
        <div className="mb-2 text-[9px] font-black uppercase tracking-[0.1em] text-cyan-800">Rajzolási iránysegéd</div>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            ["free", "Szabad"],
            ["horizontal", "Vízszintes"],
            ["vertical", "Függőleges"],
          ] as Array<[SurveySectionDrawingConstraint, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              data-section-constraint={value}
              aria-pressed={props.drawingConstraint === value}
              onClick={() => props.onDrawingConstraintChange(value)}
              className={`min-h-10 rounded-lg border px-2 text-[10px] font-black uppercase transition ${props.drawingConstraint === value ? "border-cyan-600 bg-cyan-100 text-cyan-950 ring-2 ring-cyan-200" : "border-slate-200 bg-white text-slate-700 hover:border-cyan-300"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-2 text-[10px] font-semibold leading-4 text-slate-600">Vízszintes vagy függőleges módban a végpont automatikusan tengelyre zár, így nem keletkezik néhány fokos ferde metszetvonal.</div>
      </div>
      <button type="button" onClick={props.drawingMode ? props.onDrawingCancel : props.onDrawingStart} className={`mt-3 w-full ${props.drawingMode ? "survey-action-danger" : "survey-action-primary"}`}>{props.drawingMode ? <X size={17} /> : <Ruler size={17} />}{props.drawingMode ? "Metszetrajzolás megszakítása" : "Metszetvonal rajzolása"}</button>
      {props.drawingMode ? <div className="mt-2 rounded-xl border border-cyan-300 bg-white px-3 py-2 text-xs font-black text-cyan-950">Tartsd lenyomva a rajzlapon, és húzd végig a metszetvonalat. Aktív iránysegéd: {props.drawingConstraint === "horizontal" ? "vízszintes" : props.drawingConstraint === "vertical" ? "függőleges" : "szabad"}.</div> : null}
    </div>

    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-black text-[var(--survey-text)]">Metszetek</div><div className="text-xs font-semibold text-[var(--survey-muted)]">{props.lines.length} metszet az aktív szinten</div></div></div>
      {props.lines.length ? <div className="grid gap-2">{props.lines.map((item) => <button type="button" key={item.id} onClick={() => props.onSelect(item.id)} className={`rounded-xl border p-3 text-left ${line?.id === item.id ? "border-cyan-400 bg-cyan-50 text-slate-950" : "border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-text)]"}`}><div className="flex items-center justify-between gap-3"><span className="text-xs font-black uppercase">{item.serial} · {item.name}</span><span className="text-[9px] font-black uppercase text-[var(--survey-muted)]">{surveySectionKindLabels[item.kind]}</span></div></button>)}</div> : <div className="rounded-xl border border-dashed border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4 text-center text-xs font-bold text-[var(--survey-muted)]">Még nincs metszetvonal ezen a szinten.</div>}
    </div>

    {line ? <>
      <SectionPreview line={line} spanMeters={props.activeLineLengthMeters} internalWalls={props.internalWalls} />
      <div><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.1em] text-[var(--survey-muted)]">Metszet neve</span><input className={inputClass} value={line.name} onChange={(event) => props.onUpdate(line.id, { name: event.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3">
        <label><span className="mb-1.5 block text-[10px] font-black uppercase text-[var(--survey-muted)]">Metszet típusa</span><select className={inputClass} value={line.kind} onChange={(event) => props.onUpdate(line.id, { kind: event.target.value as SurveySectionKind })}>{Object.entries(surveySectionKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span className="mb-1.5 block text-[10px] font-black uppercase text-[var(--survey-muted)]">Tetőforma</span><select className={inputClass} value={line.roofShape} onChange={(event) => props.onUpdate(line.id, { roofShape: event.target.value as SurveyRoofShape })}>{Object.entries(surveyRoofShapeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label><span className="mb-1.5 block text-[10px] font-black uppercase text-[var(--survey-muted)]">Padlószint (m)</span><input type="number" step="0.01" className={inputClass} value={line.floorElevationMeters} onChange={(event) => updateNumber("floorElevationMeters", event.target.value, -100, 100)} /></label>
        <label><span className="mb-1.5 block text-[10px] font-black uppercase text-[var(--survey-muted)]">Belmagasság (m)</span><input type="number" min="0.1" step="0.01" className={inputClass} value={line.clearHeightMeters} onChange={(event) => updateNumber("clearHeightMeters", event.target.value, 0.1, 100)} /></label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label><span className="mb-1.5 block text-[10px] font-black uppercase text-[var(--survey-muted)]">Padlószerkezet vastagsága (cm)</span><input type="number" min="0" step="1" className={inputClass} value={line.floorSlabThicknessCm} onChange={(event) => updateNumber("floorSlabThicknessCm", event.target.value, 0, 300)} /></label>
        <label><span className="mb-1.5 block text-[10px] font-black uppercase text-[var(--survey-muted)]">Födém vastagsága (cm)</span><input type="number" min="0" step="1" className={inputClass} value={line.ceilingSlabThicknessCm} onChange={(event) => updateNumber("ceilingSlabThicknessCm", event.target.value, 0, 300)} /></label>
      </div>
      <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-[10px] font-bold leading-5 text-slate-700">A metszetvonal által keresztezett, alaprajzon belső falszakaszként rögzített falak automatikusan bekerülnek a metszeti rajzba. Jelenleg {props.internalWalls.length} belső fal metszése azonosítható.</div>
      <div className="grid grid-cols-2 gap-3">
        <label><span className="mb-1.5 block text-[10px] font-black uppercase text-[var(--survey-muted)]">Eresz / fal felső sík (m)</span><input type="number" min="0.1" step="0.01" className={inputClass} value={line.eavesHeightMeters} onChange={(event) => updateNumber("eavesHeightMeters", event.target.value, 0.1, 100)} /></label>
        <label><span className="mb-1.5 block text-[10px] font-black uppercase text-[var(--survey-muted)]">Gerincmagasság (m)</span><input type="number" min="0.1" step="0.01" className={inputClass} value={line.ridgeHeightMeters} onChange={(event) => updateNumber("ridgeHeightMeters", event.target.value, 0.1, 100)} /></label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label><span className="mb-1.5 block text-[10px] font-black uppercase text-[var(--survey-muted)]">Bal térdfal (m)</span><input type="number" min="0" step="0.01" className={inputClass} value={line.leftKneeWallHeightMeters} onChange={(event) => updateNumber("leftKneeWallHeightMeters", event.target.value, 0, 100)} /></label>
        <label><span className="mb-1.5 block text-[10px] font-black uppercase text-[var(--survey-muted)]">Jobb térdfal (m)</span><input type="number" min="0" step="0.01" className={inputClass} value={line.rightKneeWallHeightMeters} onChange={(event) => updateNumber("rightKneeWallHeightMeters", event.target.value, 0, 100)} /></label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label><span className="mb-1.5 block text-[10px] font-black uppercase text-[var(--survey-muted)]">Bal tetőhajlás (°)</span><input type="number" min="0" max="89" step="1" className={inputClass} value={line.leftRoofPitchDegrees} onChange={(event) => updateNumber("leftRoofPitchDegrees", event.target.value, 0, 89)} /></label>
        <label><span className="mb-1.5 block text-[10px] font-black uppercase text-[var(--survey-muted)]">Jobb tetőhajlás (°)</span><input type="number" min="0" max="89" step="1" className={inputClass} value={line.rightRoofPitchDegrees} onChange={(event) => updateNumber("rightRoofPitchDegrees", event.target.value, 0, 89)} /></label>
      </div>
      <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3">
        <div className="flex items-center gap-2 text-sm font-black text-[var(--survey-text)]"><Triangle size={17} className="text-cyan-700" /> Tetőablak a ferde síkban</div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label><span className="mb-1.5 block text-[10px] font-black uppercase text-[var(--survey-muted)]">Darabszám</span><input type="number" min="0" step="1" className={inputClass} value={line.roofWindowCount} onChange={(event) => updateNumber("roofWindowCount", event.target.value, 0, 100)} /></label>
          <label><span className="mb-1.5 block text-[10px] font-black uppercase text-[var(--survey-muted)]">Tetősík oldala</span><select className={inputClass} value={line.roofWindowSide} onChange={(event) => props.onUpdate(line.id, { roofWindowSide: event.target.value as SurveySectionLine["roofWindowSide"] })}><option value="none">Nincs</option><option value="left">Bal tetősík</option><option value="right">Jobb tetősík</option></select></label>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <label><span className="mb-1 block text-[9px] font-black uppercase text-[var(--survey-muted)]">Szélesség</span><input type="number" min="0" step="0.01" className={inputClass} value={line.roofWindowWidthMeters} onChange={(event) => updateNumber("roofWindowWidthMeters", event.target.value, 0, 20)} /></label>
          <label><span className="mb-1 block text-[9px] font-black uppercase text-[var(--survey-muted)]">Magasság</span><input type="number" min="0" step="0.01" className={inputClass} value={line.roofWindowHeightMeters} onChange={(event) => updateNumber("roofWindowHeightMeters", event.target.value, 0, 20)} /></label>
          <label><span className="mb-1 block text-[9px] font-black uppercase text-[var(--survey-muted)]">Alsó él</span><input type="number" min="0" step="0.01" className={inputClass} value={line.roofWindowSillHeightMeters} onChange={(event) => updateNumber("roofWindowSillHeightMeters", event.target.value, 0, 100)} /></label>
        </div>
      </div>
      <div><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.1em] text-[var(--survey-muted)]">Metszeti megjegyzés</span><textarea className="min-h-24 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 text-xs font-bold text-[var(--survey-text)] outline-none focus:border-cyan-500" value={line.note} onChange={(event) => props.onUpdate(line.id, { note: event.target.value })} placeholder={`Megjegyzés a(z) ${props.surveyMode.toLocaleLowerCase("hu-HU")} metszetéhez...`} /></div>
      <HoldActionButton
        tone="danger"
        durationMs={2000}
        icon={<Trash2 size={17} />}
        label="Metszet törlése · 2 mp"
        holdingLabel="Törléshez"
        completedLabel="Metszet törölve"
        ariaLabel={`${line.serial} metszet törléséhez tartsd nyomva 2 másodpercig`}
        className="w-full"
        onComplete={() => props.onDelete(line.id)}
      />
    </> : null}
  </div>;
}
