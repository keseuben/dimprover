import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import type { PlanIssueMarker } from "@/components/viewers/PlanMarkerTypes";
import type { EnergyMaterialSnapshot } from "@/components/materials/domain/materialPropertyTypes";
import type {
  EnergyAirGapVentilation,
  EnergyAssemblyBoundaryMode,
  EnergyAssemblyCalculationMode,
  EnergyAssemblyComplexity,
  EnergyAssemblyCorrectionSettings,
  EnergyAssemblyRequirementType,
  EnergyHeatFlowDirection,
  EnergyLayerKind,
} from "@/components/energy/domain/energyAssemblyTypes";

export type SurveyAssemblyCategory = "plinth" | "wall" | "floor" | "ceiling";
export type SurveyThermalBoundaryMode = "heatedRooms" | "allRooms" | "manual";
export type SurveyPhotoPlacementMode = "create" | "move" | null;
export type SurveyPhotoPurpose = "documentation" | "issue";
export type SurveyCertificatePhotoCategory = "building" | "heatGenerator" | "heatEmitter" | "other";
export type SurveyMechanicalPlacementMode = "create" | "move" | null;
export type SurveyMechanicalKind = "boiler" | "heatPump" | "radiator" | "underfloorHeating" | "airConditioner" | "waterHeater" | "ventilation" | "solar" | "other";

export type SurveyAssemblyLayer = {
  id: string;
  kind: EnergyLayerKind;
  material: string;
  materialId?: string;
  materialVersionId?: string;
  materialSnapshot?: EnergyMaterialSnapshot;
  thicknessCm: number;
  lambdaWmK: string;
  fixedResistanceM2KPerW?: string;
  airGapVentilation?: EnergyAirGapVentilation;
  lambdaOverrideReason?: string;
  note: string;
};

