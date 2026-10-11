/**
 * V0.9.49 central AUTH license operator / dual approval model.
 * Pure commercial review only. Not an authorization token, billing proof,
 * database mutation or effective product entitlement.
 */
export const LICENSE_OPERATOR_WORKFLOW_VERSION="0.9.49" as const;
export const LICENSE_ACTIVATION_RELEASED=false as const;

export const LICENSE_OPERATOR_PERMISSIONS=[
  "license.center.read","license.request.create","license.request.cancel",
  "license.billing.review","license.security.review","license.release.prepare",
  "license.audit.read","license.operator.manage",
] as const;
export type LicenseOperatorPermission=typeof LICENSE_OPERATOR_PERMISSIONS[number];

export const LICENSE_OPERATOR_ROLES=[
  {code:"LICENSE_SUPERADMIN",label:"Licencközpont főadmin",
    description:"Operátori jogosultságok kezelése és ellenőrzés; önjóváhagyás nincs.",
    permissions:["license.center.read","license.request.create","license.request.cancel",
      "license.billing.review","license.security.review","license.release.prepare",
      "license.audit.read","license.operator.manage"]},
  {code:"LICENSE_OPERATOR",label:"Licencügyintéző",
    description:"Kérelmek felvitele, ellenőrzése és megszüntetésének kezdeményezése.",
    permissions:["license.center.read","license.request.create","license.request.cancel"]},
  {code:"LICENSE_FINANCE",label:"Pénzügyi ellenőr",
    description:"Számlázási és befizetési igazolás felülvizsgálata.",
    permissions:["license.center.read","license.billing.review"]},
  {code:"LICENSE_SECURITY",label:"Biztonsági jóváhagyó",
    description:"Jogosultság-, termék- és ügyfél-hozzárendelési ellenőrzés.",
    permissions:["license.center.read","license.security.review","license.release.prepare",
      "license.audit.read"]},
  {code:"LICENSE_AUDITOR",label:"Licencellenőr · csak olvasás",
    description:"Kérelmek és változástörténet ellenőrzése, írás nélkül.",
    permissions:["license.center.read","license.audit.read"]},
  {code:"LICENSE_SUPPORT_READONLY",label:"Ügyfélszolgálat · csak olvasás",
    description:"Ügyféllicenc állapotának megtekintése, módosítás nélkül.",
    permissions:["license.center.read"]},
] as const satisfies readonly {
  code:string;label:string;description:string;permissions:readonly LicenseOperatorPermission[];
}[];

export type LicenseOperatorRoleCode=typeof LICENSE_OPERATOR_ROLES[number]["code"];
export type LicenseRequestScope="USER"|"ORGANIZATION"|"PROJECT";
export type LicenseApprovalStage="PENDING_BILLING"|"PENDING_SECURITY"|"READY_FOR_RELEASE"|"REJECTED"|"CANCELLED";
export type LicenseApprovalInput={
  requestId:string;
  requesterUserId:string;
  ownerId:string;
  productCode:string;
  scope:LicenseRequestScope;
  planCode:string;
  payerType:"USER"|"ORGANIZATION";
  payerId:string;
  reason:string;
  proposedExpiry:string;
  // Verified billing proof is a reference only (no invoice content or PII).
  billingEvidenceRef:string|null;
  financeReviewerId:string|null;
  financeApprovedAt:string|null;
  securityReviewerId:string|null;
  securityApprovedAt:string|null;
  rejected:boolean;
  cancelled:boolean;
};
export type LicenseApprovalResult={
  stage:LicenseApprovalStage;
  blockers:readonly string[];
  readyForRelease:boolean;
  effectiveEntitlementActive:false;
  invoiceCharged:false;
  activationReleased:false;
};

export function licenseRoleHasPermission(
  role:LicenseOperatorRoleCode,permission:LicenseOperatorPermission,
):boolean{
  const record=LICENSE_OPERATOR_ROLES.find(item=>item.code===role);
  return record!==undefined&&(record.permissions as readonly string[]).includes(permission);
}

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const plan=/^[A-Z0-9][A-Z0-9_-]{1,63}$/;
const reference=/^[A-Z0-9][A-Z0-9_:/.-]{7,127}$/;
const nonemptyUuid=(id:string|null)=>id!==null&&uuid.test(id);

/** No interpolation of private invoice content or actual health information. */
export function evaluateLicenseApproval(request:LicenseApprovalInput):LicenseApprovalResult{
  const blockers:string[]=[];
  if(!uuid.test(request.requestId)||!uuid.test(request.requesterUserId))
    blockers.push("REQUEST_IDENTITY_UNVERIFIED");
  if(!uuid.test(request.ownerId)||!uuid.test(request.payerId))
    blockers.push("OWNER_OR_PAYER_UNVERIFIED");
  if(!/^[A-Z][A-Z0-9_]{1,63}$/.test(request.productCode)||
     !plan.test(request.planCode))
    blockers.push("PRODUCT_OR_PLAN_INVALID");
  if(!["USER","ORGANIZATION","PROJECT"].includes(request.scope))
    blockers.push("SCOPE_INVALID");
  if(!["USER","ORGANIZATION"].includes(request.payerType))
    blockers.push("PAYER_TYPE_INVALID");
  if(request.reason.trim().length<12||request.reason.trim().length>500)
    blockers.push("REASON_REQUIRED");
  const expiry=Date.parse(request.proposedExpiry);
  if(!Number.isFinite(expiry)||expiry<=Date.now())
    blockers.push("EXPIRY_INVALID");
  if(request.cancelled)return {stage:"CANCELLED",blockers:["REQUEST_CANCELLED"],readyForRelease:false,
    effectiveEntitlementActive:false,invoiceCharged:false,activationReleased:false};
  if(request.rejected)return {stage:"REJECTED",blockers:["REQUEST_REJECTED"],readyForRelease:false,
    effectiveEntitlementActive:false,invoiceCharged:false,activationReleased:false};
  if(!request.billingEvidenceRef||!reference.test(request.billingEvidenceRef))
    blockers.push("BILLING_EVIDENCE_NOT_VERIFIED");
  if(!nonemptyUuid(request.financeReviewerId)||!request.financeApprovedAt||
     !Number.isFinite(Date.parse(request.financeApprovedAt)))
    blockers.push("BILLING_REVIEW_REQUIRED");
  if(request.financeReviewerId===request.requesterUserId)
    blockers.push("FINANCE_SELF_APPROVAL_DENIED");
  if(!nonemptyUuid(request.securityReviewerId)||!request.securityApprovedAt||
     !Number.isFinite(Date.parse(request.securityApprovedAt)))
    blockers.push("SECURITY_REVIEW_REQUIRED");
  if(request.securityReviewerId===request.requesterUserId||
     request.securityReviewerId===request.financeReviewerId)
    blockers.push("SECURITY_REVIEWER_MUST_BE_DISTINCT");
  const billingBlockers=blockers.some(item=>[
    "BILLING_EVIDENCE_NOT_VERIFIED","BILLING_REVIEW_REQUIRED",
    "FINANCE_SELF_APPROVAL_DENIED",
  ].includes(item));
  const stage:LicenseApprovalStage=billingBlockers?"PENDING_BILLING":
    blockers.length?"PENDING_SECURITY":"READY_FOR_RELEASE";
  return {stage,blockers,readyForRelease:stage==="READY_FOR_RELEASE",
    effectiveEntitlementActive:false,invoiceCharged:false,activationReleased:false};
}

/** A live operation always needs a separately approved future release. */
export function canActivateLicense():false{return LICENSE_ACTIVATION_RELEASED;}
