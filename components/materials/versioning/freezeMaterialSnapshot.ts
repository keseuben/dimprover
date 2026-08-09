import type { EnergyMaterialSnapshot, MaterialVersion } from "@/components/materials/domain/materialPropertyTypes";
import type { MaterialRecord } from "@/components/materials/domain/materialTypes";

export type FreezeMaterialSnapshotOptions = {
  lambdaOverrideWmK?: number;
  overrideReason?: string;
  sourceDocument?: string;
  capturedAt?: string;
};

export function freezeMaterialSnapshot(material: MaterialRecord, version: MaterialVersion, options: FreezeMaterialSnapshotOptions = {}): Readonly<EnergyMaterialSnapshot> {
  const catalogLambda = version.designLambdaWmK?.value ?? version.declaredLambdaWmK?.value;
  const lambda = options.lambdaOverrideWmK ?? catalogLambda;
  if (!Number.isFinite(lambda) || Number(lambda) <= 0) throw new Error(`A(z) ${material.productName} anyaghoz nincs használható pozitív λ-érték.`);
  if (options.lambdaOverrideWmK !== undefined && !options.overrideReason?.trim()) throw new Error("A λ-felülírás indoklása kötelező.");
  const snapshot: EnergyMaterialSnapshot = {
    materialId: material.id,
    materialVersionId: version.id,
    displayName: material.productName,
    manufacturer: material.manufacturerName,
    productCode: material.productCode,
    densityKgM3: version.densityKgM3?.value,
    specificHeatJkgK: version.specificHeatJkgK?.value,
    lambdaUsedWmK: Number(lambda),
    lambdaSource: options.lambdaOverrideWmK !== undefined ? "custom" : version.designLambdaWmK?.value !== undefined ? "design" : "declared",
    mu: version.vaporResistanceFactorMu?.value,
    sourcePackageId: version.sourcePackageId,
    sourceDocument: options.sourceDocument,
    verificationStatus: version.verificationStatus,
    capturedAt: options.capturedAt || new Date().toISOString(),
  };
  return Object.freeze(snapshot);
}
