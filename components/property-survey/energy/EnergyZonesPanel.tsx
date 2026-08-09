"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Flame, Plus, RefreshCw, Snowflake, Trash2, Warehouse } from "lucide-react";
import {
  createAutomaticEnergyZoneWorkspace,
  createEnergyUnheatedSpace,
  createEnergyZone,
  energyUnheatedSpaceTypeLabels,
  energyZoneServiceLevelLabels,
  energyZoneUsageProfileLabels,
  type EnergyUnheatedSpace,
  type EnergyZone,
  type EnergyZoneServiceLevel,
  type EnergyZoneSetResult,
  type EnergyZoneUsageProfile,
  type EnergyZoneWorkspace,
  type EnergyUnheatedSpaceType,
  type EnergyUnheatedVentilation,
  type EnergyTemperatureSource,
} from "@/components/energy/domain/energyZoneTypes";
import type { SurveyBuildingLevel } from "@/components/property-survey/propertySurveyBuildingModel";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";

const inputClass = "h-10 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 text-xs font-bold text-[var(--survey-text)] outline-none focus:border-cyan-500";
const labelClass = "mb-1 block text-[9px] font-black uppercase tracking-[0.1em] text-[var(--survey-muted)]";

type Props = {
  workspace: EnergyZoneWorkspace;
  result: EnergyZoneSetResult;
  rooms: SurveyRoom[];
  levels: SurveyBuildingLevel[];
  onChange: (workspace: EnergyZoneWorkspace) => void;
};

