import { costMajorItems, getRelatedWorks, getDetailLines } from "./costDatabase";
import { calculateLaborUnitPriceFromHourlyRate, type LaborRateMode } from "./laborRates";

export type RenovationPropertyType = "family_house" | "panel_flat" | "condo_flat" | "small_building" | "bathroom_only";
export type RenovationQualityLevel = "basic" | "medium" | "premium";
export type RenovationPriceMode = "net" | "gross";
export type RenovationCategoryId = string;

export type RenovationCategoryInput = {
  id: RenovationCategoryId;
  name: string;
  enabled: boolean;
  quantity: number;
  unit: string;
  materialUnitPrice: number;
  laborUnitPrice: number;
  otherCost: number;
  actualCost?: number;
  isCompleted?: boolean;
  relatedWorks?: string[];
  detailMode?: boolean;
  laborHoursPerUnit?: number;
  calculatedLaborUnitPrice?: number;
  laborRateSourceNote?: string;
};

export type RenovationCalculationInput = {
  name: string;
  propertyType: RenovationPropertyType;
  area: number;
  rooms: number;
  qualityLevel: RenovationQualityLevel;
  reservePercent: number;
  ownWorkPercent: number;
  priceMode: RenovationPriceMode;
  vatPercent: number;
  laborRateMode: LaborRateMode;
  categories: RenovationCategoryInput[];
};

export type RenovationCategoryResult = RenovationCategoryInput & {
  materialNetCost: number;
  laborNetCost: number;
  adjustedLaborNetCost: number;
  otherNetCost: number;
  estimatedNetBeforeReserve: number;
  reserveNetCost: number;
  estimatedNetTotal: number;
  estimatedVat: number;
  estimatedGrossTotal: number;
  runningNetBasis: number;
  runningVat: number;
  runningGrossBasis: number;
  differenceNetFromEstimate: number;
  differenceGrossFromEstimate: number;
  materialCost: number;
  laborCost: number;
  adjustedLaborCost: number;
  estimatedBeforeReserve: number;
  reserveCost: number;
  estimatedTotal: number;
  runningCostBasis: number;
  differenceFromEstimate: number;
};

export type RenovationCalculationResult = {
  name: string;
  propertyType: RenovationPropertyType;
  area: number;
  rooms: number;
  qualityLevel: RenovationQualityLevel;
  reservePercent: number;
  ownWorkPercent: number;
  priceMode: RenovationPriceMode;
  vatPercent: number;
  laborRateMode: LaborRateMode;
  rows: RenovationCategoryResult[];
  materialNetTotal: number;
  laborNetTotal: number;
  otherNetTotal: number;
  reserveNetTotal: number;
  estimatedNetTotal: number;
  estimatedVatTotal: number;
  estimatedGrossTotal: number;
  completedActualNetTotal: number;
  completedActualGrossTotal: number;
  remainingEstimatedNetTotal: number;
  remainingEstimatedGrossTotal: number;
  runningNetTotal: number;
  runningVatTotal: number;
  runningGrossTotal: number;
  runningDifferenceNet: number;
  runningDifferenceGross: number;
  runningDifferencePercent: number;
  materialTotal: number;
  laborTotal: number;
  otherTotal: number;
  reserveTotal: number;
  estimatedTotal: number;
  completedActualTotal: number;
  remainingEstimatedTotal: number;
  runningTotal: number;
  runningDifference: number;
  completedCount: number;
  enabledCount: number;
};

export type RenovationVersion = {
  id: string;
  name: string;
  createdAt: string;
  total: number;
  netTotal: number;
  grossTotal: number;
};

export type RenovationSample = RenovationCalculationInput & {
  id: string;
  label: string;
  description: string;
};

export const propertyTypeLabels: Record<RenovationPropertyType, string> = {
  family_house: "Családi ház",
  panel_flat: "Panellakás",
  condo_flat: "Társasházi lakás",
  small_building: "Kisebb épület",
  bathroom_only: "Fürdőszoba felújítás",
};

