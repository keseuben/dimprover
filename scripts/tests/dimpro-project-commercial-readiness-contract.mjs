import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {interpretProjectCommercialStatus,resolveProjectCommercialReadiness}
 from "../../app/lib/license/projectCommercialReadinessCore.ts";
const at=Date.parse("2026-10-11T10:00:00Z");
const base={
 product_code:"DRIVE",status:"ACTIVE",plan_code:"DRIVE_PROJECT_25G",
 storage_quota_bytes:String(25*1024**3),max_project_members:12,
 starts_at:"2026-10-01T10:00:00Z",expires_at:"2026-11-01T10:00:00Z",
 approved_at:"2026-09-30T10:00:00Z",approved_by_user_id:"operator-uuid",
};
assert.equal(interpretProjectCommercialStatus(base,at),"ACTIVE_RECORD_ONLY");
assert.equal(interpretProjectCommercialStatus({...base,status:"PENDING_APPROVAL"},at),"PENDING_APPROVAL");
assert.equal(interpretProjectCommercialStatus({...base,status:"DRAFT"},at),"DRAFT");
assert.equal(interpretProjectCommercialStatus({...base,status:"SUSPENDED"},at),"SUSPENDED");
assert.equal(interpretProjectCommercialStatus({...base,status:"CANCELLED"},at),"CANCELLED");
assert.equal(interpretProjectCommercialStatus({...base,status:"EXPIRED"},at),"EXPIRED");
assert.equal(interpretProjectCommercialStatus({...base,approved_by_user_id:null},at),"INCONSISTENT_RECORD");
assert.equal(interpretProjectCommercialStatus({...base,approved_at:null},at),"INCONSISTENT_RECORD");
assert.equal(interpretProjectCommercialStatus({...base,expires_at:null},at),"INCONSISTENT_RECORD");
assert.equal(interpretProjectCommercialStatus({...base,expires_at:"invalid"},at),"INCONSISTENT_RECORD");
assert.equal(interpretProjectCommercialStatus({...base,expires_at:"2026-09-30T00:00:00Z"},at),"INCONSISTENT_RECORD");
assert.equal(interpretProjectCommercialStatus({...base,starts_at:"2026-10-12T10:00:00Z"},at),"NOT_STARTED");
assert.equal(interpretProjectCommercialStatus({...base,approved_at:"2026-10-12T10:00:00Z"},at),"INCONSISTENT_RECORD");
assert.equal(interpretProjectCommercialStatus({...base,expires_at:"2026-10-10T10:00:00Z"},at),"EXPIRED");
assert.equal(interpretProjectCommercialStatus({...base,storage_quota_bytes:"0"},at),"INCONSISTENT_RECORD");
assert.equal(interpretProjectCommercialStatus({...base,storage_quota_bytes:"bad"},at),"INCONSISTENT_RECORD");
const gate={...base,product_code:"PROJECT_GATE",storage_quota_bytes:"0",plan_code:"GATE_PROJECT_BASIC"};
assert.equal(interpretProjectCommercialStatus(gate,at),"ACTIVE_RECORD_ONLY");
assert.equal(interpretProjectCommercialStatus({...gate,storage_quota_bytes:"100"},at),"INCONSISTENT_RECORD");
const one=resolveProjectCommercialReadiness([base,gate],{now:at,sourceAvailable:true});
assert.equal(one.length,4);
assert.deepEqual(one.map(x=>x.recordStatus),["ACTIVE_RECORD_ONLY","ACTIVE_RECORD_ONLY","FUTURE_PRODUCT","FUTURE_PRODUCT"]);
assert.equal(one[0].planCode,"DRIVE_PROJECT_25G");
assert.equal(one[1].quotaBytes,0);
assert.ok(one.every(x=>!x.enforcementActive&&!x.canGrantAccess&&!x.canChangeQuota));
const two=resolveProjectCommercialReadiness([],{now:at,sourceAvailable:false});
assert.deepEqual(two.map(x=>x.recordStatus),["SOURCE_NOT_CONFIGURED","SOURCE_NOT_CONFIGURED","FUTURE_PRODUCT","FUTURE_PRODUCT"]);
assert.equal(resolveProjectCommercialReadiness([],{now:at,sourceAvailable:true})[0].recordStatus,"NOT_ASSIGNED");
const route=readFileSync("app/api/projects/[projectId]/licenses/readiness/route.ts","utf8");
assert.ok(route.includes('requireProjectPermission(request,projectId,"project.read")'));
assert.ok(route.indexOf("requireProjectPermission(")<route.indexOf("readProjectCommercialReadiness(projectId)"));
assert.ok(route.includes('private, no-store'));
assert.ok(route.includes("entitlementEnforcementReleased:false"));
assert.ok(!route.includes("export async function POST"));
const repo=readFileSync("app/lib/license/projectCommercialReadiness.ts","utf8");
assert.ok(repo.includes("ap.external_project_id=$1"));
assert.ok(repo.includes("ap.status='ACTIVE'"));
assert.ok(repo.includes("l.product_code IN ('DRIVE','PROJECT_GATE')"));
assert.ok(!repo.includes("payer_type")&&!repo.includes("license_code"));
assert.ok(repo.includes('code==="42P01"'));
console.log("DIMPRO PROJECT COMMERCIAL READINESS CONTRACT 35/35 PASS");
