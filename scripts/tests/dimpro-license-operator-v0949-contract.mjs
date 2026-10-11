import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  LICENSE_OPERATOR_ROLES,LICENSE_OPERATOR_PERMISSIONS,
  LICENSE_ACTIVATION_RELEASED,licenseRoleHasPermission,
  evaluateLicenseApproval,canActivateLicense,
} from "../../app/lib/license/licenseOperatorPolicy.ts";
const requester="14544d2c-4fe1-4c09-82f3-935d5a8b4b45";
const owner="24544d2c-4fe1-4c09-82f3-935d5a8b4b45";
const finance="34544d2c-4fe1-4c09-82f3-935d5a8b4b45";
const security="44544d2c-4fe1-4c09-82f3-935d5a8b4b45";
const base={
 requestId:"54544d2c-4fe1-4c09-82f3-935d5a8b4b45",
 requesterUserId:requester,ownerId:owner,productCode:"DRIVE",scope:"USER",
 planCode:"DRIVE_PERSONAL_PRO",payerType:"USER",payerId:owner,
 reason:"Purchase test with sufficient written justification",
 proposedExpiry:"2099-11-20T00:00:00Z",
 billingEvidenceRef:null,financeReviewerId:null,financeApprovedAt:null,
 securityReviewerId:null,securityApprovedAt:null,
 cancelled:false,rejected:false,
};
assert.equal(LICENSE_OPERATOR_ROLES.length,6);
assert.equal(LICENSE_OPERATOR_PERMISSIONS.length,8);
assert.equal(new Set(LICENSE_OPERATOR_ROLES.map(x=>x.code)).size,6);
assert.equal(new Set(LICENSE_OPERATOR_PERMISSIONS).size,8);
for(const role of LICENSE_OPERATOR_ROLES){
 assert.ok(role.permissions.includes("license.center.read"),role.code);
 for(const permission of role.permissions)assert.ok(LICENSE_OPERATOR_PERMISSIONS.includes(permission));
 assert.equal(new Set(role.permissions).size,role.permissions.length);
}
for(const role of ["LICENSE_AUDITOR","LICENSE_SUPPORT_READONLY"]){
 for(const permission of ["license.request.create","license.billing.review","license.security.review","license.release.prepare"])
  assert.equal(licenseRoleHasPermission(role,permission),false,role+" is readonly");
}
assert.equal(licenseRoleHasPermission("LICENSE_OPERATOR","license.security.review"),false);
assert.equal(licenseRoleHasPermission("LICENSE_FINANCE","license.security.review"),false);
assert.equal(licenseRoleHasPermission("LICENSE_SECURITY","license.billing.review"),false);
assert.equal(licenseRoleHasPermission("LICENSE_SUPERADMIN","license.operator.manage"),true);
assert.equal(LICENSE_ACTIVATION_RELEASED,false);
assert.equal(canActivateLicense(),false);
let review=evaluateLicenseApproval(base);
assert.equal(review.stage,"PENDING_BILLING");
assert.equal(review.readyForRelease,false);
assert.ok(review.blockers.includes("BILLING_EVIDENCE_NOT_VERIFIED"));
assert.ok(review.blockers.includes("BILLING_REVIEW_REQUIRED"));
const verified={
 ...base,billingEvidenceRef:"INV-2026-TEST001",financeReviewerId:finance,
 financeApprovedAt:"2026-10-11T11:00:00Z",
};
review=evaluateLicenseApproval(verified);
assert.equal(review.stage,"PENDING_SECURITY");
assert.equal(review.readyForRelease,false);
assert.ok(review.blockers.includes("SECURITY_REVIEW_REQUIRED"));
const ready={...verified,securityReviewerId:security,securityApprovedAt:"2026-10-11T12:00:00Z"};
review=evaluateLicenseApproval(ready);
assert.equal(review.stage,"READY_FOR_RELEASE");
assert.equal(review.readyForRelease,true);
assert.equal(review.effectiveEntitlementActive,false);
assert.equal(review.invoiceCharged,false);
assert.equal(review.activationReleased,false);
for(const change of [
 {financeReviewerId:requester},
 {securityReviewerId:requester},
 {securityReviewerId:finance},
 {requestId:"not-a-uuid"},
 {ownerId:"not-a-uuid"},
 {payerId:"not-a-uuid"},
 {productCode:""},
 {planCode:"unsafe #"},
 {reason:"x"},
 {proposedExpiry:"2000-01-01T00:00:00Z"},
 {proposedExpiry:"not a date"},
 {billingEvidenceRef:"INVALID INVOICE"},
 {scope:"INVALID"},
 {payerType:"ANONYMOUS"},
]){
 review=evaluateLicenseApproval({...ready,...change});
 assert.equal(review.readyForRelease,false,JSON.stringify(change));
 assert.ok(review.blockers.length>=1,JSON.stringify(change));
}
assert.ok(evaluateLicenseApproval({...ready,financeReviewerId:requester})
 .blockers.includes("FINANCE_SELF_APPROVAL_DENIED"));
