"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, DoorOpen, GitBranch, Plus, Trash2 } from "lucide-react";
import {
  createEnergyThermalBridge,
  energyOpeningRequirementTypeLabels,
  energyThermalBridgeCategoryLabels,
  type EnergyOpeningDetail,
  type EnergyOpeningFrameMaterial,
  type EnergyOpeningRequirementType,
  type EnergyOpeningSetResult,
  type EnergyOpeningSourceType,
  type EnergyOpeningWorkspace,
  type EnergyThermalBridge,
  type EnergyThermalBridgeCategory,
  type EnergyThermalBridgeKind,
} from "@/components/energy/domain/energyOpeningTypes";
import type { EnergyZoneResultRow } from "@/components/energy/domain/energyZoneTypes";
import type { SurveyBuildingLevel, SurveyWallOpening } from "@/components/property-survey/propertySurveyBuildingModel";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";

const inputClass = "h-10 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 text-xs font-bold text-[var(--survey-text)] outline-none focus:border-cyan-500";
const labelClass = "mb-1 block text-[9px] font-black uppercase tracking-[0.1em] text-[var(--survey-muted)]";

function format(value: number | null | undefined, digits = 3) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return value.toLocaleString("hu-HU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function now() { return new Date().toISOString(); }
function parseDecimal(value: string) {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function DecimalField({ value, onCommit, placeholder, dataAttribute }: { value?: number; onCommit: (value: number | undefined) => void; placeholder?: string; dataAttribute?: Record<string, string> }) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value).replace(".", ","));
  useEffect(() => setDraft(value === undefined ? "" : String(value).replace(".", ",")), [value]);
  return <input {...dataAttribute} inputMode="decimal" className={inputClass} value={draft} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onBlur={() => onCommit(parseDecimal(draft))} />;
}

type Props = {
  workspace: EnergyOpeningWorkspace;
  result: EnergyOpeningSetResult;
  openings: SurveyWallOpening[];
  rooms: SurveyRoom[];
  levels: SurveyBuildingLevel[];
  zones: EnergyZoneResultRow[];
  onWorkspaceChange: (workspace: EnergyOpeningWorkspace) => void;
  onDetailChange: (openingId: string, patch: Partial<EnergyOpeningDetail>) => void;
};

