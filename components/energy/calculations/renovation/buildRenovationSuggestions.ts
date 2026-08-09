import type { EnergyAssemblySetResult } from "@/components/energy/domain/energyAssemblyTypes";
import type { EnergyDemandSetResult, EnergyDemandWorkspace } from "@/components/energy/domain/energyDemandTypes";
import type { EnergyOpeningSetResult } from "@/components/energy/domain/energyOpeningTypes";
import type { EnergyRenewableSizingResult, EnergyRenewableWorkspace } from "@/components/energy/domain/energyRenewableTypes";
import {
  createEnergyRenovationMeasure,
  normalizeEnergyRenovationWorkspace,
  type EnergyRenovationMeasure,
  type EnergyRenovationMeasureCategory,
  type EnergyRenovationWorkspace,
} from "@/components/energy/domain/energyRenovationTypes";
import type { SurveyConstructionAssembly } from "@/components/property-survey/propertySurveyEnergyModel";
import type { SurveyWallOpening } from "@/components/property-survey/propertySurveyBuildingModel";

export type BuildRenovationSuggestionsInput = {
  workspace: EnergyRenovationWorkspace;
  assemblies: SurveyConstructionAssembly[];
  assemblySet: EnergyAssemblySetResult;
  wallOpenings: SurveyWallOpening[];
  openingSet: EnergyOpeningSetResult;
  demandWorkspace: EnergyDemandWorkspace;
  demandSet: EnergyDemandSetResult;
  renewableWorkspace: EnergyRenewableWorkspace;
  renewableResult: EnergyRenewableSizingResult;
};

export type BuildRenovationSuggestionsResult = {
  workspace: EnergyRenovationWorkspace;
  addedCount: number;
  updatedCount: number;
  suggestionCount: number;
};

function round(value: number | null | undefined, digits = 4) {
  if (!Number.isFinite(Number(value))) return undefined;
  return Number(Number(value).toFixed(digits));
}

function measureKey(measure: Pick<EnergyRenovationMeasure, "category" | "targetEntityId">) {
  return `${measure.category}:${measure.targetEntityId || "general"}`;
}

function assemblyCategory(assembly: SurveyConstructionAssembly): EnergyRenovationMeasureCategory {
  if (assembly.category === "plinth") return "plinth";
  if (assembly.category === "floor") return assembly.requirementType === "lowerFloorUnheated" ? "basementCeiling" : "groundFloor";
  if (assembly.category === "ceiling") {
    if (assembly.requirementType === "atticFloor") return "atticFloor";
    return "roof";
  }
  if (assembly.requirementType === "groundWall") return "basementWall";
  return "externalWall";
}

function assemblyProposalText(category: EnergyRenovationMeasureCategory) {
  if (category === "externalWall") return "Külső oldali hőszigetelő rendszer készítése teljes csomóponti és páratechnikai ellenőrzéssel.";
  if (category === "plinth") return "Nedvességálló lábazati hőszigetelés és a fal–lábazat csatlakozás folytonosságának kialakítása.";
  if (category === "groundFloor") return "A talajon fekvő padló hőtechnikai javítása felújításkor, részletes talajkapcsolati számítással.";
  if (category === "basementCeiling") return "A fűtetlen pince feletti födém alsó oldali hőszigetelése csomóponti ellenőrzéssel.";
  if (category === "basementWall") return "A pincefal nedvességtechnikailag megfelelő hőszigetelése és vízszigetelési csomópontjainak ellenőrzése.";
  if (category === "atticFloor") return "A padlásfödém felső oldalán folytonos hőszigetelés, járhatósági és páratechnikai rétegrenddel.";
  return "A tetősík vagy tetőfödém hőszigetelésének folytonos kialakítása, tetőablak- és ereszcsomópontokkal együtt.";
}

function openingProposalText() {
  return "A nyílászáró cseréje vagy hőtechnikai javítása ellenőrzött teljes Uw-értékkel, légzáró beépítéssel, káva-, parapet- és szemöldökcsomóponttal.";
}