assert.ok(evaluateLicenseApproval({...ready,securityReviewerId:finance})
 .blockers.includes("SECURITY_REVIEWER_MUST_BE_DISTINCT"));
assert.equal(evaluateLicenseApproval({...ready,cancelled:true}).stage,"CANCELLED");
assert.equal(evaluateLicenseApproval({...ready,rejected:true}).stage,"REJECTED");
const frozen=evaluateLicenseApproval(ready);
assert.equal(frozen.activationReleased,false,"preview never enables license");
const sql=readFileSync("db/auth/migrations/022_auth_v059_license_operator_approval_review.sql","utf8");
assert.ok(sql.includes("auth_role_permissions"),"reuses central AUTH RBAC");
assert.ok(sql.includes("auth_access_grants"),"documents no operator assignments");
assert.ok(sql.includes("AUTH_LICENSE_OPERATOR_MIGRATOR_ONLY"));
assert.ok(sql.includes("auth_license_approval_requests"));
assert.ok(sql.includes("auth_license_approval_audit"));
assert.ok(sql.includes("auth_license_approval_guard"));
assert.ok(sql.includes("auth_license_request_distinct_reviewers"));
assert.ok(sql.includes("AUTH_LICENSE_APPROVAL_IDENTITY_IMMUTABLE"));
assert.ok(sql.includes("AUTH_LICENSE_APPROVAL_TRANSITION_DENIED"));
assert.ok(sql.includes("AUTH_LICENSE_APPROVAL_INSERT_MUST_BE_DRAFT"));
assert.ok(sql.includes("AUTH_LICENSE_APPROVAL_ACTOR_MISMATCH"));
assert.ok(sql.includes("action_actor_user_id"));
assert.ok(sql.includes("action_reason"));
assert.ok(!sql.includes("INSERT INTO public.auth_access_grants"),"no automatic operator grants");
assert.ok(!sql.includes("UPDATE public.auth_user_product_licenses"),"does not activate personal licenses");
assert.ok(!sql.includes("UPDATE public.auth_project_product_licenses"),"does not activate project licenses");
assert.ok(!sql.includes("GRANT EXECUTE"),"no runtime RPC rights granted");
const ui=readFileSync("components/license/LicenseOperatorReviewOverview.tsx","utf8");
assert.ok(ui.includes("evaluateLicenseApproval"));
assert.ok(ui.includes("LICENSE_OPERATOR_ROLES"));
assert.ok(ui.includes("LICENSE_OPERATOR_PERMISSIONS"));
assert.ok(ui.includes("Kiadás zárolva"));
assert.ok(ui.includes("Csak helyi demonstráció"));
assert.ok(!ui.includes("fetch(")&&!ui.includes("localStorage")&&!ui.includes("method:\"POST\""),
 "role preview no API, persistence, assignment");
const page=readFileSync("app/admin/licenckozpont/page.tsx","utf8");
assert.ok(page.includes("Jóváhagyások és szerepkörök"));
assert.ok(page.includes('activeView==="approvals"'));
assert.ok(page.includes("<LicenseOperatorReviewOverview/>"));
console.log("DIMPRO V0.9.49 LICENSE OPERATOR PERMISSIONS AND FOUR-EYES PREVIEW CONTRACT PASS");
