"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BatteryCharging,
  CarFront,
  Check,
  CheckCircle2,
  Circle,
  CircleAlert,
  Gauge,
  Plus,
  Sun,
  Trash2,
  Zap,
} from "lucide-react";
import { createEnergyRoofSurface } from "@/components/energy/domain/energyRenewableTypes";
import {
  energyDataStatusLabels,
  type EnergyDataStatus,
  type EnergyWorkspaceMode,
} from "@/components/energy/domain/energyFieldWorkflowTypes";
import type {
  EnergyBatteryPlan,
  EnergyElectricityProfile,
  EnergyEvChargingPlan,
  EnergyPvPlan,
  EnergyRenewableSizingResult,
  EnergyRenewableWorkspace,
  EnergyRoofSurface,
  EnergySolarThermalPlan,
} from "@/components/energy/domain/energyRenewableTypes";
import {
  EnergyAdvancedDetails,
  EnergyFieldHelp,
  EnergyFieldIntro,
  EnergyFieldStatusBadge,
  EnergyRequiredLabel,
} from "@/components/property-survey/energy/EnergyFieldUi";

type Tab = "roof" | "electricity" | "pv" | "solar" | "battery" | "ev" | "result";
type TabReadiness = "complete" | "incomplete" | "optional";

type Props = {
  workspace: EnergyRenewableWorkspace;
  result: EnergyRenewableSizingResult;
  mode: EnergyWorkspaceMode;
  onChange: (workspace: EnergyRenewableWorkspace) => void;
};

const inputClass = "h-11 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 text-sm font-bold text-[var(--survey-text)] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";

