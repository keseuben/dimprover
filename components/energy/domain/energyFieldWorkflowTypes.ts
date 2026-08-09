export type EnergyWorkspaceMode = "field" | "expert";

export type EnergyDataStatus =
  | "measured"
  | "documented"
  | "estimated"
  | "reviewRequired"
  | "winwattFinalization"
  | "validated";

export type EnergyFieldWorkflowState = {
  schemaVersion: 1;
  mode: EnergyWorkspaceMode;
  activeScenarioId: string;
  completedStepIds: string[];
  showOnlyIncomplete: boolean;
  updatedAt: string;
};

export const energyDataStatusLabels: Record<EnergyDataStatus, string> = {
  measured: "Helyszínen mért",
  documented: "Dokumentumból rögzített",
  estimated: "Előzetesen becsült",
  reviewRequired: "Szakmai ellenőrzés szükséges",
  winwattFinalization: "WinWattban véglegesítendő",
  validated: "Validált DIMPRO számítás",
};

export function createDefaultEnergyFieldWorkflowState(): EnergyFieldWorkflowState {
  return {
    schemaVersion: 1,
    mode: "field",
    activeScenarioId: "scenario-existing",
    completedStepIds: [],
    showOnlyIncomplete: false,
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeEnergyFieldWorkflowState(input?: Partial<EnergyFieldWorkflowState> | null): EnergyFieldWorkflowState {
  const base = createDefaultEnergyFieldWorkflowState();
  return {
    schemaVersion: 1,
    mode: input?.mode === "expert" ? "expert" : "field",
    activeScenarioId: typeof input?.activeScenarioId === "string" && input.activeScenarioId.trim() ? input.activeScenarioId : base.activeScenarioId,
    completedStepIds: Array.isArray(input?.completedStepIds) ? [...new Set(input.completedStepIds.filter((item): item is string => typeof item === "string" && Boolean(item.trim())))] : [],
    showOnlyIncomplete: Boolean(input?.showOnlyIncomplete),
    updatedAt: typeof input?.updatedAt === "string" && input.updatedAt ? input.updatedAt : base.updatedAt,
  };
}
