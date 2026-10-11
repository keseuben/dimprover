/**
 * Canonical product topology, version 1.0.
 *
 * This is classification metadata, NOT a license, SSO registration,
 * ACL grant, quota override or enabled product.
 *
 * Architectural levels: ONE → WORK → PROJECT_GATE → BUILD → DIMPROVER.
 * DRIVE is a separately licensable shared service, not a sixth level.
 */
export const DIMPRO_PRODUCT_ARCHITECTURE_VERSION = "1.0.0" as const;

export type DimproLicenseScope = "USER" | "ORGANIZATION" | "PROJECT";
export type DimproProductCode =
  | "DIMPRO_ONE"
  | "DIMPRO_WORK"
  | "PROJECT_GATE"
  | "DIMPRO_BUILD"
  | "DIMPROVER"
  | "DRIVE";

export type DimproProductDefinition = {
  code: DimproProductCode;
  name: string;
  architecturalLevel: 1 | 2 | 3 | 4 | 5 | null;
  role: "PRIMARY_PRODUCT" | "SHARED_SERVICE";
  licenseScopes: readonly DimproLicenseScope[];
  storagePolicy: "PERSONAL_DRIVE" | "PROJECT_DRIVE" | "SHARED_DRIVE" | "NO_INDEPENDENT_DRIVE_QUOTA";
  currentCommercialRecord: "PROJECT_LICENSE_SOURCE_ONLY" | "NOT_IMPLEMENTED";
  state: "ARCHITECTURE_DEFINED";
};

export const DIMPRO_PRODUCTS: readonly DimproProductDefinition[] = [
  {
    code:"DIMPRO_ONE",name:"DIMPROONE",architecturalLevel:1,role:"PRIMARY_PRODUCT",
    licenseScopes:["USER"],storagePolicy:"SHARED_DRIVE",
    currentCommercialRecord:"NOT_IMPLEMENTED",state:"ARCHITECTURE_DEFINED",
  },
  {
    code:"DIMPRO_WORK",name:"DIMPRO WORK",architecturalLevel:2,role:"PRIMARY_PRODUCT",
    licenseScopes:["ORGANIZATION"],storagePolicy:"SHARED_DRIVE",
    currentCommercialRecord:"NOT_IMPLEMENTED",state:"ARCHITECTURE_DEFINED",
  },
  {
    code:"PROJECT_GATE",name:"DIMPRO Projektkapu",architecturalLevel:3,role:"PRIMARY_PRODUCT",
    licenseScopes:["PROJECT"],storagePolicy:"NO_INDEPENDENT_DRIVE_QUOTA",
    currentCommercialRecord:"PROJECT_LICENSE_SOURCE_ONLY",state:"ARCHITECTURE_DEFINED",
  },
  {
    code:"DIMPRO_BUILD",name:"DIMPRO BUILD",architecturalLevel:4,role:"PRIMARY_PRODUCT",
    licenseScopes:["PROJECT","ORGANIZATION"],storagePolicy:"SHARED_DRIVE",
    currentCommercialRecord:"NOT_IMPLEMENTED",state:"ARCHITECTURE_DEFINED",
  },
  {
    code:"DIMPROVER",name:"DIMPROVER",architecturalLevel:5,role:"PRIMARY_PRODUCT",
    licenseScopes:["ORGANIZATION","PROJECT"],storagePolicy:"SHARED_DRIVE",
    currentCommercialRecord:"NOT_IMPLEMENTED",state:"ARCHITECTURE_DEFINED",
  },
  {
    code:"DRIVE",name:"DIMPRO Drive",architecturalLevel:null,role:"SHARED_SERVICE",
    licenseScopes:["USER","PROJECT"],storagePolicy:"SHARED_DRIVE",
    currentCommercialRecord:"PROJECT_LICENSE_SOURCE_ONLY",state:"ARCHITECTURE_DEFINED",
  },
] as const;

export const DIMPRO_PRIMARY_PRODUCT_CODES = [
  "DIMPRO_ONE","DIMPRO_WORK","PROJECT_GATE","DIMPRO_BUILD","DIMPROVER",
] as const;

export const DIMPRO_PROJECT_RELEVANT_CODES = [
  "DRIVE","PROJECT_GATE","DIMPRO_BUILD","DIMPROVER",
] as const;

export function dimproProduct(code:DimproProductCode):DimproProductDefinition {
  const found=DIMPRO_PRODUCTS.find(item=>item.code===code);
  if(!found)throw new Error("DIMPRO_PRODUCT_UNKNOWN");
  return found;
}

export function isLicensedScopeAllowed(code:DimproProductCode,scope:DimproLicenseScope):boolean{
  return dimproProduct(code).licenseScopes.includes(scope);
}

export function currentProjectLicenseHasSource(code:DimproProductCode):boolean{
  return code==="DRIVE"||code==="PROJECT_GATE";
}
