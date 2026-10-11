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

/** Draft figures: proposed only; can be changed before approval, no fixed pricing. */
export const INITIAL_LICENSE_PLAN_DRAFTS: readonly LicensePlanDraft[] = [
  {planCode:"DRIVE_PERSONAL_START",productCode:"DRIVE",scope:"PERSONAL",
    label:"Saját Drive Start",description:"Kisebb személyes dokumentumtár",
    proposedStorageGiB:5,proposedMemberLimit:1,proposedFeatureCodes:["PERSONAL_FILES","MANUAL_UPLOAD"],
    proposedMonthlyPriceHuf:null,proposedAnnualPriceHuf:null,status:"DRAFT",published:false},
  {planCode:"DRIVE_PERSONAL_PLUS",productCode:"DRIVE",scope:"PERSONAL",
    label:"Saját Drive Plus",description:"Rendszeres saját műszaki dokumentumkezelés",
    proposedStorageGiB:25,proposedMemberLimit:1,proposedFeatureCodes:["PERSONAL_FILES","MANUAL_UPLOAD","FILE_HISTORY"],
    proposedMonthlyPriceHuf:null,proposedAnnualPriceHuf:null,status:"DRAFT",published:false},
  {planCode:"DRIVE_PERSONAL_PRO",productCode:"DRIVE",scope:"PERSONAL",
    label:"Saját Drive Pro",description:"Nagyobb, személyes szakmai fájltér",
    proposedStorageGiB:100,proposedMemberLimit:1,proposedFeatureCodes:["PERSONAL_FILES","MANUAL_UPLOAD","FILE_HISTORY","DESKTOP_SYNC_CANDIDATE"],
    proposedMonthlyPriceHuf:null,proposedAnnualPriceHuf:null,status:"DRAFT",published:false},
  {planCode:"DRIVE_PROJECT_START",productCode:"DRIVE",scope:"PROJECT",
    label:"Projekt Drive Start",description:"Kisebb projekt közös műszaki fájltára",
    proposedStorageGiB:25,proposedMemberLimit:10,proposedFeatureCodes:["PROJECT_FILES","FILE_HISTORY","PROJECT_ACL"],
    proposedMonthlyPriceHuf:null,proposedAnnualPriceHuf:null,status:"DRAFT",published:false},
  {planCode:"DRIVE_PROJECT_TEAM",productCode:"DRIVE",scope:"PROJECT",
    label:"Projekt Drive Team",description:"Több szakági szereplős projekt",
    proposedStorageGiB:100,proposedMemberLimit:25,proposedFeatureCodes:["PROJECT_FILES","FILE_HISTORY","PROJECT_ACL","EXTERNAL_PARTNERS_CANDIDATE"],
    proposedMonthlyPriceHuf:null,proposedAnnualPriceHuf:null,status:"DRAFT",published:false},
  {planCode:"DRIVE_PROJECT_ENTERPRISE",productCode:"DRIVE",scope:"PROJECT",
    label:"Projekt Drive Enterprise",description:"Nagy, sok résztvevős beruházás",
    proposedStorageGiB:500,proposedMemberLimit:100,proposedFeatureCodes:["PROJECT_FILES","FILE_HISTORY","PROJECT_ACL","AUDIT_CANDIDATE","EXTERNAL_PARTNERS_CANDIDATE"],
    proposedMonthlyPriceHuf:null,proposedAnnualPriceHuf:null,status:"DRAFT",published:false},
  {planCode:"GATE_PROJECT_BASIC",productCode:"PROJECT_GATE",scope:"PROJECT",
    label:"Projektkapu Alap",description:"Projektáttekintés és alapmunkafolyamatok",
    proposedStorageGiB:null,proposedMemberLimit:10,proposedFeatureCodes:["PROJECT_OVERVIEW","PROJECT_MEMBERS"],
    proposedMonthlyPriceHuf:null,proposedAnnualPriceHuf:null,status:"DRAFT",published:false},
  {planCode:"GATE_PROJECT_PRO",productCode:"PROJECT_GATE",scope:"PROJECT",
    label:"Projektkapu Pro",description:"Kiterjesztett projektmunkafolyamatok",
    proposedStorageGiB:null,proposedMemberLimit:25,proposedFeatureCodes:["PROJECT_OVERVIEW","PROJECT_MEMBERS","DIALOG_CANDIDATE","DECIDE_CANDIDATE"],
    proposedMonthlyPriceHuf:null,proposedAnnualPriceHuf:null,status:"DRAFT",published:false},
  {planCode:"GATE_PROJECT_ENTERPRISE",productCode:"PROJECT_GATE",scope:"PROJECT",
    label:"Projektkapu Enterprise",description:"Nagyobb projekt és bővített modulkeretek",
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
