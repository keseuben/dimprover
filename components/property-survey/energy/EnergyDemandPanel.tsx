"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Flame, Gauge, GitBranch, Plus, Settings2, Trash2, Wind } from "lucide-react";
import {
  createEnergyBoundaryCondition,
  createEnergySystem,
  createEnergyZoneDemandSettings,
  energyBoundaryTargetKindLabels,
  energySystemServiceLabels,
  energySystemTypeLabels,
  roomBoundaryConditionKey,
  type EnergyBoundaryCondition,
  type EnergyDemandSetResult,
  type EnergyDemandValidationMessage,
  type EnergyDemandWorkspace,
  type EnergySystem,
  type EnergySystemService,
  type EnergySystemType,
  type EnergyVentilationCalculationMode,
} from "@/components/energy/domain/energyDemandTypes";
import type { EnergyZoneSetResult, EnergyZoneWorkspace } from "@/components/energy/domain/energyZoneTypes";
import type { SurveyWallSegment } from "@/components/property-survey/propertySurveyBuildingModel";
import { surveyMechanicalKindLabels, type SurveyConstructionAssembly, type SurveyMechanicalDevice } from "@/components/property-survey/propertySurveyEnergyModel";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";

const inputClass = "h-10 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 text-xs font-bold text-[var(--survey-text)] outline-none focus:border-cyan-500";
const labelClass = "mb-1 block text-[9px] font-black uppercase tracking-[0.1em] text-[var(--survey-muted)]";
const now = () => new Date().toISOString();
function format(value: number | null | undefined, digits = 3) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return value.toLocaleString("hu-HU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function parseDecimal(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}
function DecimalField({ value, onCommit, placeholder, dataAttribute }: { value?: number; onCommit: (value: number | undefined) => void; placeholder?: string; dataAttribute?: Record<string, string> }) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value).replace(".", ","));
  useEffect(() => setDraft(value === undefined ? "" : String(value).replace(".", ",")), [value]);
  return <input {...dataAttribute} inputMode="decimal" className={inputClass} value={draft} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onBlur={() => onCommit(parseDecimal(draft))} />;
}

type Section = "settings" | "zones" | "boundaries" | "systems" | "results" | "trace";
type Props = {
  workspace: EnergyDemandWorkspace;
  result: EnergyDemandSetResult;
  zoneWorkspace: EnergyZoneWorkspace;
  zoneResult: EnergyZoneSetResult;
  rooms: SurveyRoom[];
  wallSegments: SurveyWallSegment[];
  assemblies: SurveyConstructionAssembly[];
  mechanicalDevices: SurveyMechanicalDevice[];
  onChange: (workspace: EnergyDemandWorkspace) => void;
};