export type SurveyConstructionAssembly = {
  id: string;
  category: SurveyAssemblyCategory;
  name: string;
  heatFlowDirection: EnergyHeatFlowDirection;
  boundaryMode: EnergyAssemblyBoundaryMode;
  calculationMode: EnergyAssemblyCalculationMode;
  complexity: EnergyAssemblyComplexity;
  requirementType: EnergyAssemblyRequirementType;
  customRequirementUValueWm2K?: string;
  surfaceResistanceMode: "ruleSetDefault" | "custom";
  customRsiM2KPerW?: string;
  customRseM2KPerW?: string;
  declaredUValueWm2K?: string;
  declaredUValueSource?: string;
  corrections: EnergyAssemblyCorrectionSettings;
  layers: SurveyAssemblyLayer[];
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type SurveyThermalBoundarySettings = {
  id: string;
  levelId: string;
  mode: SurveyThermalBoundaryMode;
  offsetCm: number;
  manualX: number;
  manualY: number;
  manualWidth: number;
  manualHeight: number;
  updatedAt: string;
};

export type SurveyPhotoPoint = {
  id: string;
  serial: string;
  levelId: string;
  roomId: string;
  xPercent: number;
  yPercent: number;
  title: string;
  note: string;
  purpose: SurveyPhotoPurpose;
  certificateCategory: SurveyCertificatePhotoCategory;
  includeInCertificate: boolean;
  fileName?: string;
  dataUrl?: string;
  mimeType?: string;
  originalSizeBytes?: number;
  optimizedSizeBytes?: number;
  pixelWidth?: number;
  pixelHeight?: number;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type SurveyMechanicalDevice = {
  id: string;
  levelId: string;
  roomId: string;
  kind: SurveyMechanicalKind;
  name: string;
  xRatio: number;
  yRatio: number;
  manufacturer: string;
  model: string;
  capacity: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export const surveyAssemblyCategoryLabels: Record<SurveyAssemblyCategory, string> = {
  plinth: "Lábazat",
  wall: "Fal",
  floor: "Padló",
  ceiling: "Födém / tető",
};

export const surveyPhotoPurposeLabels: Record<SurveyPhotoPurpose, string> = {
  documentation: "Energetikai fotódokumentáció",
  issue: "Hibafotó / észrevétel",
};

export const surveyCertificatePhotoCategoryLabels: Record<SurveyCertificatePhotoCategory, string> = {
  building: "Fénykép az épületről",
  heatGenerator: "Fénykép a hőtermelő rendszerről",
  heatEmitter: "Fénykép a hőleadó rendszerről",
  other: "Egyéb felmérési fotó (nem WinWatt-kategória)",
};

export const requiredSurveyCertificatePhotoCategories: SurveyCertificatePhotoCategory[] = ["building", "heatGenerator", "heatEmitter"];

export const surveyMechanicalKindLabels: Record<SurveyMechanicalKind, string> = {
  boiler: "Kazán / hőtermelő",
  heatPump: "Hőszivattyú",
  radiator: "Radiátor / hőleadó",
  underfloorHeating: "Padlófűtés",
  airConditioner: "Klíma",
  waterHeater: "Melegvíz-tároló",
  ventilation: "Szellőző berendezés",
  solar: "Napelem / napkollektor",
  other: "Egyéb gépészeti berendezés",
};

export function createEnergyModelId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultThermalBoundary(levelId: string): SurveyThermalBoundarySettings {
  return {
    id: `thermal-${levelId}`,
    levelId,
    mode: "heatedRooms",
    offsetCm: 0,
    manualX: 90,
    manualY: 90,
    manualWidth: 620,
    manualHeight: 360,
    updatedAt: new Date().toISOString(),
  };
}

export function createDefaultAssemblyCorrectionSettings(): EnergyAssemblyCorrectionSettings {
  return {
    policy: "applyAll",
    airVoid: { level: "none" },
    mechanicalFastener: {
      enabled: false,
      fastenerLambdaWmK: 50,
      fastenerCountPerSquareMeter: 0,
      fastenerCrossSectionSquareMeters: 0,
      insulationThicknessMeters: 0,
      penetrationLengthMeters: 0,
      embedded: false,
      passesAirLayer: false,
      pointFastener: true,
    },
    invertedRoofDeltaUWm2K: 0,
    invertedRoofSource: "",
  };
}

export function getDefaultAssemblyThermalSettings(category: SurveyAssemblyCategory): Pick<SurveyConstructionAssembly, "heatFlowDirection" | "boundaryMode" | "calculationMode" | "complexity" | "requirementType" | "surfaceResistanceMode"> {
  if (category === "ceiling") return { heatFlowDirection: "upward", boundaryMode: "externalAir", calculationMode: "calculated", complexity: "homogeneous", requirementType: "atticFloor", surfaceResistanceMode: "ruleSetDefault" };
  if (category === "floor") return { heatFlowDirection: "downward", boundaryMode: "groundEquivalentRequired", calculationMode: "calculated", complexity: "homogeneous", requirementType: "groundFloor", surfaceResistanceMode: "ruleSetDefault" };
  if (category === "plinth") return { heatFlowDirection: "horizontal", boundaryMode: "externalAir", calculationMode: "calculated", complexity: "homogeneous", requirementType: "plinthWall", surfaceResistanceMode: "ruleSetDefault" };
  return { heatFlowDirection: "horizontal", boundaryMode: "externalAir", calculationMode: "calculated", complexity: "homogeneous", requirementType: "externalWall", surfaceResistanceMode: "ruleSetDefault" };
}

export function createConstructionAssembly(category: SurveyAssemblyCategory, name?: string): SurveyConstructionAssembly {
  const now = new Date().toISOString();
  return {
    id: createEnergyModelId(`assembly-${category}`),
    category,
    name: name || `${surveyAssemblyCategoryLabels[category]} rétegrend`,
    ...getDefaultAssemblyThermalSettings(category),
    corrections: createDefaultAssemblyCorrectionSettings(),
    layers: [{ id: createEnergyModelId("layer"), kind: "solid", material: "", thicknessCm: 0, lambdaWmK: "", note: "" }],
    note: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeSurveyAssemblyLayer(layer: Partial<SurveyAssemblyLayer>, index = 0): SurveyAssemblyLayer {
  const kind: EnergyLayerKind = layer.kind === "closedAirGap" || layer.kind === "ventilatedAirGap" || layer.kind === "fixedResistance" ? layer.kind : "solid";
  return {
    ...layer,
    id: layer.id || createEnergyModelId(`layer-${index + 1}`),
    kind,
    material: layer.material || (kind === "closedAirGap" ? "Zárt légréteg" : kind === "ventilatedAirGap" ? "Szellőztetett légréteg" : kind === "fixedResistance" ? "Megadott hővezetési ellenállás" : ""),
    thicknessCm: Math.max(0, Number(layer.thicknessCm) || 0),
    lambdaWmK: layer.lambdaWmK || "",
    fixedResistanceM2KPerW: layer.fixedResistanceM2KPerW || "",
    airGapVentilation: kind === "closedAirGap" ? "closed" : layer.airGapVentilation || (kind === "ventilatedAirGap" ? "slightlyVentilated" : undefined),
    note: layer.note || "",
  };
}

export function normalizeSurveyConstructionAssembly(input: Partial<SurveyConstructionAssembly>): SurveyConstructionAssembly {
  const category: SurveyAssemblyCategory = input.category === "plinth" || input.category === "floor" || input.category === "ceiling" ? input.category : "wall";
  const base = createConstructionAssembly(category, input.name);
  const defaults = getDefaultAssemblyThermalSettings(category);
  const heatFlowDirection: EnergyHeatFlowDirection = input.heatFlowDirection === "upward" || input.heatFlowDirection === "downward" || input.heatFlowDirection === "horizontal" ? input.heatFlowDirection : defaults.heatFlowDirection;
  const boundaryMode: EnergyAssemblyBoundaryMode = input.boundaryMode === "internalUnheated" || input.boundaryMode === "groundEquivalentRequired" ? input.boundaryMode : defaults.boundaryMode;
  const calculationMode: EnergyAssemblyCalculationMode = input.calculationMode === "declared" ? "declared" : "calculated";
  const complexity: EnergyAssemblyComplexity = input.complexity === "inhomogeneous" || input.complexity === "variableThicknessAverage" ? input.complexity : "homogeneous";
  const allowedRequirements: EnergyAssemblyRequirementType[] = ["externalWall", "flatRoof", "heatedAtticBoundary", "atticFloor", "arcadeFloor", "lowerFloorUnheated", "wallToUnheated", "adjacentHeatedWall", "plinthWall", "groundWall", "groundFloor", "custom"];
  const requirementType = allowedRequirements.includes(input.requirementType as EnergyAssemblyRequirementType) ? input.requirementType as EnergyAssemblyRequirementType : defaults.requirementType;
  const correctionBase = createDefaultAssemblyCorrectionSettings();
  return {
    ...base,
    ...input,
    id: input.id || base.id,
    category,
    name: input.name || base.name,
    heatFlowDirection,
    boundaryMode,
    calculationMode,
    complexity,
    requirementType,
    surfaceResistanceMode: input.surfaceResistanceMode === "custom" ? "custom" : "ruleSetDefault",
    corrections: {
      ...correctionBase,
      ...(input.corrections || {}),
      airVoid: { ...correctionBase.airVoid, ...(input.corrections?.airVoid || {}) },
      mechanicalFastener: { ...correctionBase.mechanicalFastener, ...(input.corrections?.mechanicalFastener || {}) },
    },
    layers: Array.isArray(input.layers) && input.layers.length ? input.layers.map(normalizeSurveyAssemblyLayer) : base.layers,
    note: input.note || "",
    createdAt: input.createdAt || base.createdAt,
    updatedAt: input.updatedAt || base.updatedAt,
  };
}

export function getAssemblyTotalThicknessCm(assembly?: SurveyConstructionAssembly | null) {
  return Number((assembly?.layers || []).reduce((sum, layer) => sum + (Number(layer.thicknessCm) || 0), 0).toFixed(2));
}

export function getRoomUsableHeight(room?: SurveyRoom | null) {
  if (!room) return 0;
  const drop = room.suspendedCeilingEnabled ? Math.max(0, Number(room.suspendedCeilingDropMeters) || 0) : 0;
  return Number(Math.max(0, room.height - drop).toFixed(2));
}

export function getNextPhotoSerial(points: SurveyPhotoPoint[]) {
  const next = points.reduce((maximum, point) => {
    const match = point.serial.match(/(\d+)$/);
    return Math.max(maximum, match ? Number(match[1]) : 0);
  }, 0) + 1;
  return `F-${String(next).padStart(3, "0")}`;
}

export function createSurveyPhotoPoint(input: {
  points: SurveyPhotoPoint[];
  levelId: string;
  roomId: string;
  xPercent: number;
  yPercent: number;
}): SurveyPhotoPoint {
  const now = new Date().toISOString();
  const serial = getNextPhotoSerial(input.points);
  return {
    id: createEnergyModelId("photo-point"),
    serial,
    levelId: input.levelId,
    roomId: input.roomId,
    xPercent: input.xPercent,
    yPercent: input.yPercent,
    title: `Energetikai fotó ${serial}`,
    note: "",
    purpose: "documentation",
    certificateCategory: "building",
    includeInCertificate: false,
    capturedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export function createMechanicalDevice(input: {
  levelId: string;
  roomId: string;
  kind: SurveyMechanicalKind;
  xRatio: number;
  yRatio: number;
}): SurveyMechanicalDevice {
  const now = new Date().toISOString();
  return {
    id: createEnergyModelId("mechanical-device"),
    levelId: input.levelId,
    roomId: input.roomId,
    kind: input.kind,
    name: surveyMechanicalKindLabels[input.kind],
    xRatio: Math.min(0.95, Math.max(0.05, input.xRatio)),
    yRatio: Math.min(0.95, Math.max(0.05, input.yRatio)),
    manufacturer: "",
    model: "",
    capacity: "",
    note: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function photoPointToPlanMarker(point: SurveyPhotoPoint, roomName?: string): PlanIssueMarker {
  return {
    id: point.id,
    markerKind: "photo",
    sourceType: "image",
    photoId: point.id,
    photoSerial: point.serial,
    photoName: point.fileName || point.title,
    photoNote: point.note,
    photoPreviewUrl: point.dataUrl,
    serial: point.serial,
    title: point.title,
    note: [roomName, point.note].filter(Boolean).join(" · "),
    status: point.purpose === "issue" ? "Hibafotó" : "Dokumentáció",
    issueSeverity: undefined,
    discipline: "architecture",
    xPercent: point.xPercent,
    yPercent: point.yPercent,
    showLetter: true,
    paperSize: "A4",
    orientation: "landscape",
  };
}
