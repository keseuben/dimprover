import type { MaterialVersion } from "@/components/materials/domain/materialPropertyTypes";

export function selectEnergyLambda(version: MaterialVersion) {
  if (version.designLambdaWmK?.value !== undefined) return { value: version.designLambdaWmK.value, source: "design" as const };
  if (version.declaredLambdaWmK?.value !== undefined) return { value: version.declaredLambdaWmK.value, source: "declared" as const };
  return null;
}
