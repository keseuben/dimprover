"use client";

import { useState } from "react";
import { Calculator, ClipboardCheck, DoorOpen, FileCheck2, FileSearch, Flame, Gauge, Layers3, Settings2, Table2 } from "lucide-react";
import type { EnergyProjectSettings } from "@/components/energy/domain/energyProjectTypes";
import type { EnergyEnvelopeGeometryResult } from "@/components/energy/domain/energyGeometryTypes";
import type { EnergyAssemblyRuleData, EnergyAssemblySetResult } from "@/components/energy/domain/energyAssemblyTypes";
import type { EnergyZoneSetResult, EnergyZoneWorkspace } from "@/components/energy/domain/energyZoneTypes";
import type { EnergyOpeningDetail, EnergyOpeningSetResult, EnergyOpeningWorkspace } from "@/components/energy/domain/energyOpeningTypes";
import type { EnergyDemandSetResult, EnergyDemandWorkspace } from "@/components/energy/domain/energyDemandTypes";
import type { SurveyConstructionAssembly, SurveyMechanicalDevice } from "@/components/property-survey/propertySurveyEnergyModel";
import type { SurveyBuildingLevel, SurveyWallOpening, SurveyWallSegment } from "@/components/property-survey/propertySurveyBuildingModel";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import { EnergyCompliancePanel } from "@/components/property-survey/energy/EnergyCompliancePanel";
import { EnergyProjectSettingsPanel } from "@/components/property-survey/energy/EnergyProjectSettingsPanel";
import { EnergyGeometryPanel } from "@/components/property-survey/energy/EnergyGeometryPanel";
import { EnergyAuditPanel } from "@/components/property-survey/energy/EnergyAuditPanel";
import { EnergyAssembliesPanel } from "@/components/property-survey/energy/EnergyAssembliesPanel";
import { EnergyZonesPanel } from "@/components/property-survey/energy/EnergyZonesPanel";
import { EnergyOpeningsPanel } from "@/components/property-survey/energy/EnergyOpeningsPanel";
import { EnergyDemandPanel } from "@/components/property-survey/energy/EnergyDemandPanel";
import { EnergyExpertTablesPanel } from "@/components/property-survey/energy/EnergyExpertTablesPanel";
import type { EnergyExpertTable } from "@/components/property-survey/propertySurveyExpertTables";
import type { WinWattFieldMapResult } from "@/components/energy/domain/energyWinWattTransferTypes";
import type { WinWattTrialFeedbackResult, WinWattTrialMetricSeed, WinWattTrialWorkspace } from "@/components/energy/domain/energyWinWattTrialTypes";
import { EnergyWinWattTransferPanel } from "@/components/property-survey/energy/EnergyWinWattTransferPanel";

export type EnergyWorkspaceTab = "settings" | "geometry" | "zones" | "openings" | "demand" | "assemblies" | "tables" | "transfer" | "status" | "audit";

export const energyWorkspaceTabs: Array<{ id: EnergyWorkspaceTab; label: string; icon: typeof Settings2 }> = [
  { id: "settings", label: "Beállítások", icon: Settings2 },
  { id: "geometry", label: "Geometria", icon: Calculator },
  { id: "zones", label: "Zónák", icon: Flame },
  { id: "openings", label: "Nyílászárók", icon: DoorOpen },
  { id: "demand", label: "Zónaterhelés", icon: Gauge },
  { id: "assemblies", label: "U-érték", icon: Layers3 },
  { id: "tables", label: "Szakértői táblák", icon: Table2 },
  { id: "transfer", label: "WinWatt átadás", icon: FileCheck2 },
  { id: "status", label: "Állapot", icon: ClipboardCheck },
  { id: "audit", label: "Nyomvonal", icon: FileSearch },
];

type Props = {
  settings: EnergyProjectSettings;
  geometry: EnergyEnvelopeGeometryResult;
  assemblies: SurveyConstructionAssembly[];
  assemblySet: EnergyAssemblySetResult;
  assemblyRules: EnergyAssemblyRuleData;
  zoneWorkspace: EnergyZoneWorkspace;
  zoneResult: EnergyZoneSetResult;
  openingWorkspace: EnergyOpeningWorkspace;
  openingResult: EnergyOpeningSetResult;
  demandWorkspace: EnergyDemandWorkspace;
  demandResult: EnergyDemandSetResult;
  wallOpenings: SurveyWallOpening[];
  wallSegments: SurveyWallSegment[];
  mechanicalDevices: SurveyMechanicalDevice[];
  rooms: SurveyRoom[];
  levels: SurveyBuildingLevel[];
  expertTables: EnergyExpertTable[];
  winWattFieldMap: WinWattFieldMapResult;
  winWattTrialWorkspace: WinWattTrialWorkspace;
  winWattTrialFeedback: WinWattTrialFeedbackResult;
  winWattTrialMetricSeeds: WinWattTrialMetricSeed[];
  exportingWorkbook?: boolean;
  activeTab?: EnergyWorkspaceTab;
  onActiveTabChange?: (tab: EnergyWorkspaceTab) => void;
  showNavigation?: boolean;
  onExportWorkbook: () => void;
  onExportTrialPackage: () => void;
  onWinWattTrialWorkspaceChange: (workspace: WinWattTrialWorkspace) => void;
  onChange: (patch: Partial<EnergyProjectSettings>) => void;
  onZoneWorkspaceChange: (workspace: EnergyZoneWorkspace) => void;
  onOpeningWorkspaceChange: (workspace: EnergyOpeningWorkspace) => void;
  onOpeningDetailChange: (openingId: string, patch: Partial<EnergyOpeningDetail>) => void;
  onDemandWorkspaceChange: (workspace: EnergyDemandWorkspace) => void;
  onUpdateAssembly: (assemblyId: string, patch: Partial<SurveyConstructionAssembly>) => void;
};

