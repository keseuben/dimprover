import {
  createDefaultEnergyProjectSettings,
  normalizeEnergyProjectSettings,
  type EnergyProjectSettings,
} from "@/components/energy/domain/energyProjectTypes";
import {
  createDefaultEnergyZoneWorkspace,
  normalizeEnergyZoneWorkspace,
  type EnergyZoneWorkspace,
} from "@/components/energy/domain/energyZoneTypes";
import {
  createDefaultEnergyOpeningWorkspace,
  normalizeEnergyOpeningWorkspace,
  type EnergyOpeningWorkspace,
} from "@/components/energy/domain/energyOpeningTypes";
import {
  createDefaultEnergyDemandWorkspace,
  normalizeEnergyDemandWorkspace,
  type EnergyDemandWorkspace,
} from "@/components/energy/domain/energyDemandTypes";
import {
  createDefaultEnergyFieldWorkflowState,
  normalizeEnergyFieldWorkflowState,
  type EnergyFieldWorkflowState,
} from "@/components/energy/domain/energyFieldWorkflowTypes";
import {
  createDefaultEnergyRenovationWorkspace,
  normalizeEnergyRenovationWorkspace,
  type EnergyRenovationWorkspace,
} from "@/components/energy/domain/energyRenovationTypes";
import {
  createDefaultEnergyRenewableWorkspace,
  normalizeEnergyRenewableWorkspace,
  type EnergyRenewableWorkspace,
} from "@/components/energy/domain/energyRenewableTypes";
import {
  createDefaultWinWattTrialWorkspace,
  normalizeWinWattTrialWorkspace,
  type WinWattTrialWorkspace,
} from "@/components/energy/domain/energyWinWattTrialTypes";
import {
  createDefaultPropertySurveyWorkTimerWorkspace,
  normalizePropertySurveyWorkTimerWorkspace,
  type PropertySurveyWorkTimerWorkspace,
} from "@/components/property-survey/propertySurveyWorkTimer";
import {
  createDefaultMaterialWorkspace,
  normalizeMaterialWorkspace,
  type MaterialWorkspaceState,
} from "@/components/materials/domain/materialWorkspaceTypes";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import {
  createSurveyPlanWorkspace,
  normalizeSurveyPlanWorkspace,
  type PropertySurveyPlanDocumentWorkspace,
  type PropertySurveySourceMode,
} from "@/components/property-survey/propertySurveyPlanDocumentTypes";
import type { PropertySurveyIssue } from "@/components/property-survey/propertySurveyIssueTypes";
import {
  createDefaultThermalBoundary,
  normalizeSurveyConstructionAssembly,
  type SurveyConstructionAssembly,
  type SurveyMechanicalDevice,
  type SurveyPhotoPoint,
  type SurveyThermalBoundarySettings,
} from "@/components/property-survey/propertySurveyEnergyModel";
import {
  createDefaultPlanSheet,
  createGroundLevel,
  ensureWallSegmentsForRooms,
  reconcileDynamicWallModelForRooms,
  type SurveyBuildingLevel,
  type SurveyPlanSheetSettings,
  type SurveyWallOpening,
  type SurveyWallSegment,
} from "@/components/property-survey/propertySurveyBuildingModel";

import {
  createDefaultIndustrialSettings,
  createIndustrialBuildingContour,
  createIndustrialMarkup,
  createSurveyPillar,
  type SurveyIndustrialBackground,
  type SurveyIndustrialBuildingContour,
  type SurveyIndustrialMarkup,
  type SurveyIndustrialSettings,
  type SurveyPillar,
} from "@/components/property-survey/propertySurveyIndustrialModel";
import {
  normalizeSurveySectionLines,
  type SurveySectionLine,
} from "@/components/property-survey/propertySurveySectionModel";
export type PropertySurveyMode = "Energetikai felmérés" | "Épület- és csarnokfelmérés" | "Térbeton- és burkolatfelmérés" | "Felújítási felmérés" | "Műszaki állapotfelmérés" | "Gyors alaprajz";
export type PropertySurveyStartMode = "blank" | "sample" | "lidar" | "import";