function parseNumber(value: string, fallback = 0) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatInput(value: number) {
  return Number.isFinite(value) ? String(value).replace(".", ",") : "";
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function DecimalInput({ value, onCommit, min, max, step = "0.01", ariaLabel }: { value: number; onCommit: (value: number) => void; min?: number; max?: number; step?: string; ariaLabel: string }) {
  const [draft, setDraft] = useState(formatInput(value));
  useEffect(() => setDraft(formatInput(value)), [value]);
  function commit() {
    let next = parseNumber(draft, value);
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    onCommit(next);
    setDraft(formatInput(next));
  }
  return <input aria-label={ariaLabel} inputMode="decimal" step={step} className={inputClass} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />;
}

function Field({ label, optional = false, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return <label><EnergyRequiredLabel optional={optional}>{label}</EnergyRequiredLabel>{children}</label>;
}

function DataStatusSelect({ value, onChange }: { value: EnergyDataStatus; onChange: (value: EnergyDataStatus) => void }) {
  return <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value as EnergyDataStatus)}>{Object.entries(energyDataStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>;
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description?: string }) {
  return <label className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3 py-3 text-sm font-black ${checked ? "border-cyan-300 bg-cyan-50 text-cyan-950" : "border-[var(--survey-border)] bg-[var(--survey-panel)] text-[var(--survey-text)]"}`}>
    <span className="min-w-0"><span className="block">{label}</span>{description ? <span className="mt-1 block text-[9px] font-semibold leading-4 opacity-70">{description}</span> : null}</span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 shrink-0 accent-cyan-600" />
  </label>;
}

function Metric({ label, value, unit, note, action }: { label: string; value: string | number | null; unit?: string; note?: string; action?: React.ReactNode }) {
  return <div className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3"><div className="text-[9px] font-black uppercase tracking-[0.08em] text-[var(--survey-muted)]">{label}</div><div className="mt-1 text-xl font-black text-[var(--survey-text)]">{value === null || value === "" ? "–" : value} {unit ? <span className="text-xs">{unit}</span> : null}</div>{note ? <div className="mt-1 text-[9px] font-semibold leading-4 text-[var(--survey-muted)]">{note}</div> : null}{action ? <div className="mt-2">{action}</div> : null}</div>;
}

function SectionTitle({ title, description, step }: { title: string; description: string; step: string }) {
  return <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[0.12em] text-cyan-700">{step}</div><div className="mt-1 text-sm font-black text-[var(--survey-text)]">{title}</div><div className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-[var(--survey-muted)]">{description}</div></div></div>;
}

function readinessIcon(readiness: TabReadiness) {
  if (readiness === "complete") return <Check size={13} />;
  if (readiness === "incomplete") return <CircleAlert size={13} />;
  return <Circle size={13} />;
}

export function EnergyRenewablePanel({ workspace, result, mode, onChange }: Props) {
  const [tab, setTab] = useState<Tab>("roof");
  const blockingCount = result.validationMessages.filter((message) => message.severity === "blocking").length;
  const warningCount = result.validationMessages.filter((message) => message.severity === "warning").length;
  const selectedPvSurfaces = useMemo(() => new Set(workspace.pv.roofSurfaceIds), [workspace.pv.roofSurfaceIds]);
  const expertMode = mode === "expert";

  const readiness = useMemo<Record<Tab, TabReadiness>>(() => {
    const roofReady = workspace.roofSurfaces.some((surface) => surface.grossAreaSquareMeters > 0 && surface.usableAreaSquareMeters > 0 && Boolean(surface.sourceReference.trim()));
    const electricityReady = workspace.electricityProfile.annualConsumptionKwh > 0
      && workspace.electricityProfile.connectionAmpsPerPhase > 0
      && Boolean(workspace.electricityProfile.sourceReference.trim());
    const pvReady = !workspace.pv.enabled || (
      workspace.pv.roofSurfaceIds.length > 0
      && workspace.pv.panelCount > 0
      && workspace.pv.modulePowerWp > 0
      && workspace.pv.inverterAcPowerKw > 0
      && workspace.pv.specificYieldKwhPerKwpYear > 0
      && Boolean(workspace.pv.sourceReference.trim())
    );
    const solarReady = !workspace.solarThermal.enabled || (
      Boolean(workspace.solarThermal.roofSurfaceId)
      && workspace.solarThermal.collectorAreaSquareMeters > 0
      && workspace.solarThermal.persons > 0
      && workspace.solarThermal.specificYieldKwhPerSquareMeterYear > 0
      && Boolean(workspace.solarThermal.sourceReference.trim())
    );
    const batteryReady = !workspace.battery.enabled || (
      workspace.battery.nominalCapacityKwh > 0
      && workspace.battery.usableCapacityKwh > 0
      && Boolean(workspace.battery.sourceReference.trim())
    );
    const evReady = !workspace.evCharging.enabled || (
      workspace.evCharging.annualDistanceKm > 0
      && workspace.evCharging.vehicleConsumptionKwhPer100Km > 0
      && workspace.evCharging.chargerPowerKw > 0
      && Boolean(workspace.evCharging.sourceReference.trim())
    );
    return {
      roof: roofReady ? "complete" : "incomplete",
      electricity: electricityReady ? "complete" : "incomplete",
      pv: workspace.pv.enabled ? (pvReady ? "complete" : "incomplete") : "optional",
      solar: workspace.solarThermal.enabled ? (solarReady ? "complete" : "incomplete") : "optional",
      battery: workspace.battery.enabled ? (batteryReady ? "complete" : "incomplete") : "optional",
      ev: workspace.evCharging.enabled ? (evReady ? "complete" : "incomplete") : "optional",
      result: workspace.enabled && blockingCount === 0 ? "complete" : "incomplete",
    };
  }, [blockingCount, workspace]);

  const tabs = useMemo<Array<{ id: Tab; label: string; icon: typeof Sun; group: string }>>(() => [
    { id: "roof", label: "Tetősíkok", icon: Sun, group: "1. Alapadat" },
    { id: "electricity", label: "Villamos adatok", icon: Zap, group: "1. Alapadat" },
    { id: "pv", label: "Napelem", icon: Sun, group: "2. Rendszer" },
    { id: "solar", label: "Napkollektor", icon: Sun, group: "2. Rendszer" },
    { id: "battery", label: "Akkumulátor", icon: BatteryCharging, group: "2. Rendszer" },
    { id: "ev", label: "Autótöltés", icon: CarFront, group: "2. Rendszer" },
    { id: "result", label: "Ellenőrzés", icon: CheckCircle2, group: "3. Eredmény" },
  ], []);

  const relevantTabs = tabs.filter((item) => item.id === "roof" || item.id === "electricity" || item.id === "result" || readiness[item.id] !== "optional");
  const completeCount = relevantTabs.filter((item) => readiness[item.id] === "complete").length;
  const enabledSystemCount = [workspace.pv.enabled, workspace.solarThermal.enabled, workspace.battery.enabled, workspace.evCharging.enabled].filter(Boolean).length;
  const nextIncomplete = relevantTabs.find((item) => readiness[item.id] === "incomplete");
  const noSystemSelected = workspace.enabled && enabledSystemCount === 0 && readiness.roof === "complete" && readiness.electricity === "complete";

  function updateWorkspace(patch: Partial<EnergyRenewableWorkspace>) {
    onChange({ ...workspace, ...patch, updatedAt: new Date().toISOString() });
  }
  function updateProfile(patch: Partial<EnergyElectricityProfile>) { updateWorkspace({ electricityProfile: { ...workspace.electricityProfile, ...patch } }); }
  function updatePv(patch: Partial<EnergyPvPlan>) { updateWorkspace({ pv: { ...workspace.pv, ...patch } }); }
  function updateSolar(patch: Partial<EnergySolarThermalPlan>) { updateWorkspace({ solarThermal: { ...workspace.solarThermal, ...patch } }); }
  function updateBattery(patch: Partial<EnergyBatteryPlan>) { updateWorkspace({ battery: { ...workspace.battery, ...patch } }); }
  function updateEv(patch: Partial<EnergyEvChargingPlan>) { updateWorkspace({ evCharging: { ...workspace.evCharging, ...patch } }); }
  function updateRoof(id: string, patch: Partial<EnergyRoofSurface>) {
    updateWorkspace({ roofSurfaces: workspace.roofSurfaces.map((surface) => surface.id === id ? { ...surface, ...patch } : surface) });
  }
  function deleteRoof(id: string) {
    updateWorkspace({
      roofSurfaces: workspace.roofSurfaces.filter((surface) => surface.id !== id),
      pv: { ...workspace.pv, roofSurfaceIds: workspace.pv.roofSurfaceIds.filter((surfaceId) => surfaceId !== id) },
      solarThermal: { ...workspace.solarThermal, roofSurfaceId: workspace.solarThermal.roofSurfaceId === id ? undefined : workspace.solarThermal.roofSurfaceId },
    });
  }
  function applyBatterySuggestion() {
    const nominal = result.battery.suggestedNominalCapacityKwh;
    if (nominal === null || nominal <= 0) return;
    updateBattery({
      nominalCapacityKwh: round(nominal),
      usableCapacityKwh: round(nominal * workspace.battery.usableFraction),
    });
  }

  return <div className="grid gap-4" data-energy-renewable-panel="true">
    <EnergyFieldIntro
      icon={<Gauge size={21} />}
      eyebrow="Terepi energetikai lépés"
      title="Megújuló és villamos előméretezés"
      description="Először a tetősíkot és a villamos alapadatokat rögzítsd. Ezután csak azokat a rendszereket kapcsold be, amelyek ténylegesen részei a tervezett változatnak."
      status={!workspace.enabled ? "Kikapcsolva" : blockingCount ? `${blockingCount} javítandó hiány` : `${completeCount}/${relevantTabs.length} rész rendben`}
      statusTone={!workspace.enabled ? "neutral" : blockingCount ? "warning" : "complete"}
    >
      <Toggle checked={workspace.enabled} onChange={(enabled) => updateWorkspace({ enabled })} label="Előméretezés használata ebben a projektben" description="Kikapcsolva a korábbi projektadatok és eredmények változatlanok maradnak." />
    </EnergyFieldIntro>

    {workspace.enabled ? <div className={`rounded-2xl border p-3 ${nextIncomplete || noSystemSelected ? "border-cyan-300 bg-cyan-50 text-cyan-950" : "border-emerald-300 bg-emerald-50 text-emerald-950"}`} data-renewable-next-action>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.12em] opacity-70">Következő teendő</div>
          <div className="mt-1 text-sm font-black">{nextIncomplete ? `${nextIncomplete.label} kitöltése` : noSystemSelected ? "Válaszd ki a tervezett rendszert" : "Az előméretezés ellenőrizhető"}</div>
          <div className="mt-1 text-[10px] font-semibold leading-4 opacity-75">{nextIncomplete ? "A még szükséges mezők a munkalap elején jelennek meg. A műszaki részletek külön nyithatók meg." : noSystemSelected ? "A napelem, napkollektor, akkumulátor és autótöltés egymástól függetlenül kapcsolható be." : "Nyisd meg az Ellenőrzés lapot, és tekintsd át a figyelmeztetéseket."}</div>
        </div>
        <button type="button" onClick={() => setTab(nextIncomplete?.id || (noSystemSelected ? "pv" : "result"))} className="survey-action-primary shrink-0">Megnyitás <ArrowRight size={16} /></button>
      </div>
    </div> : <EnergyFieldHelp>A részletes adatok megmaradnak, de a számítás és az ellenőrzési üzenetek csak a munkatér bekapcsolása után aktívak.</EnergyFieldHelp>}

    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-2 sm:grid-cols-4 xl:grid-cols-7">{tabs.map((item) => {
      const Icon = item.icon;
      const state = readiness[item.id];
      return <button key={item.id} type="button" data-renewable-tab={item.id} data-renewable-readiness={state} onClick={() => setTab(item.id)} className={`flex min-h-14 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition ${tab === item.id ? "border-cyan-400 bg-cyan-50 text-cyan-950 shadow-sm" : "border-transparent bg-[var(--survey-panel)] text-[var(--survey-text)] hover:border-[var(--survey-border)]"}`}>
        <span className="flex w-full items-center justify-between gap-2"><span className="flex items-center gap-2 text-[10px] font-black uppercase"><Icon size={15} /> {item.label}</span><span className={state === "complete" ? "text-emerald-700" : state === "incomplete" ? "text-amber-700" : "text-slate-400"}>{readinessIcon(state)}</span></span>
        <span className="mt-1 text-[8px] font-bold uppercase tracking-[0.08em] opacity-60">{item.group}</span>
      </button>;
    })}</div>

    {tab === "roof" ? <div className="grid gap-3">
      <SectionTitle step="1/A" title="Tetősíkok helyszíni adatai" description="Mérd meg a felületet, add meg a tájolást, majd jelöld, melyik rendszer használhatja a tetősíkot." />
      <div className="flex flex-wrap items-center justify-between gap-3"><EnergyFieldHelp>A helyszíni gyorsfelvételhez a név, tájolás, dőlés, bruttó és hasznos felület, valamint az adatforrás szükséges.</EnergyFieldHelp><button type="button" data-add-roof-surface onClick={() => updateWorkspace({ roofSurfaces: [...workspace.roofSurfaces, createEnergyRoofSurface({}, workspace.roofSurfaces.length)] })} className="survey-action-primary"><Plus size={16} /> Tetősík hozzáadása</button></div>
      {!workspace.roofSurfaces.length ? <div className="rounded-2xl border border-dashed border-cyan-300 bg-cyan-50 p-7 text-center"><Sun size={28} className="mx-auto text-cyan-700" /><div className="mt-3 text-sm font-black text-cyan-950">Még nincs rögzített tetősík</div><div className="mt-1 text-xs font-semibold text-cyan-800">A napelemhez és a napkollektorhoz legalább egy tetősík szükséges.</div></div> : null}
      {workspace.roofSurfaces.map((surface, index) => <div key={surface.id} data-roof-surface={surface.id} className="grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3">
        <div className="flex items-center justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[0.1em] text-cyan-700">{index + 1}. tetősík</div><div className="mt-1 text-sm font-black text-[var(--survey-text)]">{surface.name}</div></div><div className="flex items-center gap-2">{surface.grossAreaSquareMeters > 0 && surface.usableAreaSquareMeters > 0 && surface.sourceReference.trim() ? <EnergyFieldStatusBadge tone="complete">Alapadat rendben</EnergyFieldStatusBadge> : <EnergyFieldStatusBadge tone="warning">Hiányos</EnergyFieldStatusBadge>}<button type="button" onClick={() => deleteRoof(surface.id)} className="survey-icon-button text-rose-700" aria-label={`${surface.name} törlése`}><Trash2 size={15} /></button></div></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Field label="Megnevezés"><input className={inputClass} value={surface.name} onChange={(event) => updateRoof(surface.id, { name: event.target.value })} /></Field><Field label="Azimut (°)"><DecimalInput ariaLabel={`${surface.name} azimut`} value={surface.azimuthDegrees} min={0} max={359.99} onCommit={(value) => updateRoof(surface.id, { azimuthDegrees: value })} /></Field><Field label="Dőlésszög (°)"><DecimalInput ariaLabel={`${surface.name} dőlésszög`} value={surface.tiltDegrees} min={0} max={90} onCommit={(value) => updateRoof(surface.id, { tiltDegrees: value })} /></Field><Field label="Bruttó felület (m²)"><DecimalInput ariaLabel={`${surface.name} bruttó felület`} value={surface.grossAreaSquareMeters} min={0} onCommit={(value) => updateRoof(surface.id, { grossAreaSquareMeters: value })} /></Field><Field label="Hasznos felület (m²)"><DecimalInput ariaLabel={`${surface.name} hasznos felület`} value={surface.usableAreaSquareMeters} min={0} onCommit={(value) => updateRoof(surface.id, { usableAreaSquareMeters: value })} /></Field><Field label="Adatforrás"><input className={inputClass} value={surface.sourceReference} onChange={(event) => updateRoof(surface.id, { sourceReference: event.target.value })} placeholder="Helyszíni mérés, terv, felmérési rajz" /></Field></div>
        <div className="grid gap-2 sm:grid-cols-2"><Toggle checked={selectedPvSurfaces.has(surface.id)} onChange={(checked) => { const ids = checked ? [...new Set([...workspace.pv.roofSurfaceIds, surface.id])] : workspace.pv.roofSurfaceIds.filter((id) => id !== surface.id); updateWorkspace({ roofSurfaces: workspace.roofSurfaces.map((item) => item.id === surface.id ? { ...item, status: checked ? "selected" : "candidate" } : item), pv: { ...workspace.pv, roofSurfaceIds: ids } }); }} label="Napelemhez használható" /><Toggle checked={workspace.solarThermal.roofSurfaceId === surface.id} onChange={(checked) => updateSolar({ roofSurfaceId: checked ? surface.id : undefined })} label="Napkollektorhoz használható" /></div>
        <EnergyAdvancedDetails id={`roof-${surface.id}`} defaultOpen={expertMode} title="Tetősík részletes ellenőrzése" description="Árnyékolás, fedés, statikai státusz, adatminőség és megjegyzés.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Field label="Tetőfedés" optional><input className={inputClass} value={surface.roofCovering} onChange={(event) => updateRoof(surface.id, { roofCovering: event.target.value })} placeholder="Pl. cserép, lemez" /></Field><Field label="Árnyékolási szorzó (0–1)"><DecimalInput ariaLabel={`${surface.name} árnyékolási szorzó`} value={surface.shadingFactor} min={0} max={1} step="0.01" onCommit={(value) => updateRoof(surface.id, { shadingFactor: value })} /></Field><Field label="Adatstátusz"><DataStatusSelect value={surface.dataStatus} onChange={(value) => updateRoof(surface.id, { dataStatus: value })} /></Field><div className="sm:col-span-2 xl:col-span-3"><Field label="Teherbírás / statikai státusz"><input className={inputClass} value={surface.structuralAssessment} onChange={(event) => updateRoof(surface.id, { structuralAssessment: event.target.value })} placeholder="Pl. statikus ellenőrzése szükséges" /></Field></div><div className="sm:col-span-2 xl:col-span-3"><Field label="Megjegyzés" optional><textarea className="min-h-20 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 text-xs font-bold text-[var(--survey-text)]" value={surface.note} onChange={(event) => updateRoof(surface.id, { note: event.target.value })} /></Field></div></div>
        </EnergyAdvancedDetails>
      </div>)}
    </div> : null}

    {tab === "electricity" ? <div className="grid gap-4">
      <SectionTitle step="1/B" title="Épület villamosenergia- és csatlakozási adatai" description="A villanyszámla vagy fogyasztási kimutatás, valamint a mérőhely adatai alapján töltsd ki." />
      <div className="grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4 sm:grid-cols-2 xl:grid-cols-4"><Field label="Éves fogyasztás (kWh)"><DecimalInput ariaLabel="Éves villamosenergia-fogyasztás" value={workspace.electricityProfile.annualConsumptionKwh} min={0} onCommit={(value) => updateProfile({ annualConsumptionKwh: value })} /></Field><Field label="Fázisszám"><select className={inputClass} value={workspace.electricityProfile.phaseMode} onChange={(event) => updateProfile({ phaseMode: event.target.value as EnergyElectricityProfile["phaseMode"], connectionVoltageV: event.target.value === "singlePhase" ? 230 : 400 })}><option value="singlePhase">1 fázis</option><option value="threePhase">3 fázis</option></select></Field><Field label="Csatlakozás (A/fázis)"><DecimalInput ariaLabel="Csatlakozási áramerősség" value={workspace.electricityProfile.connectionAmpsPerPhase} min={0} onCommit={(value) => updateProfile({ connectionAmpsPerPhase: value })} /></Field><Field label="Forrás"><input className={inputClass} value={workspace.electricityProfile.sourceReference} onChange={(event) => updateProfile({ sourceReference: event.target.value })} placeholder="Villanyszámla és mérőhely" /></Field></div>
      <EnergyAdvancedDetails id="electricity" defaultOpen={expertMode} title="Fogyasztási profil és műszaki részletek" description="A nappali fogyasztási arány, egyidejű alapteher, feszültség és adatstátusz a részletes sajátfogyasztási és hálózati ellenőrzéshez kell.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Nappali fogyasztási arány (%)"><DecimalInput ariaLabel="Nappali fogyasztási arány" value={workspace.electricityProfile.daytimeConsumptionSharePercent} min={0} max={100} onCommit={(value) => updateProfile({ daytimeConsumptionSharePercent: value })} /></Field><Field label="Egyidejű alapteher (kW)"><DecimalInput ariaLabel="Egyidejű alapteher" value={workspace.electricityProfile.simultaneousBaseLoadKw} min={0} onCommit={(value) => updateProfile({ simultaneousBaseLoadKw: value })} /></Field><Field label="Feszültség (V)"><DecimalInput ariaLabel="Csatlakozási feszültség" value={workspace.electricityProfile.connectionVoltageV} min={1} onCommit={(value) => updateProfile({ connectionVoltageV: value })} /></Field><Field label="Adatstátusz"><DataStatusSelect value={workspace.electricityProfile.dataStatus} onChange={(value) => updateProfile({ dataStatus: value })} /></Field></div>
      </EnergyAdvancedDetails>
    </div> : null}

    {tab === "pv" ? <div className="grid gap-4">
      <SectionTitle step="2/A" title="Napelemrendszer" description="Kapcsold be csak akkor, ha a felújítási változat része. A helyszíni gyorsfelvételhez a paneldarabszám, modulteljesítmény, inverter és forrás elegendő." />
      <Toggle checked={workspace.pv.enabled} onChange={(enabled) => updatePv({ enabled })} label="Napelemrendszer előméretezése" description="A tetősík kiválasztása az első munkalapon történik." />
      {workspace.pv.enabled ? <>
        <div className="grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4 sm:grid-cols-2 xl:grid-cols-4"><Field label="Paneldarabszám"><DecimalInput ariaLabel="Napelem paneldarabszám" value={workspace.pv.panelCount} min={0} step="1" onCommit={(value) => updatePv({ panelCount: Math.round(value) })} /></Field><Field label="Modulteljesítmény (Wp)"><DecimalInput ariaLabel="Napelem modulteljesítmény" value={workspace.pv.modulePowerWp} min={0} onCommit={(value) => updatePv({ modulePowerWp: value })} /></Field><Field label="Inverter AC (kW)"><DecimalInput ariaLabel="Napelem inverter teljesítmény" value={workspace.pv.inverterAcPowerKw} min={0} onCommit={(value) => updatePv({ inverterAcPowerKw: value })} /></Field><Field label="Forrás / hozamadat"><input className={inputClass} value={workspace.pv.sourceReference} onChange={(event) => updatePv({ sourceReference: event.target.value })} placeholder="Gyártói adat vagy dokumentált előméretezés" /></Field></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Elférő maximum" value={result.pv.maxPanelCount} unit="db" action={result.pv.maxPanelCount > 0 ? <button type="button" data-apply-pv-maximum onClick={() => updatePv({ panelCount: result.pv.maxPanelCount })} className="text-[9px] font-black text-cyan-700 underline">Maximum átvétele</button> : null} /><Metric label="Beépített teljesítmény" value={result.pv.installedPowerKwp.toLocaleString("hu-HU")} unit="kWp" /><Metric label="Becsült éves hozam" value={result.pv.estimatedAnnualYieldKwh?.toLocaleString("hu-HU") ?? null} unit="kWh/év" /><Metric label="DC/AC arány" value={result.pv.inverterDcAcRatio?.toLocaleString("hu-HU") ?? null} /></div>
        <EnergyAdvancedDetails id="pv" defaultOpen={expertMode} title="Napelem részletes számítási adatai" description="Modulméret, fajlagos hozam, veszteség, kapcsolati mód és adatstátusz.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Modul felülete (m²)"><DecimalInput ariaLabel="Napelem modul felület" value={workspace.pv.moduleAreaSquareMeters} min={0} onCommit={(value) => updatePv({ moduleAreaSquareMeters: value })} /></Field><Field label="Fajlagos hozam (kWh/kWp·év)"><DecimalInput ariaLabel="Napelem fajlagos éves hozam" value={workspace.pv.specificYieldKwhPerKwpYear} min={0} onCommit={(value) => updatePv({ specificYieldKwhPerKwpYear: value })} /></Field><Field label="Rendszerveszteség (%)"><DecimalInput ariaLabel="Napelem rendszerveszteség" value={workspace.pv.systemLossPercent} min={0} max={100} onCommit={(value) => updatePv({ systemLossPercent: value })} /></Field><Field label="Kapcsolati mód"><select className={inputClass} value={workspace.pv.connectionMode} onChange={(event) => updatePv({ connectionMode: event.target.value as EnergyPvPlan["connectionMode"] })}><option value="gridConnected">Hálózatra kapcsolt</option><option value="hybrid">Hibrid</option><option value="offGrid">Szigetüzem</option></select></Field><Field label="Adatstátusz"><DataStatusSelect value={workspace.pv.dataStatus} onChange={(value) => updatePv({ dataStatus: value })} /></Field><div className="sm:col-span-2 xl:col-span-3"><Field label="Megjegyzés" optional><input className={inputClass} value={workspace.pv.note} onChange={(event) => updatePv({ note: event.target.value })} /></Field></div></div>
        </EnergyAdvancedDetails>
      </> : <EnergyFieldHelp>A rendszer nincs beválasztva. A kapcsoló bekapcsolása után jelennek meg a szükséges mezők.</EnergyFieldHelp>}
    </div> : null}

    {tab === "solar" ? <div className="grid gap-4">
      <SectionTitle step="2/B" title="Napkollektoros HMV-rásegítés" description="A gyorsfelvételhez a kollektorfelület, a használók száma és az adatforrás szükséges." />
      <Toggle checked={workspace.solarThermal.enabled} onChange={(enabled) => updateSolar({ enabled })} label="Napkollektoros HMV-rásegítés előméretezése" description="A használt tetősíkot a Tetősíkok munkalapon válaszd ki." />
      {workspace.solarThermal.enabled ? <>
        <div className="grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4 sm:grid-cols-2 xl:grid-cols-3"><Field label="Kollektorfelület (m²)"><DecimalInput ariaLabel="Napkollektor felület" value={workspace.solarThermal.collectorAreaSquareMeters} min={0} onCommit={(value) => updateSolar({ collectorAreaSquareMeters: value })} /></Field><Field label="Személyek"><DecimalInput ariaLabel="HMV személyek száma" value={workspace.solarThermal.persons} min={0} step="1" onCommit={(value) => updateSolar({ persons: Math.round(value) })} /></Field><Field label="Forrás"><input className={inputClass} value={workspace.solarThermal.sourceReference} onChange={(event) => updateSolar({ sourceReference: event.target.value })} placeholder="Gyártói kollektoradat és helyszíni előméretezés" /></Field></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Éves HMV-hőigény" value={result.solarThermal.annualHotWaterDemandKwh?.toLocaleString("hu-HU") ?? null} unit="kWh/év" /><Metric label="Becsült kollektorhozam" value={result.solarThermal.estimatedAnnualYieldKwh?.toLocaleString("hu-HU") ?? null} unit="kWh/év" /><Metric label="Becsült lefedettség" value={result.solarThermal.estimatedCoveragePercent?.toLocaleString("hu-HU") ?? null} unit="%" /><Metric label="Javasolt tároló" value={result.solarThermal.suggestedStorageVolumeLiters?.toLocaleString("hu-HU") ?? null} unit="liter" /></div>
        <EnergyAdvancedDetails id="solar" defaultOpen={expertMode} title="Napkollektor részletes számítási adatai" description="Kollektortípus, fajlagos HMV-igény, hőmérsékletek, hozam, veszteség és tárolóarány.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Kollektortípus"><select className={inputClass} value={workspace.solarThermal.collectorType} onChange={(event) => updateSolar({ collectorType: event.target.value as EnergySolarThermalPlan["collectorType"] })}><option value="flatPlate">Síkkollektor</option><option value="vacuumTube">Vákuumcsöves kollektor</option></select></Field><Field label="HMV liter/fő·nap"><DecimalInput ariaLabel="Napi HMV személyenként" value={workspace.solarThermal.dailyHotWaterLitersPerPerson} min={0} onCommit={(value) => updateSolar({ dailyHotWaterLitersPerPerson: value })} /></Field><Field label="Hidegvíz (°C)"><DecimalInput ariaLabel="Hidegvíz hőmérséklete" value={workspace.solarThermal.coldWaterTemperatureC} onCommit={(value) => updateSolar({ coldWaterTemperatureC: value })} /></Field><Field label="HMV célhőmérséklet (°C)"><DecimalInput ariaLabel="HMV célhőmérséklet" value={workspace.solarThermal.hotWaterTemperatureC} onCommit={(value) => updateSolar({ hotWaterTemperatureC: value })} /></Field><Field label="Fajlagos hozam (kWh/m²·év)"><DecimalInput ariaLabel="Napkollektor fajlagos hozam" value={workspace.solarThermal.specificYieldKwhPerSquareMeterYear} min={0} onCommit={(value) => updateSolar({ specificYieldKwhPerSquareMeterYear: value })} /></Field><Field label="Rendszerveszteség (%)"><DecimalInput ariaLabel="Napkollektor rendszerveszteség" value={workspace.solarThermal.systemLossPercent} min={0} max={100} onCommit={(value) => updateSolar({ systemLossPercent: value })} /></Field><Field label="Tároló liter/m²"><DecimalInput ariaLabel="Tárolótérfogat négyzetméterenként" value={workspace.solarThermal.storageLitersPerSquareMeter} min={0} onCommit={(value) => updateSolar({ storageLitersPerSquareMeter: value })} /></Field><Field label="Adatstátusz"><DataStatusSelect value={workspace.solarThermal.dataStatus} onChange={(value) => updateSolar({ dataStatus: value })} /></Field></div>
        </EnergyAdvancedDetails>
      </> : <EnergyFieldHelp>A rendszer nincs beválasztva. A kapcsoló bekapcsolása után jelennek meg a szükséges mezők.</EnergyFieldHelp>}
    </div> : null}

    {tab === "battery" ? <div className="grid gap-4">
      <SectionTitle step="2/C" title="Akkumulátoros energiatároló" description="A helyszíni gyorsfelvételhez válaszd ki a célt, rögzítsd a tervezett névleges kapacitást és a tartaléküzemi igényt." />
      <Toggle checked={workspace.battery.enabled} onChange={(enabled) => updateBattery({ enabled })} label="Akkumulátoros energiatároló előméretezése" description="A javaslat a villamos fogyasztásból, a PV-többletből és a tartaléküzemi igényből készül." />
      {workspace.battery.enabled ? <>
        <div className="grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4 sm:grid-cols-2 xl:grid-cols-5"><Field label="Cél"><select className={inputClass} value={workspace.battery.purpose} onChange={(event) => updateBattery({ purpose: event.target.value as EnergyBatteryPlan["purpose"] })}><option value="selfConsumption">Sajátfogyasztás növelése</option><option value="backup">Tartaléküzem</option><option value="combined">Kombinált</option></select></Field><Field label="Névleges kapacitás (kWh)"><DecimalInput ariaLabel="Akkumulátor névleges kapacitás" value={workspace.battery.nominalCapacityKwh} min={0} onCommit={(value) => updateBattery({ nominalCapacityKwh: value, usableCapacityKwh: workspace.battery.usableCapacityKwh > 0 && workspace.battery.usableCapacityKwh <= value ? workspace.battery.usableCapacityKwh : round(value * workspace.battery.usableFraction) })} /></Field><Field label="Kritikus fogyasztás (kW)"><DecimalInput ariaLabel="Kritikus fogyasztás teljesítménye" value={workspace.battery.criticalLoadKw} min={0} onCommit={(value) => updateBattery({ criticalLoadKw: value })} /></Field><Field label="Tartaléküzem (óra)"><DecimalInput ariaLabel="Tartaléküzem időtartama" value={workspace.battery.backupHours} min={0} onCommit={(value) => updateBattery({ backupHours: value })} /></Field><Field label="Forrás"><input className={inputClass} value={workspace.battery.sourceReference} onChange={(event) => updateBattery({ sourceReference: event.target.value })} placeholder="Gyártói adat vagy tervezési kiindulás" /></Field></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Esti napi igény" value={result.battery.estimatedEveningDemandKwhPerDay?.toLocaleString("hu-HU") ?? null} unit="kWh/nap" /><Metric label="PV többlet" value={result.battery.estimatedPvSurplusKwhPerDay?.toLocaleString("hu-HU") ?? null} unit="kWh/nap" /><Metric label="Tartalékhoz használható" value={result.battery.backupUsableCapacityKwh?.toLocaleString("hu-HU") ?? null} unit="kWh" /><Metric label="Javasolt névleges" value={result.battery.suggestedNominalCapacityKwh?.toLocaleString("hu-HU") ?? null} unit="kWh" action={result.battery.suggestedNominalCapacityKwh ? <button type="button" data-apply-battery-suggestion onClick={applyBatterySuggestion} className="text-[9px] font-black text-cyan-700 underline">Javaslat átvétele</button> : null} /></div>
        <EnergyAdvancedDetails id="battery" defaultOpen={expertMode} title="Akkumulátor részletes műszaki adatai" description="Használható kapacitás, hatásfok, teljesítménykorlátok, tartalék és adatstátusz.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Használható kapacitás (kWh)"><DecimalInput ariaLabel="Akkumulátor használható kapacitás" value={workspace.battery.usableCapacityKwh} min={0} onCommit={(value) => updateBattery({ usableCapacityKwh: value })} /></Field><Field label="Használható hányad (0–1)"><DecimalInput ariaLabel="Akkumulátor használható hányad" value={workspace.battery.usableFraction} min={0.01} max={1} onCommit={(value) => updateBattery({ usableFraction: value })} /></Field><Field label="Körfolyamati hatásfok (0–1)"><DecimalInput ariaLabel="Akkumulátor körfolyamati hatásfok" value={workspace.battery.roundTripEfficiency} min={0.01} max={1} onCommit={(value) => updateBattery({ roundTripEfficiency: value })} /></Field><Field label="Tartalék (%)"><DecimalInput ariaLabel="Akkumulátor tartalék százalék" value={workspace.battery.reservePercent} min={0} max={100} onCommit={(value) => updateBattery({ reservePercent: value })} /></Field><Field label="Max. töltés (kW)"><DecimalInput ariaLabel="Akkumulátor maximális töltés" value={workspace.battery.maxChargePowerKw} min={0} onCommit={(value) => updateBattery({ maxChargePowerKw: value })} /></Field><Field label="Max. kisütés (kW)"><DecimalInput ariaLabel="Akkumulátor maximális kisütés" value={workspace.battery.maxDischargePowerKw} min={0} onCommit={(value) => updateBattery({ maxDischargePowerKw: value })} /></Field><Field label="Adatstátusz"><DataStatusSelect value={workspace.battery.dataStatus} onChange={(value) => updateBattery({ dataStatus: value })} /></Field><Field label="Megjegyzés" optional><input className={inputClass} value={workspace.battery.note} onChange={(event) => updateBattery({ note: event.target.value })} /></Field></div>
        </EnergyAdvancedDetails>
      </> : <EnergyFieldHelp>A rendszer nincs beválasztva. A kapcsoló bekapcsolása után jelennek meg a szükséges mezők.</EnergyFieldHelp>}
    </div> : null}

    {tab === "ev" ? <div className="grid gap-4">
      <SectionTitle step="2/D" title="Elektromosautó-töltés" description="A gyorsfelvételhez a járműhasználatot, a töltő teljesítményét és az adatforrást add meg. A hálózati tartalékot a program automatikusan ellenőrzi." />
      <Toggle checked={workspace.evCharging.enabled} onChange={(enabled) => updateEv({ enabled })} label="Elektromosautó-töltés előméretezése" description="A dinamikus terhelésmenedzsment a részletes adatok között állítható." />
      {workspace.evCharging.enabled ? <>
        <div className="grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4 sm:grid-cols-2 xl:grid-cols-3"><Field label="Járművek"><DecimalInput ariaLabel="Elektromos járművek száma" value={workspace.evCharging.vehicles} min={1} step="1" onCommit={(value) => updateEv({ vehicles: Math.round(value) })} /></Field><Field label="Éves futás (km)"><DecimalInput ariaLabel="Éves elektromos autó futás" value={workspace.evCharging.annualDistanceKm} min={0} onCommit={(value) => updateEv({ annualDistanceKm: value })} /></Field><Field label="Fogyasztás (kWh/100 km)"><DecimalInput ariaLabel="Elektromos autó fogyasztás" value={workspace.evCharging.vehicleConsumptionKwhPer100Km} min={0} onCommit={(value) => updateEv({ vehicleConsumptionKwhPer100Km: value })} /></Field><Field label="Otthoni töltés (%)"><DecimalInput ariaLabel="Otthoni autótöltés aránya" value={workspace.evCharging.homeChargingSharePercent} min={0} max={100} onCommit={(value) => updateEv({ homeChargingSharePercent: value })} /></Field><Field label="Töltő (kW)"><DecimalInput ariaLabel="Autótöltő teljesítmény" value={workspace.evCharging.chargerPowerKw} min={0} onCommit={(value) => updateEv({ chargerPowerKw: value })} /></Field><Field label="Forrás"><input className={inputClass} value={workspace.evCharging.sourceReference} onChange={(event) => updateEv({ sourceReference: event.target.value })} placeholder="Járműadat, töltőadatlap, mérőhely" /></Field></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Éves otthoni töltés" value={result.evCharging.annualHomeChargingEnergyKwh?.toLocaleString("hu-HU") ?? null} unit="kWh/év" /><Metric label="Napi átlag" value={result.evCharging.averageDailyChargingEnergyKwh?.toLocaleString("hu-HU") ?? null} unit="kWh/nap" /><Metric label="Napi töltési idő" value={result.evCharging.averageDailyChargingHours?.toLocaleString("hu-HU") ?? null} unit="óra" /><Metric label="Töltőáram" value={result.evCharging.chargerCurrentAmps?.toLocaleString("hu-HU") ?? null} unit="A/fázis" note={result.evCharging.connectionSufficient === true ? "A becsült hálózati tartalék megfelelő." : result.evCharging.connectionSufficient === false ? "Terhelésmenedzsment vagy hálózatbővítés szükséges." : "A csatlakozás adatai hiányosak."} /></div>
        <EnergyAdvancedDetails id="ev" defaultOpen={expertMode} title="Autótöltő részletes műszaki adatai" description="Fázisszám, terhelésmenedzsment, PV-többlet alapú töltés és adatstátusz.">
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Fázisszám"><select className={inputClass} value={workspace.evCharging.phaseMode} onChange={(event) => updateEv({ phaseMode: event.target.value as EnergyEvChargingPlan["phaseMode"] })}><option value="singlePhase">1 fázis</option><option value="threePhase">3 fázis</option></select></Field><Field label="Adatstátusz"><DataStatusSelect value={workspace.evCharging.dataStatus} onChange={(value) => updateEv({ dataStatus: value })} /></Field></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><Toggle checked={workspace.evCharging.dynamicLoadBalancing} onChange={(dynamicLoadBalancing) => updateEv({ dynamicLoadBalancing })} label="Dinamikus terhelésmenedzsment" /><Toggle checked={workspace.evCharging.smartPvCharging} onChange={(smartPvCharging) => updateEv({ smartPvCharging })} label="PV-többlet alapú intelligens töltés" /></div><div className="mt-3"><Field label="Megjegyzés" optional><input className={inputClass} value={workspace.evCharging.note} onChange={(event) => updateEv({ note: event.target.value })} /></Field></div>
        </EnergyAdvancedDetails>
      </> : <EnergyFieldHelp>A rendszer nincs beválasztva. A kapcsoló bekapcsolása után jelennek meg a szükséges mezők.</EnergyFieldHelp>}
    </div> : null}

    {tab === "result" ? <div className="grid gap-4">
      <SectionTitle step="3" title="Előméretezési eredmény és teendők" description="Először a blokkoló hiányokat javítsd. A figyelmeztetések nem mindig akadályozzák a számítást, de a végleges terv előtt ellenőrizendők." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Épület + EV villamos igény" value={result.totals.annualBuildingAndEvElectricityKwh.toLocaleString("hu-HU")} unit="kWh/év" /><Metric label="PV becsült lefedettség" value={result.totals.estimatedPvCoveragePercent?.toLocaleString("hu-HU") ?? null} unit="%" /><Metric label="Közvetlen PV sajátfogyasztás" value={result.pv.estimatedDirectSelfConsumptionKwh?.toLocaleString("hu-HU") ?? null} unit="kWh/év" /><Metric label="Becsült PV többlet" value={result.pv.estimatedSurplusKwh?.toLocaleString("hu-HU") ?? null} unit="kWh/év" /></div>
      <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-black text-[var(--survey-text)]">Ellenőrzési lista</div><div className="mt-1 text-[10px] font-semibold text-[var(--survey-muted)]">A piros üzenet javítandó, a sárga szakmai ellenőrzést igényel.</div></div><div className="flex gap-2"><EnergyFieldStatusBadge tone={blockingCount ? "warning" : "complete"}>{blockingCount} blokkoló</EnergyFieldStatusBadge><EnergyFieldStatusBadge tone={warningCount ? "warning" : "neutral"}>{warningCount} figyelmeztetés</EnergyFieldStatusBadge></div></div><div className="mt-3 grid gap-2">{result.validationMessages.length ? [...result.validationMessages].sort((left, right) => left.severity === "blocking" && right.severity !== "blocking" ? -1 : right.severity === "blocking" && left.severity !== "blocking" ? 1 : 0).map((message) => <div key={`${message.code}-${message.entityId || "global"}`} className={`flex items-start gap-3 rounded-xl border p-3 ${message.severity === "blocking" ? "border-rose-300 bg-rose-50 text-rose-900" : message.severity === "warning" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-cyan-300 bg-cyan-50 text-cyan-900"}`}><CircleAlert size={17} className="mt-0.5 shrink-0" /><div><div className="text-[9px] font-black uppercase">{message.severity === "blocking" ? "Javítandó" : message.severity === "warning" ? "Ellenőrizendő" : "Tájékoztatás"} · {message.code}</div><div className="mt-1 text-xs font-bold leading-5">{message.message}</div></div></div>) : <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs font-black text-emerald-900">Minden bekapcsolt rendszer alapadata számítható. A végleges szakági tervezés továbbra is szükséges.</div>}</div></div>
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950">{result.limitation}</div>
    </div> : null}
  </div>;
}
