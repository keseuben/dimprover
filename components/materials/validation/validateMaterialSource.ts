import { canPublishMaterialSource, type MaterialSourcePackage } from "@/components/materials/domain/materialSourceTypes";

export type MaterialValidationMessage = {
  code: string;
  severity: "warning" | "error";
  field?: string;
  message: string;
};

export function validateMaterialSource(source: MaterialSourcePackage, publicPublication = false): MaterialValidationMessage[] {
  const messages: MaterialValidationMessage[] = [];
  if (!source.name.trim()) messages.push({ code: "SOURCE_NAME_REQUIRED", severity: "error", field: "name", message: "A forráscsomag neve kötelező." });
  if (!source.licenseStatus || source.licenseStatus === "unknown") messages.push({ code: "LICENSE_UNKNOWN", severity: "warning", field: "licenseStatus", message: "A forrás licencállapota nincs tisztázva." });
  if (publicPublication && !canPublishMaterialSource(source)) messages.push({ code: "PUBLICATION_NOT_ALLOWED", severity: "error", message: "A forráscsomag licencadatai nem engedik a központi publikálást." });
  if (source.attributionRequired && !source.attributionText?.trim()) messages.push({ code: "ATTRIBUTION_REQUIRED", severity: "error", field: "attributionText", message: "A kötelező forrásmegjelölés szövege hiányzik." });
  return messages;
}