export type PropertySurveyDraft = {
  surveyName: string;
  surveyMode: PropertySurveyMode;
  energyProjectSettings: EnergyProjectSettings;
  energyZoneWorkspace: EnergyZoneWorkspace;
  energyOpeningWorkspace: EnergyOpeningWorkspace;
  energyDemandWorkspace: EnergyDemandWorkspace;
  energyFieldWorkflow: EnergyFieldWorkflowState;
  energyRenovationWorkspace: EnergyRenovationWorkspace;
  energyRenewableWorkspace: EnergyRenewableWorkspace;
  energyWinWattTrialWorkspace: WinWattTrialWorkspace;
  workTimerWorkspace: PropertySurveyWorkTimerWorkspace;
  materialWorkspace: MaterialWorkspaceState;
  planDocumentWorkspace: PropertySurveyPlanDocumentWorkspace;
  property: {
    address: string;
    postalCode: string;
    settlement: string;
    street: string;
    houseNumber: string;
    parcelNumber: string;
    propertyType: string;
    constructionYear: string;
    floorCount: string;
    heatedArea: string;
    surveyDate: string;
    ownerReference: string;
  };
  rooms: SurveyRoom[];
  levels: SurveyBuildingLevel[];
  activeLevelId: string;
  planSheet: SurveyPlanSheetSettings;
  wallSegments: SurveyWallSegment[];
  wallOpenings: SurveyWallOpening[];
  thermalBoundaries: SurveyThermalBoundarySettings[];
  assemblies: SurveyConstructionAssembly[];
  mechanicalDevices: SurveyMechanicalDevice[];
  photoPoints: SurveyPhotoPoint[];
  industrialSettings: SurveyIndustrialSettings;
  industrialBackground: SurveyIndustrialBackground | null;
  industrialBuildingContours: SurveyIndustrialBuildingContour[];
  pillars: SurveyPillar[];
  industrialMarkups: SurveyIndustrialMarkup[];
  sectionLines: SurveySectionLine[];
  northAngle: number;
  orientationSource: string;
  exportDetails: {
    companyName: string;
    engineerName: string;
    chamberNumber: string;
    signaturePlace: string;
    signatureDate: string;
    coverNote: string;
  };
  structures: {
    externalWallType: string;
    roofType: string;
    floorType: string;
    basementBoundary: string;
    dataSource: string;
    confidence: string;
  };
  openings: {
    defaultWindowType: string;
    glazing: string;
    frame: string;
    uValue: string;
    shading: string;
  };
  mechanical: {
    heating: string;
    heatGenerator: string;
    heatEmission: string;
    hotWater: string;
    ventilation: string;
    cooling: string;
    renewable: string;
  };
  photoNames: string[];
  siteNote: string;
  updatedAt: string;
};

