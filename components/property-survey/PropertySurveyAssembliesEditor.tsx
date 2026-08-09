"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, Plus, Trash2 } from "lucide-react";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import {
  createConstructionAssembly,
  createEnergyModelId,
  getAssemblyTotalThicknessCm,
  surveyAssemblyCategoryLabels,
  type SurveyAssemblyCategory,
  type SurveyAssemblyLayer,
  type SurveyConstructionAssembly,
} from "@/components/property-survey/propertySurveyEnergyModel";
import type { EnergyAssemblyThermalResult, EnergyLayerKind } from "@/components/energy/domain/energyAssemblyTypes";
import { EnergyAssemblySettingsPanel } from "@/components/property-survey/energy/EnergyAssemblySettingsPanel";
import { MaterialCatalogWorkspace } from "@/components/materials/ui/MaterialCatalogWorkspace";
import { materialToEnergyLayer } from "@/components/materials/adapters/materialToEnergyLayer";
import { markMaterialRecent, type MaterialWorkspaceState } from "@/components/materials/domain/materialWorkspaceTypes";
import type { MaterialCatalogEntry } from "@/components/materials/domain/materialTypes";

const inputClass = "h-11 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 text-sm font-bold text-[var(--survey-text)] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";
const labelClass = "mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-[var(--survey-muted)]";

type Props = {
  activeRoom: SurveyRoom | null;
  assemblies: SurveyConstructionAssembly[];
  assemblyResults: EnergyAssemblyThermalResult[];
  materialWorkspace: MaterialWorkspaceState;
  onMaterialWorkspaceChange: (workspace: MaterialWorkspaceState) => void;
  onAddAssembly: (assembly: SurveyConstructionAssembly) => void;
  onUpdateAssembly: (assemblyId: string, patch: Partial<SurveyConstructionAssembly>) => void;
  onDeleteAssembly: (assemblyId: string) => void;
  onAssignRoomAssembly: (field: "floorAssemblyId" | "ceilingAssemblyId" | "plinthAssemblyId", assemblyId: string) => void;
};

