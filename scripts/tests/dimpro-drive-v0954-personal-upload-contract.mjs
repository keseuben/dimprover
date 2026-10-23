import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {
  personalUploadFeatureEnabled, personalUploadEffectiveMaxBytes,
  isPersonalUploadSafeToParse, normalizePersonalUploadFileName,
  validPersonalUploadRequestId, PERSONAL_UPLOAD_MAX_BYTES,
} from "../../app/lib/content-core/personalUploadPolicy.ts";
import {
  TRANSFER_CORE_VERSION, isTransferTerminal, summarizeTransfers,
  summarizeTransferSecurity,
} from "../../app/lib/transfer-core/transferModel.ts";

const read = path => readFileSync(path,"utf8");
const route = read("app/api/drive/personal/uploads/route.ts");
const repo = read("app/lib/content-core/repository.ts");
const scan = read("app/lib/drive-core/securityScanService.ts");
const workspace = read("components/drive/PersonalDriveWorkspace.tsx");
const panel = read("components/drive/DriveTransferCenter.tsx");
const transport = read("app/lib/transfer-core/personalFormUpload.ts");
const version = read("components/drive/driveBuildInfo.ts");

assert.ok(["0.9.54", "0.9.55"].includes(TRANSFER_CORE_VERSION));
assert.match(version, /DRIVE_DEVELOPMENT_VERSION = "0\.9\.(54|55)"/);
assert.equal(PERSONAL_UPLOAD_MAX_BYTES,16*1024*1024);
assert.equal(personalUploadEffectiveMaxBytes(110*1024*1024,100*1024*1024),PERSONAL_UPLOAD_MAX_BYTES);
assert.equal(personalUploadEffectiveMaxBytes(8*1024*1024,100*1024*1024),8*1024*1024);
assert.equal(isPersonalUploadSafeToParse(null,PERSONAL_UPLOAD_MAX_BYTES),false);
assert.equal(isPersonalUploadSafeToParse(-1,PERSONAL_UPLOAD_MAX_BYTES),false);
assert.equal(isPersonalUploadSafeToParse(PERSONAL_UPLOAD_MAX_BYTES+2*1024*1024,PERSONAL_UPLOAD_MAX_BYTES),false);
assert.equal(isPersonalUploadSafeToParse(PERSONAL_UPLOAD_MAX_BYTES+2000,PERSONAL_UPLOAD_MAX_BYTES),true);
assert.equal(validPersonalUploadRequestId(randomUUID()),true);
assert.equal(validPersonalUploadRequestId("not-uuid"),false);
assert.equal(normalizePersonalUploadFileName(" minta.dxf "),"minta.dxf");
for(const value of ["../a.txt","..", ".", "x\x00.jpg", "some/folder.pdf", "a\\b.pdf", "bad\nname.txt"]) {
  assert.throws(()=>normalizePersonalUploadFileName(value));
}
const allowEnv={DIMPRO_DRIVE_PERSONAL_UPLOAD_ENABLED:"true",DIMPRO_PRODUCTION_ACCESS:"DENY",DIMPRO_AUTH_ENVIRONMENT:"DEV"};
assert.equal(personalUploadFeatureEnabled(allowEnv),true);
for(const env of [{},{...allowEnv,DIMPRO_PRODUCTION_ACCESS:"ALLOW"},{...allowEnv,DIMPRO_AUTH_ENVIRONMENT:"PROD"},{...allowEnv,DIMPRO_DRIVE_PERSONAL_UPLOAD_ENABLED:"false"}]) {
  assert.equal(personalUploadFeatureEnabled(env),false);
}

// Sensitive POST is auth-gated, feature-gated and protected before form parsing.
assert.ok(route.indexOf("resolvePersonalDriveContentActor(request)")>=0);
assert.ok(route.indexOf("personalUploadFeatureEnabled(process.env)")>=0);
assert.ok(route.indexOf("PERSONAL_UPLOAD_ORIGIN_INVALID")>=0);
assert.ok(route.indexOf("isPersonalUploadSafeToParse") < route.indexOf("request.formData()"));
assert.ok(route.indexOf("getUserContentFolder") < route.indexOf("scanPersonalDriveBufferWithClamd(bytes)"));
assert.ok(route.indexOf("getPersonalDriveStorageQuota") < route.indexOf("scanPersonalDriveBufferWithClamd(bytes)"));
assert.ok(route.indexOf("scanPersonalDriveBufferWithClamd(bytes)") < route.indexOf("putDriveObjectStream({"));
assert.ok(route.indexOf("const checked = await calculateDriveObjectSha256") < route.indexOf("const registered = await registerVerifiedPersonalContentObject"));
assert.ok(route.includes('scanned.status !== "clean"'));
assert.ok(route.includes("getDriveObjectStorageConfig()"));
assert.ok(route.includes("ensureUserContentRef({"));
assert.ok(route.includes("moveUserContentRef({"));
assert.ok(route.includes('sourceRef = `personal-web:${requestId}`'));
assert.ok(route.includes('"PERSONAL_UPLOAD_IDEMPOTENCY_CONFLICT"'));
assert.ok(route.includes("registerVerifiedPersonalContentObject"));
assert.ok(repo.includes('security_status: "clean", virus_scan_status: "clean"'));
assert.ok(repo.includes('db.from("dimpro_content_objects").insert({'));
assert.ok(!repo.slice(repo.indexOf("export async function registerVerifiedPersonalContentObject"),repo.indexOf("export async function listUserContentItems")).includes(".upsert("));
assert.ok(repo.includes('object.security_status !== "clean" || object.virus_scan_status !== "clean"'));
assert.ok(scan.includes("scanAsyncIterableWithClamd"));
assert.ok(transport.includes("XMLHttpRequest"));
assert.ok(transport.includes('xhr.open("POST", "/api/drive/personal/uploads"'));
assert.ok(!transport.includes("retryWith"));
assert.ok(transport.includes("uncertain"));
assert.ok(workspace.includes('scope="PERSONAL"'));
assert.ok(workspace.includes("setPersonalUploadEnabled(response.enabled === true)"));
assert.ok(workspace.includes('canUpload={personalUploadEnabled && !personalTransferBusy}'));
assert.ok(workspace.includes("uploadPersonalFormWithProgress"));
assert.ok(panel.includes('scope = "PROJECT"'));
assert.equal(isTransferTerminal("AVAILABLE"),true);
const available={id:"x",fileName:"minta.pdf",folderName:"Saját Drive",sizeBytes:100,uploadedBytes:100,phase:"AVAILABLE",speedBps:null,error:null,updatedAt:0};
assert.equal(summarizeTransfers([available]).available,1);
assert.equal(summarizeTransferSecurity([available]).available,1);
assert.equal(summarizeTransferSecurity([available]).notAssessed,0);
console.log("DIMPRO Drive V0.9.54 personal upload security/policy UI contract PASS");