export const qualityLabels: Record<RenovationQualityLevel, string> = {
  basic: "Alap",
  medium: "Közép",
  premium: "Prémium",
};

export const priceModeLabels: Record<RenovationPriceMode, string> = {
  net: "Nettó árakkal számolok",
  gross: "Bruttó árakkal számolok",
};

export const qualityMultipliers: Record<RenovationQualityLevel, number> = {
  basic: 0.86,
  medium: 1,
  premium: 1.34,
};

export function calculateRenovation(input: RenovationCalculationInput): RenovationCalculationResult {
  const qualityMultiplier = qualityMultipliers[input.qualityLevel];
  const ownWorkReduction = clamp(input.ownWorkPercent, 0, 70) / 100;
  const reserveRate = clamp(input.reservePercent, 0, 30) / 100;
  const vatRate = clamp(input.vatPercent, 0, 99) / 100;

  const rows = input.categories.map((category): RenovationCategoryResult => {
    if (!category.enabled) {
      return zeroRow(category);
    }

    const laborBreakdown = category.id.includes(":") ? undefined : calculateLaborUnitPriceFromHourlyRate({ itemId: category.id, discipline: costMajorItems.find((item) => item.id === category.id)?.discipline ?? "other", fallbackLaborUnitPrice: category.laborUnitPrice, mode: input.laborRateMode });
    const effectiveLaborUnitPrice = laborBreakdown?.calculatedLaborUnitPrice ?? category.laborUnitPrice;
    const materialNetCost = category.quantity * normalizeToNet(category.materialUnitPrice, input.priceMode, vatRate) * qualityMultiplier;
    const laborNetCost = category.quantity * normalizeToNet(effectiveLaborUnitPrice, input.priceMode, vatRate) * qualityMultiplier;
    const adjustedLaborNetCost = laborNetCost * (1 - ownWorkReduction * 0.45);
    const otherNetCost = normalizeToNet(category.otherCost, input.priceMode, vatRate);
    const estimatedNetBeforeReserve = materialNetCost + adjustedLaborNetCost + otherNetCost;
    const reserveNetCost = estimatedNetBeforeReserve * reserveRate;
    const estimatedNetTotal = estimatedNetBeforeReserve + reserveNetCost;
    const estimatedVat = estimatedNetTotal * vatRate;
    const estimatedGrossTotal = estimatedNetTotal + estimatedVat;
    const hasActual = category.isCompleted && typeof category.actualCost === "number";
    const actualNet = normalizeToNet(category.actualCost ?? 0, input.priceMode, vatRate);
    const runningNetBasis = hasActual ? actualNet : estimatedNetTotal;
    const runningVat = runningNetBasis * vatRate;
    const runningGrossBasis = runningNetBasis + runningVat;
    const differenceNetFromEstimate = runningNetBasis - estimatedNetTotal;
    const differenceGrossFromEstimate = runningGrossBasis - estimatedGrossTotal;

    return {
      ...category,
      relatedWorks: category.relatedWorks ?? getRelatedWorks(category.id),
      laborHoursPerUnit: laborBreakdown?.laborHoursPerUnit,
      calculatedLaborUnitPrice: laborBreakdown?.calculatedLaborUnitPrice,
      laborRateSourceNote: laborBreakdown?.sourceNote,
      materialNetCost,
      laborNetCost,
      adjustedLaborNetCost,
      otherNetCost,
      estimatedNetBeforeReserve,
      reserveNetCost,
      estimatedNetTotal,
      estimatedVat,
      estimatedGrossTotal,
      runningNetBasis,
      runningVat,
      runningGrossBasis,
      differenceNetFromEstimate,
      differenceGrossFromEstimate,
      materialCost: materialNetCost,
      laborCost: laborNetCost,
      adjustedLaborCost: adjustedLaborNetCost,
      estimatedBeforeReserve: estimatedNetBeforeReserve,
      reserveCost: reserveNetCost,
      estimatedTotal: estimatedNetTotal,
      runningCostBasis: runningNetBasis,
      differenceFromEstimate: differenceNetFromEstimate,
    };
  });

  const enabledRows = rows.filter((row) => row.enabled);
  const materialNetTotal = sum(enabledRows.map((row) => row.materialNetCost));
  const laborNetTotal = sum(enabledRows.map((row) => row.adjustedLaborNetCost));
  const otherNetTotal = sum(enabledRows.map((row) => row.otherNetCost));
  const reserveNetTotal = sum(enabledRows.map((row) => row.reserveNetCost));
  const estimatedNetTotal = sum(enabledRows.map((row) => row.estimatedNetTotal));
  const estimatedVatTotal = estimatedNetTotal * vatRate;
  const estimatedGrossTotal = estimatedNetTotal + estimatedVatTotal;
  const completedActualNetTotal = sum(enabledRows.filter((row) => row.isCompleted).map((row) => normalizeToNet(row.actualCost ?? 0, input.priceMode, vatRate)));
  const completedActualGrossTotal = completedActualNetTotal * (1 + vatRate);
  const remainingEstimatedNetTotal = sum(enabledRows.filter((row) => !row.isCompleted).map((row) => row.estimatedNetTotal));
  const remainingEstimatedGrossTotal = remainingEstimatedNetTotal * (1 + vatRate);
  const runningNetTotal = completedActualNetTotal + remainingEstimatedNetTotal;
  const runningVatTotal = runningNetTotal * vatRate;
  const runningGrossTotal = runningNetTotal + runningVatTotal;
  const runningDifferenceNet = runningNetTotal - estimatedNetTotal;
  const runningDifferenceGross = runningGrossTotal - estimatedGrossTotal;
  const runningDifferencePercent = estimatedNetTotal > 0 ? (runningDifferenceNet / estimatedNetTotal) * 100 : 0;

  return {
    name: input.name,
    propertyType: input.propertyType,
    area: input.area,
    rooms: input.rooms,
    qualityLevel: input.qualityLevel,
    reservePercent: input.reservePercent,
    ownWorkPercent: input.ownWorkPercent,
    priceMode: input.priceMode,
    vatPercent: input.vatPercent,
    laborRateMode: input.laborRateMode,
    rows,
    materialNetTotal,
    laborNetTotal,
    otherNetTotal,
    reserveNetTotal,
    estimatedNetTotal,
    estimatedVatTotal,
    estimatedGrossTotal,
    completedActualNetTotal,
    completedActualGrossTotal,
    remainingEstimatedNetTotal,
    remainingEstimatedGrossTotal,
    runningNetTotal,
    runningVatTotal,
    runningGrossTotal,
    runningDifferenceNet,
    runningDifferenceGross,
    runningDifferencePercent,
    materialTotal: materialNetTotal,
    laborTotal: laborNetTotal,
    otherTotal: otherNetTotal,
    reserveTotal: reserveNetTotal,
    estimatedTotal: estimatedNetTotal,
    completedActualTotal: completedActualNetTotal,
    remainingEstimatedTotal: remainingEstimatedNetTotal,
    runningTotal: runningNetTotal,
    runningDifference: runningDifferenceNet,
    completedCount: enabledRows.filter((row) => row.isCompleted).length,
    enabledCount: enabledRows.length,
  };
}

