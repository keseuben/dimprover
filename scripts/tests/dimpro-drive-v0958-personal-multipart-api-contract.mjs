import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TRANSFER_CORE_VERSION } from "../../app/lib/transfer-core/transferModel.ts";
import { planPersonalMultipart,validatePersonalMultipartParts,PERSONAL_MULTIPART_SERVER_RELEASED }
  from "../../app/lib/content-core/personalMultipartPolicy.ts";

const read=p=>readFileSync(p,"utf8");
const service=read("app/lib/content-core/personalMultipartService.ts");
const api=read("app/lib/content-core/personalMultipartApi.ts");
const sql=read("supabase/migrations/20261023_personal_drive_multipart_foundation_v010.sql");
const repo=read("app/lib/content-core/personalMultipartRepository.ts");
const build=read("components/drive/driveBuildInfo.ts");
const base="app/api/drive/personal/uploads/multipart";
const routes=[
  ["init/route.ts","POST"],
  ["[sessionId]/checkpoint/route.ts","GET"],
  ["[sessionId]/parts/[partNumber]/route.ts","POST","PATCH"],
  ["[sessionId]/abort/route.ts","POST"],
  ["[sessionId]/complete/route.ts","POST"],
];
assert.ok(["0.9.58","0.9.59"].includes(TRANSFER_CORE_VERSION));
assert.equal(PERSONAL_MULTIPART_SERVER_RELEASED,false);
assert.match(service,/if \(!PERSONAL_MULTIPART_SERVER_RELEASED\) throw error\("PERSONAL_MULTIPART_SOURCE_ONLY", 503\)/);
assert.match(read(base+"/capabilities/route.ts"),/!PERSONAL_MULTIPART_SERVER_RELEASED/);
assert.match(build,/DRIVE_DEVELOPMENT_VERSION = "0\.9\.(58|59)"/);
for(const [file,...methods] of routes) {
  const content=read(base+"/"+file);
  assert.match(content,/personalMultipartActor\(request/,"auth gate missing "+file);
  assert.match(content,/personalMultipartError\(error\)/);
  assert.match(content,/cache|personalMultipartOk/);
  for(const method of methods) assert.ok(content.includes("function "+method+"("),"method missing "+file);
  if(methods.some(method=>method!=="GET")) assert.ok(content.includes("personalMultipartActor(request,true)"));
}
for(const marker of [
  'process.env.DIMPRO_DRIVE_PERSONAL_LARGE_SCAN_VERIFIED !== "true"',
  "personalMultipartFeatureEnabled(process.env)",
  "config.maxUploadBytes < PERSONAL_MULTIPART_MAX_BYTES",
  "getDriveScannerUploadLimitBytes() < PERSONAL_MULTIPART_MAX_BYTES",
  "getOwnedPersonalMultipartSession({ ownerUserId: userId, sessionId })",
  "sessionId = requestId",
  "storageKey = buildPersonalMultipartStorageKey",
  "reservePersonalMultipartSession",
  "createDriveS3Multipart",
  "abortDriveS3Multipart",
  "expectedStatus: \"INITIATED\"",
  "nextStatus: \"UPLOADING\"",
  "listDriveS3MultipartParts",
  "createDriveS3PartUrl",
  "inspectDriveS3MultipartPart",
  "part_manifest: manifest",
  "validatePersonalMultipartParts",
  "nextStatus: \"COMPLETING\"",
  "completeDriveS3Multipart",
  "headDriveObject",
  "nextStatus: \"QUARANTINED\"",
  "downloadable: false",
  'scanStatus: "NOT_SCANNED"',
]) assert.ok(service.includes(marker),"service missing "+marker);

assert.ok(service.indexOf("const completing = await transitionPersonalMultipartSession")
 < service.indexOf("await completeDriveS3Multipart"));
assert.ok(service.indexOf("await completeDriveS3Multipart") <
 service.indexOf("nextStatus: \"QUARANTINED\""));
assert.ok(service.indexOf("reservePersonalMultipartSession({") <
 service.indexOf("createDriveS3Multipart({"));
assert.ok(service.indexOf('await requirePersonalMultipartServerReady()') <
 service.indexOf("const session = await requireOwnedActiveSession"));
assert.ok(!service.includes("ensureUserContentRef("));
assert.ok(!service.includes("registerVerifiedPersonalContentObject("));
assert.ok(!service.includes('nextStatus: "CLEAN"'));
assert.match(api,/resolvePersonalDriveContentActor\(request\)/);
assert.match(api,/url\.protocol !== "https:" \|\| url\.host !== host/);
assert.match(api,/seen > maxBytes/);
assert.ok(!api.includes("await request.text()"));
assert.match(api,/reader\.cancel\(\)/);
assert.match(repo,/\.eq\("owner_user_id", input.ownerUserId\)/);
assert.match(repo,/\.eq\("state_version", input.expectedVersion\)/);
assert.match(sql,/COMPLETING/);
assert.match(sql,/PERSONAL_MULTIPART_FOLDER_NOT_OWNED/);
assert.match(sql,/coalesce\(hard_limit,true\)/);
assert.match(sql,/personal-drive-quota:/);

const sizes=[101*1024**2,512*1024**2,1024**3,5*1024**3];
for(const bytes of sizes) {
  const plan=planPersonalMultipart(bytes);
  const parts=Array.from({length:plan.totalParts},(_,i)=>({
    partNumber:i+1, sizeBytes:Math.min(plan.chunkSizeBytes,bytes-i*plan.chunkSizeBytes),
    etag:"a".repeat(32),sha256:"b".repeat(64),
  }));
  assert.equal(validatePersonalMultipartParts(plan,parts).length,plan.totalParts);
}
console.log("DIMPRO Drive V0.9.58 personal multipart API, owner, origin, bounded request, quarantine contract PASS");
