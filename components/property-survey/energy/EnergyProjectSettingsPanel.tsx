"use client";

import {
  energyBuildingSymbolLabels,
  energyCalculationMethodLabels,
  energyCalculationPurposeLabels,
  energyCertificationSubjectLabels,
  energyRequirementLevelLabels,
  type EnergyProjectSettings,
} from "@/components/energy/domain/energyProjectTypes";
import { listEnergyRuleSets } from "@/components/energy/regulations/registry";

const inputClass = "h-11 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 text-sm font-bold text-[var(--survey-text)] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";
const labelClass = "mb-1.5 block text-[10px] font-black uppercase tracking-[0.11em] text-[var(--survey-muted)]";

type Props = {
  settings: EnergyProjectSettings;
  onChange: (patch: Partial<EnergyProjectSettings>) => void;
};

function optionalYear(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function EnergyProjectSettingsPanel({ settings, onChange }: Props) {
  const ruleSets = listEnergyRuleSets();
  return <section className="grid gap-4" data-energy-settings-panel="true">
    <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-4 text-cyan-950">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-black">Energetikai projektbeállítások</div>
          <p className="mt-1 text-xs font-semibold leading-5">A projekt célját, szabályállapotát és vizsgálati keretét rögzíti. Ebben a verzióban még nem készül energetikai végeredmény.</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 rounded-xl border border-cyan-300 bg-white px-3 py-2 text-xs font-black">
          <input data-energy-field="enabled" type="checkbox" checked={settings.enabled} onChange={(event) => onChange({ enabled: event.target.checked })} /> Aktív
        </label>
      </div>
    </div>

    <label><span className={labelClass}>Számítás célja</span><select data-energy-field="calculationPurpose" className={inputClass} value={settings.calculationPurpose} onChange={(event) => onChange({ calculationPurpose: event.target.value as EnergyProjectSettings["calculationPurpose"] })}>{Object.entries(energyCalculationPurposeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>

    <label><span className={labelClass}>Alkalmazott szabálycsomag</span><select data-energy-field="ruleSetId" className={inputClass} value={settings.ruleSetId} onChange={(event) => onChange({ ruleSetId: event.target.value as EnergyProjectSettings["ruleSetId"] })}>{ruleSets.map((ruleSet) => <option key={ruleSet.metadata.id} value={ruleSet.metadata.id}>{ruleSet.metadata.id} · {ruleSet.metadata.version}</option>)}</select></label>

    <label><span className={labelClass}>Követelményszint</span><select data-energy-field="requirementLevel" className={inputClass} value={settings.requirementLevel} onChange={(event) => onChange({ requirementLevel: event.target.value as EnergyProjectSettings["requirementLevel"] })}>{Object.entries(energyRequirementLevelLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>

    <div className="grid gap-3 sm:grid-cols-2">
      <label><span className={labelClass}>Tanúsítás tárgya</span><select data-energy-field="certificationSubject" className={inputClass} value={settings.certificationSubject} onChange={(event) => onChange({ certificationSubject: event.target.value as EnergyProjectSettings["certificationSubject"] })}>{Object.entries(energyCertificationSubjectLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span className={labelClass}>Épületszimbólum</span><select data-energy-field="buildingSymbol" className={inputClass} value={settings.buildingSymbol} onChange={(event) => onChange({ buildingSymbol: event.target.value as EnergyProjectSettings["buildingSymbol"] })}>{Object.entries(energyBuildingSymbolLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <label><span className={labelClass}>Engedély / bejelentés dátuma</span><input data-energy-field="permitOrNotificationDate" type="date" className={inputClass} value={settings.permitOrNotificationDate || ""} onChange={(event) => onChange({ permitOrNotificationDate: event.target.value || undefined })} /></label>
      <label><span className={labelClass}>Építés éve</span><input data-energy-field="constructionYear" type="number" min="1800" max="2200" className={inputClass} value={settings.constructionYear || ""} onChange={(event) => onChange({ constructionYear: optionalYear(event.target.value) })} /></label>
      <label><span className={labelClass}>Jelentős felújítás éve</span><input data-energy-field="significantRenovationYear" type="number" min="1800" max="2200" className={inputClass} value={settings.significantRenovationYear || ""} onChange={(event) => onChange({ significantRenovationYear: optionalYear(event.target.value) })} /></label>
    </div>

    <label><span className={labelClass}>Számítási módszer</span><select data-energy-field="calculationMethod" className={inputClass} value={settings.calculationMethod} onChange={(event) => onChange({ calculationMethod: event.target.value as EnergyProjectSettings["calculationMethod"] })}>{Object.entries(energyCalculationMethodLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>

    <label className="flex items-start gap-3 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3 text-sm font-bold text-[var(--survey-text)]">
      <input data-energy-field="wholeBuildingDataAvailable" type="checkbox" className="mt-1" checked={settings.wholeBuildingDataAvailable} onChange={(event) => onChange({ wholeBuildingDataAvailable: event.target.checked })} />
      <span><span className="block font-black">A teljes épület adatai rendelkezésre állnak</span><span className="mt-1 block text-xs font-semibold leading-5 text-[var(--survey-muted)]">Önálló rendeltetési egységnél is jelezd, hogy a teljes épület összefüggő energetikai adatai elérhetők-e.</span></span>
    </label>
  </section>;
}
