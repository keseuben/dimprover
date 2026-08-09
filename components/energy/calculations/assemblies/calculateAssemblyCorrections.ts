import type { EnergyAssemblyCorrectionResult, EnergyAssemblyLayerResult, EnergyAssemblyValidationMessage } from "@/components/energy/domain/energyAssemblyTypes";
import type { SurveyConstructionAssembly } from "@/components/property-survey/propertySurveyEnergyModel";

function round(value: number, digits = 8) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateAssemblyCorrections(input: {
  assembly: SurveyConstructionAssembly;
  layerResults: EnergyAssemblyLayerResult[];
  totalResistanceM2KPerW: number;
  baseUValueWm2K: number;
}): { result: EnergyAssemblyCorrectionResult; messages: EnergyAssemblyValidationMessage[]; trace: Array<{ id: string; ruleId: string; label: string; formula: string; inputs: Record<string, number | string | boolean | null>; unroundedValue: number; value: number; unit: "W/m2K" | "%"; layerId?: string }> } {
  const { assembly } = input;
  const messages: EnergyAssemblyValidationMessage[] = [];
  const trace: Array<{ id: string; ruleId: string; label: string; formula: string; inputs: Record<string, number | string | boolean | null>; unroundedValue: number; value: number; unit: "W/m2K" | "%"; layerId?: string }> = [];
  const base = { assemblyId: assembly.id, assemblyName: assembly.name };
  const ratioSquared = (resistance: number) => (resistance / input.totalResistanceM2KPerW) ** 2;

  let airVoidDelta = 0;
  if (assembly.corrections.airVoid.level !== "none") {
    const layer = input.layerResults.find((item) => item.layerId === assembly.corrections.airVoid.insulationLayerId);
    if (!layer?.resistanceM2KPerW) messages.push({ ...base, code: "AIR_VOID_LAYER_REQUIRED", severity: "error", blocking: true, field: "corrections.airVoid.insulationLayerId", message: `${assembly.name}: a légüreg-korrekcióhoz ki kell választani az érintett, érvényes hőszigetelő réteget.` });
    else {
      const coefficient = assembly.corrections.airVoid.level === "level2" ? 0.04 : 0.01;
      airVoidDelta = coefficient * ratioSquared(layer.resistanceM2KPerW);
      trace.push({
        id: `assembly-trace-${assembly.id}-air-void`,
        ruleId: "U-CORR-AIR-VOID-4.12",
        label: `${assembly.name} légüreg-korrekciója`,
        formula: "ΔU'' × (R1 / Rtot)²",
        inputs: { coefficientDeltaU: coefficient, insulationResistanceM2KPerW: layer.resistanceM2KPerW, totalResistanceM2KPerW: input.totalResistanceM2KPerW, level: assembly.corrections.airVoid.level },
        unroundedValue: airVoidDelta,
        value: round(airVoidDelta, 6),
        unit: "W/m2K",
        layerId: layer.layerId,
      });
    }
  }

  let mechanicalDelta = 0;
  const fastener = assembly.corrections.mechanicalFastener;
  if (fastener.enabled) {
    if (!fastener.pointFastener) messages.push({ ...base, code: "MECHANICAL_FASTENER_DETAILED_METHOD_REQUIRED", severity: "error", blocking: true, field: "corrections.mechanicalFastener.pointFastener", message: `${assembly.name}: nem pontszerű vagy két fémlemezt összekötő rögzítőnél részletes numerikus módszer szükséges.` });
    const layer = input.layerResults.find((item) => item.layerId === fastener.insulationLayerId);
    const invalid = !layer?.resistanceM2KPerW
      || !(fastener.fastenerLambdaWmK > 0)
      || !(fastener.fastenerCountPerSquareMeter >= 0)
      || !(fastener.fastenerCrossSectionSquareMeters > 0)
      || !(fastener.insulationThicknessMeters > 0)
      || !(fastener.penetrationLengthMeters > 0)
      || fastener.penetrationLengthMeters > fastener.insulationThicknessMeters * 2;
    if (invalid) messages.push({ ...base, code: "MECHANICAL_FASTENER_INPUT_INVALID", severity: "error", blocking: true, field: "corrections.mechanicalFastener", message: `${assembly.name}: a mechanikai rögzítő korrekciójához érvényes szigetelőréteg, λ, darabszám, keresztmetszet, szigetelésvastagság és behatolási hossz szükséges.` });
    else if (fastener.pointFastener && !fastener.passesAirLayer && fastener.fastenerLambdaWmK >= 1 && layer?.resistanceM2KPerW) {
      const alpha = fastener.embedded ? 0.8 * Math.min(1, fastener.penetrationLengthMeters / fastener.insulationThicknessMeters) : 0.8;
      mechanicalDelta = alpha
        * fastener.fastenerLambdaWmK
        * fastener.fastenerCrossSectionSquareMeters
        * fastener.fastenerCountPerSquareMeter
        / fastener.penetrationLengthMeters
        * ratioSquared(layer.resistanceM2KPerW);
      trace.push({
        id: `assembly-trace-${assembly.id}-mechanical-fastener`,
        ruleId: "U-CORR-FASTENER-4.13",
        label: `${assembly.name} rögzítőelem-korrekciója`,
        formula: "α × λrögz × Arögz × nrögz / d1 × (R1 / Rtot)²",
        inputs: { alpha, fastenerLambdaWmK: fastener.fastenerLambdaWmK, fastenerCrossSectionSquareMeters: fastener.fastenerCrossSectionSquareMeters, fastenerCountPerSquareMeter: fastener.fastenerCountPerSquareMeter, penetrationLengthMeters: fastener.penetrationLengthMeters, insulationResistanceM2KPerW: layer.resistanceM2KPerW, totalResistanceM2KPerW: input.totalResistanceM2KPerW, embedded: fastener.embedded },
        unroundedValue: mechanicalDelta,
        value: round(mechanicalDelta, 6),
        unit: "W/m2K",
        layerId: layer.layerId,
      });
    }
  }

  const invertedRoofDelta = Math.max(0, Number(assembly.corrections.invertedRoofDeltaUWm2K) || 0);
  if (invertedRoofDelta > 0) trace.push({
    id: `assembly-trace-${assembly.id}-inverted-roof`,
    ruleId: "U-CORR-INVERTED-ROOF-4.11",
    label: `${assembly.name} fordított tető korrekciója`,
    formula: "külső, dokumentált MSZ EN ISO 6946 F melléklet szerinti ΔUford",
    inputs: { invertedRoofDeltaUWm2K: invertedRoofDelta, source: assembly.corrections.invertedRoofSource || null },
    unroundedValue: invertedRoofDelta,
    value: round(invertedRoofDelta, 6),
    unit: "W/m2K",
  });

  const totalDelta = airVoidDelta + mechanicalDelta + invertedRoofDelta;
  const ratioPercent = input.baseUValueWm2K > 0 ? totalDelta / input.baseUValueWm2K * 100 : 0;
  const negligible = totalDelta > 0 && ratioPercent < 3;
  const appliedDelta = assembly.corrections.policy === "omitBelowThreePercent" && negligible ? 0 : totalDelta;
  trace.push({
    id: `assembly-trace-${assembly.id}-correction-total`,
    ruleId: "U-CORR-TOTAL-4.10-4.11",
    label: `${assembly.name} összes U-korrekciója`,
    formula: "ΔUlégrés + ΔUrögz + ΔUford",
    inputs: { airVoidDeltaUWm2K: airVoidDelta, mechanicalFastenerDeltaUWm2K: mechanicalDelta, invertedRoofDeltaUWm2K: invertedRoofDelta, baseUValueWm2K: input.baseUValueWm2K, correctionPolicy: assembly.corrections.policy, negligibleBelowThreePercent: negligible },
    unroundedValue: totalDelta,
    value: round(totalDelta, 6),
    unit: "W/m2K",
  });
  trace.push({
    id: `assembly-trace-${assembly.id}-correction-ratio`,
    ruleId: "U-CORR-THRESHOLD-3PCT",
    label: `${assembly.name} korrekciós aránya`,
    formula: "ΔU / U0 × 100",
    inputs: { totalDeltaUWm2K: totalDelta, baseUValueWm2K: input.baseUValueWm2K },
    unroundedValue: ratioPercent,
    value: round(ratioPercent, 4),
    unit: "%",
  });

  return {
    result: {
      airVoidDeltaUWm2K: round(airVoidDelta, 8),
      mechanicalFastenerDeltaUWm2K: round(mechanicalDelta, 8),
      invertedRoofDeltaUWm2K: round(invertedRoofDelta, 8),
      totalDeltaUWm2K: round(totalDelta, 8),
      correctionRatioPercent: round(ratioPercent, 6),
      negligibleBelowThreePercent: negligible,
      appliedDeltaUWm2K: round(appliedDelta, 8),
    },
    messages,
    trace,
  };
}
