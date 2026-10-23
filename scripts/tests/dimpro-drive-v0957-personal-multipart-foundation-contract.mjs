import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PERSONAL_MULTIPART_MAX_BYTES, PERSONAL_MULTIPART_DEFAULT_CHUNK_BYTES,
  PERSONAL_MULTIPART_MAX_PARTS, PERSONAL_MULTIPART_SESSION_TTL_MS,
  planPersonalMultipart, personalMultipartExpectedPartSize, validatePersonalMultipartParts,
  personalMultipartFeatureEnabled, personalMultipartMayBecomeClean, canAbortPersonalMultipart,
} from "../../app/lib/content-core/personalMultipartPolicy.ts";
import { PERSONAL_UPLOAD_MAX_BYTES, personalUploadFeatureEnabled }
  from "../../app/lib/content-core/personalUploadPolicy.ts";
import { TRANSFER_CORE_VERSION } from "../../app/lib/transfer-core/transferModel.ts";

const read = p => readFileSync(p, "utf8");
const sql = read("supabase/migrations/20261023_personal_drive_multipart_foundation_v010.sql");
const repository = read("app/lib/content-core/personalMultipartRepository.ts");
const capabilities = read("app/api/drive/personal/uploads/multipart/capabilities/route.ts");
const s3 = read("app/lib/drive-core/s3ObjectStorage.ts");
const version = read("components/drive/driveBuildInfo.ts");

assert.ok(["0.9.57","0.9.58", "0.9.59", "0.9.60", "0.9.61", "0.9.62", "0.9.63"].includes(TRANSFER_CORE_VERSION));
assert.match(version,/DRIVE_DEVELOPMENT_VERSION = "0\.9\.(57|58|59|60|61|62|63)"/);
assert.equal(PERSONAL_MULTIPART_MAX_BYTES,5*1024**3);
assert.equal(PERSONAL_UPLOAD_MAX_BYTES,100*1024**2);
assert.equal(PERSONAL_MULTIPART_DEFAULT_CHUNK_BYTES,64*1024**2);
assert.equal(PERSONAL_MULTIPART_MAX_PARTS,10000);
assert.equal(PERSONAL_MULTIPART_SESSION_TTL_MS,24*3600*1000);
const plan5=planPersonalMultipart(5*1024**3);
assert.equal(plan5.totalParts,80);
assert.equal(personalMultipartExpectedPartSize(plan5,1),64*1024**2);
assert.equal(personalMultipartExpectedPartSize(plan5,80),64*1024**2);
const tiny=planPersonalMultipart(100*1024**2+1);
assert.equal(tiny.totalParts,2);
assert.equal(personalMultipartExpectedPartSize(tiny,2),36*1024**2+1);
assert.throws(()=>personalMultipartExpectedPartSize(plan5,81));
assert.throws(()=>personalMultipartExpectedPartSize(plan5,0));
for(const size of [0,1,100*1024**2,5*1024**3+1,Infinity,NaN,-123]) assert.throws(()=>planPersonalMultipart(size));
for(const chunk of [1,4*1024**2,513*1024**2,NaN]) assert.throws(()=>planPersonalMultipart(1024**3,chunk));
const parts=Array.from({length:80},(_,i)=>({
  partNumber:i+1,sizeBytes:64*1024**2,
  etag:"abcdef0123456789abcdef0123456789",sha256:"f".repeat(64),
}));
assert.equal(validatePersonalMultipartParts(plan5,[...parts].reverse())[0].partNumber,1);
assert.throws(()=>validatePersonalMultipartParts(plan5,parts.slice(1)));
assert.throws(()=>validatePersonalMultipartParts(plan5,[{...parts[0],sizeBytes:10},...parts.slice(1)]));
assert.throws(()=>validatePersonalMultipartParts(plan5,[parts[0],{...parts[1],partNumber:1},...parts.slice(2)]));
assert.throws(()=>validatePersonalMultipartParts(plan5,[{...parts[0],sha256:"unknown"},...parts.slice(1)]));
const env={
 DIMPRO_DRIVE_PERSONAL_UPLOAD_ENABLED:"true",DIMPRO_PRODUCTION_ACCESS:"DENY",
 DIMPRO_AUTH_ENVIRONMENT:"DEV",DIMPRO_DRIVE_PERSONAL_MULTIPART_ENABLED:"true",
};
assert.equal(personalMultipartFeatureEnabled(env),true);
assert.equal(personalUploadFeatureEnabled(env),true);
for(const key of Object.keys(env)) assert.equal(personalMultipartFeatureEnabled({...env,[key]:"false"}),false);
const safe={currentStatus:"SCANNING",expectedSha256:"a".repeat(64),
  actualSha256:"a".repeat(64),sizeMatches:true,fullFileScanStatus:"CLEAN"};