export function createVersions(result: RenovationCalculationResult): RenovationVersion[] {
  return [
    { id: "V1", name: "Első becslés", createdAt: "2026.06.27. 09:00", total: result.estimatedNetTotal * 0.94, netTotal: result.estimatedNetTotal * 0.94, grossTotal: result.estimatedGrossTotal * 0.94 },
    { id: "V2", name: "Módosított becslés", createdAt: "2026.06.27. 13:30", total: result.estimatedNetTotal * 1.02, netTotal: result.estimatedNetTotal * 1.02, grossTotal: result.estimatedGrossTotal * 1.02 },
    { id: "V3", name: "Véglegesített becslés", createdAt: "2026.06.28. 08:45", total: result.estimatedNetTotal, netTotal: result.estimatedNetTotal, grossTotal: result.estimatedGrossTotal },
  ];
}

export function createBaseCategories(area: number, propertyType: RenovationPropertyType): RenovationCategoryInput[] {
  return costMajorItems
    .filter((item) => isAllowedForPropertyType(item.id, propertyType))
    .map((item) => ({
      id: item.id,
      name: item.name,
      enabled: isDefaultEnabled(item.id, item.defaultEnabled, propertyType),
      quantity: getDefaultQuantity(item.id, area, item.quantityMultiplier, item.minQuantity, propertyType),
      unit: item.unit,
      materialUnitPrice: item.materialUnitPrice,
      laborUnitPrice: item.laborUnitPrice,
      otherCost: item.otherCost,
      relatedWorks: item.relatedWorks,
      detailMode: false,
    }));
}

