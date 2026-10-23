import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePersonalQuotaSummary, quotaOccupiedLabel }
  from "../../app/lib/content-core/personalQuotaSummary.ts";
import { planPersonalMultipartReconciliation }
  from "../../app/lib/content-core/personalMultipartReconciliation.ts";
import { canAbortPersonalMultipart, PERSONAL_MULTIPART_SERVER_RELEASED }
  from "../../app/lib/content-core/personalMultipartPolicy.ts";
import { TRANSFER_CORE_VERSION } from "../../app/lib/transfer-core/transferModel.ts";
const read=p=>readFileSync(p,"utf8");
const quotaSQL=read("supabase/migrations/20261023_personal_drive_multipart_quota_v011.sql");
const foundationSQL=read("supabase/migrations/20261023_personal_drive_multipart_foundation_v010.sql");
const baseSQL=read("supabase/migrations/20261007_personal_drive_storage_v010.sql");
const repository=read("app/lib/content-core/repository.ts");
const sessionRepo=read("app/lib/content-core/personalMultipartRepository.ts");
const service=read("app/lib/content-core/personalMultipartService.ts");
const workspace=read("components/drive/PersonalDriveWorkspace.tsx");
const build=read("components/drive/driveBuildInfo.ts");
assert.ok(["0.9.59","0.9.60", "0.9.61", "0.9.62", "0.9.63", "0.9.64", "0.9.65", "0.9.66", "0.9.67"].includes(TRANSFER_CORE_VERSION));
assert.match(build,/DRIVE_DEVELOPMENT_VERSION = "0\.9\.(59|60|61|62|63|64|65|66|67)"/);
assert.equal(PERSONAL_MULTIPART_SERVER_RELEASED,false);
const GB=1024**3;
const quota={quotaBytes:50*GB,usedBytes:20*GB,reservedBytes:4*GB,occupiedBytes:24*GB,
 remainingBytes:26*GB,hardLimit:true,source:"PLAN"};
assert.deepEqual(parsePersonalQuotaSummary(quota),{
 ...quota,source:"PLAN",usagePercent:48,
});
assert.equal(parsePersonalQuotaSummary({...quota,reservedBytes:0,occupiedBytes:20*GB,remainingBytes:30*GB}).reservedBytes,0);
assert.equal(parsePersonalQuotaSummary({...quota,occupiedBytes:60*GB,usedBytes:55*GB,
 reservedBytes:5*GB,remainingBytes:0}).usagePercent,100);
assert.equal(parsePersonalQuotaSummary({...quota,source:"DEFAULT"}).source,"PERSONAL_DEFAULT");
assert.equal(parsePersonalQuotaSummary({...quota,source:"OVERRIDE"}).source,"OVERRIDE");
for(const altered of [
 {...quota,occupiedBytes:20*GB},{...quota,remainingBytes:27*GB},
 {...quota,reservedBytes:-1},{...quota,usedBytes:Infinity},{...quota,quotaBytes:0},
 {...quota,source:"GUEST"},{...quota,hardLimit:"true"},
 {...quota,usedBytes:Number.MAX_SAFE_INTEGER},{...quota,remainingBytes:"26"},
 null, [], "invalid",
]) assert.throws(()=>parsePersonalQuotaSummary(altered));
assert.deepEqual(quotaOccupiedLabel({usedBytes:20*GB,reservedBytes:4*GB}),{
 occupied:24*GB,hasReservations:true,
});
assert.deepEqual(quotaOccupiedLabel({usedBytes:20*GB,reservedBytes:0}),{
 occupied:20*GB,hasReservations:false,
});
assert.throws(()=>quotaOccupiedLabel({usedBytes:Number.MAX_SAFE_INTEGER,reservedBytes:1}));
assert.match(repository,/if \(PERSONAL_MULTIPART_SERVER_RELEASED\)/);
assert.match(repository,/dimpro_personal_drive_quota_summary_v011/);
assert.match(repository,/PERSONAL_QUOTA_RESERVATIONS_UNAVAILABLE/);
assert.match(repository,/PERSONAL_QUOTA_SUMMARY_INVALID/);
assert.match(repository,/reservedBytes: number/);
assert.match(sessionRepo,/meta\.data\?\.schema_version === "0\.1\.1"/);
assert.match(workspace,/Ebből függő feltöltések/);
assert.match(quotaSQL,/create or replace function public\.dimpro_personal_drive_ensure_ref_atomic/);
assert.match(quotaSQL,/create or replace function public\.dimpro_personal_drive_quota_summary_v011/);
assert.ok(quotaSQL.includes("v_used_bytes + v_reserved_bytes + v_increment_bytes > v_quota_bytes"));
assert.ok(quotaSQL.includes("status in ('INITIATED','UPLOADING','ABORTING','COMPLETING','QUARANTINED','SCANNING')"));
assert.ok(foundationSQL.includes("status in ('INITIATED','UPLOADING','ABORTING','COMPLETING','QUARANTINED','SCANNING')"));
assert.ok(quotaSQL.includes("pg_advisory_xact_lock(hashtextextended('personal-drive-quota:'"));
assert.ok(foundationSQL.includes("pg_advisory_xact_lock(hashtextextended('personal-drive-quota:'"));
assert.ok(baseSQL.includes("pg_advisory_xact_lock(hashtextextended('personal-drive-quota:'"));
for(const token of ["public,anon,authenticated","to service_role","schema_version='0.1.1'",
 "PERSONAL_MULTIPART_V011_BASE_MARKER_MISSING","PERSONAL_MULTIPART_V011_MARKER_ADVANCE_FAILED",
 "ref.status in ('ACTIVE','REMOVED')","greatest(0,v_quota_bytes-v_used-v_reserved)"]) {
 assert.ok(quotaSQL.includes(token),"SQL missing "+token);
}
assert.ok(!quotaSQL.toLowerCase().includes("drop table"));
assert.ok(!quotaSQL.toLowerCase().includes("delete from"));
assert.match(service,/nextStatus: session\.storage_upload_id \? "ABORTING" : "ABORTED"/);
assert.ok(service.indexOf("await abortDriveS3Multipart({") <
 service.indexOf("expectedStatus: \"ABORTING\""));