export type PropertySurveyProject = {
  id: string;
  code: string;
  name: string;
  location: string;
  clientName: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type PropertySurveyRecord = {
  id: string;
  projectId: string;
  name: string;
  surveyMode: PropertySurveyMode;
  startMode: PropertySurveyStartMode;
  status: "draft" | "in_progress" | "completed";
  draft: PropertySurveyDraft;
  issues: PropertySurveyIssue[];
  createdAt: string;
  updatedAt: string;
};

export type PropertySurveyWorkspace = {
  version: 1;
  projects: PropertySurveyProject[];
  surveys: PropertySurveyRecord[];
  activeProjectId: string | null;
  activeSurveyId: string | null;
  updatedAt: string;
};

export const PROPERTY_SURVEY_WORKSPACE_KEY = "dimpro-property-survey-workspace-v1";
export const LEGACY_SURVEY_KEY = "dimpro-property-survey-mvp-v1";
export const LEGACY_ISSUE_KEY = "dimpro-property-survey-issues-v1";

const sampleRooms: SurveyRoom[] = [
  { id: "room-living", levelId: "level-ground", name: "01 Nappali", function: "Nappali", area: 28.4, height: 2.7, x: 90, y: 90, width: 320, depth: 190, heated: true, externalWallType: "38 cm tömör tégla", floorType: "Talajon fekvő padló", ceilingType: "Fűtött tér feletti födém", windowCount: 2, windowType: "Műanyag, 3 rétegű", orientation: "Dél", note: "" },
  { id: "room-kitchen", levelId: "level-ground", name: "02 Konyha", function: "Konyha", area: 12.1, height: 2.7, x: 410, y: 90, width: 170, depth: 190, heated: true, externalWallType: "38 cm tömör tégla", floorType: "Talajon fekvő padló", ceilingType: "Fűtött tér feletti födém", windowCount: 1, windowType: "Műanyag, 3 rétegű", orientation: "Kelet", note: "" },
  { id: "room-bedroom", levelId: "level-ground", name: "03 Szoba", function: "Hálószoba", area: 16.3, height: 2.7, x: 580, y: 90, width: 230, depth: 190, heated: true, externalWallType: "38 cm tömör tégla", floorType: "Talajon fekvő padló", ceilingType: "Fűtött tér feletti födém", windowCount: 1, windowType: "Műanyag, 3 rétegű", orientation: "Észak", note: "" },
  { id: "room-hall", levelId: "level-ground", name: "04 Előtér", function: "Közlekedő", area: 8.5, height: 2.7, x: 250, y: 280, width: 160, depth: 135, heated: true, externalWallType: "Belső határolás", floorType: "Talajon fekvő padló", ceilingType: "Fűtött tér feletti födém", windowCount: 0, windowType: "", orientation: "Belső", note: "" },
  { id: "room-bath", levelId: "level-ground", name: "05 Fürdő", function: "Fürdő", area: 6.2, height: 2.7, x: 410, y: 280, width: 180, depth: 135, heated: true, externalWallType: "38 cm tömör tégla", floorType: "Talajon fekvő padló", ceilingType: "Fűtött tér feletti födém", windowCount: 1, windowType: "Műanyag, 3 rétegű", orientation: "Nyugat", note: "" },
  { id: "room-utility", levelId: "level-ground", name: "06 Gépészet", function: "Gépészeti helyiség", area: 7.1, height: 2.7, x: 590, y: 280, width: 220, depth: 135, heated: false, externalWallType: "38 cm tömör tégla", floorType: "Talajon fekvő padló", ceilingType: "Padlásfödém", windowCount: 1, windowType: "Fa, 2 rétegű", orientation: "Észak", note: "Fűtetlen helyiségként ellenőrizendő." },
  { id: "room-stair", levelId: "level-ground", name: "07 Lépcső / tároló", function: "Közlekedő", area: 6, height: 2.55, x: 250, y: 415, width: 340, depth: 100, heated: true, externalWallType: "Vegyes határolás", floorType: "Talajon fekvő padló", ceilingType: "Padlásfödém", windowCount: 0, windowType: "", orientation: "Belső", note: "" },
];

export function composePropertySurveyAddress(property: { postalCode?: string; settlement?: string; street?: string; houseNumber?: string }) {
  const locality = [property.postalCode?.trim(), property.settlement?.trim()].filter(Boolean).join(" ");
  const streetAddress = [property.street?.trim(), property.houseNumber?.trim()].filter(Boolean).join(" ");
  return [locality, streetAddress].filter(Boolean).join(", ");
}

function parseLegacyPropertySurveyAddress(address: string, settlementHint = "") {
  const normalized = (address || "").replace(/\s+/g, " ").trim();
  let postalCode = "";
  let settlement = settlementHint.trim();
  let remainder = normalized;
  const localityMatch = normalized.match(/^(\d{4})\s+([^,]+?)(?:,|\s{2,})(.*)$/);
  if (localityMatch) {
    postalCode = localityMatch[1];
    settlement = localityMatch[2].trim();
    remainder = localityMatch[3].trim();
  } else {
    const postalOnlyMatch = normalized.match(/^(\d{4})\s+(.*)$/);
    if (postalOnlyMatch) {
      postalCode = postalOnlyMatch[1];
      remainder = postalOnlyMatch[2].trim();
      if (settlement && remainder.toLocaleLowerCase("hu-HU").startsWith(settlement.toLocaleLowerCase("hu-HU"))) {
        remainder = remainder.slice(settlement.length).replace(/^,?\s*/, "");
      }
    } else if (settlement && remainder.toLocaleLowerCase("hu-HU").startsWith(settlement.toLocaleLowerCase("hu-HU"))) {
      remainder = remainder.slice(settlement.length).replace(/^,?\s*/, "");
    }
  }
  const houseMatch = remainder.match(/^(.+?)\s+(\d+[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]?(?:[./-](?:\d+[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]?|[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]))?\.?)$/);
  return {
    postalCode,
    settlement,
    street: houseMatch ? houseMatch[1].trim() : remainder,
    houseNumber: houseMatch ? houseMatch[2].trim() : "",
  };
}

export function createWorkspaceId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createBlankSurveyDraft(name = "Új ingatlanfelmérés", mode: PropertySurveyMode = "Energetikai felmérés"): PropertySurveyDraft {
  const now = new Date().toISOString();
  return {
    surveyName: name,
    surveyMode: mode,
    energyProjectSettings: createDefaultEnergyProjectSettings({ enabled: mode === "Energetikai felmérés" || mode === "Felújítási felmérés" }),
    energyZoneWorkspace: createDefaultEnergyZoneWorkspace(),
    energyOpeningWorkspace: createDefaultEnergyOpeningWorkspace(),
    energyDemandWorkspace: createDefaultEnergyDemandWorkspace(),
    energyFieldWorkflow: createDefaultEnergyFieldWorkflowState(),
    energyRenovationWorkspace: createDefaultEnergyRenovationWorkspace(),
    energyRenewableWorkspace: createDefaultEnergyRenewableWorkspace(),
    energyWinWattTrialWorkspace: createDefaultWinWattTrialWorkspace(),
    workTimerWorkspace: createDefaultPropertySurveyWorkTimerWorkspace(now),
    materialWorkspace: createDefaultMaterialWorkspace(),
    planDocumentWorkspace: createSurveyPlanWorkspace("site"),
    property: {
      address: "",
      postalCode: "",
      settlement: "",
      street: "",
      houseNumber: "",
      parcelNumber: "",
      propertyType: "Családi ház",
      constructionYear: "",
      floorCount: "1",
      heatedArea: "",
      surveyDate: now.slice(0, 10),
      ownerReference: "",
    },
    rooms: [],
    levels: [createGroundLevel()],
    activeLevelId: "level-ground",
    planSheet: createDefaultPlanSheet(),
    wallSegments: [],
    wallOpenings: [],
    thermalBoundaries: [createDefaultThermalBoundary("level-ground")],
    assemblies: [],
    mechanicalDevices: [],
    photoPoints: [],
    industrialSettings: createDefaultIndustrialSettings(),
    industrialBackground: null,
    industrialBuildingContours: [],
    pillars: [],
    industrialMarkups: [],
    sectionLines: [],
    northAngle: 0,
    orientationSource: "E-közmű / HRSZ térkép",
    exportDetails: {
      companyName: "",
      engineerName: "",
      chamberNumber: "",
      signaturePlace: "",
      signatureDate: now.slice(0, 10),
      coverNote: "",
    },
    structures: {
      externalWallType: "",
      roofType: "",
      floorType: "",
      basementBoundary: "",
      dataSource: "Helyszíni szemrevételezés",
      confidence: "Közepes",
    },
    openings: {
      defaultWindowType: "",
      glazing: "",
      frame: "",
      uValue: "",
      shading: "Nincs",
    },
    mechanical: {
      heating: "",
      heatGenerator: "",
      heatEmission: "",
      hotWater: "",
      ventilation: "",
      cooling: "",
      renewable: "",
    },
    photoNames: [],
    siteNote: "",
    updatedAt: now,
  };
}

export function createIndustrialSampleSurveyDraft(name = "Csarnok- és térbetonfelmérés", mode: PropertySurveyMode = "Épület- és csarnokfelmérés"): PropertySurveyDraft {
  const base = createBlankSurveyDraft(name, mode);
  const room12: SurveyRoom = { id: "hall-12", levelId: "level-ground", name: "12. épület", function: "Tartástér", area: 1057.5, height: 2.9, x: 90, y: 78, width: 330, depth: 430, lengthMeters: 25.3, widthMeters: 41.8, heated: false, externalWallType: "Csarnok külső falszerkezet", floorType: "Térbeton padozat", ceilingType: "Csarnok tetőszerkezet", windowCount: 0, windowType: "", orientation: "Dél", note: "Demjén tanya 12. épület mintája." };
  const room11: SurveyRoom = { id: "hall-11", levelId: "level-ground", name: "11. épület", function: "Tartástér", area: 1057.5, height: 2.9, x: 480, y: 78, width: 330, depth: 430, lengthMeters: 25.3, widthMeters: 41.8, heated: false, externalWallType: "Csarnok külső falszerkezet", floorType: "Térbeton padozat", ceilingType: "Csarnok tetőszerkezet", windowCount: 0, windowType: "", orientation: "Dél", note: "Demjén tanya 11. épület mintája." };
  const rooms = [room12, room11];
  const settings = { ...createDefaultIndustrialSettings(), planWidthMeters: 55, planHeightMeters: 42, gridSpacingXMeters: 3, gridSpacingYMeters: 3 };
  let industrialBuildingContours: SurveyIndustrialBuildingContour[] = [];
  industrialBuildingContours = [
    createIndustrialBuildingContour({ levelId: "level-ground", title: "12. épület", contours: industrialBuildingContours, points: [{ xMeters: 1.3, yMeters: 0.6 }, { xMeters: 26.6, yMeters: 0.6 }, { xMeters: 26.6, yMeters: 41.4 }, { xMeters: 1.3, yMeters: 41.4 }] }),
  ];
  industrialBuildingContours = [...industrialBuildingContours, createIndustrialBuildingContour({ levelId: "level-ground", title: "11. épület", contours: industrialBuildingContours, points: [{ xMeters: 28.4, yMeters: 0.6 }, { xMeters: 53.7, yMeters: 0.6 }, { xMeters: 53.7, yMeters: 41.4 }, { xMeters: 28.4, yMeters: 41.4 }] })];
  let pillars = [] as ReturnType<typeof createSurveyPillar>[];
  for (const baseX of [3.5, 30.5]) {
    for (const xOffset of [5, 10, 15, 20]) {
      for (const yMeters of [6, 12, 18, 24, 30, 36]) {
        const pillar = createSurveyPillar({ levelId: "level-ground", xMeters: baseX + xOffset, yMeters, pillars });
        pillars = [...pillars, { ...pillar, label: `P${pillars.length + 1}` }];
      }
    }
  }
  let industrialMarkups = [] as SurveyIndustrialMarkup[];
  const repairPolygons = [
    [{ xMeters: 1.5, yMeters: 1.5 }, { xMeters: 8.4, yMeters: 1.5 }, { xMeters: 8.4, yMeters: 5 }, { xMeters: 1.5, yMeters: 5 }],
    [{ xMeters: 1.5, yMeters: 20 }, { xMeters: 9.5, yMeters: 20 }, { xMeters: 9.5, yMeters: 36 }, { xMeters: 1.5, yMeters: 36 }],
    [{ xMeters: 38, yMeters: 1.5 }, { xMeters: 53.5, yMeters: 1.5 }, { xMeters: 53.5, yMeters: 21 }, { xMeters: 46, yMeters: 21 }, { xMeters: 46, yMeters: 8 }, { xMeters: 38, yMeters: 8 }],
  ];
  for (const points of repairPolygons) industrialMarkups = [...industrialMarkups, createIndustrialMarkup({ levelId: "level-ground", kind: "repairArea", points, markups: industrialMarkups })];
  industrialMarkups = [...industrialMarkups, createIndustrialMarkup({ levelId: "level-ground", kind: "crack", points: [{ xMeters: 4, yMeters: 39 }, { xMeters: 9, yMeters: 31 }, { xMeters: 13, yMeters: 22 }, { xMeters: 18, yMeters: 12 }, { xMeters: 22, yMeters: 3 }], markups: industrialMarkups })];
  return {
    ...base,
    rooms,
    industrialSettings: settings,
    industrialBuildingContours,
    pillars,
    industrialMarkups,
    wallSegments: ensureWallSegmentsForRooms(rooms, [], "Csarnok külső falszerkezet"),
    property: { ...base.property, propertyType: "Ipari / mezőgazdasági csarnok" },
    siteNote: "A minta a Demjén tanya 11. és 12. épület felmérési munkafolyamatát szemlélteti.",
  };
}

export function createSampleSurveyDraft(name = "Családi ház energetikai felmérése"): PropertySurveyDraft {
  const base = createBlankSurveyDraft(name, "Energetikai felmérés");
  const rooms = sampleRooms.map((room) => ({ ...room, levelId: "level-ground" }));
  return {
    ...base,
    energyProjectSettings: createDefaultEnergyProjectSettings({
      ...base.energyProjectSettings,
      enabled: true,
      constructionYear: 1985,
      buildingSymbol: "familyHouse",
      calculationPurpose: "existingAssessment",
    }),
    energyZoneWorkspace: createDefaultEnergyZoneWorkspace(rooms),
    rooms,
    wallSegments: ensureWallSegmentsForRooms(rooms, [], "38 cm tömör tégla, szigeteletlen"),
    northAngle: 12,
    structures: {
      externalWallType: "38 cm tömör tégla, szigeteletlen",
      roofType: "Magastető, padlásfödémmel",
      floorType: "Talajon fekvő padló",
      basementBoundary: "Nincs pince",
      dataSource: "Helyszíni szemrevételezés",
      confidence: "Közepes",
    },
    openings: {
      defaultWindowType: "Műanyag nyílászáró",
      glazing: "3 rétegű hőszigetelő üveg",
      frame: "PVC",
      uValue: "0.90",
      shading: "Redőny",
    },
    mechanical: {
      heating: "Központi fűtés",
      heatGenerator: "Kondenzációs gázkazán",
      heatEmission: "Radiátor",
      hotWater: "Kazánról, indirekt tárolóval",
      ventilation: "Természetes szellőzés",
      cooling: "Split klíma",
      renewable: "Nincs rögzítve",
    },
  };
}

export function normalizePropertySurveyDraft(input: PropertySurveyDraft, projectReference = "local"): PropertySurveyDraft {
  const ground = createGroundLevel();
  const levels = Array.isArray(input.levels) && input.levels.length ? input.levels : [ground];
  const activeLevelId = levels.some((level) => level.id === input.activeLevelId) ? input.activeLevelId : (levels.find((level) => level.kind === "ground")?.id || levels[0].id);
  const rooms = Array.isArray(input.rooms) ? input.rooms.map((room) => ({ ...room, levelId: room.levelId || activeLevelId })) : [];
  const inputProperty = input.property || createBlankSurveyDraft().property;
  const legacyAddress = parseLegacyPropertySurveyAddress(inputProperty.address || "", inputProperty.settlement || "");
  const property = {
    address: "",
    postalCode: inputProperty.postalCode || legacyAddress.postalCode,
    settlement: inputProperty.settlement || legacyAddress.settlement,
    street: inputProperty.street || legacyAddress.street,
    houseNumber: inputProperty.houseNumber || legacyAddress.houseNumber,
    parcelNumber: inputProperty.parcelNumber || "",
    propertyType: inputProperty.propertyType || "Családi ház",
    constructionYear: inputProperty.constructionYear || "",
    floorCount: inputProperty.floorCount || String(levels.length),
    heatedArea: inputProperty.heatedArea || "",
    surveyDate: inputProperty.surveyDate || new Date().toISOString().slice(0, 10),
    ownerReference: inputProperty.ownerReference || "",
  };
  property.address = composePropertySurveyAddress(property) || inputProperty.address || "";
  const energyProjectSettings = normalizeEnergyProjectSettings(input.energyProjectSettings || {
    enabled: input.surveyMode === "Energetikai felmérés" || input.surveyMode === "Felújítási felmérés",
    constructionYear: Number(property.constructionYear) || undefined,
    buildingSymbol: property.propertyType === "Családi ház" ? "familyHouse" : "otherBuilding",
  });
  const energyZoneWorkspace = normalizeEnergyZoneWorkspace(input.energyZoneWorkspace, rooms);
  const materialWorkspace = normalizeMaterialWorkspace(input.materialWorkspace, projectReference);
  const planDocumentWorkspace = normalizeSurveyPlanWorkspace(input.planDocumentWorkspace);
  materialWorkspace.projectCatalog = { ...materialWorkspace.projectCatalog, projectId: projectReference, id: materialWorkspace.projectCatalog.id === "catalog-project-local" ? `catalog-project-${projectReference}` : materialWorkspace.projectCatalog.id };
  const planSheet = input.planSheet || createDefaultPlanSheet();
  const thermalBoundaries = levels.map((level) => {
    const existing = Array.isArray(input.thermalBoundaries) ? input.thermalBoundaries.find((item) => item.levelId === level.id) : null;
    return existing ? { ...createDefaultThermalBoundary(level.id), ...existing, levelId: level.id } : createDefaultThermalBoundary(level.id);
  });
  const assemblies = Array.isArray(input.assemblies) ? input.assemblies.map((assembly) => normalizeSurveyConstructionAssembly(assembly)) : [];
  const industrialSettings = { ...createDefaultIndustrialSettings(), ...(input.industrialSettings || {}) };
  const rawIndustrialBackground = input.industrialBackground && typeof input.industrialBackground === "object" ? input.industrialBackground : null;
  const industrialBackground = rawIndustrialBackground ? (() => {
    const legacyPage = {
      pageNumber: 1,
      dataUrl: rawIndustrialBackground.dataUrl || "",
      widthPixels: Number(rawIndustrialBackground.sourceWidthPixels) || 1,
      heightPixels: Number(rawIndustrialBackground.sourceHeightPixels) || 1,
    };
    const pages = Array.isArray(rawIndustrialBackground.pages) && rawIndustrialBackground.pages.length ? rawIndustrialBackground.pages : [legacyPage];
    const activePageIndex = Math.min(pages.length - 1, Math.max(0, Number(rawIndustrialBackground.activePageIndex) || 0));
    const activePage = pages[activePageIndex] || pages[0];
    return {
      ...rawIndustrialBackground,
      pages,
      activePageIndex,
      pageCount: pages.length,
      sourcePageCount: Math.max(pages.length, Number(rawIndustrialBackground.sourcePageCount) || pages.length),
      dataUrl: activePage.dataUrl,
      sourceWidthPixels: activePage.widthPixels,
      sourceHeightPixels: activePage.heightPixels,
      offsetXMeters: Number(rawIndustrialBackground.offsetXMeters) || 0,
      offsetYMeters: Number(rawIndustrialBackground.offsetYMeters) || 0,
      rotationDegrees: Number(rawIndustrialBackground.rotationDegrees) || 0,
      scalePercent: Math.max(10, Number(rawIndustrialBackground.scalePercent) || 100),
      calibrationPoints: Array.isArray(rawIndustrialBackground.calibrationPoints) ? rawIndustrialBackground.calibrationPoints : [],
    };
  })() : null;
  const industrialBuildingContours = Array.isArray(input.industrialBuildingContours) ? input.industrialBuildingContours : [];
  const pillars = Array.isArray(input.pillars) ? input.pillars : [];
  const industrialMarkups = Array.isArray(input.industrialMarkups) ? input.industrialMarkups.map((markup) => ({
    ...markup,
    crackSeverity: markup.crackSeverity || "minor",
    crackStatus: markup.crackStatus || "observed",
    crackWidthMillimeters: Number(markup.crackWidthMillimeters) || (markup.kind === "crack" ? 1 : 0),
    crackDepthMillimeters: Number(markup.crackDepthMillimeters) || 0,
    locationDescription: markup.locationDescription || "",
    causeAssessment: markup.causeAssessment || "",
    repairMethod: markup.repairMethod || "",
    requiresStructuralReview: Boolean(markup.requiresStructuralReview),
    recordedAt: markup.recordedAt || String(markup.createdAt || new Date().toISOString()).slice(0, 10),
  })) : [];
  const mechanicalDevices = Array.isArray(input.mechanicalDevices) ? input.mechanicalDevices.filter((item) => rooms.some((room) => room.id === item.roomId)) : [];
  const energyDemandWorkspace = normalizeEnergyDemandWorkspace(input.energyDemandWorkspace, energyZoneWorkspace, null, mechanicalDevices);
  const energyRenovationWorkspace = normalizeEnergyRenovationWorkspace(input.energyRenovationWorkspace);
  const energyFieldWorkflow = normalizeEnergyFieldWorkflowState({ ...input.energyFieldWorkflow, activeScenarioId: energyRenovationWorkspace.scenarios.some((scenario) => scenario.id === input.energyFieldWorkflow?.activeScenarioId) ? input.energyFieldWorkflow?.activeScenarioId : energyRenovationWorkspace.activeScenarioId });
  const energyRenewableWorkspace = normalizeEnergyRenewableWorkspace(input.energyRenewableWorkspace);
  const energyWinWattTrialWorkspace = normalizeWinWattTrialWorkspace(input.energyWinWattTrialWorkspace);
  const workTimerWorkspace = normalizePropertySurveyWorkTimerWorkspace(input.workTimerWorkspace);
  const sectionLines = normalizeSurveySectionLines(input.sectionLines).filter((line) => levels.some((level) => level.id === line.levelId));
  const exportDetails = {
    companyName: input.exportDetails?.companyName || "",
    engineerName: input.exportDetails?.engineerName || "",
    chamberNumber: input.exportDetails?.chamberNumber || "",
    signaturePlace: input.exportDetails?.signaturePlace || property.settlement || "",
    signatureDate: input.exportDetails?.signatureDate || property.surveyDate || new Date().toISOString().slice(0, 10),
    coverNote: input.exportDetails?.coverNote || "",
  };
  const legacyPhotoNames = Array.isArray(input.photoNames) ? input.photoNames : [];
  const rawPhotoPoints: Array<Partial<SurveyPhotoPoint>> = Array.isArray(input.photoPoints) ? input.photoPoints : legacyPhotoNames.map((fileName, index) => ({
    id: `legacy-photo-${index + 1}`,
    serial: `F-${String(index + 1).padStart(3, "0")}`,
    levelId: activeLevelId,
    roomId: rooms[0]?.id || "",
    xPercent: 50,
    yPercent: 50,
    title: `Helyszíni fotó F-${String(index + 1).padStart(3, "0")}`,
    note: "Korábbi verzióból átemelt, alaprajzi pozíció ellenőrizendő.",
    fileName,
    capturedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  const photoPoints: SurveyPhotoPoint[] = rawPhotoPoints.map((point, index) => ({
    ...point,
    id: point.id || `photo-${index + 1}`,
    serial: point.serial || `F-${String(index + 1).padStart(3, "0")}`,
    levelId: point.levelId || activeLevelId,
    roomId: point.roomId || "",
    xPercent: Number.isFinite(Number(point.xPercent)) ? Number(point.xPercent) : 50,
    yPercent: Number.isFinite(Number(point.yPercent)) ? Number(point.yPercent) : 50,
    title: point.title || `Energetikai fotó F-${String(index + 1).padStart(3, "0")}`,
    note: point.note || "",
    purpose: point.purpose === "issue" ? "issue" : "documentation",
    certificateCategory: point.certificateCategory === "heatGenerator" || point.certificateCategory === "heatEmitter" || point.certificateCategory === "other"
      ? point.certificateCategory
      : String(point.certificateCategory) === "systems"
        ? "heatGenerator"
        : "building",
    includeInCertificate: point.purpose === "issue" ? false : point.includeInCertificate === true,
    mimeType: point.mimeType || (point.dataUrl?.match(/^data:([^;]+);/)?.[1] || undefined),
    originalSizeBytes: Number(point.originalSizeBytes) || undefined,
    optimizedSizeBytes: Number(point.optimizedSizeBytes) || undefined,
    pixelWidth: Number(point.pixelWidth) || undefined,
    pixelHeight: Number(point.pixelHeight) || undefined,
    capturedAt: point.capturedAt || new Date().toISOString(),
    createdAt: point.createdAt || new Date().toISOString(),
    updatedAt: point.updatedAt || new Date().toISOString(),
  }));
  let wallSegments = ensureWallSegmentsForRooms(rooms, input.wallSegments, input.structures?.externalWallType || "");
  let wallOpenings = Array.isArray(input.wallOpenings) ? input.wallOpenings.filter((opening) => wallSegments.some((segment) => segment.id === opening.wallSegmentId)) : [];
  for (const level of levels) {
    const levelRooms = rooms.filter((room) => (room.levelId || activeLevelId) === level.id);
    const reconciled = reconcileDynamicWallModelForRooms(levelRooms, wallSegments, wallOpenings, input.structures?.externalWallType || "");
    wallSegments = reconciled.wallSegments;
    wallOpenings = reconciled.wallOpenings;
  }
  const energyOpeningWorkspace = normalizeEnergyOpeningWorkspace(input.energyOpeningWorkspace, wallOpenings);
  return {
    ...input,
    property,
    energyProjectSettings,
    energyZoneWorkspace,
    energyOpeningWorkspace,
    energyDemandWorkspace,
    energyFieldWorkflow,
    energyRenovationWorkspace,
    energyRenewableWorkspace,
    energyWinWattTrialWorkspace,
    workTimerWorkspace,
    materialWorkspace,
    planDocumentWorkspace,
    rooms,
    levels,
    activeLevelId,
    planSheet: {
      paperSize: planSheet.paperSize || "A3",
      orientation: planSheet.orientation || "landscape",
      scaleMode: planSheet.scaleMode || "auto",
      scaleDenominator: Number(planSheet.scaleDenominator) || 50,
    },
    wallSegments,
    wallOpenings,
    thermalBoundaries,
    assemblies,
    mechanicalDevices,
    photoPoints,
    industrialSettings,
    industrialBackground,
    industrialBuildingContours,
    pillars,
    industrialMarkups,
    sectionLines,
    exportDetails,
    photoNames: photoPoints.map((point) => point.fileName).filter((value): value is string => Boolean(value)),
  };
}

export function createEmptyPropertySurveyWorkspace(): PropertySurveyWorkspace {
  return {
    version: 1,
    projects: [],
    surveys: [],
    activeProjectId: null,
    activeSurveyId: null,
    updatedAt: new Date().toISOString(),
  };
}

export function createPropertySurveyProject(input: { name: string; code?: string; location?: string; clientName?: string; note?: string }): PropertySurveyProject {
  const now = new Date().toISOString();
  return {
    id: createWorkspaceId("property-project"),
    code: input.code?.trim() || `PROJ-${new Date().getFullYear()}-${Math.random().toString(10).slice(2, 6)}`,
    name: input.name.trim(),
    location: input.location?.trim() || "",
    clientName: input.clientName?.trim() || "",
    note: input.note?.trim() || "",
    createdAt: now,
    updatedAt: now,
  };
}

export function createPropertySurveyRecord(input: { projectId: string; name: string; surveyMode: PropertySurveyMode; startMode: PropertySurveyStartMode; sourceMode?: PropertySurveySourceMode }): PropertySurveyRecord {
  const now = new Date().toISOString();
  const industrialMode = input.surveyMode === "Épület- és csarnokfelmérés" || input.surveyMode === "Térbeton- és burkolatfelmérés";
  const draft = input.startMode === "sample"
    ? (industrialMode ? createIndustrialSampleSurveyDraft(input.name, input.surveyMode) : createSampleSurveyDraft(input.name))
    : createBlankSurveyDraft(input.name, input.surveyMode);
  draft.surveyMode = input.surveyMode;
  draft.planDocumentWorkspace = createSurveyPlanWorkspace(input.sourceMode || (input.startMode === "import" ? "designPlan" : "site"));
  draft.materialWorkspace = normalizeMaterialWorkspace(draft.materialWorkspace, input.projectId);
  return {
    id: createWorkspaceId("property-survey"),
    projectId: input.projectId,
    name: input.name.trim(),
    surveyMode: input.surveyMode,
    startMode: input.startMode,
    status: "draft",
    draft,
    issues: [],
    createdAt: now,
    updatedAt: now,
  };
}