export function PropertySurveyEnergyWorkspace({ settings, geometry, assemblies, assemblySet, assemblyRules, zoneWorkspace, zoneResult, openingWorkspace, openingResult, demandWorkspace, demandResult, wallOpenings, wallSegments, mechanicalDevices, rooms, levels, expertTables, winWattFieldMap, winWattTrialWorkspace, winWattTrialFeedback, winWattTrialMetricSeeds, exportingWorkbook, activeTab, onActiveTabChange, showNavigation = true, onExportWorkbook, onExportTrialPackage, onWinWattTrialWorkspaceChange, onChange, onZoneWorkspaceChange, onOpeningWorkspaceChange, onOpeningDetailChange, onDemandWorkspaceChange, onUpdateAssembly }: Props) {
  const [internalTab, setInternalTab] = useState<EnergyWorkspaceTab>("settings");
  const tab = activeTab || internalTab;
  function selectTab(next: EnergyWorkspaceTab) {
    if (activeTab === undefined) setInternalTab(next);
    onActiveTabChange?.(next);
  }

  return <div className="grid min-w-0 gap-4" data-energy-workspace="true" data-energy-active-tab={tab}>
    {showNavigation ? <div className="grid gap-2 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))" }}>
      {energyWorkspaceTabs.map((item) => { const Icon = item.icon; return <button key={item.id} data-energy-tab={item.id} type="button" onClick={() => selectTab(item.id)} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-[9px] font-black uppercase ${tab === item.id ? "bg-cyan-100 text-cyan-900 ring-1 ring-cyan-400" : "text-[var(--survey-muted)]"}`}><Icon size={15} /> {item.label}</button>; })}
    </div> : null}
    <div className="min-w-0" data-energy-workspace-content={tab}>
      {tab === "settings" ? <EnergyProjectSettingsPanel settings={settings} onChange={onChange} /> : null}
      {tab === "geometry" ? <EnergyGeometryPanel result={geometry} /> : null}
      {tab === "zones" ? <EnergyZonesPanel workspace={zoneWorkspace} result={zoneResult} rooms={rooms} levels={levels} onChange={onZoneWorkspaceChange} /> : null}
      {tab === "openings" ? <EnergyOpeningsPanel workspace={openingWorkspace} result={openingResult} openings={wallOpenings} rooms={rooms} levels={levels} zones={zoneResult.zones} onWorkspaceChange={onOpeningWorkspaceChange} onDetailChange={onOpeningDetailChange} /> : null}
      {tab === "demand" ? <EnergyDemandPanel workspace={demandWorkspace} result={demandResult} zoneWorkspace={zoneWorkspace} zoneResult={zoneResult} rooms={rooms} wallSegments={wallSegments} assemblies={assemblies} mechanicalDevices={mechanicalDevices} onChange={onDemandWorkspaceChange} /> : null}
      {tab === "assemblies" ? <EnergyAssembliesPanel assemblies={assemblies} resultSet={assemblySet} rules={assemblyRules} requirementLevel={settings.requirementLevel} onUpdateAssembly={onUpdateAssembly} /> : null}
      {tab === "tables" ? <EnergyExpertTablesPanel tables={expertTables} exporting={exportingWorkbook} onExportWorkbook={onExportWorkbook} /> : null}
      {tab === "transfer" ? <EnergyWinWattTransferPanel result={winWattFieldMap} trialWorkspace={winWattTrialWorkspace} trialResult={winWattTrialFeedback} trialMetricSeeds={winWattTrialMetricSeeds} exporting={exportingWorkbook} onExportWorkbook={onExportWorkbook} onExportTrialPackage={onExportTrialPackage} onTrialWorkspaceChange={onWinWattTrialWorkspaceChange} /> : null}
      {tab === "status" ? <EnergyCompliancePanel settings={settings} geometry={geometry} assemblySet={assemblySet} zoneSet={zoneResult} openingSet={openingResult} demandSet={demandResult} /> : null}
      {tab === "audit" ? <EnergyAuditPanel result={geometry} /> : null}
    </div>
  </div>;
}
