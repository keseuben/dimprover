import type { SurveyAssemblyLayer } from "@/components/property-survey/propertySurveyEnergyModel";
import type { MaterialVersion } from "@/components/materials/domain/materialPropertyTypes";
import type { MaterialRecord } from "@/components/materials/domain/materialTypes";
import { freezeMaterialSnapshot } from "@/components/materials/versioning/freezeMaterialSnapshot";

export function materialToEnergyLayer(input: {
  layerId: string;
  material: MaterialRecord;
  version: MaterialVersion;
  thicknessCm: number;
  note?: string;
}): SurveyAssemblyLayer {
  const snapshot = freezeMaterialSnapshot(input.material, input.version);
  return {
    id: input.layerId,
    kind: "solid",
    material: input.material.productName,
    materialId: input.material.id,
    materialVersionId: input.version.id,
    materialSnapshot: snapshot,
    thicknessCm: input.thicknessCm,
    lambdaWmK: String(snapshot.lambdaUsedWmK),
    note: input.note || "",
  };
}
