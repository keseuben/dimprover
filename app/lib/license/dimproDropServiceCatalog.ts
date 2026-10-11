/**
 * DIMPRO Drop is an independent shared file-transfer service alongside Drive,
 * NOT a sixth architectural level or a mini-app.
 * Registry and legacy bridge are planning-only until separately released.
 */
import type {DimproLicenseScope} from "./dimproProductArchitecture";

export const DIMPRO_DROP_PRODUCT_CODE="DIMPRO_DROP" as const;
export const DIMPRO_DROP_COMMERCIAL_RELEASED=false as const;
export const DIMPRO_DROP_LEGACY_CUTOVER_RELEASED=false as const;

export const DIMPRO_DROP_SERVICE={
  code:DIMPRO_DROP_PRODUCT_CODE,
  name:"DIMPRO Drop",
  category:"SHARED_SERVICE",
  companionProductCode:"DRIVE",
  licenseScopes:["USER","ORGANIZATION"] as readonly DimproLicenseScope[],
  requiresDriveSubscription:false,
  standaloneUse:true,
  driveConnection:"OPTIONAL_PROJECT_ACL_GATED",
  commercialState:"MIGRATION_PLANNED",
  temporaryStorageDistinctFromDrive:true,
} as const;

export const DIMPRO_DROP_WORKFLOWS=[
  {code:"DROP_SEND",name:"DIMPRO Send",description:"Önálló, címzetteknek történő e-mailes fájlküldés",driveRequired:false},
  {code:"DROP_QUICK_IMAGE_SEND",name:"Gyors KépSend",description:"Képoptimalizálással és megjegyzésekkel történő küldés",driveRequired:false},
  {code:"DROP_PROJECT_INBOX",name:"Projekt Beérkező Drop",description:"Projektkapcsolatos fájlátadás, külön Project Core ACL mellett",driveRequired:false},
  {code:"DROP_QUICK_VOICE_NOTE",name:"Hangos megjegyzés",description:"Kiegészítő, licencfüggő hangos megjegyzés",driveRequired:false},
] as const;

export const DIMPRO_DROP_LEGACY_ORIGINS=[
  "IDENTITY_CORE_DIMPRO_LICENSES",
  "LEGACY_DROP_SEND_CODE",
] as const;

export type DropLegacyOrigin=(typeof DIMPRO_DROP_LEGACY_ORIGINS)[number];
export type DropLegacyOwnerType="USER"|"ORGANIZATION";
export type DropLegacyCandidate={
  source:DropLegacyOrigin;
  sourceRecordId:string;
  sourceProductCode:string;
  ownerType:DropLegacyOwnerType;
  verifiedCentralOwnerId:string|null;
  legacyStatus:"active"|"trial"|"pending"|"suspended"|"expired"|"revoked";
  legacyExpiresAt:string|null;
  legacyModuleCodes:readonly string[];
  hasExistingSendEntitlement:boolean;
};

export type DropMigrationPreview={
  source:DropLegacyOrigin;
  sourceRecordId:string;
  targetProductCode:typeof DIMPRO_DROP_PRODUCT_CODE;
  targetScope:DropLegacyOwnerType;
  decision:"MANUAL_REVIEW_REQUIRED"|"BLOCKED_IDENTITY_OR_PRODUCT"|"BLOCKED_INVALID_SOURCE";
  preservedLegacyAccess:true;
  newEntitlementCreated:false;
  automaticallyRevoked:false;
  projectAccessGranted:false;
  effectiveDriveQuotaChanged:false;
  matchedModules:readonly string[];
  warnings:readonly string[];
};

/**
 * No I/O, no credential parsing and no writes. Legacy source remains authoritative.
 * Never infer central AUTH user/org IDs from an e-mail address or Send code.
 */
export function previewDropLegacyMigration(input:DropLegacyCandidate):DropMigrationPreview{
  const warnings:string[]=[];
  const trimmedId=input.sourceRecordId.trim();
  const knownProducts=new Set(["DIMPRO_DROP","DROP","DIMPRO_SEND"]);
  const permittedModules=new Set<string>(DIMPRO_DROP_WORKFLOWS.map(item=>item.code));
  const matchedModules=[...new Set(input.legacyModuleCodes.filter(code=>permittedModules.has(code)))];
  const validSource=DIMPRO_DROP_LEGACY_ORIGINS.includes(input.source)
    &&trimmedId.length>0&&trimmedId.length<=160
    &&["USER","ORGANIZATION"].includes(input.ownerType)
    &&["active","trial","pending","suspended","expired","revoked"].includes(input.legacyStatus);
  if(!validSource)warnings.push("A forrásazonosító, tulajdonosi scope vagy korábbi licencállapot nem ellenőrizhető.");
  if(!knownProducts.has(input.sourceProductCode.trim().toUpperCase()))
    warnings.push("A korábbi licenc termékkódját manuálisan ellenőrizni kell, nem alakítható át automatikusan.");
  const hasVerifiedOwner=typeof input.verifiedCentralOwnerId==="string"
    &&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.verifiedCentralOwnerId);
  if(!hasVerifiedOwner)
    warnings.push("Nincs hitelesen összerendelt központi AUTH USER vagy ORGANIZATION UUID; e-mail alapján tilos párosítani.");
  if(input.legacyModuleCodes.some(code=>!permittedModules.has(code)))
    warnings.push("Ismeretlen vagy speciális legacy modul található, kézi jogosultsági térképezés szükséges.");
  if(input.hasExistingSendEntitlement)
    warnings.push("Meglévő Send entitlement és Send-kód megőrzendő, automatikus visszavonás vagy új kód kiadása tilos.");
  if(input.legacyExpiresAt!==null&&!Number.isFinite(Date.parse(input.legacyExpiresAt)))
    warnings.push("A korábbi lejárati dátumot manuálisan kell ellenőrizni.");
  return {
    source:input.source,sourceRecordId:trimmedId,targetProductCode:DIMPRO_DROP_PRODUCT_CODE,
    targetScope:input.ownerType,
    decision:!validSource?"BLOCKED_INVALID_SOURCE":
      !knownProducts.has(input.sourceProductCode.trim().toUpperCase())||!hasVerifiedOwner
        ?"BLOCKED_IDENTITY_OR_PRODUCT":"MANUAL_REVIEW_REQUIRED",
    preservedLegacyAccess:true,newEntitlementCreated:false,
    automaticallyRevoked:false,projectAccessGranted:false,effectiveDriveQuotaChanged:false,
    matchedModules,warnings,
  };
}