assert.equal(personalMultipartMayBecomeClean(safe),true);
for(const patch of [{fullFileScanStatus:"NOT_SCANNED"},{fullFileScanStatus:"ERROR"},
 {fullFileScanStatus:"INFECTED"},{sizeMatches:false},
 {actualSha256:"b".repeat(64)},{currentStatus:"QUARANTINED"}]) {
 assert.equal(personalMultipartMayBecomeClean({...safe,...patch}),false);
}
assert.equal(canAbortPersonalMultipart("UPLOADING"),true);
assert.equal(canAbortPersonalMultipart("ABORTING"),true);
assert.equal(canAbortPersonalMultipart("INITIATED"),true);
for(const status of ["QUARANTINED","SCANNING","CLEAN","REJECTED","EXPIRED"])
 assert.equal(canAbortPersonalMultipart(status),false);

for(const token of [
 "dimpro_personal_drive_multipart_sessions","dimpro_personal_drive_multipart_schema_meta",
 "foreign key (owner_user_id,folder_id)","dimpro_personal_multipart_owner_request_uniq",
 "dimpro_personal_multipart_storage_uniq","hashtextextended('personal-drive-quota:'",
 "status in ('INITIATED','UPLOADING','ABORTING','COMPLETING','QUARANTINED','SCANNING')",
 "r.content_object_id=o.id and r.owner_type='USER'",
 "if v_hard_limit and v_used + v_reserved + v_size > v_quota",
 "PERSONAL_MULTIPART_FOLDER_NOT_OWNED","PERSONAL_MULTIPART_IDEMPOTENCY_CONFLICT",
 "security definer","from public, anon, authenticated","to service_role",
]) assert.ok(sql.includes(token),"missing "+token);
assert.ok(!sql.includes("drop table"));
assert.ok(!sql.includes("delete from public"));
assert.ok(!sql.includes("dimpro_personal_multipart_mark_clean"));
assert.match(repository,/\.eq\("owner_user_id", input.ownerUserId\)/);
assert.match(repository,/\.eq\("state_version", input.expectedVersion\)/);
assert.match(repository,/\.eq\("status", input.expectedStatus\)/);
assert.match(repository,/input\.nextStatus === "CLEAN"/);
assert.match(repository,/\.rpc\("dimpro_personal_multipart_create_atomic"/);
assert.match(capabilities,/resolvePersonalDriveContentActor\(request\)/);
assert.match(capabilities,/personalMultipartFeatureEnabled\(process.env\)/);
assert.match(capabilities,/scannerCapBytes >= PERSONAL_MULTIPART_MAX_BYTES/);
assert.match(capabilities,/usableMaxFileBytes: 0/);
assert.ok(capabilities.indexOf("!personalMultipartFeatureEnabled(process.env)") <
  capabilities.indexOf("getPersonalMultipartSchemaReadiness()"));
assert.match(s3,/export function buildPersonalMultipartStorageKey/);
console.log("DIMPRO Drive V0.9.57 5 GiB personal multipart/quota/quarantine contract PASS");