assert.equal(canAbortPersonalMultipart("ABORTING"),true);
const now=Date.UTC(2026,9,23);
const obs={status:"UPLOADING",sizeBytes:5*GB,uploadedBytes:3*GB,
 nowMs:now,expiresAtMs:now+1000,s3MultipartExists:true,
 s3WholeObjectSizeBytes:null,completeFileSha256Verified:false,
 fullFileMalwareScanClean:false,hasContentRef:false};
const cases=[
 ["INITIATED","CHECK_S3_PARTS"],
 ["UPLOADING","CHECK_S3_PARTS"],
 ["ABORTING","RETRY_S3_ABORT_WITH_REVIEW"],
 ["COMPLETING","MANUAL_SECURITY_REVIEW"],
 ["QUARANTINED","REVIEW_FULL_FILE_SCAN"],
 ["SCANNING","REVIEW_SCAN_WORKER"],
 ["REJECTED","MANUAL_SECURITY_REVIEW"],
 ["EXPIRED","MANUAL_SECURITY_REVIEW"],
 ["ABORTED","MANUAL_SECURITY_REVIEW"],
 ["CLEAN","MANUAL_SECURITY_REVIEW"],
];
for(const [status,action] of cases) {
 const plan=planPersonalMultipartReconciliation({...obs,status});
 assert.equal(plan.action,action,status);
 assert.equal(plan.canReleaseQuota,false);
 assert.equal(plan.canMarkClean,false);
}
const expired=planPersonalMultipartReconciliation({...obs,expiresAtMs:now-1});
assert.equal(expired.action,"RETRY_S3_ABORT_WITH_REVIEW");
assert.equal(planPersonalMultipartReconciliation({...obs,status:"COMPLETING",
 s3WholeObjectSizeBytes:obs.sizeBytes}).action,"VERIFY_WHOLE_OBJECT_AND_QUARANTINE");
assert.equal(planPersonalMultipartReconciliation({...obs,status:"ABORTED",
 s3MultipartExists:false}).action,"NONE");
assert.equal(planPersonalMultipartReconciliation({...obs,status:"CLEAN",hasContentRef:true,
 completeFileSha256Verified:true,fullFileMalwareScanClean:true}).action,"NONE");
assert.equal(planPersonalMultipartReconciliation({...obs,uploadedBytes:-1}).action,"MANUAL_SECURITY_REVIEW");
console.log("DIMPRO Drive V0.9.59 quota reservation + ABORTING + read-only reconciliation contract PASS");
