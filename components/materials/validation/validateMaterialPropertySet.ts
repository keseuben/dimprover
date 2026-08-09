import type { MaterialVersion } from "@/components/materials/domain/materialPropertyTypes";
import type { MaterialValidationMessage } from "@/components/materials/validation/validateMaterialSource";

export function validateMaterialPropertySet(version: MaterialVersion, forEnergyCalculation = false): MaterialValidationMessage[] {
  const messages: MaterialValidationMessage[] = [];
  const lambda = version.designLambdaWmK?.value ?? version.declaredLambdaWmK?.value;
  if (forEnergyCalculation && (!Number.isFinite(lambda) || Number(lambda) <= 0)) {
    messages.push({ code: "LAMBDA_REQUIRED", severity: "error", field: "designLambdaWmK", message: "Energetikai számításhoz pozitív λ-érték szükséges." });
  }
  if (lambda !== undefined && (lambda <= 0 || lambda > 500)) messages.push({ code: "LAMBDA_OUT_OF_RANGE", severity: "error", field: "designLambdaWmK", message: "A λ-érték a technikai ellenőrzési tartományon kívül van." });
  if (version.densityKgM3?.value !== undefined && version.densityKgM3.value <= 0) messages.push({ code: "DENSITY_INVALID", severity: "error", field: "densityKgM3", message: "A sűrűségnek pozitívnak kell lennie." });
  if (version.specificHeatJkgK?.value !== undefined && version.specificHeatJkgK.value <= 0) messages.push({ code: "SPECIFIC_HEAT_INVALID", severity: "error", field: "specificHeatJkgK", message: "A fajhőnek pozitívnak kell lennie." });
  if (version.vaporResistanceFactorMu?.value !== undefined && version.vaporResistanceFactorMu.value <= 0) messages.push({ code: "MU_INVALID", severity: "error", field: "vaporResistanceFactorMu", message: "A μ-értéknek pozitívnak kell lennie." });
  if (!version.sourcePackageId) messages.push({ code: "SOURCE_PACKAGE_REQUIRED", severity: "error", field: "sourcePackageId", message: "Az anyagverzióhoz forráscsomag szükséges." });
  if (forEnergyCalculation && version.verificationStatus === "unverified") messages.push({ code: "UNVERIFIED_FOR_CALCULATION", severity: "warning", field: "verificationStatus", message: "Az anyag nincs szakmailag ellenőrizve; számítási használata figyelmeztetést igényel." });
  return messages;
}