export function createDetailedRows(parent: RenovationCategoryInput): RenovationCategoryInput[] {
  const details = getDetailLines(parent.id);
  return details.map((detail) => ({
    id: `${parent.id}:${detail.id}`,
    name: detail.name,
    enabled: detail.defaultEnabled,
    quantity: Math.max(detail.minQuantity ?? 0, parent.quantity * detail.quantityMultiplier),
    unit: detail.unit,
    materialUnitPrice: Math.round(parent.materialUnitPrice * 0.18),
    laborUnitPrice: Math.round(parent.laborUnitPrice * 0.18),
    otherCost: 0,
    relatedWorks: [],
    detailMode: false,
  }));
}

function baseInput(overrides: Omit<RenovationSample, "priceMode" | "vatPercent" | "laborRateMode">): RenovationSample {
  return { ...overrides, priceMode: "net", vatPercent: 27, laborRateMode: "dimpro" };
}

export const renovationSamples: RenovationSample[] = [
  baseInput({
    id: "family-medium",
    label: "Családi ház – közepes felújítás",
    description: "120 m²-es családi ház, bontással, gépészettel, burkolással, szigeteléssel és részleges tetőfelújítással.",
    name: "Családi ház közepes felújítás",
    propertyType: "family_house",
    area: 120,
    rooms: 5,
    qualityLevel: "medium",
    reservePercent: 10,
    ownWorkPercent: 15,
    categories: createBaseCategories(120, "family_house").map((category) =>
      category.id === "demolition" ? { ...category, isCompleted: true, actualCost: 720000 } :
      category.id === "waste" ? { ...category, isCompleted: true, actualCost: 560000 } : category,
    ),
  }),
  baseInput({
    id: "panel-basic",
    label: "Panellakás – alap/közép",
    description: "62 m²-es panellakás felújítása, strang és társasházi kötöttségek figyelembevételével.",
    name: "Panellakás részleges felújítás",
    propertyType: "panel_flat",
    area: 62,
    rooms: 3,
    qualityLevel: "medium",
    reservePercent: 8,
    ownWorkPercent: 5,
    categories: createBaseCategories(62, "panel_flat").map((category) =>
      ["demolition", "waste", "painting"].includes(category.id)
        ? { ...category, isCompleted: true, actualCost: Math.round((category.materialUnitPrice * category.quantity + category.laborUnitPrice * category.quantity + category.otherCost) * 1.04) }
        : category,
    ),
  }),
  baseInput({
    id: "bathroom-premium",
    label: "Fürdőszoba – prémium",
    description: "8 m²-es fürdőszoba teljes bontással, vízszigeteléssel, gépészettel és prémium burkolattal.",
    name: "Fürdőszoba prémium felújítás",
    propertyType: "bathroom_only",
    area: 8,
    rooms: 1,
    qualityLevel: "premium",
    reservePercent: 15,
    ownWorkPercent: 0,
    categories: createBaseCategories(8, "bathroom_only").map((category) =>
      ["demolition", "waste"].includes(category.id) ? { ...category, isCompleted: true, actualCost: category.id === "demolition" ? 185000 : 130000 } : category,
    ),
  }),
  baseInput({
    id: "condo-paint-electric",
    label: "Társasházi lakás – részleges",
    description: "74 m²-es társasházi lakás festés, villanyszerelés, burkolás és konyhai munkák kombinációjával.",
    name: "Társasházi lakás részleges felújítás",
    propertyType: "condo_flat",
    area: 74,
    rooms: 3,
    qualityLevel: "basic",
    reservePercent: 7,
    ownWorkPercent: 25,
    categories: createBaseCategories(74, "condo_flat").map((category) => category.id === "painting" ? { ...category, isCompleted: true, actualCost: 780000 } : category),
  }),
  baseInput({
    id: "small-building-roof",
    label: "Kisebb épület – tető/szigetelés",
    description: "48 m²-es melléképület tetőfelújítással, hőszigeteléssel és alap elektromos munkákkal.",
    name: "Kisebb épület felújítás",
    propertyType: "small_building",
    area: 48,
    rooms: 2,
    qualityLevel: "medium",
    reservePercent: 12,
    ownWorkPercent: 30,
    categories: createBaseCategories(48, "small_building").map((category) => category.id === "roof" ? { ...category, isCompleted: true, actualCost: 1880000 } : category),
  }),
];

