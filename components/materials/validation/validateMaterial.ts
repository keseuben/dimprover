import type { MaterialRecord } from "@/components/materials/domain/materialTypes";
import type { MaterialVersion } from "@/components/materials/domain/materialPropertyTypes";
import type { MaterialValidationMessage } from "@/components/materials/validation/validateMaterialSource";
import { validateMaterialPropertySet } from "@/components/materials/validation/validateMaterialPropertySet";

export function validateMaterial(material: MaterialRecord, version: MaterialVersion, forEnergyCalculation = false): MaterialValidationMessage[] {
  const messages: MaterialValidationMessage[] = [];
  if (!material.productName.trim()) messages.push({ code: "MATERIAL_NAME_REQUIRED", severity: "error", field: "productName", message: "Az anyag vagy termék neve kötelező." });
  if (!material.categoryId) messages.push({ code: "CATEGORY_REQUIRED", severity: "error", field: "categoryId", message: "Anyagkategória kiválasztása kötelező." });
  if (material.currentVersionId !== version.id || version.materialId !== material.id) messages.push({ code: "VERSION_REFERENCE_INVALID", severity: "error", message: "Az anyag és az aktív verzió hivatkozása nem egyezik." });
  if (material.kind === "manufacturerProduct" && !material.manufacturerName?.trim()) messages.push({ code: "MANUFACTURER_REQUIRED", severity: "error", field: "manufacturerName", message: "Gyártói terméknél a gyártó megadása kötelező." });
  if (material.visibility === "public" && material.publicationStatus !== "published") messages.push({ code: "PUBLIC_STATUS_INVALID", severity: "error", field: "publicationStatus", message: "Nyilvános rekord csak publikált állapotban lehet." });
  return [...messages, ...validateMaterialPropertySet(version, forEnergyCalculation)];
}
