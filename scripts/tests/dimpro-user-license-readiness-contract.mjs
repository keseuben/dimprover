import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {classifyUserCommercialRecord,resolveUserCommercialReadiness,USER_LICENSE_PRODUCTS} from "../../app/lib/license/userCommercialReadinessCore.ts";
const now=Date.parse("2026-10-11T11:00:00Z");
const row={
 product_code:"DRIVE",status:"ACTIVE",plan_code:"DRIVE_PERSONAL_PLUS",
 storage_quota_bytes:String(25*1024**3),
 starts_at:"2026-10-01T10:00:00Z",expires_at:"2026-11-01T10:00:00Z",
 approved_at:"2026-10-01T09:00:00Z",approved_by_user_id:"operator-uuid",
};
assert.deepEqual(USER_LICENSE_PRODUCTS,["DRIVE","DIMPRO_ONE"]);
assert.equal(classifyUserCommercialRecord(row,now),"ACTIVE_RECORD_ONLY");
assert.equal(classifyUserCommercialRecord({...row,status:"DRAFT"},now),"DRAFT");
assert.equal(classifyUserCommercialRecord({...row,status:"PENDING_APPROVAL"},now),"PENDING_APPROVAL");
assert.equal(classifyUserCommercialRecord({...row,status:"SUSPENDED"},now),"SUSPENDED");
assert.equal(classifyUserCommercialRecord({...row,status:"EXPIRED"},now),"EXPIRED");
assert.equal(classifyUserCommercialRecord({...row,status:"CANCELLED"},now),"CANCELLED");
assert.equal(classifyUserCommercialRecord({...row,status:"UNKNOWN"},now),"INCONSISTENT_RECORD");
assert.equal(classifyUserCommercialRecord({...row,expires_at:null},now),"INCONSISTENT_RECORD");
assert.equal(classifyUserCommercialRecord({...row,approved_at:null},now),"INCONSISTENT_RECORD");
assert.equal(classifyUserCommercialRecord({...row,approved_by_user_id:null},now),"INCONSISTENT_RECORD");
assert.equal(classifyUserCommercialRecord({...row,approved_at:"2026-10-12T09:00:00Z"},now),"INCONSISTENT_RECORD");
assert.equal(classifyUserCommercialRecord({...row,starts_at:"2026-10-12T10:00:00Z"},now),"NOT_STARTED");
assert.equal(classifyUserCommercialRecord({...row,expires_at:"2026-10-10T10:00:00Z"},now),"EXPIRED");
assert.equal(classifyUserCommercialRecord({...row,expires_at:"2026-09-01T10:00:00Z"},now),"INCONSISTENT_RECORD");
assert.equal(classifyUserCommercialRecord({...row,storage_quota_bytes:"NaN"},now),"INCONSISTENT_RECORD");
assert.equal(classifyUserCommercialRecord({...row,storage_quota_bytes:"0"},now),"INCONSISTENT_RECORD");
const one={...row,product_code:"DIMPRO_ONE",storage_quota_bytes:"0",plan_code:"DIMPRO_ONE_BASE"};
assert.equal(classifyUserCommercialRecord(one,now),"ACTIVE_RECORD_ONLY");
assert.equal(classifyUserCommercialRecord({...one,storage_quota_bytes:"100"},now),"INCONSISTENT_RECORD");
assert.equal(classifyUserCommercialRecord({...one,product_code:"PROJECT_GATE"},now),"INCONSISTENT_RECORD");
const summaries=resolveUserCommercialReadiness([row,one],{now,sourceAvailable:true});
assert.equal(summaries.length,2);
assert.deepEqual(summaries.map(x=>x.status),["ACTIVE_RECORD_ONLY","ACTIVE_RECORD_ONLY"]);
assert.equal(summaries[0].proposedQuotaBytes,25*1024**3);
assert.equal(summaries[1].proposedQuotaBytes,0);
assert.ok(summaries.every(x=>!x.effectiveEntitlementActive&&!x.enforcementReleased&&!x.canGrantAccess&&!x.effectiveQuotaChanged));
assert.deepEqual(resolveUserCommercialReadiness([],{now,sourceAvailable:true}).map(x=>x.status),["NOT_ASSIGNED","NOT_ASSIGNED"]);
assert.deepEqual(resolveUserCommercialReadiness([],{now,sourceAvailable:false}).map(x=>x.status),["SOURCE_NOT_CONFIGURED","SOURCE_NOT_CONFIGURED"]);
const repo=readFileSync("app/lib/license/userCommercialReadiness.ts","utf8");
assert.ok(repo.includes("l.owner_user_id=$1::uuid"));
assert.ok(repo.includes("u.status='ACTIVE'")&&repo.includes("u.login_enabled=true")&&repo.includes("u.email_verified_at IS NOT NULL"));
assert.ok(!repo.includes("email_normalized=")&&!repo.includes("auth_access_grants"),"commercial and access separate");
assert.ok(!repo.includes("payer_type")&&!repo.includes("payer_user_id"));
assert.ok(repo.includes('code==="42P01"'),"missing migration explicit");
const api=readFileSync("app/api/drive/license/self/route.ts","utf8");
assert.ok(api.includes("resolveProjectCoreAuth(request)"));
assert.ok(api.includes("readOwnUserCommercialReadiness(auth.actor.userId)"));
assert.ok(api.includes("private, no-store"));
assert.ok(!api.includes("export async function POST"));
const sql=readFileSync("db/auth/migrations/019_auth_v056_user_product_licenses.sql","utf8");
assert.ok(sql.includes("owner_user_id uuid NOT NULL")&&sql.includes("UNIQUE(owner_user_id,product_code)"));
assert.ok(!sql.includes("INSERT INTO public.auth_access_grants"));
assert.ok(!sql.includes("INSERT INTO public.auth_user_product_licenses"));
assert.ok(!sql.includes("auth_project_id"));
console.log("DIMPRO V0.9.44 USER LICENSE READINESS CONTRACT PASS");