export function EnergyDemandPanel({ workspace, result, zoneWorkspace, zoneResult, rooms, wallSegments, assemblies, mechanicalDevices, onChange }: Props) {
  const [section, setSection] = useState<Section>("settings");
  const roomMap = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms]);
  const assemblyMap = useMemo(() => new Map(assemblies.map((assembly) => [assembly.id, assembly])), [assemblies]);
  const editableRoomBoundaries = useMemo(() => rooms.flatMap((room) => {
    if (!zoneWorkspace.roomAssignments[room.id]) return [];
    const rows: Array<{ key: string; room: SurveyRoom; side: "lower" | "upper"; assembly: SurveyConstructionAssembly }> = [];
    const floor = room.floorAssemblyId ? assemblyMap.get(room.floorAssemblyId) : undefined;
    const ceiling = room.ceilingAssemblyId ? assemblyMap.get(room.ceilingAssemblyId) : undefined;
    if (floor?.boundaryMode === "internalUnheated") rows.push({ key: roomBoundaryConditionKey(room.id, "lower"), room, side: "lower", assembly: floor });
    if (ceiling?.boundaryMode === "internalUnheated") rows.push({ key: roomBoundaryConditionKey(room.id, "upper"), room, side: "upper", assembly: ceiling });
    return rows;
  }), [assemblyMap, rooms, zoneWorkspace.roomAssignments]);
  const editableWallBoundaries = useMemo(() => wallSegments.filter((segment) => (segment.boundaryType === "unheated" || segment.boundaryType === "adjacent") && Boolean(zoneWorkspace.roomAssignments[segment.roomId])), [wallSegments, zoneWorkspace.roomAssignments]);

  function commit(patch: Partial<EnergyDemandWorkspace>) {
    onChange({ ...workspace, ...patch, updatedAt: now() });
  }
  function updateZone(zoneId: string, patch: Partial<EnergyDemandWorkspace["zoneSettings"][string]>) {
    const existing = workspace.zoneSettings[zoneId] || createEnergyZoneDemandSettings(zoneId);
    commit({ zoneSettings: { ...workspace.zoneSettings, [zoneId]: { ...existing, ...patch, zoneId, updatedAt: now() } } });
  }
  function updateRoomBoundary(key: string, patch: Partial<EnergyBoundaryCondition>) {
    const existing = workspace.roomBoundaryConditions[key] || createEnergyBoundaryCondition({ targetKind: "unheatedSpace" });
    commit({ roomBoundaryConditions: { ...workspace.roomBoundaryConditions, [key]: { ...existing, ...patch, updatedAt: now() } } });
  }
  function updateWallBoundary(id: string, patch: Partial<EnergyBoundaryCondition>) {
    const segment = wallSegments.find((item) => item.id === id);
    const existing = workspace.wallBoundaryConditions[id] || createEnergyBoundaryCondition({ targetKind: segment?.boundaryType === "adjacent" ? "adjacentHeated" : "unheatedSpace" });
    commit({ wallBoundaryConditions: { ...workspace.wallBoundaryConditions, [id]: { ...existing, ...patch, updatedAt: now() } } });
  }
  function addSystem() {
    commit({ systems: [...workspace.systems, createEnergySystem({ service: "heating", type: "boiler", name: "Új fűtési rendszer" })] });
    setSection("systems");
  }
  function updateSystem(id: string, patch: Partial<EnergySystem>) {
    commit({ systems: workspace.systems.map((system) => system.id === id ? { ...system, ...patch, updatedAt: now() } : system) });
  }
  function deleteSystem(id: string) {
    commit({ systems: workspace.systems.filter((system) => system.id !== id) });
  }
  function toggleSystemZone(system: EnergySystem, zoneId: string, checked: boolean) {
    const servedZoneIds = checked ? [...new Set([...system.servedZoneIds, zoneId])] : system.servedZoneIds.filter((id) => id !== zoneId);
    const allocations = { ...system.zoneCapacityAllocationsKw };
    if (!checked) delete allocations[zoneId];
    updateSystem(system.id, { servedZoneIds, zoneCapacityAllocationsKw: allocations });
  }
  function toggleSystemDevice(system: EnergySystem, deviceId: string, checked: boolean) {
    updateSystem(system.id, { linkedSurveyDeviceIds: checked ? [...new Set([...system.linkedSurveyDeviceIds, deviceId])] : system.linkedSurveyDeviceIds.filter((id) => id !== deviceId) });
  }

  const sections: Array<{ id: Section; label: string; icon: typeof Settings2 }> = [
    { id: "settings", label: "Alapadatok", icon: Settings2 },
    { id: "zones", label: "Légcsere", icon: Wind },
    { id: "boundaries", label: "Határok", icon: GitBranch },
    { id: "systems", label: "Rendszerek", icon: Flame },
    { id: "results", label: "Eredmény", icon: Gauge },
    { id: "trace", label: "Nyomvonal", icon: ChevronRight },
  ];

  return <section className="grid min-w-0 gap-4" data-energy-demand-panel data-energy-demand-enabled={workspace.enabled ? "true" : "false"} data-energy-demand-valid={result.valid ? "true" : "false"}>
    <div className="rounded-2xl border border-indigo-300 bg-indigo-50 p-4 text-indigo-950">
      <div className="flex items-start gap-3"><Gauge size={22} className="shrink-0" /><div><div className="text-sm font-black">Zónaterhelés és gépészeti rendszerkapcsolatok · v0.7.5</div><p className="mt-1 text-xs font-semibold leading-5">Zónánkénti transzmissziós és szellőzési hőveszteségi tényező, dokumentált külső méretezési hőmérséklettel számított fűtési teljesítményigény, valamint rendszerlefedettség és kapacitás-ellenőrzés.</p></div></div>
      <div className="mt-3 rounded-xl border border-indigo-300 bg-white/70 px-3 py-2 text-[10px] font-bold leading-5">Ez méretezési fűtési terhelés-előkészítés. Nem havi vagy éves tanúsítási energiaigény, és nem hiteles méretezési jegyzőkönyv.</div>
    </div>

    <label className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4"><span><span className="block text-sm font-black text-[var(--survey-text)]">Zónaterhelési számítás bekapcsolása</span><span className="mt-1 block text-[10px] font-semibold text-[var(--survey-muted)]">Kikapcsolva a régi projektek változatlanul és blokkolás nélkül működnek.</span></span><input data-demand-enabled type="checkbox" className="h-5 w-5 accent-cyan-600" checked={workspace.enabled} onChange={(event) => commit({ enabled: event.target.checked })} /></label>

    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-2 sm:grid-cols-3 xl:grid-cols-6">
      {sections.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" data-energy-demand-section={item.id} onClick={() => setSection(item.id)} className={`flex min-h-10 items-center justify-center gap-2 rounded-xl px-2 text-[9px] font-black uppercase ${section === item.id ? "bg-cyan-100 text-cyan-900 ring-1 ring-cyan-400" : "text-[var(--survey-muted)]"}`}><Icon size={14} /> {item.label}</button>; })}
    </div>

    {section === "settings" ? <div className="grid gap-4" data-demand-settings>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className={labelClass}>Külső méretezési hőmérséklet °C</span><DecimalField value={workspace.externalDesignTemperatureC} onCommit={(value) => commit({ externalDesignTemperatureC: value })} dataAttribute={{ "data-demand-external-temperature": "true" }} /></label>
        <label><span className={labelClass}>Hőmérséklet forráshivatkozása</span><input data-demand-external-source className={inputClass} value={workspace.externalTemperatureSourceReference} onChange={(event) => commit({ externalTemperatureSourceReference: event.target.value })} placeholder="Szabvány, települési adat vagy számítás" /></label>
        <label><span className={labelClass}>Levegő térfogati hőkapacitása Wh/m³K</span><DecimalField value={workspace.airHeatCapacityWhM3K} onCommit={(value) => commit({ airHeatCapacityWhM3K: value || 0 })} dataAttribute={{ "data-demand-air-capacity": "true" }} /></label>
        <label><span className={labelClass}>Hőkapacitás forráshivatkozása</span><input data-demand-air-capacity-source className={inputClass} value={workspace.airHeatCapacitySourceReference} onChange={(event) => commit({ airHeatCapacitySourceReference: event.target.value })} placeholder="Alkalmazott műszaki forrás" /></label>
      </div>
      <ValidationList messages={result.validationMessages.filter((message) => !message.zoneId && !message.systemId)} />
    </div> : null}

    {section === "zones" ? <div className="grid gap-4" data-demand-zone-settings>
      {zoneResult.zones.map((zone) => {
        const settings = workspace.zoneSettings[zone.zoneId] || createEnergyZoneDemandSettings(zone.zoneId);
        const zoneResultRow = result.zones.find((item) => item.zoneId === zone.zoneId);
        return <article key={zone.zoneId} data-demand-zone-card={zone.zoneId} className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-sm font-black text-[var(--survey-text)]">{zone.zoneName}</div><div className="mt-1 text-[9px] font-bold text-[var(--survey-muted)]">{format(zone.floorAreaSquareMeters, 2)} m² · {format(zone.volumeCubicMeters, 2)} m³ · belső alapérték {format(zone.heatingSetpointC, 1)} °C</div></div><DemandStatus result={zoneResultRow || null} /></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label><span className={labelClass}>Szellőzési adat módja</span><select data-demand-ventilation-mode={zone.zoneId} className={inputClass} value={settings.ventilationMode} onChange={(event) => updateZone(zone.zoneId, { ventilationMode: event.target.value as EnergyVentilationCalculationMode })}><option value="airChange">Légcsereszám n</option><option value="designAirflow">Méretezési légmennyiség</option></select></label>
            {settings.ventilationMode === "airChange" ? <label><span className={labelClass}>Légcsereszám 1/h</span><DecimalField value={settings.airChangePerHour} onCommit={(value) => updateZone(zone.zoneId, { airChangePerHour: value })} dataAttribute={{ "data-demand-air-change": zone.zoneId }} /></label> : <label><span className={labelClass}>Légmennyiség m³/h</span><DecimalField value={settings.designAirflowM3h} onCommit={(value) => updateZone(zone.zoneId, { designAirflowM3h: value })} dataAttribute={{ "data-demand-airflow": zone.zoneId }} /></label>}
            <label><span className={labelClass}>Hővisszanyerés η 0–1</span><DecimalField value={settings.heatRecoveryEfficiency} onCommit={(value) => updateZone(zone.zoneId, { heatRecoveryEfficiency: value })} placeholder="0" dataAttribute={{ "data-demand-heat-recovery": zone.zoneId }} /></label>
            <label className="sm:col-span-2 lg:col-span-3"><span className={labelClass}>Légcsere / légmennyiség forrása</span><input data-demand-ventilation-source={zone.zoneId} className={inputClass} value={settings.ventilationSourceReference} onChange={(event) => updateZone(zone.zoneId, { ventilationSourceReference: event.target.value })} placeholder="Mérés, tervezési adat, légtechnikai számítás" /></label>
          </div>
          {zoneResultRow ? <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><SmallMetric label="H transzmisszió" value={`${format(zoneResultRow.transmissionHeatLossCoefficientWK)} W/K`} /><SmallMetric label="H szellőzés" value={`${format(zoneResultRow.ventilationHeatLossCoefficientWK)} W/K`} /><SmallMetric label="Fűtési igény" value={`${format(zoneResultRow.designHeatingPowerKw)} kW`} /><SmallMetric label="Fajlagos igény" value={`${format(zoneResultRow.designHeatingPowerPerAreaWm2, 1)} W/m²`} /></div> : null}
          <ValidationList messages={zoneResultRow?.validationMessages || []} />
        </article>;
      })}
    </div> : null}

    {section === "boundaries" ? <div className="grid gap-4" data-demand-boundaries>
      <div className="rounded-xl border border-blue-300 bg-blue-50 p-3 text-xs font-bold leading-5 text-blue-950">A külső levegővel és talajjal határos szerkezetekhez nem kell külön hőmérsékleti tényező. Itt csak a fűtetlen vagy szomszédos fűtött térrel határos elemek jelennek meg.</div>
      {editableRoomBoundaries.map((row) => <BoundaryEditor key={row.key} id={row.key} title={`${row.room.name} · ${row.side === "lower" ? "alsó határ" : "felső határ"}`} subtitle={row.assembly.name} value={workspace.roomBoundaryConditions[row.key]} onChange={(patch) => updateRoomBoundary(row.key, patch)} dataPrefix="room" />)}
      {editableWallBoundaries.map((segment) => <BoundaryEditor key={segment.id} id={segment.id} title={`${roomMap.get(segment.roomId)?.name || segment.roomId} · ${segment.wallType}`} subtitle={segment.boundaryType === "adjacent" ? "Szomszédos fűtött tér" : "Fűtetlen tér"} value={workspace.wallBoundaryConditions[segment.id]} defaultKind={segment.boundaryType === "adjacent" ? "adjacentHeated" : "unheatedSpace"} onChange={(patch) => updateWallBoundary(segment.id, patch)} dataPrefix="wall" />)}
      {!editableRoomBoundaries.length && !editableWallBoundaries.length ? <div className="rounded-2xl border border-dashed border-[var(--survey-border)] p-6 text-center text-xs font-bold text-[var(--survey-muted)]">Nincs külön szerkesztendő fűtetlen vagy szomszédos határfeltétel.</div> : null}
    </div> : null}

    {section === "systems" ? <div className="grid gap-4" data-demand-systems>
      <button type="button" data-add-energy-system onClick={addSystem} className="survey-action-secondary"><Plus size={15} /> Energetikai rendszer hozzáadása</button>
      {!workspace.systems.length ? <div className="rounded-2xl border border-dashed border-[var(--survey-border)] p-6 text-center text-xs font-bold text-[var(--survey-muted)]">Nincs energetikai rendszer. A zónaterhelés ettől még számítható, de a kapacitás-lefedettség ismeretlen marad.</div> : workspace.systems.map((system, index) => {
        const systemResult = result.systems.find((item) => item.systemId === system.id);
        return <article key={system.id} data-energy-system-card={system.id} className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4">
          <div className="mb-3 flex items-start justify-between gap-3"><div><div className="text-sm font-black text-[var(--survey-text)]">{index + 1}. {system.name}</div><div className="mt-1 text-[9px] font-bold text-[var(--survey-muted)]">{energySystemServiceLabels[system.service]} · {energySystemTypeLabels[system.type]} · {systemResult?.nominalCapacityKw === null || systemResult?.nominalCapacityKw === undefined ? "kapacitás nélkül" : `${format(systemResult.nominalCapacityKw)} kW`}</div></div><button type="button" data-delete-energy-system={system.id} onClick={() => deleteSystem(system.id)} className="survey-icon-button h-9 w-9 text-rose-700"><Trash2 size={15} /></button></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label><span className={labelClass}>Megnevezés</span><input data-system-name={system.id} className={inputClass} value={system.name} onChange={(event) => updateSystem(system.id, { name: event.target.value })} /></label>
            <label><span className={labelClass}>Szolgáltatás</span><select data-system-service={system.id} className={inputClass} value={system.service} onChange={(event) => updateSystem(system.id, { service: event.target.value as EnergySystemService })}>{Object.entries(energySystemServiceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span className={labelClass}>Rendszertípus</span><select data-system-type={system.id} className={inputClass} value={system.type} onChange={(event) => updateSystem(system.id, { type: event.target.value as EnergySystemType })}>{Object.entries(energySystemTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span className={labelClass}>Névleges kapacitás kW</span><DecimalField value={system.nominalCapacityKw} onCommit={(value) => updateSystem(system.id, { nominalCapacityKw: value })} dataAttribute={{ "data-system-capacity": system.id }} /></label>
            <label className="sm:col-span-2"><span className={labelClass}>Kapacitás forráshivatkozása</span><input data-system-source={system.id} className={inputClass} value={system.sourceReference} onChange={(event) => updateSystem(system.id, { sourceReference: event.target.value })} placeholder="Adatlap, teljesítménynyilatkozat, beszabályozás" /></label>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div><div className={labelClass}>Kiszolgált zónák</div><div className="grid gap-2">{zoneResult.zones.map((zone) => <label key={zone.zoneId} className="flex items-center gap-2 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 py-2 text-xs font-bold text-[var(--survey-text)]"><input data-system-zone={`${system.id}:${zone.zoneId}`} type="checkbox" checked={system.servedZoneIds.includes(zone.zoneId)} onChange={(event) => toggleSystemZone(system, zone.zoneId, event.target.checked)} /> <span className="min-w-0 flex-1">{zone.zoneName}</span>{system.servedZoneIds.includes(zone.zoneId) ? <span className="w-24"><DecimalField value={system.zoneCapacityAllocationsKw[zone.zoneId]} onCommit={(value) => {
                  const allocations = { ...system.zoneCapacityAllocationsKw };
                  if (value === undefined) delete allocations[zone.zoneId];
                  else allocations[zone.zoneId] = value;
                  updateSystem(system.id, { zoneCapacityAllocationsKw: allocations });
                }} placeholder="kW" dataAttribute={{ "data-system-zone-capacity": `${system.id}:${zone.zoneId}` }} /></span> : null}</label>)}</div></div>
            <div><div className={labelClass}>Kapcsolt helyszíni berendezések</div><div className="grid gap-2">{mechanicalDevices.length ? mechanicalDevices.map((device) => <label key={device.id} className="flex items-center gap-2 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 py-2 text-xs font-bold text-[var(--survey-text)]"><input data-system-device={`${system.id}:${device.id}`} type="checkbox" checked={system.linkedSurveyDeviceIds.includes(device.id)} onChange={(event) => toggleSystemDevice(system, device.id, event.target.checked)} /><span>{device.name} · {surveyMechanicalKindLabels[device.kind]}</span></label>) : <div className="rounded-xl border border-dashed border-[var(--survey-border)] p-3 text-xs font-bold text-[var(--survey-muted)]">Az alaprajzon még nincs elhelyezett gépészeti berendezés.</div>}</div></div>
          </div>
          <textarea className="mt-3 min-h-16 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 text-xs font-bold text-[var(--survey-text)]" value={system.note} onChange={(event) => updateSystem(system.id, { note: event.target.value })} placeholder="Rendszerhatár, tartalék, üzemállapot..." />
          <ValidationList messages={systemResult?.validationMessages || []} />
        </article>;
      })}
    </div> : null}

    {section === "results" ? <div className="grid gap-4" data-demand-results>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"><Metric label="Zónák" value={String(result.totals.zoneCount)} /><Metric label="H transzmisszió" value={`${format(result.totals.transmissionHeatLossCoefficientWK)} W/K`} /><Metric label="H szellőzés" value={`${format(result.totals.ventilationHeatLossCoefficientWK)} W/K`} /><Metric label="H összes" value={`${format(result.totals.totalHeatLossCoefficientWK)} W/K`} /><Metric label="Fűtési igény" value={`${format(result.totals.designHeatingPowerKw)} kW`} /><Metric label="Kapcsolt kapacitás" value={`${format(result.totals.allocatedHeatingCapacityKw)} kW`} /></div>
      {result.zones.map((zone) => <article key={zone.zoneId} data-demand-result-zone={zone.zoneId} className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-sm font-black text-[var(--survey-text)]">{zone.zoneName}</div><div className="mt-1 text-[9px] font-bold text-[var(--survey-muted)]">ΔT {format(zone.designTemperatureDifferenceK, 1)} K · {format(zone.designHeatingPowerPerAreaWm2, 1)} W/m²</div></div><DemandStatus result={zone} /></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><SmallMetric label="Fal" value={`${format(zone.wallHeatLossCoefficientWK)} W/K`} /><SmallMetric label="Alsó + felső" value={`${format(zone.lowerBoundaryHeatLossCoefficientWK + zone.upperBoundaryHeatLossCoefficientWK)} W/K`} /><SmallMetric label="Nyílás + hőhíd" value={`${format(zone.openingHeatLossCoefficientWK + zone.installationHeatLossCoefficientWK + zone.thermalBridgeHeatLossCoefficientWK)} W/K`} /><SmallMetric label="Fűtési teljesítmény" value={`${format(zone.designHeatingPowerKw)} kW`} /></div><details className="mt-3 rounded-xl border border-[var(--survey-border)]"><summary className="cursor-pointer p-3 text-xs font-black text-[var(--survey-text)]">Részletes hőveszteségi komponensek · {zone.components.length} sor</summary><div className="overflow-x-auto border-t border-[var(--survey-border)]"><table className="min-w-[760px] w-full text-left text-[10px]"><thead><tr className="text-[var(--survey-muted)]"><th className="p-2">Elem</th><th className="p-2">Típus</th><th className="p-2">A</th><th className="p-2">U</th><th className="p-2">b</th><th className="p-2">H</th><th className="p-2">Forrás</th></tr></thead><tbody>{zone.components.map((row) => <tr key={row.id} data-demand-component={row.kind} className="border-t border-[var(--survey-border)] text-[var(--survey-text)]"><td className="p-2 font-bold">{row.entityName}</td><td className="p-2">{row.kind}</td><td className="p-2">{format(row.areaSquareMeters, 2)}</td><td className="p-2">{format(row.uValueWm2K)}</td><td className="p-2">{format(row.temperatureFactor)}</td><td className="p-2 font-black">{format(row.effectiveHeatLossCoefficientWK)} W/K</td><td className="max-w-64 p-2">{row.sourceReference}</td></tr>)}</tbody></table></div></details><ValidationList messages={zone.validationMessages} /></article>)}
      {!workspace.enabled ? <div className="rounded-2xl border border-dashed border-[var(--survey-border)] p-6 text-center text-xs font-bold text-[var(--survey-muted)]">A zónaterhelési számítás nincs bekapcsolva.</div> : null}
    </div> : null}

    {section === "trace" ? <div className="grid gap-2" data-demand-trace>{result.trace.map((item) => <details key={item.id} data-demand-trace-rule={item.ruleId} className="group rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)]"><summary className="flex cursor-pointer list-none items-start gap-2 p-3"><ChevronRight size={15} className="mt-0.5 shrink-0 transition group-open:rotate-90" /><span className="min-w-0 flex-1"><span className="block text-xs font-black text-[var(--survey-text)]">{item.label}</span><span className="mt-1 block text-[9px] font-bold text-[var(--survey-muted)]">{item.ruleId} · {item.formula}</span></span><span className="shrink-0 text-xs font-black text-[var(--survey-text)]">{format(item.value)} {item.unit.replace("m2", "m²").replace("m3", "m³")}</span></summary><div className="border-t border-[var(--survey-border)] p-3 text-[10px] font-semibold text-[var(--survey-muted)]">{Object.entries(item.inputs).map(([key, value]) => <div key={key}><strong className="text-[var(--survey-text)]">{key}:</strong> {String(value)}</div>)}</div></details>)}</div> : null}

    <div className="rounded-xl border border-dashed border-[var(--survey-border)] p-3 text-[10px] font-semibold leading-5 text-[var(--survey-muted)]">Motor: {result.engineVersion} · forrásazonosítók: {result.sourceReferenceIds.join(" · ")} · ellenőrzés: {result.sourceCheckedAt}. A havi/éves energiaigényhez meteorológiai, szoláris, belső nyereség-, hőtárolási és rendszer-veszteségi számítási szint szükséges.</div>
  </section>;
}

function BoundaryEditor({ id, title, subtitle, value, defaultKind = "unheatedSpace", onChange, dataPrefix }: { id: string; title: string; subtitle: string; value?: EnergyBoundaryCondition; defaultKind?: EnergyBoundaryCondition["targetKind"]; onChange: (patch: Partial<EnergyBoundaryCondition>) => void; dataPrefix: string }) {
  const condition = value || createEnergyBoundaryCondition({ targetKind: defaultKind });
  return <article data-demand-boundary={`${dataPrefix}:${id}`} className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4"><div className="text-sm font-black text-[var(--survey-text)]">{title}</div><div className="mt-1 text-[9px] font-bold text-[var(--survey-muted)]">{subtitle}</div><div className="mt-3 grid gap-3 sm:grid-cols-3"><label><span className={labelClass}>Céltér típusa</span><select data-boundary-kind={`${dataPrefix}:${id}`} className={inputClass} value={condition.targetKind} onChange={(event) => onChange({ targetKind: event.target.value as EnergyBoundaryCondition["targetKind"] })}>{Object.entries(energyBoundaryTargetKindLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label><span className={labelClass}>Céltér hőmérséklete °C</span><DecimalField value={condition.targetTemperatureC} onCommit={(next) => onChange({ targetTemperatureC: next })} dataAttribute={{ "data-boundary-temperature": `${dataPrefix}:${id}` }} /></label><label><span className={labelClass}>Forráshivatkozás</span><input data-boundary-source={`${dataPrefix}:${id}`} className={inputClass} value={condition.sourceReference} onChange={(event) => onChange({ sourceReference: event.target.value })} /></label></div></article>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-indigo-300 bg-indigo-50 p-3 text-center text-indigo-950"><div className="text-lg font-black">{value}</div><div className="mt-1 text-[8px] font-black uppercase">{label}</div></div>; }
function SmallMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-2"><div className="text-[8px] font-black uppercase text-[var(--survey-muted)]">{label}</div><div className="mt-1 text-xs font-black text-[var(--survey-text)]">{value}</div></div>; }
function DemandStatus({ result }: { result: EnergyDemandSetResult["zones"][number] | null }) {
  if (!result) return null;
  const text = result.blocked ? "Blokkolt" : result.systemCoverageStatus === "sufficient" ? "Kapacitás megfelelő" : result.systemCoverageStatus === "insufficient" ? "Kapacitás kevés" : result.systemCoverageStatus === "unknownCapacity" ? "Kapacitás ismeretlen" : result.systemCoverageStatus === "missing" ? "Rendszer hiányzik" : "Számítható";
  const cls = result.blocked || result.systemCoverageStatus === "insufficient" ? "border-rose-300 bg-rose-50 text-rose-950" : result.systemCoverageStatus === "sufficient" ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-amber-300 bg-amber-50 text-amber-950";
  return <span data-demand-system-status={result.systemCoverageStatus} className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase ${cls}`}>{text}</span>;
}
function ValidationList({ messages }: { messages: EnergyDemandValidationMessage[] }) {
  if (!messages.length) return <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-bold text-emerald-950"><CheckCircle2 size={16} className="shrink-0" /> A kapcsolódó adatok teljesek.</div>;
  return <div className="mt-3 grid gap-2">{messages.map((item, index) => <div key={`${item.code}-${index}`} data-demand-validation-code={item.code} className={`flex items-start gap-2 rounded-xl border p-3 text-xs font-bold ${item.severity === "error" ? "border-rose-300 bg-rose-50 text-rose-950" : item.severity === "warning" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-blue-300 bg-blue-50 text-blue-950"}`}><AlertTriangle size={16} className="shrink-0" /> {item.message}</div>)}</div>;
}