export function PropertySurveyAssembliesEditor(props: Props) {
  const [activeAssemblyId, setActiveAssemblyId] = useState<string | null>(props.assemblies[0]?.id || null);
  const [materialPickerLayerId, setMaterialPickerLayerId] = useState<string | null>(null);
  const activeAssembly = props.assemblies.find((item) => item.id === activeAssemblyId) || props.assemblies[0] || null;
  const activeResult = props.assemblyResults.find((item) => item.assemblyId === activeAssembly?.id) || null;
  const activePickerLayer = activeAssembly?.layers.find((layer) => layer.id === materialPickerLayerId) || null;
  const assembliesByCategory = useMemo(() => Object.fromEntries((Object.keys(surveyAssemblyCategoryLabels) as SurveyAssemblyCategory[]).map((category) => [category, props.assemblies.filter((item) => item.category === category)])), [props.assemblies]);

  function addAssembly(category: SurveyAssemblyCategory) {
    const assembly = createConstructionAssembly(category);
    props.onAddAssembly(assembly);
    setActiveAssemblyId(assembly.id);
  }

  function updateActiveAssembly(patch: Partial<SurveyConstructionAssembly>) {
    if (!activeAssembly) return;
    props.onUpdateAssembly(activeAssembly.id, { ...patch, updatedAt: new Date().toISOString() });
  }

  function updateLayer(layerId: string, patch: Partial<SurveyAssemblyLayer>) {
    if (!activeAssembly) return;
    updateActiveAssembly({ layers: activeAssembly.layers.map((layer) => layer.id === layerId ? { ...layer, ...patch } : layer) });
  }

  function changeLayerKind(layer: SurveyAssemblyLayer, kind: EnergyLayerKind) {
    const labels: Record<EnergyLayerKind, string> = { solid: "", closedAirGap: "Zárt légréteg", ventilatedAirGap: "Szellőztetett légréteg", fixedResistance: "Megadott hővezetési ellenállás" };
    updateLayer(layer.id, {
      kind,
      material: labels[kind] || (layer.kind === "solid" ? layer.material : ""),
      materialId: undefined,
      materialVersionId: undefined,
      materialSnapshot: undefined,
      lambdaWmK: kind === "solid" ? layer.lambdaWmK : "",
      fixedResistanceM2KPerW: kind === "fixedResistance" ? layer.fixedResistanceM2KPerW || "" : "",
      airGapVentilation: kind === "closedAirGap" ? "closed" : kind === "ventilatedAirGap" ? "slightlyVentilated" : undefined,
      lambdaOverrideReason: undefined,
    });
  }

  function addLayer() {
    if (!activeAssembly) return;
    updateActiveAssembly({ layers: [...activeAssembly.layers, { id: createEnergyModelId("layer"), kind: "solid", material: "", thicknessCm: 0, lambdaWmK: "", note: "" }] });
  }

  function deleteLayer(layerId: string) {
    if (!activeAssembly || activeAssembly.layers.length <= 1) return;
    updateActiveAssembly({ layers: activeAssembly.layers.filter((layer) => layer.id !== layerId) });
  }

  function selectMaterial(entry: MaterialCatalogEntry) {
    if (!activePickerLayer) return;
    const thicknessCm = activePickerLayer.thicknessCm > 0 ? activePickerLayer.thicknessCm : (entry.version.defaultThicknessMm || 0) / 10;
    const layer = materialToEnergyLayer({ layerId: activePickerLayer.id, material: entry.material, version: entry.version, thicknessCm, note: activePickerLayer.note });
    updateLayer(activePickerLayer.id, { ...layer, lambdaOverrideReason: undefined });
    props.onMaterialWorkspaceChange(markMaterialRecent(props.materialWorkspace, entry.material.id));
    setMaterialPickerLayerId(null);
  }

  return <div className="grid gap-4" data-property-survey-assemblies-editor>
    <div className="rounded-2xl border border-violet-300 bg-violet-50 p-4 text-violet-950"><div className="flex items-start gap-3"><Database size={20} className="shrink-0" /><div><div className="text-sm font-black">Rétegrend, U-érték és DIMPRO Anyagtörzs</div><div className="mt-1 text-xs font-semibold leading-5">A rétegek ellenállása, felületi ellenállások és dokumentált korrekciók ugyanabból a szabálycsomag-alapú motorból számolódnak az editorban, az Energetika munkalapon és az exportban.</div></div></div></div>
    <div className="grid grid-cols-2 gap-2">{(Object.keys(surveyAssemblyCategoryLabels) as SurveyAssemblyCategory[]).map((category) => <button key={category} type="button" data-add-assembly={category} onClick={() => addAssembly(category)} className="survey-action-secondary"><Plus size={15} />{surveyAssemblyCategoryLabels[category]}</button>)}</div>
    {props.assemblies.length ? <label><span className={labelClass}>Szerkesztett rétegrend</span><select data-active-assembly-selector className={inputClass} value={activeAssembly?.id || ""} onChange={(event) => setActiveAssemblyId(event.target.value)}>{props.assemblies.map((assembly) => <option key={assembly.id} value={assembly.id}>{surveyAssemblyCategoryLabels[assembly.category]} · {assembly.name}</option>)}</select></label> : <div className="rounded-xl border border-dashed border-[var(--survey-border)] p-4 text-center text-xs font-bold text-[var(--survey-muted)]">Még nincs rögzített rétegrend.</div>}

    {activeAssembly ? <>
      <label><span className={labelClass}>Rétegrend neve</span><input data-assembly-name className={inputClass} value={activeAssembly.name} onChange={(event) => updateActiveAssembly({ name: event.target.value })} /></label>
      <div className="rounded-xl border border-cyan-300 bg-cyan-50 p-3 text-slate-950"><div className="text-[9px] font-black uppercase text-cyan-800">Összvastagság</div><div className="mt-1 text-xl font-black">{getAssemblyTotalThicknessCm(activeAssembly).toFixed(1).replace(".", ",")} cm</div></div>
      <EnergyAssemblySettingsPanel assembly={activeAssembly} result={activeResult} onUpdate={updateActiveAssembly} />

      <div className="grid gap-2">{activeAssembly.layers.map((layer, index) => {
        const snapshotLambda = layer.materialSnapshot?.lambdaUsedWmK;
        const overridden = snapshotLambda !== undefined && Math.abs((Number(layer.lambdaWmK) || 0) - snapshotLambda) > 0.000001;
        return <div key={layer.id} className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3" data-assembly-layer={layer.id}>
          <div className="mb-3 flex items-center justify-between gap-2"><div className="text-xs font-black">{index + 1}. réteg</div><button type="button" onClick={() => deleteLayer(layer.id)} disabled={activeAssembly.layers.length <= 1} className="survey-icon-button h-8 w-8 disabled:opacity-40"><Trash2 size={14} /></button></div>
          <div className="grid gap-3">
            <label><span className={labelClass}>Rétegtípus</span><select data-layer-kind={layer.id} className={inputClass} value={layer.kind} onChange={(event) => changeLayerKind(layer, event.target.value as EnergyLayerKind)}><option value="solid">Szilárd anyagréteg · R = d/λ</option><option value="closedAirGap">Zárt légréteg · hivatalos táblázat</option><option value="ventilatedAirGap">Szellőztetett légréteg · részletes módszer</option><option value="fixedResistance">Dokumentált fix R-érték</option></select></label>

            {layer.kind === "solid" ? <>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]"><input data-layer-material={layer.id} className={inputClass} value={layer.material} onChange={(event) => updateLayer(layer.id, { material: event.target.value, materialId: undefined, materialVersionId: undefined, materialSnapshot: undefined })} placeholder="Anyag, pl. tömör tégla" /><button type="button" data-open-material-picker={layer.id} onClick={() => setMaterialPickerLayerId(layer.id)} className="survey-action-secondary whitespace-nowrap"><Database size={15} /> Anyagtörzs</button></div>
              {layer.materialSnapshot ? <div className={`rounded-xl border p-2 text-[9px] font-bold leading-4 ${layer.materialSnapshot.verificationStatus === "verified" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-950"}`} data-layer-material-snapshot={layer.materialSnapshot.materialVersionId}>Verzió: {layer.materialSnapshot.materialVersionId} · λ-forrás: {layer.materialSnapshot.lambdaSource} · ellenőrzés: {layer.materialSnapshot.verificationStatus}</div> : null}
              <div className="grid grid-cols-2 gap-2"><DecimalNumberInput dataAttribute="data-layer-thickness" dataValue={layer.id} value={layer.thicknessCm} onCommit={(value) => updateLayer(layer.id, { thicknessCm: value })} placeholder="Vastagság cm" /><DecimalTextInput dataAttribute="data-layer-lambda" dataValue={layer.id} value={layer.lambdaWmK} onCommit={(value) => updateLayer(layer.id, { lambdaWmK: value })} placeholder="λ W/mK" /></div>
              {overridden ? <label><span className={labelClass}>λ-felülírás indoklása *</span><textarea data-lambda-override-reason={layer.id} aria-invalid={!Boolean(layer.lambdaOverrideReason?.trim())} className={`min-h-16 w-full rounded-xl border p-2 text-xs font-bold ${layer.lambdaOverrideReason?.trim() ? "border-amber-300 bg-amber-50 text-amber-950" : "border-rose-400 bg-rose-50 text-rose-950"}`} value={layer.lambdaOverrideReason || ""} onChange={(event) => updateLayer(layer.id, { lambdaOverrideReason: event.target.value })} placeholder="Miért tér el a kézi λ a kiválasztott anyagverziótól?" />{!layer.lambdaOverrideReason?.trim() ? <span className="mt-1 block text-[9px] font-black text-rose-700">Az indoklás nélkül az U-eredmény blokkolt.</span> : null}</label> : null}
            </> : null}

            {layer.kind === "closedAirGap" ? <><input data-layer-material={layer.id} className={inputClass} value={layer.material} onChange={(event) => updateLayer(layer.id, { material: event.target.value })} /><label><span className={labelClass}>Légréteg vastagsága cm</span><DecimalNumberInput dataAttribute="data-layer-thickness" dataValue={layer.id} value={layer.thicknessCm} onCommit={(value) => updateLayer(layer.id, { thicknessCm: value })} /></label><div className="rounded-xl border border-blue-300 bg-blue-50 p-3 text-[10px] font-bold leading-5 text-blue-950">0–300 mm között a hivatalos táblázatból, köztes vastagságnál lineáris interpolációval számolódik.</div></> : null}

            {layer.kind === "ventilatedAirGap" ? <><input data-layer-material={layer.id} className={inputClass} value={layer.material} onChange={(event) => updateLayer(layer.id, { material: event.target.value })} /><div className="grid grid-cols-2 gap-2"><DecimalNumberInput dataAttribute="data-layer-thickness" dataValue={layer.id} value={layer.thicknessCm} onCommit={(value) => updateLayer(layer.id, { thicknessCm: value })} /><select data-layer-air-ventilation={layer.id} className={inputClass} value={layer.airGapVentilation || "slightlyVentilated"} onChange={(event) => updateLayer(layer.id, { airGapVentilation: event.target.value as SurveyAssemblyLayer["airGapVentilation"] })}><option value="slightlyVentilated">Kissé szellőztetett</option><option value="wellVentilated">Intenzíven szellőztetett</option></select></div><div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-[10px] font-bold leading-5 text-rose-950"><AlertTriangle size={14} className="mr-2 inline" />A nyílásfelületek és a külön légáramlási szabály nélkül a v0.7.2 blokkolja az U-eredményt.</div></> : null}

            {layer.kind === "fixedResistance" ? <><input data-layer-material={layer.id} className={inputClass} value={layer.material} onChange={(event) => updateLayer(layer.id, { material: event.target.value })} /><label><span className={labelClass}>Dokumentált R-érték m²K/W</span><DecimalTextInput dataAttribute="data-layer-fixed-resistance" dataValue={layer.id} value={layer.fixedResistanceM2KPerW || ""} onCommit={(value) => updateLayer(layer.id, { fixedResistanceM2KPerW: value })} placeholder="0,18" /></label></> : null}

            <textarea className="min-h-14 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-2 text-xs font-bold text-[var(--survey-text)]" value={layer.note} onChange={(event) => updateLayer(layer.id, { note: event.target.value })} placeholder="Réteg megjegyzése és adatforrása" />
          </div>
        </div>;
      })}</div>
      <button type="button" onClick={addLayer} className="survey-action-secondary"><Plus size={15} /> Réteg hozzáadása</button>

      {props.activeRoom ? <div className="grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3"><div className="text-sm font-black text-[var(--survey-text)]">Hozzárendelés: {props.activeRoom.name}</div>{(["plinth", "floor", "ceiling"] as SurveyAssemblyCategory[]).map((category) => { const field = category === "plinth" ? "plinthAssemblyId" : category === "floor" ? "floorAssemblyId" : "ceilingAssemblyId"; return <label key={category}><span className={labelClass}>{surveyAssemblyCategoryLabels[category]}</span><select className={inputClass} value={props.activeRoom?.[field] || ""} onChange={(event) => props.onAssignRoomAssembly(field, event.target.value)}><option value="">Nincs hozzárendelve</option>{(assembliesByCategory[category] || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>; })}</div> : null}
      <button type="button" onClick={() => { props.onDeleteAssembly(activeAssembly.id); setActiveAssemblyId(props.assemblies.find((item) => item.id !== activeAssembly.id)?.id || null); }} className="survey-action-danger"><Trash2 size={16} /> Rétegrend törlése</button>
    </> : null}

    {materialPickerLayerId ? <MaterialCatalogWorkspace workspace={props.materialWorkspace} selectedMaterialId={activePickerLayer?.materialId} onWorkspaceChange={props.onMaterialWorkspaceChange} onSelect={selectMaterial} onClose={() => setMaterialPickerLayerId(null)} /> : null}
  </div>;
}

function DecimalNumberInput({ dataAttribute, dataValue, value, onCommit, placeholder }: { dataAttribute: string; dataValue: string; value: number; onCommit: (value: number) => void; placeholder?: string }) {
  const [draft, setDraft] = useState(value ? String(value) : "");
  useEffect(() => setDraft(value ? String(value) : ""), [value]);
  const dataProps = { [dataAttribute]: dataValue };
  return <input {...dataProps} inputMode="decimal" className={inputClass} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => { const parsed = Number(draft.trim().replace(",", ".")); onCommit(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0); }} placeholder={placeholder} />;
}

function DecimalTextInput({ dataAttribute, dataValue, value, onCommit, placeholder }: { dataAttribute: string; dataValue: string; value: string; onCommit: (value: string) => void; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const dataProps = { [dataAttribute]: dataValue };
  return <input {...dataProps} inputMode="decimal" className={inputClass} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => onCommit(draft.trim().replace(",", "."))} placeholder={placeholder} />;
}
