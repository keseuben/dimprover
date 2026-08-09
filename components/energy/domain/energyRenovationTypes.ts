import type { EnergyDataStatus } from "@/components/energy/domain/energyFieldWorkflowTypes";

export type EnergyRenovationScenarioKind = "existing" | "proposal";
export type EnergyRenovationScenarioStatus = "draft" | "reviewRequired" | "winwattReady" | "validated";
export type EnergyRenovationEffectLevel = "low" | "medium" | "high" | "veryHigh";
export type EnergyRenovationMeasureCategory =
  | "externalWall"
  | "plinth"
  | "atticFloor"
  | "roof"
  | "basementWall"
  | "basementCeiling"
  | "groundFloor"
  | "opening"
  | "heating"
  | "cooling"
  | "hotWater"
  | "ventilation"
  | "pv"
  | "solarThermal"
  | "battery"
  | "evCharging"
  | "other";

export type EnergyRenovationMeasure = {
  id: string;
  category: EnergyRenovationMeasureCategory;
  title: string;
  targetEntityId?: string;
  existingDescription: string;
  proposedDescription: string;
  currentValue?: number;
  targetValue?: number;
  unit?: string;
  effectLevel: EnergyRenovationEffectLevel;
  dataStatus: EnergyDataStatus;
  sourceReference: string;
  included: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type EnergyRenovationScenario = {
  id: string;
  code: string;
  name: string;
  kind: EnergyRenovationScenarioKind;
  baseScenarioId?: string;
  description: string;
  status: EnergyRenovationScenarioStatus;
  measures: EnergyRenovationMeasure[];
  createdAt: string;
  updatedAt: string;
};

export type EnergyRenovationWorkspace = {
  schemaVersion: 1;
  activeScenarioId: string;
  scenarios: EnergyRenovationScenario[];
  updatedAt: string;
};

export const energyRenovationCategoryLabels: Record<EnergyRenovationMeasureCategory, string> = {
  externalWall: "Homlokzati fal",
  plinth: "Lábazat",
  atticFloor: "Padlásfödém",
  roof: "Tetősík / tetőfödém",
  basementWall: "Pincefal",
  basementCeiling: "Pincefödém",
  groundFloor: "Talajon fekvő padló",
  opening: "Nyílászáró",
  heating: "Fűtési rendszer",
  cooling: "Hűtési rendszer",
  hotWater: "Használati melegvíz",
  ventilation: "Szellőzés",
  pv: "Napelem",
  solarThermal: "Napkollektor",
  battery: "Energiatároló",
  evCharging: "Elektromosautó-töltés",
  other: "Egyéb intézkedés",
};

export const energyRenovationEffectLabels: Record<EnergyRenovationEffectLevel, string> = {
  low: "Kisebb hatás",
  medium: "Közepes hatás",
  high: "Jelentős hatás",
  veryHigh: "Kiemelt hatás",
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEnergyRenovationMeasure(category: EnergyRenovationMeasureCategory, input: Partial<EnergyRenovationMeasure> = {}): EnergyRenovationMeasure {
  const now = new Date().toISOString();
  return {
    id: input.id || createId("renovation-measure"),
    category,
    title: input.title || energyRenovationCategoryLabels[category],
    targetEntityId: input.targetEntityId,
    existingDescription: input.existingDescription || "",
    proposedDescription: input.proposedDescription || "",
    currentValue: Number.isFinite(Number(input.currentValue)) ? Number(input.currentValue) : undefined,
    targetValue: Number.isFinite(Number(input.targetValue)) ? Number(input.targetValue) : undefined,
    unit: input.unit || "",
    effectLevel: input.effectLevel === "low" || input.effectLevel === "high" || input.effectLevel === "veryHigh" ? input.effectLevel : "medium",
    dataStatus: input.dataStatus || "estimated",
    sourceReference: input.sourceReference || "",
    included: input.included !== false,
    note: input.note || "",
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

export function createDefaultRenovationScenario(): EnergyRenovationScenario {
  const now = new Date().toISOString();
  return {
    id: "scenario-existing",
    code: "M0",
    name: "Meglévő állapot",
    kind: "existing",
    description: "A helyszínen felmért és dokumentált jelenlegi állapot.",
    status: "reviewRequired",
    measures: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createProposalRenovationScenario(index = 1, input: Partial<EnergyRenovationScenario> = {}): EnergyRenovationScenario {
  const now = new Date().toISOString();
  return {
    id: input.id || createId("scenario"),
    code: input.code || `T${index}`,
    name: input.name || (index === 1 ? "Helyszíni javaslat" : `Felújítási változat ${index}`),
    kind: "proposal",
    baseScenarioId: input.baseScenarioId || "scenario-existing",
    description: input.description || "A helyszíni felmérés alapján összeállított előzetes felújítási csomag.",
    status: input.status === "winwattReady" || input.status === "validated" ? input.status : "draft",
    measures: Array.isArray(input.measures) ? input.measures.map((measure) => createEnergyRenovationMeasure(measure.category, measure)) : [],
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

export function createDefaultEnergyRenovationWorkspace(): EnergyRenovationWorkspace {
  const existing = createDefaultRenovationScenario();
  const proposal = createProposalRenovationScenario(1, { id: "scenario-field-proposal" });
  return {
    schemaVersion: 1,
    activeScenarioId: proposal.id,
    scenarios: [existing, proposal],
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeEnergyRenovationWorkspace(input?: Partial<EnergyRenovationWorkspace> | null): EnergyRenovationWorkspace {
  const base = createDefaultEnergyRenovationWorkspace();
  const rawScenarios = Array.isArray(input?.scenarios) ? input.scenarios : base.scenarios;
  const scenarios = rawScenarios.map((scenario, index) => {
    if (scenario.kind === "existing" || scenario.id === "scenario-existing") {
      const existing = createDefaultRenovationScenario();
      return {
        ...existing,
        ...scenario,
        id: "scenario-existing",
        code: scenario.code || "M0",
        kind: "existing" as const,
        measures: [],
        status: scenario.status === "validated" ? "validated" as const : "reviewRequired" as const,
      };
    }
    return createProposalRenovationScenario(index || 1, scenario);
  });
  if (!scenarios.some((scenario) => scenario.id === "scenario-existing")) scenarios.unshift(createDefaultRenovationScenario());
  if (!scenarios.some((scenario) => scenario.kind === "proposal")) scenarios.push(createProposalRenovationScenario(1, { id: "scenario-field-proposal" }));
  const activeScenarioId = scenarios.some((scenario) => scenario.id === input?.activeScenarioId)
    ? String(input?.activeScenarioId)
    : scenarios.find((scenario) => scenario.kind === "proposal")?.id || "scenario-existing";
  return {
    schemaVersion: 1,
    activeScenarioId,
    scenarios,
    updatedAt: typeof input?.updatedAt === "string" && input.updatedAt ? input.updatedAt : new Date().toISOString(),
  };
}

export function getRenovationMeasureTemplates(): Array<Pick<EnergyRenovationMeasure, "category" | "title" | "proposedDescription" | "effectLevel" | "unit">> {
  return [
    { category: "externalWall", title: "Homlokzati fal hőszigetelése", proposedDescription: "Külső oldali hőszigetelő rendszer készítése ellenőrzött rétegrenddel.", effectLevel: "high", unit: "W/m²K" },
    { category: "plinth", title: "Lábazati hőszigetelés", proposedDescription: "Nedvességálló lábazati hőszigetelés és csatlakozási hőhíd javítása.", effectLevel: "medium", unit: "W/m²K" },
    { category: "atticFloor", title: "Padlásfödém hőszigetelése", proposedDescription: "A padlásfödém felső oldalán folytonos hőszigetelés készítése.", effectLevel: "veryHigh", unit: "W/m²K" },
    { category: "roof", title: "Tetősík hőszigetelése", proposedDescription: "A fűtött tetőteret határoló tetősík rétegrendjének korszerűsítése.", effectLevel: "high", unit: "W/m²K" },
    { category: "basementWall", title: "Pincefal hőszigetelése", proposedDescription: "A pincefal külső vagy belső oldali, nedvességtechnikailag ellenőrzött hőszigetelése.", effectLevel: "medium", unit: "W/m²K" },
    { category: "basementCeiling", title: "Pincefödém hőszigetelése", proposedDescription: "A fűtetlen pince feletti födém alsó oldali hőszigetelése.", effectLevel: "high", unit: "W/m²K" },
    { category: "groundFloor", title: "Padló hőtechnikai javítása", proposedDescription: "A talajon fekvő padló korszerűsítése felújításkor, részletes talajkapcsolati ellenőrzéssel.", effectLevel: "medium", unit: "W/m²K" },
    { category: "opening", title: "Nyílászárócsere", proposedDescription: "Energetikailag megfelelő, ellenőrzött Uw-értékű nyílászáró és csatlakozás.", effectLevel: "high", unit: "W/m²K" },
    { category: "heating", title: "Fűtési rendszer korszerűsítése", proposedDescription: "Hőtermelő, szabályozás, hőleadók és hidraulikai rendszer összehangolt korszerűsítése.", effectLevel: "veryHigh", unit: "" },
    { category: "cooling", title: "Hűtési rendszer kialakítása / cseréje", proposedDescription: "Méretezett, magas szezonális hatásfokú hűtési rendszer és árnyékolás.", effectLevel: "medium", unit: "" },
    { category: "hotWater", title: "HMV-rendszer korszerűsítése", proposedDescription: "Hőtermelő, tároló, elosztás és megújuló rásegítés összehangolása.", effectLevel: "medium", unit: "" },
    { category: "ventilation", title: "Szellőzés korszerűsítése", proposedDescription: "Légcsere, légzárás és szükség esetén hővisszanyerés tervezése.", effectLevel: "medium", unit: "" },
    { category: "pv", title: "Napelemrendszer", proposedDescription: "Tetősík- és fogyasztásalapú napelemes rendszer előméretezése.", effectLevel: "high", unit: "kWp" },
    { category: "solarThermal", title: "Napkollektoros rendszer", proposedDescription: "HMV-igényhez és tetősíkhoz illesztett napkollektoros rendszer.", effectLevel: "medium", unit: "m²" },
    { category: "battery", title: "Akkumulátoros energiatároló", proposedDescription: "Sajátfogyasztásra vagy tartaléküzemre méretezett energiatároló.", effectLevel: "medium", unit: "kWh" },
    { category: "evCharging", title: "Elektromosautó-töltés", proposedDescription: "Hálózati csatlakozáshoz és járműhasználathoz méretezett intelligens töltés.", effectLevel: "medium", unit: "kW" },
  ];
}
