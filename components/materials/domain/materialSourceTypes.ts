export type MaterialSourceType = "standard" | "officialDocument" | "manufacturer" | "openDatabase" | "winwattExport" | "userFile";
export type MaterialLicenseStatus = "unknown" | "internalOnly" | "userOwned" | "permissionRequested" | "licensed" | "openLicense" | "publicationProhibited";

export type MaterialSourcePackage = {
  id: string;
  name: string;
  sourceType: MaterialSourceType;
  publisher?: string;
  documentTitle?: string;
  documentVersion?: string;
  documentDate?: string;
  originalFileName?: string;
  originalFileHash?: string;
  importedFileHash?: string;
  licenseStatus: MaterialLicenseStatus;
  licenseReference?: string;
  redistributionAllowed: boolean;
  commercialUseAllowed: boolean;
  attributionRequired: boolean;
  attributionText?: string;
  importedBy: string;
  importedAt: string;
};

export function canPublishMaterialSource(source: MaterialSourcePackage) {
  return source.redistributionAllowed
    && source.commercialUseAllowed
    && (source.licenseStatus === "licensed" || source.licenseStatus === "openLicense");
}
