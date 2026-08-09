import type { EnergyGeometryTraceItem } from "@/components/energy/domain/energyGeometryTypes";

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function traceId(input: Pick<EnergyGeometryTraceItem, "ruleId" | "label" | "entityRefs">) {
  const raw = [input.ruleId, input.label, ...input.entityRefs.map((reference) => `${reference.type}-${reference.id}`)].join("-");
  return `geometry-trace-${raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 180)}`;
}

export function createGeometryTraceItem(input: Omit<EnergyGeometryTraceItem, "id" | "value"> & { digits?: number }): EnergyGeometryTraceItem {
  return {
    id: traceId(input),
    ruleId: input.ruleId,
    label: input.label,
    formula: input.formula,
    inputs: input.inputs,
    unroundedValue: input.unroundedValue,
    value: round(input.unroundedValue, input.digits ?? 3),
    unit: input.unit,
    entityRefs: input.entityRefs,
  };
}
