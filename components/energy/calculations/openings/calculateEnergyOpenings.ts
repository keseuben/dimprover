import type { EnergyRequirementLevel } from "@/components/energy/domain/energyProjectTypes";
import type {
  EnergyOpeningDetail,
  EnergyOpeningResult,
  EnergyOpeningSetResult,
  EnergyOpeningTraceItem,
  EnergyOpeningValidationMessage,
  EnergyOpeningWorkspace,
  EnergyThermalBridge,
  EnergyThermalBridgeResult,
} from "@/components/energy/domain/energyOpeningTypes";
import { huEkm20231101OpeningRequirements } from "@/components/energy/regulations/HU_EKM_2023_11_01/openingRequirements";
import type { SurveyWallOpening } from "@/components/property-survey/propertySurveyBuildingModel";

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
function positive(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function nonNegative(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; }
function sum<T>(rows: T[], selector: (row: T) => number) { return rows.reduce((total, row) => total + selector(row), 0); }
function trace(input: Omit<EnergyOpeningTraceItem, "id" | "value">): EnergyOpeningTraceItem {
  return { ...input, id: `opening-trace-${input.ruleId}-${input.entityRefs.map((ref) => ref.id).join("-")}`, value: round(input.unroundedValue) };
}
function message(input: EnergyOpeningValidationMessage) { return input; }
function openingRef(opening: SurveyWallOpening) { return [{ type: "opening" as const, id: opening.id, name: opening.name || opening.id }]; }

function requirementFor(detail: EnergyOpeningDetail, requirementLevel: EnergyRequirementLevel) {
  if (requirementLevel === "existingNoRequirement") return { maximum: null, applicable: false, small: false };
  if (detail.requirementType === "custom") return { maximum: positive(detail.customRequirementMaximumUwWm2K), applicable: true, small: false };
  const rule = huEkm20231101OpeningRequirements[detail.requirementType];
  return { maximum: rule.maximumUValueWm2K, applicable: true, small: false, rule };
}

function calculateOneOpening(opening: SurveyWallOpening, detail: EnergyOpeningDetail | undefined, requirementLevel: EnergyRequirementLevel): EnergyOpeningResult {
  const validationMessages: EnergyOpeningValidationMessage[] = [];
  const traceItems: EnergyOpeningTraceItem[] = [];
  const width = positive(opening.widthMeters) || 0;
  const height = positive(opening.heightMeters) || 0;
  const area = width * height;
  const perimeter = 2 * (width + height);
  if (!width || !height) validationMessages.push(message({ code: "OPENING_GEOMETRY_INVALID", severity: "error", blocking: true, openingId: opening.id, entityName: opening.name, message: `${opening.name}: a nyílászáró szélessége és magassága legyen pozitív.` }));
  if (!detail) validationMessages.push(message({ code: "OPENING_DETAIL_MISSING", severity: "error", blocking: true, openingId: opening.id, entityName: opening.name, message: `${opening.name}: hiányzik az energetikai részletadat.` }));

  let glazingArea: number | null = null;
  let frameArea: number | null = null;
  let glazingEdgeLength: number | null = null;
  let effectiveUw: number | null = null;

  if (detail?.calculationMode === "declared") {
    const declared = positive(detail.declaredUwWm2K);
    if (!declared) validationMessages.push(message({ code: "DECLARED_U_REQUIRED", severity: "error", blocking: true, openingId: opening.id, entityName: opening.name, message: `${opening.name}: deklarált módban pozitív teljes Uw-érték szükséges.` }));
    if (!detail.declaredSourceReference?.trim()) validationMessages.push(message({ code: "DECLARED_SOURCE_REQUIRED", severity: "error", blocking: true, openingId: opening.id, entityName: opening.name, message: `${opening.name}: a deklarált Uw-érték forrása kötelező.` }));
    effectiveUw = declared;
    if (declared) traceItems.push(trace({ ruleId: "OPENING-UW-DECLARED-001", label: `${opening.name} deklarált Uw-értéke`, formula: "Uw = dokumentált teljes nyílászáró U-érték", inputs: { declaredUwWm2K: declared, source: detail.declaredSourceReference || "" }, unroundedValue: declared, unit: "W/m2K", entityRefs: openingRef(opening) }));
  } else if (detail) {
    const frameWidth = positive(detail.frameWidthMeters);
    const ug = positive(detail.glazingUgWm2K);
    const uf = positive(detail.frameUfWm2K);
    const psi = nonNegative(detail.glazingEdgePsiWmK);
    if (!frameWidth || frameWidth * 2 >= width || frameWidth * 2 >= height) validationMessages.push(message({ code: "FRAME_WIDTH_INVALID", severity: "error", blocking: true, openingId: opening.id, entityName: opening.name, message: `${opening.name}: a keretszélesség legyen pozitív és kisebb a nyílászáró fél méreténél.` }));
    if (!ug) validationMessages.push(message({ code: "UG_REQUIRED", severity: "error", blocking: true, openingId: opening.id, entityName: opening.name, message: `${opening.name}: a részletes számításhoz pozitív Ug-érték szükséges.` }));
    if (!uf) validationMessages.push(message({ code: "UF_REQUIRED", severity: "error", blocking: true, openingId: opening.id, entityName: opening.name, message: `${opening.name}: a részletes számításhoz pozitív Uf-érték szükséges.` }));
    if (psi === null) validationMessages.push(message({ code: "GLAZING_EDGE_PSI_REQUIRED", severity: "error", blocking: true, openingId: opening.id, entityName: opening.name, message: `${opening.name}: az üvegszegély Ψ-értéke kötelező, és lehet dokumentált 0 is.` }));
    if (psi !== null && !detail.glazingEdgeSourceReference?.trim()) validationMessages.push(message({ code: "GLAZING_EDGE_SOURCE_REQUIRED", severity: "error", blocking: true, openingId: opening.id, entityName: opening.name, message: `${opening.name}: az üvegszegély Ψ-érték forrása kötelező.` }));
    if (detail.solarGValue !== undefined && (!(Number(detail.solarGValue) >= 0) || !(Number(detail.solarGValue) <= 1))) validationMessages.push(message({ code: "SOLAR_G_VALUE_INVALID", severity: "error", blocking: true, openingId: opening.id, entityName: opening.name, message: `${opening.name}: a napenergia-átbocsátási tényező 0 és 1 közötti legyen.` }));
    if (frameWidth && frameWidth * 2 < width && frameWidth * 2 < height && ug && uf && psi !== null) {
      const glazingWidth = width - 2 * frameWidth;
      const glazingHeight = height - 2 * frameWidth;
      glazingArea = glazingWidth * glazingHeight;
      frameArea = area - glazingArea;
      glazingEdgeLength = 2 * (glazingWidth + glazingHeight);
      if (!(glazingArea > 0) || !(frameArea > 0)) validationMessages.push(message({ code: "GLAZING_AREA_INVALID", severity: "error", blocking: true, openingId: opening.id, entityName: opening.name, message: `${opening.name}: a keret- és üvegfelület geometriája érvénytelen.` }));
      const numerator = glazingArea * ug + frameArea * uf + glazingEdgeLength * psi;
      effectiveUw = area > 0 ? numerator / area : null;
      traceItems.push(trace({ ruleId: "OPENING-GLAZING-AREA-002", label: `${opening.name} üvegfelülete`, formula: "Ag = (szélesség − 2·keretszélesség) × (magasság − 2·keretszélesség)", inputs: { widthMeters: width, heightMeters: height, frameWidthMeters: frameWidth }, unroundedValue: glazingArea, unit: "m2", entityRefs: openingRef(opening) }));
      traceItems.push(trace({ ruleId: "OPENING-FRAME-AREA-003", label: `${opening.name} keretfelülete`, formula: "Af = Aw − Ag", inputs: { openingAreaSquareMeters: area, glazingAreaSquareMeters: glazingArea }, unroundedValue: frameArea, unit: "m2", entityRefs: openingRef(opening) }));
      traceItems.push(trace({ ruleId: "OPENING-UW-DETAILED-004", label: `${opening.name} részletes Uw-értéke`, formula: "Uw = (Ag·Ug + Af·Uf + lg·Ψg) / Aw", inputs: { Ag: glazingArea, Ug: ug, Af: frameArea, Uf: uf, glazingEdgeLengthMeters: glazingEdgeLength, glazingEdgePsiWmK: psi, Aw: area }, unroundedValue: effectiveUw || 0, unit: "W/m2K", entityRefs: openingRef(opening) }));
    }
  }

  const installationPsi = detail?.installationPsiWmK === undefined ? 0 : nonNegative(detail.installationPsiWmK);
  if (detail?.installationPsiWmK !== undefined && installationPsi === null) validationMessages.push(message({ code: "INSTALLATION_PSI_INVALID", severity: "error", blocking: true, openingId: opening.id, entityName: opening.name, message: `${opening.name}: a beépítési perem Ψ-értéke nem lehet negatív.` }));
  if (detail?.installationPsiWmK !== undefined && !detail.installationPsiSourceReference?.trim()) validationMessages.push(message({ code: "INSTALLATION_SOURCE_REQUIRED", severity: "error", blocking: true, openingId: opening.id, entityName: opening.name, message: `${opening.name}: a beépítési perem Ψ-érték forrása kötelező.` }));
  const installationH = installationPsi === null ? 0 : perimeter * installationPsi;
  if (detail?.installationPsiWmK !== undefined && installationPsi !== null) traceItems.push(trace({ ruleId: "OPENING-INSTALLATION-BRIDGE-005", label: `${opening.name} beépítési perem hőveszteségi tényezője`, formula: "HΨ,beép = kerület × Ψbeép", inputs: { perimeterMeters: perimeter, installationPsiWmK: installationPsi }, unroundedValue: installationH, unit: "W/K", entityRefs: openingRef(opening) }));

  const openingH = effectiveUw === null ? null : area * effectiveUw;
  const totalH = openingH === null ? null : openingH + installationH;
  if (openingH !== null) traceItems.push(trace({ ruleId: "OPENING-TRANSMISSION-006", label: `${opening.name} felületi hőveszteségi tényezője`, formula: "Htr,ny = Aw × Uw", inputs: { areaSquareMeters: area, effectiveUwWm2K: effectiveUw }, unroundedValue: openingH, unit: "W/K", entityRefs: openingRef(opening) }));

  let requirementMaximum: number | null = null;
  let compliance: EnergyOpeningResult["compliance"] = "notCalculated";
  if (detail) {
    const requirement = requirementFor(detail, requirementLevel);
    requirementMaximum = requirement.maximum;
    if (!requirement.applicable) compliance = "notApplicable";
    else if (detail.requirementType === "custom" && !requirementMaximum) {
      validationMessages.push(message({ code: "CUSTOM_REQUIREMENT_REQUIRED", severity: "error", blocking: true, openingId: opening.id, entityName: opening.name, message: `${opening.name}: egyedi követelménynél pozitív határérték szükséges.` }));
    } else if (requirement.rule?.minimumAreaExclusiveSquareMeters !== undefined && area <= requirement.rule.minimumAreaExclusiveSquareMeters) {
      compliance = "notApplicableSmallArea";
      validationMessages.push(message({ code: "SMALL_OPENING_REQUIREMENT_NOT_APPLICABLE", severity: "info", blocking: false, openingId: opening.id, entityName: opening.name, message: `${opening.name}: a ${area.toFixed(2)} m² felület nem haladja meg a követelménytáblázat ${requirement.rule.minimumAreaExclusiveSquareMeters.toFixed(2)} m² küszöbét.` }));
    } else if (effectiveUw !== null && requirementMaximum !== null) compliance = effectiveUw <= requirementMaximum + 1e-9 ? "compliant" : "notCompliant";
  }

  const blocked = validationMessages.some((item) => item.blocking);
  if (blocked && compliance !== "notApplicable" && compliance !== "notApplicableSmallArea") compliance = "notCalculated";
  return {
    openingId: opening.id,
    openingName: opening.name || opening.id,
    kind: opening.kind,
    calculationMode: detail?.calculationMode || "declared",
    requirementType: detail?.requirementType || "custom",
    widthMeters: round(width),
    heightMeters: round(height),
    areaSquareMeters: round(area),
    perimeterMeters: round(perimeter),
    glazingAreaSquareMeters: glazingArea === null ? null : round(glazingArea),
    frameAreaSquareMeters: frameArea === null ? null : round(frameArea),
    glazingEdgeLengthMeters: glazingEdgeLength === null ? null : round(glazingEdgeLength),
    effectiveUwWm2K: effectiveUw === null ? null : round(effectiveUw),
    requirementMaximumUwWm2K: requirementMaximum === null ? null : round(requirementMaximum),
    compliance,
    openingHeatLossCoefficientWK: openingH === null ? null : round(openingH),
    installationHeatLossCoefficientWK: round(installationH),
    totalHeatLossCoefficientWK: totalH === null ? null : round(totalH),
    blocked,
    validationMessages,
    trace: traceItems,
  };
}

function calculateThermalBridge(bridge: EnergyThermalBridge, openings: SurveyWallOpening[], details: Record<string, EnergyOpeningDetail>): EnergyThermalBridgeResult {
  const validationMessages: EnergyOpeningValidationMessage[] = [];
  const traceItems: EnergyOpeningTraceItem[] = [];
  if (!bridge.name.trim()) validationMessages.push(message({ code: "THERMAL_BRIDGE_NAME_REQUIRED", severity: "error", blocking: true, thermalBridgeId: bridge.id, message: "A hőhíd megnevezése kötelező." }));
  if (!bridge.sourceReference.trim()) validationMessages.push(message({ code: "THERMAL_BRIDGE_SOURCE_REQUIRED", severity: "error", blocking: true, thermalBridgeId: bridge.id, entityName: bridge.name, message: `${bridge.name}: a Ψ vagy χ érték forrása kötelező.` }));
  if (bridge.openingId && !openings.some((opening) => opening.id === bridge.openingId)) validationMessages.push(message({ code: "THERMAL_BRIDGE_OPENING_MISSING", severity: "error", blocking: true, thermalBridgeId: bridge.id, entityName: bridge.name, message: `${bridge.name}: a kapcsolt nyílászáró nem található.` }));
  if (bridge.openingId && ["openingReveal", "openingSill", "openingHead"].includes(bridge.category) && details[bridge.openingId]?.installationPsiWmK !== undefined) validationMessages.push(message({ code: "OPENING_INSTALLATION_DOUBLE_COUNT", severity: "error", blocking: true, openingId: bridge.openingId, thermalBridgeId: bridge.id, entityName: bridge.name, message: `${bridge.name}: ugyanahhoz a nyílászáróhoz beépítési perem és külön káva/parapet/szemöldök hőhíd is tartozik. Válassz egyetlen elszámolási módot.` }));
  let heatLoss: number | null = null;
  if (bridge.kind === "linear") {
    const length = positive(bridge.lengthMeters);
    const psi = nonNegative(bridge.psiWmK);
    if (!length) validationMessages.push(message({ code: "THERMAL_BRIDGE_LENGTH_REQUIRED", severity: "error", blocking: true, thermalBridgeId: bridge.id, entityName: bridge.name, message: `${bridge.name}: lineáris hőhídnál pozitív hossz szükséges.` }));
    if (psi === null) validationMessages.push(message({ code: "THERMAL_BRIDGE_PSI_REQUIRED", severity: "error", blocking: true, thermalBridgeId: bridge.id, entityName: bridge.name, message: `${bridge.name}: lineáris hőhídnál nem negatív Ψ-érték szükséges.` }));
    if (length && psi !== null) {
      heatLoss = length * psi;
      traceItems.push(trace({ ruleId: "THERMAL-BRIDGE-LINEAR-007", label: `${bridge.name} lineáris hőveszteségi tényezője`, formula: "HΨ = l × Ψ", inputs: { lengthMeters: length, psiWmK: psi }, unroundedValue: heatLoss, unit: "W/K", entityRefs: [{ type: "thermalBridge", id: bridge.id, name: bridge.name }] }));
    }
  } else {
    const quantity = positive(bridge.quantity);
    const chi = nonNegative(bridge.chiWK);
    if (!quantity) validationMessages.push(message({ code: "THERMAL_BRIDGE_QUANTITY_REQUIRED", severity: "error", blocking: true, thermalBridgeId: bridge.id, entityName: bridge.name, message: `${bridge.name}: pontszerű hőhídnál pozitív darabszám szükséges.` }));
    if (chi === null) validationMessages.push(message({ code: "THERMAL_BRIDGE_CHI_REQUIRED", severity: "error", blocking: true, thermalBridgeId: bridge.id, entityName: bridge.name, message: `${bridge.name}: pontszerű hőhídnál nem negatív χ-érték szükséges.` }));
    if (quantity && chi !== null) {
      heatLoss = quantity * chi;
      traceItems.push(trace({ ruleId: "THERMAL-BRIDGE-POINT-008", label: `${bridge.name} pontszerű hőveszteségi tényezője`, formula: "Hχ = n × χ", inputs: { quantity, chiWK: chi }, unroundedValue: heatLoss, unit: "W/K", entityRefs: [{ type: "thermalBridge", id: bridge.id, name: bridge.name }] }));
    }
  }
  const blocked = validationMessages.some((item) => item.blocking);
  return { id: bridge.id, name: bridge.name, kind: bridge.kind, category: bridge.category, openingId: bridge.openingId, heatLossCoefficientWK: heatLoss === null ? null : round(heatLoss), blocked, validationMessages, trace: traceItems };
}

export function calculateEnergyOpenings(input: { workspace: EnergyOpeningWorkspace; openings: SurveyWallOpening[]; requirementLevel: EnergyRequirementLevel; calculatedAt?: string }): EnergyOpeningSetResult {
  const openings = input.openings.map((opening) => calculateOneOpening(opening, input.workspace.openingDetails[opening.id], input.requirementLevel));
  const thermalBridges = input.workspace.thermalBridges.map((bridge) => calculateThermalBridge(bridge, input.openings, input.workspace.openingDetails));
  const validationMessages = [...openings.flatMap((result) => result.validationMessages), ...thermalBridges.flatMap((result) => result.validationMessages)];
  const blocked = validationMessages.some((item) => item.blocking);
  const openingH = sum(openings, (result) => result.openingHeatLossCoefficientWK || 0);
  const installationH = sum(openings, (result) => result.installationHeatLossCoefficientWK);
  const bridgeH = sum(thermalBridges, (result) => result.heatLossCoefficientWK || 0);
  return {
    schema: "dimpro.energy-opening-set.v0.7.4",
    engineVersion: "0.7.4",
    calculatedAt: input.calculatedAt || new Date().toISOString(),
    valid: !blocked,
    blocked,
    requirementLevel: input.requirementLevel,
    openings,
    thermalBridges,
    totals: {
      openingCount: openings.length,
      validOpeningCount: openings.filter((result) => !result.blocked).length,
      blockedOpeningCount: openings.filter((result) => result.blocked).length,
      compliantOpeningCount: openings.filter((result) => result.compliance === "compliant").length,
      notCompliantOpeningCount: openings.filter((result) => result.compliance === "notCompliant").length,
      totalOpeningAreaSquareMeters: round(sum(openings, (result) => result.areaSquareMeters)),
      openingHeatLossCoefficientWK: round(openingH),
      installationHeatLossCoefficientWK: round(installationH),
      otherThermalBridgeHeatLossCoefficientWK: round(bridgeH),
      totalHeatLossCoefficientWK: round(openingH + installationH + bridgeH),
    },
    validationMessages,
    trace: [...openings.flatMap((result) => result.trace), ...thermalBridges.flatMap((result) => result.trace)],
    openingFormulaSourceReferenceId: "EN-ISO-10077-1-UW",
    requirementSourceReferenceId: "HU-EKM-9-2023-ANNEX-1-OPENINGS",
    thermalBridgeSourceReferenceId: "EN-ISO-10211-14683-THERMAL-BRIDGES",
    sourceCheckedAt: "2026-07-29",
  };
}