function format(value: number, digits = 2) {
  return value.toLocaleString("hu-HU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function now() { return new Date().toISOString(); }

export function EnergyZonesPanel({ workspace, result, rooms, levels, onChange }: Props) {
  const [section, setSection] = useState<"zones" | "unheated" | "connections" | "trace">("zones");
  const levelMap = useMemo(() => new Map(levels.map((level) => [level.id, level.name])), [levels]);
  const heatedRooms = rooms.filter((room) => room.heated);
  const unheatedRooms = rooms.filter((room) => !room.heated);

  function commit(patch: Partial<EnergyZoneWorkspace>) {
    onChange({ ...workspace, ...patch, updatedAt: now() });
  }

  function updateZone(zoneId: string, patch: Partial<EnergyZone>) {
    commit({ zones: workspace.zones.map((zone) => zone.id === zoneId ? { ...zone, ...patch, updatedAt: now() } : zone) });
  }

  function updateUnheated(spaceId: string, patch: Partial<EnergyUnheatedSpace>) {
    commit({ unheatedSpaces: workspace.unheatedSpaces.map((space) => space.id === spaceId ? { ...space, ...patch, updatedAt: now() } : space) });
  }

  function addZone() {
    commit({ zones: [...workspace.zones, createEnergyZone({ name: `Fűtött zóna ${workspace.zones.length + 1}` })] });
  }

  function deleteZone(zoneId: string) {
    if (workspace.zones.length <= 1) return;
    commit({
      zones: workspace.zones.filter((zone) => zone.id !== zoneId),
      roomAssignments: Object.fromEntries(Object.entries(workspace.roomAssignments).filter(([, assigned]) => assigned !== zoneId)),
    });
  }

  function addUnheated() {
    commit({ unheatedSpaces: [...workspace.unheatedSpaces, createEnergyUnheatedSpace({ name: `Fűtetlen tér ${workspace.unheatedSpaces.length + 1}` })] });
  }

  function deleteUnheated(spaceId: string) {
    commit({
      unheatedSpaces: workspace.unheatedSpaces.filter((space) => space.id !== spaceId),
      unheatedRoomAssignments: Object.fromEntries(Object.entries(workspace.unheatedRoomAssignments).filter(([, assigned]) => assigned !== spaceId)),
    });
  }

  function assignHeatedRoom(roomId: string, zoneId: string) {
    const next = { ...workspace.roomAssignments };
    if (zoneId) next[roomId] = zoneId; else delete next[roomId];
    commit({ roomAssignments: next });
  }

  function assignUnheatedRoom(roomId: string, spaceId: string) {
    const next = { ...workspace.unheatedRoomAssignments };
    if (spaceId) next[roomId] = spaceId; else delete next[roomId];
    commit({ unheatedRoomAssignments: next });
  }

  return <section className="grid min-w-0 gap-4" data-energy-zones-panel data-energy-zones-valid={result.valid ? "true" : "false"}>
    <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-4 text-cyan-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3"><Flame size={22} className="shrink-0" /><div><div className="text-sm font-black">Energetikai zónák és fűtetlen terek · v0.7.3</div><p className="mt-1 text-xs font-semibold leading-5">Egyszerű családi háznál egy zóna elegendő. Több zóna akkor szükséges, ha a használati profil vagy a kondicionálási szolgáltatási szint eltér.</p></div></div>
        <button type="button" data-auto-zone-layout onClick={() => onChange(createAutomaticEnergyZoneWorkspace(rooms))} className="survey-action-secondary shrink-0 bg-white text-cyan-950"><RefreshCw size={15} /> Automatikus alapbeosztás</button>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Metric label="Zónák" value={String(result.totals.zoneCount)} tone="cyan" />
      <Metric label="Fűtött terület" value={`${format(result.totals.conditionedFloorAreaSquareMeters)} m²`} tone="emerald" />
      <Metric label="Fűtött térfogat" value={`${format(result.totals.conditionedVolumeCubicMeters)} m³`} tone="emerald" />
      <Metric label="Fűtetlen határ" value={`${format(result.totals.unheatedBoundaryAreaSquareMeters)} m²`} tone="amber" />
    </div>

    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-2 sm:grid-cols-4">
      {([
        ["zones", "Zónák", Flame],
        ["unheated", "Fűtetlen terek", Warehouse],
        ["connections", "Kapcsolatok", Snowflake],
        ["trace", "Nyomvonal", ChevronRight],
      ] as const).map(([id, label, Icon]) => <button key={id} type="button" data-energy-zone-section={id} onClick={() => setSection(id)} className={`flex min-h-10 items-center justify-center gap-2 rounded-xl px-2 text-[9px] font-black uppercase ${section === id ? "bg-cyan-100 text-cyan-900 ring-1 ring-cyan-400" : "text-[var(--survey-muted)]"}`}><Icon size={14} /> {label}</button>)}
    </div>

    {section === "zones" ? <div className="grid gap-4" data-energy-zone-editor>
      <div className="grid gap-3">{workspace.zones.map((zone, index) => {
        const zoneResult = result.zones.find((row) => row.zoneId === zone.id);
        return <article key={zone.id} className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4" data-energy-zone-card={zone.id}>
          <div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-sm font-black text-[var(--survey-text)]">{index + 1}. energetikai zóna</div><div className="mt-1 text-[9px] font-bold text-[var(--survey-muted)]">{zoneResult?.roomCount || 0} helyiség · {format(zoneResult?.floorAreaSquareMeters || 0)} m² · {format(zoneResult?.volumeCubicMeters || 0)} m³</div></div><button type="button" data-delete-zone={zone.id} disabled={workspace.zones.length <= 1} onClick={() => deleteZone(zone.id)} className="survey-icon-button h-9 w-9 text-rose-700 disabled:opacity-30"><Trash2 size={15} /></button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className={labelClass}>Zóna neve</span><input data-zone-name={zone.id} className={inputClass} value={zone.name} onChange={(event) => updateZone(zone.id, { name: event.target.value })} /></label>
            <label><span className={labelClass}>Használati profil</span><select data-zone-profile={zone.id} className={inputClass} value={zone.usageProfile} onChange={(event) => updateZone(zone.id, { usageProfile: event.target.value as EnergyZoneUsageProfile })}>{Object.entries(energyZoneUsageProfileLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span className={labelClass}>Szolgáltatási szint</span><select data-zone-service={zone.id} className={inputClass} value={zone.serviceLevel} onChange={(event) => updateZone(zone.id, { serviceLevel: event.target.value as EnergyZoneServiceLevel })}>{Object.entries(energyZoneServiceLevelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span className={labelClass}>Fűtési alapérték °C</span><input data-zone-heating-setpoint={zone.id} type="number" step="0.1" className={inputClass} value={zone.heatingSetpointC} onChange={(event) => updateZone(zone.id, { heatingSetpointC: Number(event.target.value) || 0 })} /></label>
            <label><span className={labelClass}>Hűtési alapérték °C</span><input data-zone-cooling-setpoint={zone.id} type="number" step="0.1" className={inputClass} value={zone.coolingSetpointC ?? ""} onChange={(event) => updateZone(zone.id, { coolingSetpointC: event.target.value ? Number(event.target.value) : undefined })} placeholder="Nincs hűtés" /></label>
            <label><span className={labelClass}>Légcsereszám 1/h</span><input data-zone-air-change={zone.id} type="number" step="0.01" className={inputClass} value={zone.airChangePerHour ?? ""} onChange={(event) => updateZone(zone.id, { airChangePerHour: event.target.value ? Number(event.target.value) : undefined })} placeholder="Későbbi részletes számításhoz" /></label>
          </div>
          <textarea className="mt-3 min-h-16 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 text-xs font-bold text-[var(--survey-text)]" value={zone.note} onChange={(event) => updateZone(zone.id, { note: event.target.value })} placeholder="Zóna használata, üzemidő, eltérő igények..." />
          {zoneResult ? <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><SmallMetric label="Külső fal" value={`${format(zoneResult.externalWallAreaSquareMeters)} m²`} /><SmallMetric label="Fűtetlen határ" value={`${format(zoneResult.unheatedBoundaryAreaSquareMeters)} m²`} /><SmallMetric label="Zónaközi határ" value={`${format(zoneResult.interzoneBoundaryAreaSquareMeters)} m²`} /><SmallMetric label="Talajfal" value={`${format(zoneResult.groundWallAreaSquareMeters)} m²`} /></div> : null}
        </article>;
      })}</div>
      <button type="button" data-add-zone onClick={addZone} className="survey-action-secondary"><Plus size={15} /> Új energetikai zóna</button>

      <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4">
        <div className="text-sm font-black text-[var(--survey-text)]">Fűtött helyiségek zónabeosztása</div>
        <div className="mt-3 grid gap-2">{heatedRooms.map((room) => <div key={room.id} className="grid gap-2 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 sm:grid-cols-[1fr_220px] sm:items-center" data-heated-room-assignment={room.id}><div><div className="text-xs font-black text-[var(--survey-text)]">{room.name}</div><div className="mt-1 text-[9px] font-bold text-[var(--survey-muted)]">{levelMap.get(room.levelId || "") || room.levelId || "Szint nélkül"} · {format(room.area)} m² · {format(room.area * room.height)} m³</div></div><select className={inputClass} value={workspace.roomAssignments[room.id] || ""} onChange={(event) => assignHeatedRoom(room.id, event.target.value)}><option value="">Nincs zónához rendelve</option>{workspace.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></div>)}</div>
      </div>
    </div> : null}

    {section === "unheated" ? <div className="grid gap-4" data-energy-unheated-editor>
      {workspace.unheatedSpaces.map((space, index) => {
        const row = result.unheatedSpaces.find((item) => item.unheatedSpaceId === space.id);
        return <article key={space.id} className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950" data-energy-unheated-card={space.id}>
          <div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-sm font-black">{index + 1}. kapcsolódó fűtetlen tér</div><div className="mt-1 text-[9px] font-bold">{row?.roomCount || 0} helyiség · {format(row?.floorAreaSquareMeters || 0)} m² · kapcsolódó határ {format(row?.connectedBoundaryAreaSquareMeters || 0)} m²</div></div><button type="button" data-delete-unheated={space.id} onClick={() => deleteUnheated(space.id)} className="survey-icon-button h-9 w-9 bg-white text-rose-700"><Trash2 size={15} /></button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className={labelClass}>Megnevezés</span><input data-unheated-name={space.id} className={inputClass} value={space.name} onChange={(event) => updateUnheated(space.id, { name: event.target.value })} /></label>
            <label><span className={labelClass}>Tértípus</span><select data-unheated-type={space.id} className={inputClass} value={space.type} onChange={(event) => updateUnheated(space.id, { type: event.target.value as EnergyUnheatedSpaceType })}>{Object.entries(energyUnheatedSpaceTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span className={labelClass}>Szellőzés</span><select data-unheated-ventilation={space.id} className={inputClass} value={space.ventilation} onChange={(event) => updateUnheated(space.id, { ventilation: event.target.value as EnergyUnheatedVentilation })}><option value="unknown">Nincs meghatározva</option><option value="sealed">Zárt</option><option value="natural">Természetes</option><option value="mechanical">Gépi</option></select></label>
            <label><span className={labelClass}>Hőmérséklet forrása</span><select data-unheated-temperature-source={space.id} className={inputClass} value={space.temperatureSource} onChange={(event) => updateUnheated(space.id, { temperatureSource: event.target.value as EnergyTemperatureSource, designTemperatureC: event.target.value === "manual" ? space.designTemperatureC : undefined })}><option value="notCalculated">Még nincs számítva</option><option value="manual">Kézzel megadott</option><option value="laterDetailedCalculation">Későbbi részletes számítás</option></select></label>
            {space.temperatureSource === "manual" ? <label><span className={labelClass}>Belső hőmérséklet °C</span><input data-unheated-temperature={space.id} type="number" step="0.1" className={inputClass} value={space.designTemperatureC ?? ""} onChange={(event) => updateUnheated(space.id, { designTemperatureC: event.target.value ? Number(event.target.value) : undefined })} /></label> : null}
            <label className="sm:col-span-2"><span className={labelClass}>Hőmérséklet forráshivatkozása</span><input data-unheated-temperature-source-reference={space.id} className={inputClass} value={space.temperatureSourceReference || ""} onChange={(event) => updateUnheated(space.id, { temperatureSourceReference: event.target.value })} placeholder="Számítás, mérés vagy dokumentum azonosítója" /></label>
          </div>
          <textarea className="mt-3 min-h-16 w-full rounded-xl border border-amber-300 bg-white p-3 text-xs font-bold" value={space.note} onChange={(event) => updateUnheated(space.id, { note: event.target.value })} placeholder="Padlás, garázs vagy pince kialakítása, légkapcsolata..." />
        </article>;
      })}
      <button type="button" data-add-unheated onClick={addUnheated} className="survey-action-secondary"><Plus size={15} /> Új fűtetlen tér</button>

      <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4">
        <div className="text-sm font-black text-[var(--survey-text)]">Fűtetlen helyiségek hozzárendelése</div>
        {!unheatedRooms.length ? <div className="mt-3 rounded-xl border border-dashed border-[var(--survey-border)] p-4 text-center text-xs font-bold text-[var(--survey-muted)]">Nincs fűtetlenként jelölt helyiség.</div> : <div className="mt-3 grid gap-2">{unheatedRooms.map((room) => <div key={room.id} className="grid gap-2 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 sm:grid-cols-[1fr_220px] sm:items-center" data-unheated-room-assignment={room.id}><div><div className="text-xs font-black text-[var(--survey-text)]">{room.name}</div><div className="mt-1 text-[9px] font-bold text-[var(--survey-muted)]">{levelMap.get(room.levelId || "") || room.levelId || "Szint nélkül"} · {format(room.area)} m²</div></div><select className={inputClass} value={workspace.unheatedRoomAssignments[room.id] || ""} onChange={(event) => assignUnheatedRoom(room.id, event.target.value)}><option value="">Nincs fűtetlen térhez rendelve</option>{workspace.unheatedSpaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}</select></div>)}</div>}
      </div>
    </div> : null}

    {section === "connections" ? <div className="grid gap-3" data-energy-zone-connections>
      {!result.connections.length ? <div className="rounded-2xl border border-dashed border-[var(--survey-border)] p-6 text-center text-xs font-bold text-[var(--survey-muted)]">Nincs felismert zónaközi vagy zóna–fűtetlen tér falszakasz.</div> : result.connections.map((connection) => <div key={connection.id} className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3" data-energy-zone-connection={connection.kind}><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black text-[var(--survey-text)]">{connection.sourceZoneName} → {connection.targetZoneName || connection.targetUnheatedSpaceName}</div><div className="mt-1 text-[9px] font-bold text-[var(--survey-muted)]">{connection.sourceRoomName} / {connection.adjacentRoomName}</div></div><div className="text-sm font-black text-[var(--survey-text)]">{format(connection.netAreaSquareMeters)} m²</div></div><div className="mt-2 text-[9px] font-semibold text-[var(--survey-muted)]">Bruttó {format(connection.grossAreaSquareMeters)} m² · nyílás {format(connection.openingAreaSquareMeters)} m²</div></div>)}
    </div> : null}

    {section === "trace" ? <div className="grid gap-2" data-energy-zone-trace>{result.trace.map((item) => <details key={item.id} className="group rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)]" data-energy-zone-trace-rule={item.ruleId}><summary className="flex cursor-pointer list-none items-start gap-2 p-3"><ChevronRight size={15} className="mt-0.5 shrink-0 transition group-open:rotate-90" /><span className="min-w-0 flex-1"><span className="block text-xs font-black text-[var(--survey-text)]">{item.label}</span><span className="mt-1 block text-[9px] font-bold text-[var(--survey-muted)]">{item.ruleId} · {item.formula}</span></span><span className="shrink-0 text-xs font-black text-[var(--survey-text)]">{format(item.value, 3)} {item.unit.replace("m2", "m²").replace("m3", "m³")}</span></summary><div className="border-t border-[var(--survey-border)] p-3 text-[10px] font-semibold text-[var(--survey-muted)]"><div><strong className="text-[var(--survey-text)]">Kerekítetlen:</strong> {item.unroundedValue}</div><div className="mt-2 grid gap-1">{Object.entries(item.inputs).map(([key, value]) => <div key={key}><strong className="text-[var(--survey-text)]">{key}:</strong> {String(value)}</div>)}</div></div></details>)}</div> : null}

    <div className="grid gap-2" data-energy-zone-validation>{result.validationMessages.length ? result.validationMessages.map((message, index) => <div key={`${message.code}-${message.roomId || message.zoneId || message.unheatedSpaceId || index}`} data-energy-zone-validation-code={message.code} className={`flex items-start gap-3 rounded-xl border p-3 text-xs font-bold leading-5 ${message.severity === "error" ? "border-rose-300 bg-rose-50 text-rose-950" : message.severity === "warning" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-blue-300 bg-blue-50 text-blue-950"}`}>{message.severity === "error" ? <AlertTriangle size={17} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={17} className="mt-0.5 shrink-0" />}<span>{message.message}</span></div>) : <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-bold text-emerald-950"><CheckCircle2 size={17} className="shrink-0" /> A zónabeosztás teljes és számítható.</div>}</div>

    <div className="rounded-xl border border-dashed border-[var(--survey-border)] p-3 text-[10px] font-semibold leading-5 text-[var(--survey-muted)]">Forrás: {result.sourceReferenceId} · ellenőrzés: {result.sourceCheckedAt}. A zónahatárok és használati profilok szakmai ellenőrzést igényelnek; a v0.7.3 még nem számít havi energiaigényt.</div>
  </section>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "cyan" | "emerald" | "amber" }) {
  const tones = { cyan: "border-cyan-300 bg-cyan-50 text-cyan-950", emerald: "border-emerald-300 bg-emerald-50 text-emerald-950", amber: "border-amber-300 bg-amber-50 text-amber-950" };
  return <div className={`rounded-2xl border p-3 text-center ${tones[tone]}`}><div className="text-lg font-black">{value}</div><div className="mt-1 text-[8px] font-black uppercase">{label}</div></div>;
}
function SmallMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-2"><div className="text-[8px] font-black uppercase text-[var(--survey-muted)]">{label}</div><div className="mt-1 text-xs font-black text-[var(--survey-text)]">{value}</div></div>; }
