/**
 * Commercial proposal only. These are NOT paid products or enforcement defaults.
 * Personal Drive currently uses 50 GiB in Content Core and project Drive
 * currently uses 10 GiB in the Drive Storage Core. Neither is changed here.
 */
export const GIB = 1024 ** 3;

export type LicensePlanScope = "PERSONAL" | "PROJECT";
export type LicensePlanProduct = "DRIVE" | "PROJECT_GATE";

export type LicensePlanDraft = {
  planCode: string;
  productCode: LicensePlanProduct;
  scope: LicensePlanScope;
  label: string;
  description: string;
  proposedStorageGiB: number | null;
  proposedMemberLimit: number | null;
  proposedFeatureCodes: string[];
  proposedMonthlyPriceHuf: null;
  proposedAnnualPriceHuf: null;
  status: "DRAFT";
  published: false;
};

/**
 * User-approved capacity choices (GiB), 2026-10-11.
 * Storage tier != feature tier, seat entitlement or commercial price.
 * Labels/features/seats remain PROPOSALS, to be approved independently.
 */
export const USER_SELECTED_DRIVE_SIZES_GIB = [5,10,25,50,100,250,500] as const;

/** Keep existing V0.9.39 identifiers stable for source compatibility. */
const personalTierCodes: readonly [number,string][] = [
  [5,"DRIVE_PERSONAL_START"],[10,"DRIVE_PERSONAL_10G"],
  [25,"DRIVE_PERSONAL_PLUS"],[50,"DRIVE_PERSONAL_50G"],
  [100,"DRIVE_PERSONAL_PRO"],[250,"DRIVE_PERSONAL_250G"],
  [500,"DRIVE_PERSONAL_500G"],
];
const projectTierCodes: readonly [number,string][] = [
  [5,"DRIVE_PROJECT_5G"],[10,"DRIVE_PROJECT_10G"],
  [25,"DRIVE_PROJECT_START"],[50,"DRIVE_PROJECT_50G"],
  [100,"DRIVE_PROJECT_TEAM"],[250,"DRIVE_PROJECT_250G"],
  [500,"DRIVE_PROJECT_ENTERPRISE"],
];

function draftDriveTiers(
  scope: "PERSONAL" | "PROJECT",
  tiers: readonly [number,string][],
): LicensePlanDraft[] {
  const isPersonal=scope==="PERSONAL";
  return tiers.map(([gib,code])=>({
    planCode:code,productCode:"DRIVE",scope,
    label:(isPersonal?"Saját Drive":"Projekt Drive")+" · "+gib+" GiB",
    description:isPersonal?"Személyes dokumentumtár":"Közös projektfájlok, verziók és külsős résztvevők",
    proposedStorageGiB:gib,
    // Project seats are a separate commercial decision; never infer seats from GiB.
    proposedMemberLimit:isPersonal?1:null,
    // Identical baseline functionality for all capacities. Advanced features
    // and user seats are licensed separately, not automatically from GiB.
    proposedFeatureCodes:isPersonal
      ? ["PERSONAL_FILES","MANUAL_UPLOAD"]
      : ["PROJECT_FILES","FILE_HISTORY","PROJECT_ACL"],
    proposedMonthlyPriceHuf:null,proposedAnnualPriceHuf:null,status:"DRAFT",published:false,
  }));
}

export const INITIAL_LICENSE_PLAN_DRAFTS: readonly LicensePlanDraft[] = [
  ...draftDriveTiers("PERSONAL",personalTierCodes),
  ...draftDriveTiers("PROJECT",projectTierCodes),
  {planCode:"GATE_PROJECT_BASIC",productCode:"PROJECT_GATE",scope:"PROJECT",
    label:"Projektkapu Alap",description:"Projektirányítás, modulok és munkafolyamatok – alap",
    proposedStorageGiB:null,proposedMemberLimit:10,proposedFeatureCodes:["PROJECT_OVERVIEW","PROJECT_MEMBERS"],
    proposedMonthlyPriceHuf:null,proposedAnnualPriceHuf:null,status:"DRAFT",published:false},
  {planCode:"GATE_PROJECT_PRO",productCode:"PROJECT_GATE",scope:"PROJECT",
    label:"Projektkapu Pro",description:"Projektirányítás, modulok és munkafolyamatok – Pro",
    proposedStorageGiB:null,proposedMemberLimit:25,proposedFeatureCodes:["PROJECT_OVERVIEW","PROJECT_MEMBERS","DIALOG_CANDIDATE","DECIDE_CANDIDATE"],
    proposedMonthlyPriceHuf:null,proposedAnnualPriceHuf:null,status:"DRAFT",published:false},
  {planCode:"GATE_PROJECT_ENTERPRISE",productCode:"PROJECT_GATE",scope:"PROJECT",
    label:"Projektkapu Enterprise",description:"Projektirányítás, modulok és munkafolyamatok – Enterprise",
    proposedStorageGiB:null,proposedMemberLimit:100,proposedFeatureCodes:["PROJECT_OVERVIEW","PROJECT_MEMBERS","DIALOG_CANDIDATE","DECIDE_CANDIDATE","REPORTS_CANDIDATE"],
    proposedMonthlyPriceHuf:null,proposedAnnualPriceHuf:null,status:"DRAFT",published:false},
] as const;

export function validateProposedPlanSelection(input: {
  planCode: string; productCode: LicensePlanProduct; scope: LicensePlanScope;
}) {
  return INITIAL_LICENSE_PLAN_DRAFTS.find(plan=>
    plan.planCode===input.planCode && plan.productCode===input.productCode && plan.scope===input.scope
  ) ?? null;
}
