import type { EnergyAirGapResistanceRow, EnergyAssemblyLayerResult, EnergyAssemblyValidationMessage, EnergyHeatFlowDirection } from "@/components/energy/domain/energyAssemblyTypes";
import type { SurveyAssemblyLayer, SurveyConstructionAssembly } from "@/components/property-survey/propertySurveyEnergyModel";

function round(value: number, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function directionKey(direction: EnergyHeatFlowDirection): keyof Pick<EnergyAirGapResistanceRow, "upwardM2KPerW" | "horizontalM2KPerW" | "downwardM2KPerW"> {
  return direction === "upward" ? "upwardM2KPerW" : direction === "downward" ? "downwardM2KPerW" : "horizontalM2KPerW";
}

export function interpolateClosedAirGapResistance(thicknessMm: number, direction: EnergyHeatFlowDirection, rows: EnergyAirGapResistanceRow[]) {
  if (!Number.isFinite(thicknessMm) || thicknessMm < 0 || !rows.length) return null;
  const sorted = [...rows].sort((left, right) => left.thicknessMm - right.thicknessMm);
  if (thicknessMm > sorted[sorted.length - 1].thicknessMm) return null;
  const key = directionKey(direction);
  const exact = sorted.find((row) => row.thicknessMm === thicknessMm);
  if (exact) return exact[key];
  const upperIndex = sorted.findIndex((row) => row.thicknessMm > thicknessMm);
  if (upperIndex <= 0) return sorted[0][key];
  const lower = sorted[upperIndex - 1];
  const upper = sorted[upperIndex];
  const ratio = (thicknessMm - lower.thicknessMm) / (upper.thicknessMm - lower.thicknessMm);
  return round(lower[key] + (upper[key] - lower[key]) * ratio, 6);
}

export function calculateAssemblyLayerResistance(input: {
  assembly: SurveyConstructionAssembly;
  layer: SurveyAssemblyLayer;
  airGapRows: EnergyAirGapResistanceRow[];
}): { result: EnergyAssemblyLayerResult; messages: EnergyAssemblyValidationMessage[] } {
  const { assembly, layer } = input;
  const messages: EnergyAssemblyValidationMessage[] = [];
  const layerName = layer.material || layer.id;
  const messageBase = { assemblyId: assembly.id, assemblyName: assembly.name, layerId: layer.id, layerName };
  const thicknessMeters = Number(layer.thicknessCm) / 100;
  const lambda = Number(String(layer.lambdaWmK || "").replace(",", "."));
  const fixedResistance = Number(String(layer.fixedResistanceM2KPerW || "").replace(",", "."));
  let resistance: number | null = null;
  let resistanceSource: EnergyAssemblyLayerResult["resistanceSource"] = "missing";

  if (!layer.material.trim()) messages.push({ ...messageBase, code: "LAYER_NAME_REQUIRED", severity: "error", blocking: true, field: "material", message: `${assembly.name}: a(z) ${layer.id} réteg megnevezése hiányzik.` });

  if (layer.kind === "solid") {
    if (!(thicknessMeters > 0)) messages.push({ ...messageBase, code: "LAYER_THICKNESS_INVALID", severity: "error", blocking: true, field: "thicknessCm", message: `${assembly.name} · ${layerName}: a rétegvastagságnak pozitívnak kell lennie.` });
    if (!String(layer.lambdaWmK || "").trim()) messages.push({ ...messageBase, code: "LAYER_LAMBDA_MISSING", severity: "error", blocking: true, field: "lambdaWmK", message: `${assembly.name} · ${layerName}: hiányzik a tervezési λ-érték, ezért nem készül hamis U-eredmény.` });
    else if (!(lambda > 0) || lambda > 500) messages.push({ ...messageBase, code: "LAYER_LAMBDA_INVALID", severity: "error", blocking: true, field: "lambdaWmK", message: `${assembly.name} · ${layerName}: a λ-érték legyen 0 és 500 W/(mK) között.` });
    if (thicknessMeters > 0 && lambda > 0 && lambda <= 500) {
      resistance = thicknessMeters / lambda;
      resistanceSource = "d/lambda";
    }
  } else if (layer.kind === "closedAirGap") {
    const thicknessMm = Number(layer.thicknessCm) * 10;
    if (!(thicknessMm >= 0) || thicknessMm > 300) messages.push({ ...messageBase, code: "AIR_GAP_TOO_THICK", severity: "error", blocking: true, field: "thicknessCm", message: `${assembly.name} · ${layerName}: az egyszerűsített zárt légréteg-tábla legfeljebb 300 mm vastagságig alkalmazható.` });
    else {
      resistance = interpolateClosedAirGapResistance(thicknessMm, assembly.heatFlowDirection, input.airGapRows);
      resistanceSource = resistance === null ? "missing" : "airGapTable";
    }
  } else if (layer.kind === "ventilatedAirGap") {
    messages.push({ ...messageBase, code: "VENTILATED_AIR_GAP_UNSUPPORTED", severity: "error", blocking: true, field: "airGapVentilation", message: `${assembly.name} · ${layerName}: kis- vagy intenzíven szellőztetett légréteghez nyílásfelület és külön számítás szükséges; a v0.7.2 nem helyettesíti ezt becsléssel.` });
  } else if (layer.kind === "fixedResistance") {
    if (!(fixedResistance > 0)) messages.push({ ...messageBase, code: "LAYER_RESISTANCE_INVALID", severity: "error", blocking: true, field: "fixedResistanceM2KPerW", message: `${assembly.name} · ${layerName}: a megadott hővezetési ellenállás legyen pozitív.` });
    else {
      resistance = fixedResistance;
      resistanceSource = "fixed";
    }
  }

  const snapshotLambda = layer.materialSnapshot?.lambdaUsedWmK;
  if (snapshotLambda !== undefined && Number.isFinite(lambda) && Math.abs(lambda - snapshotLambda) > 0.000001 && !layer.lambdaOverrideReason?.trim()) {
    messages.push({ ...messageBase, code: "LAYER_OVERRIDE_REASON_REQUIRED", severity: "error", blocking: true, field: "lambdaOverrideReason", message: `${assembly.name} · ${layerName}: a katalógus λ-értékének felülírásához indoklás szükséges.` });
  }
  if (layer.materialSnapshot && layer.materialSnapshot.verificationStatus !== "verified") {
    messages.push({ ...messageBase, code: "UNVERIFIED_MATERIAL", severity: "warning", blocking: false, message: `${assembly.name} · ${layerName}: az anyagverzió ${layer.materialSnapshot.verificationStatus} állapotú; szakmai ellenőrzés szükséges.` });
  }

  return {
    result: {
      layerId: layer.id,
      layerName,
      kind: layer.kind,
      thicknessMeters: Number.isFinite(thicknessMeters) ? round(thicknessMeters) : null,
      lambdaWmK: Number.isFinite(lambda) && lambda > 0 ? round(lambda) : null,
      resistanceM2KPerW: resistance === null ? null : round(resistance),
      resistanceSource,
      materialVersionId: layer.materialVersionId || layer.materialSnapshot?.materialVersionId,
      materialVerificationStatus: layer.materialSnapshot?.verificationStatus,
      valid: resistance !== null && !messages.some((message) => message.blocking),
    },
    messages,
  };
}