function mergeMeasure(existing: EnergyRenovationMeasure | undefined, suggestion: EnergyRenovationMeasure): { measure: EnergyRenovationMeasure; updated: boolean } {
  if (!existing) return { measure: suggestion, updated: false };
  return {
    updated: true,
    measure: {
      ...suggestion,
      id: existing.id,
      included: existing.included,
      note: existing.note || suggestion.note,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function buildRenovationSuggestions(input: BuildRenovationSuggestionsInput): BuildRenovationSuggestionsResult {
  const workspace = normalizeEnergyRenovationWorkspace(input.workspace);
  const proposal = workspace.scenarios.find((scenario) => scenario.id === workspace.activeScenarioId && scenario.kind === "proposal")
    || workspace.scenarios.find((scenario) => scenario.kind === "proposal");
  if (!proposal) return { workspace, addedCount: 0, updatedCount: 0, suggestionCount: 0 };

  const suggestions: EnergyRenovationMeasure[] = [];
  const assemblyById = new Map(input.assemblies.map((assembly) => [assembly.id, assembly]));
  input.assemblySet.results.forEach((result) => {
    if (result.compliance !== "notCompliant" && !result.blocked) return;
    const assembly = assemblyById.get(result.assemblyId);
    if (!assembly) return;
    const category = assemblyCategory(assembly);
    suggestions.push(createEnergyRenovationMeasure(category, {
      targetEntityId: assembly.id,
      title: `${assembly.name} hőtechnikai korszerűsítése`,
      existingDescription: result.effectiveUValueWm2K !== null ? `Jelenlegi eredő U = ${result.effectiveUValueWm2K.toFixed(3)} W/m²K.` : "A jelenlegi rétegrend számítása vagy adatforrása ellenőrzendő.",
      proposedDescription: assemblyProposalText(category),
      currentValue: round(result.effectiveUValueWm2K),
      targetValue: round(result.requirementMaximumUValueWm2K),
      unit: "W/m²K",
      effectLevel: category === "atticFloor" || category === "externalWall" || category === "roof" ? "high" : "medium",
      dataStatus: result.blocked ? "reviewRequired" : "winwattFinalization",
      sourceReference: `${input.assemblySet.ruleSourceReferenceId} · ${result.schema}`,
      note: result.blocked ? result.validationMessages.filter((message) => message.blocking).map((message) => message.message).join(" ") : "A célértéket a projekt követelményszintje alapján kell véglegesíteni.",
    }));
  });

  const openingById = new Map(input.wallOpenings.map((opening) => [opening.id, opening]));
  input.openingSet.openings.forEach((result) => {
    if (result.compliance !== "notCompliant" && !result.blocked) return;
    const opening = openingById.get(result.openingId);
    suggestions.push(createEnergyRenovationMeasure("opening", {
      targetEntityId: result.openingId,
      title: `${opening?.name || result.openingName} korszerűsítése`,
      existingDescription: result.effectiveUwWm2K !== null ? `Jelenlegi Uw = ${result.effectiveUwWm2K.toFixed(3)} W/m²K.` : "A teljes Uw vagy a forrásadat hiányos.",
      proposedDescription: openingProposalText(),
      currentValue: round(result.effectiveUwWm2K),
      targetValue: round(result.requirementMaximumUwWm2K),
      unit: "W/m²K",
      effectLevel: result.areaSquareMeters >= 2 ? "high" : "medium",
      dataStatus: result.blocked ? "reviewRequired" : "winwattFinalization",
      sourceReference: `${input.openingSet.requirementSourceReferenceId} · ${input.openingSet.openingFormulaSourceReferenceId}`,
      note: result.blocked ? result.validationMessages.filter((message) => message.blocking).map((message) => message.message).join(" ") : "A cserecsomagba a beépítési csatlakozások és az árnyékolás is tartozzon bele.",
    }));
  });

  const heatingZoneProblems = input.demandSet.zones.filter((zone) => zone.systemCoverageStatus === "missing" || zone.systemCoverageStatus === "unknownCapacity" || zone.systemCoverageStatus === "insufficient");
  const heatingSystems = input.demandWorkspace.systems.filter((system) => system.service === "heating");
  if (heatingZoneProblems.length || !heatingSystems.length) {
    const missing = !heatingSystems.length;
    suggestions.push(createEnergyRenovationMeasure("heating", {
      targetEntityId: "heating-system",
      title: missing ? "Fűtési rendszer kialakítása / korszerűsítése" : "Fűtési rendszer kapacitásának és szabályozásának felülvizsgálata",
      existingDescription: missing ? "Nincs zónákhoz kapcsolt, ellenőrzött fűtési rendszer." : `${heatingZoneProblems.length} zóna rendszerlefedettsége vagy kapacitása ellenőrzendő.`,
      proposedDescription: "A hőtermelő, hőleadók, szabályozás, hidraulikai beszabályozás, elosztási veszteségek és segédenergia együttes korszerűsítése.",
      effectLevel: "veryHigh",
      dataStatus: "winwattFinalization",
      sourceReference: input.demandSet.schema,
      note: "A helyszíni terhelési eredmény a hőtermelő kiválasztásának előkészítése; a teljes rendszerhatásfokot WinWattban és gépészeti tervben kell véglegesíteni.",
    }));
  }

  const hasDhw = input.demandWorkspace.systems.some((system) => system.service === "dhw");
  if (!hasDhw) suggestions.push(createEnergyRenovationMeasure("hotWater", {
    targetEntityId: "dhw-system",
    title: "Használati melegvíz-rendszer felülvizsgálata",
    existingDescription: "Nincs részletes, zónákhoz vagy berendezéshez kapcsolt HMV-rendszeradat.",
    proposedDescription: "A HMV-termelő, tároló, elosztás, cirkuláció, segédenergia és megújuló rásegítés közös ellenőrzése.",
    effectLevel: "medium",
    dataStatus: "winwattFinalization",
    sourceReference: input.demandSet.schema,
  }));

  const hasCooling = input.demandWorkspace.systems.some((system) => system.service === "cooling");
  if (!hasCooling && input.demandWorkspace.systems.length) suggestions.push(createEnergyRenovationMeasure("cooling", {
    targetEntityId: "cooling-system",
    title: "Nyári hővédelem és hűtési igény felülvizsgálata",
    existingDescription: "Nincs részletes hűtési rendszerkapcsolat rögzítve.",
    proposedDescription: "Elsődlegesen külső árnyékolás és nyári hővédelem, majd szükség esetén szezonálisan hatékony hűtési rendszer méretezése.",
    effectLevel: "medium",
    dataStatus: "reviewRequired",
    sourceReference: input.openingSet.schema,
  }));

  const renewableItems: Array<{ enabled: boolean; category: EnergyRenovationMeasureCategory; target: string; title: string; existing: string; proposal: string; current?: number; targetValue?: number; unit: string; source: string; blocked: boolean }> = [
    {
      enabled: input.renewableWorkspace.pv.enabled,
      category: "pv",
      target: "pv-plan",
      title: "Napelemrendszer telepítése",
      existing: "A villamosenergia-fogyasztás és a tetőfelületek helyszíni adatai alapján.",
      proposal: `${input.renewableResult.pv.selectedPanelCount} db modul, összesen ${input.renewableResult.pv.installedPowerKwp.toFixed(2)} kWp előzetes rendszer.` ,
      current: 0,
      targetValue: input.renewableResult.pv.installedPowerKwp,
      unit: "kWp",
      source: input.renewableWorkspace.pv.sourceReference,
      blocked: input.renewableResult.validationMessages.some((message) => message.code.startsWith("PV_") && message.severity === "blocking"),
    },
    {
      enabled: input.renewableWorkspace.solarThermal.enabled,
      category: "solarThermal",
      target: "solar-thermal-plan",
      title: "Napkollektoros HMV-rásegítés",
      existing: "A személyszám és a HMV-hőmérséklet alapján felvett előzetes igény.",
      proposal: `${input.renewableWorkspace.solarThermal.collectorAreaSquareMeters.toFixed(1)} m² kollektor és ${input.renewableResult.solarThermal.suggestedStorageVolumeLiters ?? "–"} liter javasolt tároló.` ,
      current: 0,
      targetValue: input.renewableWorkspace.solarThermal.collectorAreaSquareMeters,
      unit: "m²",
      source: input.renewableWorkspace.solarThermal.sourceReference,
      blocked: input.renewableResult.validationMessages.some((message) => message.code.startsWith("SOLAR_THERMAL_") && message.severity === "blocking"),
    },
    {
      enabled: input.renewableWorkspace.battery.enabled,
      category: "battery",
      target: "battery-plan",
      title: "Akkumulátoros energiatároló",
      existing: "Az esti fogyasztás, PV-többlet és tartaléküzemi igény alapján.",
      proposal: `${input.renewableResult.battery.suggestedNominalCapacityKwh ?? "–"} kWh előzetesen javasolt névleges kapacitás.` ,
      current: 0,
      targetValue: input.renewableResult.battery.suggestedNominalCapacityKwh ?? input.renewableWorkspace.battery.nominalCapacityKwh,
      unit: "kWh",
      source: input.renewableWorkspace.battery.sourceReference,
      blocked: input.renewableResult.validationMessages.some((message) => message.code.startsWith("BATTERY_") && message.severity === "blocking"),
    },
    {
      enabled: input.renewableWorkspace.evCharging.enabled,
      category: "evCharging",
      target: "ev-charging-plan",
      title: "Elektromosautó-töltő kialakítása",
      existing: "A hálózati csatlakozás, alapfogyasztás és járműhasználat alapján.",
      proposal: `${input.renewableWorkspace.evCharging.chargerPowerKw.toFixed(1)} kW névleges töltő, ${input.renewableWorkspace.evCharging.dynamicLoadBalancing ? "dinamikus terhelésmenedzsmenttel" : "terhelésmenedzsment nélkül"}.`,
      current: 0,
      targetValue: input.renewableWorkspace.evCharging.chargerPowerKw,
      unit: "kW",
      source: input.renewableWorkspace.evCharging.sourceReference,
      blocked: input.renewableResult.evCharging.connectionSufficient === false && !input.renewableWorkspace.evCharging.dynamicLoadBalancing,
    },
  ];
  renewableItems.filter((item) => item.enabled).forEach((item) => suggestions.push(createEnergyRenovationMeasure(item.category, {
    targetEntityId: item.target,
    title: item.title,
    existingDescription: item.existing,
    proposedDescription: item.proposal,
    currentValue: item.current,
    targetValue: round(item.targetValue),
    unit: item.unit,
    effectLevel: item.category === "pv" ? "high" : "medium",
    dataStatus: item.blocked ? "reviewRequired" : "winwattFinalization",
    sourceReference: item.source || input.renewableResult.schema,
    note: input.renewableResult.limitation,
  })));

  const existingByKey = new Map(proposal.measures.map((measure) => [measureKey(measure), measure]));
  const suggestionKeys = new Set(suggestions.map(measureKey));
  let addedCount = 0;
  let updatedCount = 0;
  const mergedSuggestions = suggestions.map((suggestion) => {
    const merged = mergeMeasure(existingByKey.get(measureKey(suggestion)), suggestion);
    if (merged.updated) updatedCount += 1;
    else addedCount += 1;
    return merged.measure;
  });
  const manualMeasures = proposal.measures.filter((measure) => !suggestionKeys.has(measureKey(measure)));
  const now = new Date().toISOString();
  const nextScenarios = workspace.scenarios.map((scenario) => scenario.id === proposal.id ? {
    ...scenario,
    measures: [...mergedSuggestions, ...manualMeasures],
    status: "reviewRequired" as const,
    updatedAt: now,
  } : scenario);
  return {
    workspace: { ...workspace, activeScenarioId: proposal.id, scenarios: nextScenarios, updatedAt: now },
    addedCount,
    updatedCount,
    suggestionCount: suggestions.length,
  };
}
