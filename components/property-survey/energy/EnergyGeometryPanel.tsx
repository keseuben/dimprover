"use client";

import { AlertTriangle, CheckCircle2, ChevronRight, Compass, Cuboid, Layers3, Ratio, Ruler } from "lucide-react";
import type { EnergyEnvelopeGeometryResult } from "@/components/energy/domain/energyGeometryTypes";

function number(value: number | null, digits = 2) {
  return value === null ? "–" : value.toLocaleString("hu-HU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function messageTone(severity: "info" | "warning" | "error") {
  if (severity === "error") return "border-rose-300 bg-rose-50 text-rose-950";
  if (severity === "warning") return "border-amber-300 bg-amber-50 text-amber-950";
  return "border-blue-300 bg-blue-50 text-blue-950";
}

export function EnergyGeometryPanel({ result }: { result: EnergyEnvelopeGeometryResult }) {
  const errors = result.validationMessages.filter((message) => message.severity === "error").length;
  const warnings = result.validationMessages.filter((message) => message.severity === "warning").length;
  return <section className="grid min-w-0 gap-4" data-energy-geometry-panel="true" data-energy-geometry-valid={result.valid ? "true" : "false"}>
    <div className={`rounded-2xl border p-4 ${result.blocked ? "border-rose-300 bg-rose-50 text-rose-950" : "border-emerald-300 bg-emerald-50 text-emerald-950"}`}>
      <div className="flex items-start gap-3">{result.blocked ? <AlertTriangle size={22} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={22} className="mt-0.5 shrink-0" />}<div><div className="text-sm font-black">{result.blocked ? "A geometriai eredmény blokkolt" : "A geometriai összesítő számítható"}</div><p className="mt-1 text-xs font-semibold leading-5">{result.blocked ? `${errors} blokkoló hiba és ${warnings} figyelmeztetés található. A hibák javítása után az eredmény automatikusan frissül.` : `${result.wallRows.length} egyedi energetikai falszakasz, ${result.levelRows.length} szint és ${result.trace.length} auditált számítási sor.`}</p></div></div>
    </div>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric icon={<Layers3 size={18} />} label="Lehűlő felület" value={`${number(result.totals.thermalEnvelopeAreaSquareMeters)} m²`} testId="thermal-envelope" />
      <Metric icon={<Cuboid size={18} />} label="Kondicionált térfogat" value={`${number(result.totals.conditionedVolumeCubicMeters)} m³`} testId="conditioned-volume" />
      <Metric icon={<Ratio size={18} />} label="A/V arány" value={result.totals.areaToVolumeRatioPerMeter === null ? "–" : `${number(result.totals.areaToVolumeRatioPerMeter, 4)} 1/m`} testId="av-ratio" />
      <Metric icon={<Ruler size={18} />} label="Fűtött alapterület" value={`${number(result.totals.conditionedFloorAreaSquareMeters)} m²`} testId="conditioned-floor" />
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <SmallMetric label="Bruttó fal" value={`${number(result.totals.grossWallAreaSquareMeters)} m²`} />
      <SmallMetric label="Nyílászáró" value={`${number(result.totals.openingAreaSquareMeters)} m²`} />
      <SmallMetric label="Nettó fal" value={`${number(result.totals.netWallAreaSquareMeters)} m²`} />
      <SmallMetric label="Alsó határoló" value={`${number(result.totals.lowerBoundaryAreaSquareMeters)} m²`} />
      <SmallMetric label="Felső vetület" value={`${number(result.totals.upperBoundaryProjectedAreaSquareMeters)} m²`} />
      <SmallMetric label="Felső korrigált" value={`${number(result.totals.upperBoundaryAdjustedAreaSquareMeters)} m²`} />
    </div>

    {result.validationMessages.length ? <div className="grid gap-2" data-energy-geometry-messages="true">
      <div className="text-xs font-black uppercase tracking-[0.1em] text-[var(--survey-muted)]">Geometriai ellenőrzések</div>
      {result.validationMessages.map((message, index) => <details key={`${message.code}-${message.entityId || index}`} className={`group rounded-xl border ${messageTone(message.severity)}`} data-energy-geometry-message={message.code} open={message.blocking}>
        <summary className="flex cursor-pointer list-none items-start gap-3 p-3 text-xs font-black leading-5"><ChevronRight size={16} className="mt-0.5 shrink-0 transition group-open:rotate-90" /><span className="min-w-0 flex-1">{message.message}</span><span className="shrink-0 rounded-full border border-current/30 px-2 py-0.5 text-[8px] uppercase">{message.blocking ? "blokkoló" : message.severity}</span></summary>
        <div className="border-t border-current/15 px-3 py-2 text-[10px] font-semibold leading-4"><strong>Kód:</strong> {message.code}{message.entityName ? <> · <strong>Elem:</strong> {message.entityName}</> : null}{message.levelId ? <> · <strong>Szint:</strong> {message.levelId}</> : null}</div>
      </details>)}
    </div> : null}

    <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3">
      <div className="mb-3 text-sm font-black text-[var(--survey-text)]">Szintenkénti geometria</div>
      <div className="overflow-x-auto">
        <table className="min-w-[820px] w-full text-left text-[10px] font-semibold text-[var(--survey-text)]" data-energy-level-table="true">
          <thead><tr className="border-b border-[var(--survey-border)] text-[9px] uppercase text-[var(--survey-muted)]"><th className="p-2">Szint</th><th className="p-2 text-right">Fűtött m²</th><th className="p-2 text-right">Térfogat m³</th><th className="p-2 text-right">Bruttó fal</th><th className="p-2 text-right">Nyílászáró</th><th className="p-2 text-right">Alsó</th><th className="p-2 text-right">Felső</th><th className="p-2 text-right">Lehűlő</th></tr></thead>
          <tbody>{result.levelRows.map((row) => <tr key={row.levelId} data-energy-level-row={row.levelId} className="border-b border-[var(--survey-border)]/70 last:border-0"><td className="p-2 font-black">{row.levelName}<span className="ml-1 text-[8px] text-[var(--survey-muted)]">{row.conditionedRoomCount}/{row.roomCount} helyiség</span></td><td className="p-2 text-right">{number(row.conditionedFloorAreaSquareMeters)}</td><td className="p-2 text-right">{number(row.conditionedVolumeCubicMeters)}</td><td className="p-2 text-right">{number(row.grossWallAreaSquareMeters)}</td><td className="p-2 text-right">{number(row.openingAreaSquareMeters)}</td><td className="p-2 text-right">{number(row.lowerBoundaryAreaSquareMeters)}</td><td className="p-2 text-right">{number(row.upperBoundaryAdjustedAreaSquareMeters)}</td><td className="p-2 text-right font-black">{number(row.thermalEnvelopeAreaSquareMeters)}</td></tr>)}</tbody>
        </table>
      </div>
    </div>

    <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-black text-[var(--survey-text)]"><Compass size={17} /> Tájolási összesítő</div>
      <div className="grid gap-2 sm:grid-cols-2" data-energy-orientation-list="true">{result.orientationRows.map((row) => <div key={row.orientation} data-energy-orientation={row.orientation} className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3"><div className="flex items-center justify-between"><span className="text-sm font-black">{row.orientation}</span><span className="text-[9px] font-bold text-[var(--survey-muted)]">{number(row.azimuth, 0)}°</span></div><div className="mt-2 grid grid-cols-3 gap-2 text-center"><Tiny label="Bruttó" value={number(row.grossWallAreaSquareMeters)} /><Tiny label="Nyílás" value={number(row.openingAreaSquareMeters)} /><Tiny label="Nettó" value={number(row.netWallAreaSquareMeters)} /></div></div>)}</div>
    </div>

    <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3">
      <div className="mb-3 text-sm font-black text-[var(--survey-text)]">Energetikai falszakaszok</div>
      <div className="grid gap-2" data-energy-wall-list="true">{result.wallRows.map((row) => <details key={row.wallSegmentId} className="group rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)]" data-energy-wall-row={row.wallSegmentId}><summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-xs font-black"><ChevronRight size={15} className="transition group-open:rotate-90" /><span className="min-w-0 flex-1 truncate">{row.wallName}</span><span className="shrink-0">{number(row.netAreaSquareMeters)} m²</span></summary><div className="grid grid-cols-2 gap-2 border-t border-[var(--survey-border)] p-3 text-[10px] font-semibold sm:grid-cols-4"><Tiny label="Tájolás" value={`${row.orientation} · ${number(row.azimuth, 0)}°`} /><Tiny label="Hossz × magasság" value={`${number(row.lengthMeters)} × ${number(row.heightMeters)} m`} /><Tiny label="Bruttó / nyílás" value={`${number(row.grossAreaSquareMeters)} / ${number(row.openingAreaSquareMeters)} m²`} /><Tiny label="Határolás" value={row.boundaryType} /></div></details>)}</div>
    </div>

    <div className="rounded-xl border border-dashed border-[var(--survey-border)] p-3 text-[10px] font-semibold leading-5 text-[var(--survey-muted)]">A felső határoló felület tetősík-korrekciója csak tetőtéri szintnél vagy kifejezetten tetősíkos helyiségnél aktív. Padlásfödém esetén a vízszintes födémfelület marad az energetikai határ. Egyedi tetőforma szakmai ellenőrzést igényel.</div>
  </section>;
}

function Metric({ icon, label, value, testId }: { icon: React.ReactNode; label: string; value: string; testId: string }) {
  return <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-3 text-cyan-950" data-energy-metric={testId}><div className="flex items-center gap-2 text-[9px] font-black uppercase text-cyan-800">{icon}{label}</div><div className="mt-2 text-xl font-black sm:text-2xl">{value}</div></div>;
}
function SmallMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3"><div className="text-[8px] font-black uppercase text-[var(--survey-muted)]">{label}</div><div className="mt-1 text-base font-black text-[var(--survey-text)]">{value}</div></div>; }
function Tiny({ label, value }: { label: string; value: string }) { return <div><div className="text-[8px] font-black uppercase text-[var(--survey-muted)]">{label}</div><div className="mt-1 font-black text-[var(--survey-text)]">{value}</div></div>; }