export function EnergyOpeningsPanel({ workspace, result, openings, rooms, levels, zones, onWorkspaceChange, onDetailChange }: Props) {
  const [section, setSection] = useState<"openings" | "bridges" | "trace">("openings");
  const [activeOpeningId, setActiveOpeningId] = useState(openings[0]?.id || "");
  useEffect(() => {
    if (!openings.some((opening) => opening.id === activeOpeningId)) setActiveOpeningId(openings[0]?.id || "");
  }, [activeOpeningId, openings]);
  const activeOpening = openings.find((opening) => opening.id === activeOpeningId) || openings[0] || null;
  const activeDetail = activeOpening ? workspace.openingDetails[activeOpening.id] : null;
  const activeResult = activeOpening ? result.openings.find((item) => item.openingId === activeOpening.id) : null;
  const roomMap = useMemo(() => new Map(rooms.map((room) => [room.id, room.name])), [rooms]);
  const levelMap = useMemo(() => new Map(levels.map((level) => [level.id, level.name])), [levels]);

  function commitWorkspace(patch: Partial<EnergyOpeningWorkspace>) {
    onWorkspaceChange({ ...workspace, ...patch, updatedAt: now() });
  }
  function addBridge(kind: EnergyThermalBridgeKind) {
    commitWorkspace({ thermalBridges: [...workspace.thermalBridges, createEnergyThermalBridge({ kind, name: kind === "linear" ? "Új lineáris hőhíd" : "Új pontszerű hőhíd" })] });
    setSection("bridges");
  }
  function updateBridge(id: string, patch: Partial<EnergyThermalBridge>) {
    commitWorkspace({ thermalBridges: workspace.thermalBridges.map((bridge) => bridge.id === id ? { ...bridge, ...patch, updatedAt: now() } : bridge) });
  }
  function deleteBridge(id: string) {
    commitWorkspace({ thermalBridges: workspace.thermalBridges.filter((bridge) => bridge.id !== id) });
  }

  return <section className="grid min-w-0 gap-4" data-energy-openings-panel data-energy-openings-valid={result.valid ? "true" : "false"}>
    <div className="rounded-2xl border border-blue-300 bg-blue-50 p-4 text-blue-950">
      <div className="flex items-start gap-3"><DoorOpen size={22} className="shrink-0" /><div><div className="text-sm font-black">Nyílászárók és hőhidak · v0.7.4</div><p className="mt-1 text-xs font-semibold leading-5">A teljes Uw deklarált adatból vagy a keret, üveg és üvegszegély részletes számításából készül. A beépítési perem, a lineáris Ψ és a pontszerű χ érték csak dokumentált forrással számítható.</p></div></div>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Metric label="Nyílászárók" value={String(result.totals.openingCount)} />
      <Metric label="Összfelület" value={`${format(result.totals.totalOpeningAreaSquareMeters, 2)} m²`} />
      <Metric label="Nyílászáró H" value={`${format(result.totals.openingHeatLossCoefficientWK)} W/K`} />
      <Metric label="Beépítési H" value={`${format(result.totals.installationHeatLossCoefficientWK)} W/K`} />
      <Metric label="Teljes H" value={`${format(result.totals.totalHeatLossCoefficientWK)} W/K`} />
    </div>

    <div className="grid grid-cols-3 gap-2 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-2">
      {([["openings", "Nyílászárók", DoorOpen], ["bridges", "Hőhidak", GitBranch], ["trace", "Nyomvonal", ChevronRight]] as const).map(([id, label, Icon]) => <button key={id} type="button" data-energy-opening-section={id} onClick={() => setSection(id)} className={`flex min-h-10 items-center justify-center gap-2 rounded-xl px-2 text-[9px] font-black uppercase ${section === id ? "bg-cyan-100 text-cyan-900 ring-1 ring-cyan-400" : "text-[var(--survey-muted)]"}`}><Icon size={14} /> {label}</button>)}
    </div>

    {section === "openings" ? <div className="grid gap-4" data-energy-opening-editor>
      {!openings.length ? <div className="rounded-2xl border border-dashed border-[var(--survey-border)] p-6 text-center text-xs font-bold text-[var(--survey-muted)]">Nincs falhoz kötött nyílászáró. A Nyílászárók munkalapon előbb vegyél fel ablakot vagy ajtót.</div> : <>
        <label><span className={labelClass}>Szerkesztett nyílászáró</span><select data-energy-opening-selector className={inputClass} value={activeOpening?.id || ""} onChange={(event) => setActiveOpeningId(event.target.value)}>{openings.map((opening) => <option key={opening.id} value={opening.id}>{opening.name} · {opening.widthMeters.toFixed(2)} × {opening.heightMeters.toFixed(2)} m</option>)}</select></label>
        {activeOpening && activeDetail ? <article className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4" data-energy-opening-card={activeOpening.id}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-sm font-black text-[var(--survey-text)]">{activeOpening.name}</div><div className="mt-1 text-[9px] font-bold text-[var(--survey-muted)]">{levelMap.get(activeOpening.levelId) || activeOpening.levelId} · {roomMap.get(activeOpening.roomId) || activeOpening.roomId} · {format(activeResult?.areaSquareMeters, 2)} m²</div></div><StatusBadge result={activeResult || null} /></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label><span className={labelClass}>Számítási mód</span><select data-opening-calculation-mode={activeOpening.id} className={inputClass} value={activeDetail.calculationMode} onChange={(event) => onDetailChange(activeOpening.id, { calculationMode: event.target.value as EnergyOpeningDetail["calculationMode"] })}><option value="declared">Deklarált teljes Uw</option><option value="detailed">Részletes keret–üveg számítás</option></select></label>
            <label><span className={labelClass}>Követelménytípus</span><select data-opening-requirement-type={activeOpening.id} className={inputClass} value={activeDetail.requirementType} onChange={(event) => onDetailChange(activeOpening.id, { requirementType: event.target.value as EnergyOpeningRequirementType })}>{Object.entries(energyOpeningRequirementTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>

          {activeDetail.calculationMode === "declared" ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label><span className={labelClass}>Deklarált Uw W/m²K</span><DecimalField value={activeDetail.declaredUwWm2K} onCommit={(value) => onDetailChange(activeOpening.id, { declaredUwWm2K: value })} dataAttribute={{ "data-opening-declared-uw": activeOpening.id }} /></label>
            <label><span className={labelClass}>Forrástípus</span><select data-opening-declared-source-type={activeOpening.id} className={inputClass} value={activeDetail.declaredSourceType || "manufacturerDeclaration"} onChange={(event) => onDetailChange(activeOpening.id, { declaredSourceType: event.target.value as EnergyOpeningSourceType })}><option value="manufacturerDeclaration">Gyártói teljesítménynyilatkozat</option><option value="calculation">Számítás</option><option value="catalog">Katalógus</option><option value="manual">Kézi szakértői adat</option><option value="legacyMigration">Korábbi adat migrációja</option></select></label>
            <label className="sm:col-span-2"><span className={labelClass}>Deklarált Uw forrása</span><input data-opening-declared-source={activeOpening.id} className={inputClass} value={activeDetail.declaredSourceReference || ""} onChange={(event) => onDetailChange(activeOpening.id, { declaredSourceReference: event.target.value })} placeholder="Teljesítménynyilatkozat, adatlap, számítás azonosítója" /></label>
          </div> : <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label><span className={labelClass}>Keret anyaga</span><select data-opening-frame-material={activeOpening.id} className={inputClass} value={activeDetail.frameMaterial} onChange={(event) => onDetailChange(activeOpening.id, { frameMaterial: event.target.value as EnergyOpeningFrameMaterial })}><option value="wood">Fa</option><option value="pvc">PVC</option><option value="metal">Fém</option><option value="composite">Kompozit</option><option value="other">Egyéb</option></select></label>
            <label><span className={labelClass}>Keretszélesség (m)</span><DecimalField value={activeDetail.frameWidthMeters} onCommit={(value) => onDetailChange(activeOpening.id, { frameWidthMeters: value })} dataAttribute={{ "data-opening-frame-width": activeOpening.id }} /></label>
            <label><span className={labelClass}>Ug W/m²K</span><DecimalField value={activeDetail.glazingUgWm2K} onCommit={(value) => onDetailChange(activeOpening.id, { glazingUgWm2K: value })} dataAttribute={{ "data-opening-ug": activeOpening.id }} /></label>
            <label><span className={labelClass}>Uf W/m²K</span><DecimalField value={activeDetail.frameUfWm2K} onCommit={(value) => onDetailChange(activeOpening.id, { frameUfWm2K: value })} dataAttribute={{ "data-opening-uf": activeOpening.id }} /></label>
            <label><span className={labelClass}>Üvegszegély Ψg W/mK</span><DecimalField value={activeDetail.glazingEdgePsiWmK} onCommit={(value) => onDetailChange(activeOpening.id, { glazingEdgePsiWmK: value })} dataAttribute={{ "data-opening-edge-psi": activeOpening.id }} /></label>
            <label><span className={labelClass}>Napenergia-tényező g</span><DecimalField value={activeDetail.solarGValue} onCommit={(value) => onDetailChange(activeOpening.id, { solarGValue: value })} dataAttribute={{ "data-opening-g-value": activeOpening.id }} /></label>
            <label className="sm:col-span-2 lg:col-span-3"><span className={labelClass}>Üvegszegély Ψg forrása</span><input data-opening-edge-source={activeOpening.id} className={inputClass} value={activeDetail.glazingEdgeSourceReference || ""} onChange={(event) => onDetailChange(activeOpening.id, { glazingEdgeSourceReference: event.target.value })} placeholder="Távtartó-adatlap vagy számítás hivatkozása" /></label>
          </div>}

          <div className="mt-4 rounded-xl border border-cyan-300 bg-cyan-50 p-3 text-cyan-950">
            <div className="text-[10px] font-black uppercase">Beépítési perem</div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2"><label><span className={labelClass}>Ψbeép W/mK</span><DecimalField value={activeDetail.installationPsiWmK} onCommit={(value) => onDetailChange(activeOpening.id, { installationPsiWmK: value })} placeholder="Üresen hagyható" dataAttribute={{ "data-opening-installation-psi": activeOpening.id }} /></label><label><span className={labelClass}>Forrás</span><input data-opening-installation-source={activeOpening.id} className={inputClass} value={activeDetail.installationPsiSourceReference || ""} onChange={(event) => onDetailChange(activeOpening.id, { installationPsiSourceReference: event.target.value })} placeholder="Katalógus, csomóponti számítás" /></label></div>
            <p className="mt-2 text-[9px] font-semibold leading-4">A beépítési perem helyett külön káva/parapet/szemöldök hőhíd is használható, de a két módszer ugyanazon nyílászárón nem számolható együtt.</p>
          </div>

          {activeDetail.requirementType === "custom" ? <label className="mt-3 block"><span className={labelClass}>Egyedi követelmény Uw max.</span><DecimalField value={activeDetail.customRequirementMaximumUwWm2K} onCommit={(value) => onDetailChange(activeOpening.id, { customRequirementMaximumUwWm2K: value })} dataAttribute={{ "data-opening-custom-requirement": activeOpening.id }} /></label> : null}
          <textarea className="mt-3 min-h-16 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 text-xs font-bold text-[var(--survey-text)]" value={activeDetail.note} onChange={(event) => onDetailChange(activeOpening.id, { note: event.target.value })} placeholder="Mérési, gyártói vagy beépítési megjegyzés..." />

          {activeResult ? <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><SmallMetric label="Uw" value={`${format(activeResult.effectiveUwWm2K)} W/m²K`} /><SmallMetric label="Követelmény" value={activeResult.requirementMaximumUwWm2K === null ? "Nincs" : `${format(activeResult.requirementMaximumUwWm2K)} W/m²K`} /><SmallMetric label="Felületi H" value={`${format(activeResult.openingHeatLossCoefficientWK)} W/K`} /><SmallMetric label="Beépítési H" value={`${format(activeResult.installationHeatLossCoefficientWK)} W/K`} /></div> : null}
          <ValidationList messages={activeResult?.validationMessages || []} />
        </article> : null}
      </>}
    </div> : null}

    {section === "bridges" ? <div className="grid gap-4" data-energy-thermal-bridge-editor>
      <div className="grid grid-cols-2 gap-2"><button type="button" data-add-linear-bridge onClick={() => addBridge("linear")} className="survey-action-secondary"><Plus size={15} /> Lineáris hőhíd</button><button type="button" data-add-point-bridge onClick={() => addBridge("point")} className="survey-action-secondary"><Plus size={15} /> Pontszerű hőhíd</button></div>
      {!workspace.thermalBridges.length ? <div className="rounded-2xl border border-dashed border-[var(--survey-border)] p-6 text-center text-xs font-bold text-[var(--survey-muted)]">Nincs külön hőhídrekord. Ismeretlen Ψ vagy χ értéket a rendszer nem becsül meg.</div> : workspace.thermalBridges.map((bridge, index) => {
        const bridgeResult = result.thermalBridges.find((item) => item.id === bridge.id);
        return <article key={bridge.id} data-energy-thermal-bridge-card={bridge.id} className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4">
          <div className="mb-3 flex items-center justify-between"><div><div className="text-sm font-black text-[var(--survey-text)]">{index + 1}. {bridge.kind === "linear" ? "lineáris" : "pontszerű"} hőhíd</div><div className="mt-1 text-[9px] font-bold text-[var(--survey-muted)]">Eredmény: {format(bridgeResult?.heatLossCoefficientWK)} W/K</div></div><button type="button" data-delete-thermal-bridge={bridge.id} onClick={() => deleteBridge(bridge.id)} className="survey-icon-button h-9 w-9 text-rose-700"><Trash2 size={15} /></button></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label><span className={labelClass}>Típus</span><select data-bridge-kind={bridge.id} className={inputClass} value={bridge.kind} onChange={(event) => updateBridge(bridge.id, { kind: event.target.value as EnergyThermalBridgeKind })}><option value="linear">Lineáris Ψ·l</option><option value="point">Pontszerű χ·n</option></select></label>
            <label><span className={labelClass}>Kategória</span><select data-bridge-category={bridge.id} className={inputClass} value={bridge.category} onChange={(event) => updateBridge(bridge.id, { category: event.target.value as EnergyThermalBridgeCategory })}>{Object.entries(energyThermalBridgeCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span className={labelClass}>Megnevezés</span><input data-bridge-name={bridge.id} className={inputClass} value={bridge.name} onChange={(event) => updateBridge(bridge.id, { name: event.target.value })} /></label>
            {bridge.kind === "linear" ? <><label><span className={labelClass}>Hossz (m)</span><DecimalField value={bridge.lengthMeters} onCommit={(value) => updateBridge(bridge.id, { lengthMeters: value })} dataAttribute={{ "data-bridge-length": bridge.id }} /></label><label><span className={labelClass}>Ψ W/mK</span><DecimalField value={bridge.psiWmK} onCommit={(value) => updateBridge(bridge.id, { psiWmK: value })} dataAttribute={{ "data-bridge-psi": bridge.id }} /></label></> : <><label><span className={labelClass}>Darabszám</span><DecimalField value={bridge.quantity} onCommit={(value) => updateBridge(bridge.id, { quantity: value })} dataAttribute={{ "data-bridge-quantity": bridge.id }} /></label><label><span className={labelClass}>χ W/K</span><DecimalField value={bridge.chiWK} onCommit={(value) => updateBridge(bridge.id, { chiWK: value })} dataAttribute={{ "data-bridge-chi": bridge.id }} /></label></>}
            <label><span className={labelClass}>Kapcsolt nyílászáró</span><select data-bridge-opening={bridge.id} className={inputClass} value={bridge.openingId || ""} onChange={(event) => updateBridge(bridge.id, { openingId: event.target.value || undefined })}><option value="">Nincs közvetlen kapcsolat</option>{openings.map((opening) => <option key={opening.id} value={opening.id}>{opening.name}</option>)}</select></label>
            <label><span className={labelClass}>Energetikai zóna</span><select data-bridge-zone={bridge.id} className={inputClass} value={bridge.zoneId || ""} onChange={(event) => updateBridge(bridge.id, { zoneId: event.target.value || undefined })}><option value="">Automatikus kapcsolatból</option>{zones.map((zone) => <option key={zone.zoneId} value={zone.zoneId}>{zone.zoneName}</option>)}</select></label>
            <label><span className={labelClass}>Forrástípus</span><select data-bridge-source-type={bridge.id} className={inputClass} value={bridge.sourceType} onChange={(event) => updateBridge(bridge.id, { sourceType: event.target.value as EnergyOpeningSourceType })}><option value="calculation">Csomóponti számítás</option><option value="catalog">Katalógus</option><option value="manufacturerDeclaration">Gyártói adat</option><option value="manual">Kézi szakértői adat</option></select></label>
            <label className="sm:col-span-2 lg:col-span-3"><span className={labelClass}>Forráshivatkozás</span><input data-bridge-source={bridge.id} className={inputClass} value={bridge.sourceReference} onChange={(event) => updateBridge(bridge.id, { sourceReference: event.target.value })} placeholder="Csomóponti számítás, katalógus vagy adatlap azonosítója" /></label>
          </div>
          <ValidationList messages={bridgeResult?.validationMessages || []} />
        </article>;
      })}
    </div> : null}

    {section === "trace" ? <div className="grid gap-2" data-energy-opening-trace>{result.trace.map((item) => <details key={item.id} data-energy-opening-trace-rule={item.ruleId} className="group rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)]"><summary className="flex cursor-pointer list-none items-start gap-2 p-3"><ChevronRight size={15} className="mt-0.5 shrink-0 transition group-open:rotate-90" /><span className="min-w-0 flex-1"><span className="block text-xs font-black text-[var(--survey-text)]">{item.label}</span><span className="mt-1 block text-[9px] font-bold text-[var(--survey-muted)]">{item.ruleId} · {item.formula}</span></span><span className="shrink-0 text-xs font-black text-[var(--survey-text)]">{format(item.value)} {item.unit.replace("m2", "m²")}</span></summary><div className="border-t border-[var(--survey-border)] p-3 text-[10px] font-semibold text-[var(--survey-muted)]">{Object.entries(item.inputs).map(([key, value]) => <div key={key}><strong className="text-[var(--survey-text)]">{key}:</strong> {String(value)}</div>)}</div></details>)}</div> : null}

    <div className="rounded-xl border border-dashed border-[var(--survey-border)] p-3 text-[10px] font-semibold leading-5 text-[var(--survey-muted)]">Uw képlet: {result.openingFormulaSourceReferenceId} · követelmény: {result.requirementSourceReferenceId} · hőhidak: {result.thermalBridgeSourceReferenceId} · ellenőrzés: {result.sourceCheckedAt}. Az árnyékoló többlet-hőszigetelő hatása nem része az elemi Uw-követelmény vizsgálatának.</div>
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-3 text-center text-cyan-950"><div className="text-lg font-black">{value}</div><div className="mt-1 text-[8px] font-black uppercase">{label}</div></div>; }
function SmallMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-2"><div className="text-[8px] font-black uppercase text-[var(--survey-muted)]">{label}</div><div className="mt-1 text-xs font-black text-[var(--survey-text)]">{value}</div></div>; }
function StatusBadge({ result }: { result: EnergyOpeningSetResult["openings"][number] | null }) {
  if (!result) return null;
  const text = result.blocked ? "Blokkolt" : result.compliance === "compliant" ? "Megfelel" : result.compliance === "notCompliant" ? "Nem felel meg" : result.compliance === "notApplicableSmallArea" ? "Küszöb alatt" : "Nem vizsgált";
  const cls = result.blocked || result.compliance === "notCompliant" ? "border-rose-300 bg-rose-50 text-rose-950" : result.compliance === "compliant" ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-amber-300 bg-amber-50 text-amber-950";
  return <span data-opening-compliance={result.compliance} className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase ${cls}`}>{text}</span>;
}
function ValidationList({ messages }: { messages: EnergyOpeningSetResult["validationMessages"] }) {
  if (!messages.length) return <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-bold text-emerald-950"><CheckCircle2 size={16} className="shrink-0" /> A számítási adatok teljesek.</div>;
  return <div className="mt-3 grid gap-2">{messages.map((message, index) => <div key={`${message.code}-${index}`} data-energy-opening-validation-code={message.code} className={`flex items-start gap-2 rounded-xl border p-3 text-xs font-bold ${message.severity === "error" ? "border-rose-300 bg-rose-50 text-rose-950" : message.severity === "warning" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-blue-300 bg-blue-50 text-blue-950"}`}><AlertTriangle size={16} className="shrink-0" /> {message.message}</div>)}</div>;
}