function isAllowedForPropertyType(id: string, propertyType: RenovationPropertyType) {
  if (propertyType === "bathroom_only") {
    return ["demolition", "waste", "floor_tiling", "wall_tiling", "painting", "electric_rewire", "mechanical", "bathroom", "other"].includes(id);
  }
  if (propertyType === "panel_flat" || propertyType === "condo_flat") {
    return !["roof", "fence_build", "driveway", "landscaping", "lawn", "irrigation", "tree_planting", "solar_collector", "heat_pump"].includes(id);
  }
  return true;
}

function isDefaultEnabled(id: string, defaultEnabled: boolean, propertyType: RenovationPropertyType) {
  if (propertyType === "small_building" && ["bathroom", "kitchen", "mechanical"].includes(id)) return false;
  if (propertyType === "bathroom_only") return ["demolition", "waste", "floor_tiling", "wall_tiling", "painting", "electric_rewire", "mechanical", "bathroom"].includes(id);
  return defaultEnabled;
}

function getDefaultQuantity(id: string, area: number, multiplier: number, minQuantity: number, propertyType: RenovationPropertyType) {
  if (["bathroom", "kitchen", "ac_install_5m", "ac_install_plus", "solar_collector", "heat_pump", "other"].includes(id)) return minQuantity;
  if (id === "windows") return Math.max(minQuantity, Math.round(area / 18));
  if (propertyType === "bathroom_only" && ["floor_tiling", "wall_tiling"].includes(id)) return Math.max(minQuantity, area * (id === "wall_tiling" ? 2.3 : 1));
  return Math.max(minQuantity, area * multiplier);
}

function zeroRow(category: RenovationCategoryInput): RenovationCategoryResult {
  return {
    ...category,
    materialNetCost: 0,
    laborNetCost: 0,
    adjustedLaborNetCost: 0,
    otherNetCost: 0,
    estimatedNetBeforeReserve: 0,
    reserveNetCost: 0,
    estimatedNetTotal: 0,
    estimatedVat: 0,
    estimatedGrossTotal: 0,
    runningNetBasis: 0,
    runningVat: 0,
    runningGrossBasis: 0,
    differenceNetFromEstimate: 0,
    differenceGrossFromEstimate: 0,
    materialCost: 0,
    laborCost: 0,
    adjustedLaborCost: 0,
    estimatedBeforeReserve: 0,
    reserveCost: 0,
    estimatedTotal: 0,
    runningCostBasis: 0,
    differenceFromEstimate: 0,
  };
}

function normalizeToNet(value: number, priceMode: RenovationPriceMode, vatRate: number) {
  return priceMode === "gross" ? value / (1 + vatRate) : value;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
