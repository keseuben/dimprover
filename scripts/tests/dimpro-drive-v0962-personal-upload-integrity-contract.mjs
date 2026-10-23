import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TRANSFER_CORE_VERSION } from "../../app/lib/transfer-core/transferModel.ts";
import { PERSONAL_UPLOAD_MAX_FILES_PER_SELECTION, PERSONAL_UPLOAD_MAX_BYTES }
  from "../../app/lib/content-core/personalUploadPolicy.ts";
const read=p=>readFileSync(p,"utf8");
const quota=read("app/lib/content-core/personalQuotaPaging.ts");
const repo=read("app/lib/content-core/repository.ts");
const form=read("app/api/drive/personal/uploads/route.ts");
const stream=read("app/api/drive/personal/uploads/stream/route.ts");
const client=read("app/lib/transfer-core/personalFormUpload.ts");
const workspace=read("components/drive/PersonalDriveWorkspace.tsx");
const version=read("components/drive/driveBuildInfo.ts");
assert.ok(["0.9.62","0.9.63","0.9.64","0.9.65","0.9.66"].includes(TRANSFER_CORE_VERSION));
assert.match(version,/DRIVE_DEVELOPMENT_VERSION = "0\.9\.(62|63|64|65|66)"/);
assert.equal(PERSONAL_UPLOAD_MAX_FILES_PER_SELECTION,500);
assert.equal(PERSONAL_UPLOAD_MAX_BYTES,100*1024**2);
assert.match(quota,/seen\.size !== batch\.length/);
assert.match(quota,/PERSONAL_QUOTA_OBJECT_BATCH_INCOMPLETE/);
assert.match(quota,/object\.status === "ACTIVE"/);
assert.match(repo,/\.select\("id,size_bytes,status"\)/);
assert.ok(!repo.includes(".select(\"id,size_bytes\")\n          .in(\"id\", ids)"));
assert.match(client,/xhr\.status >= 500/);
assert.match(client,/if \(streaming\) \{[\s\S]*?xhr\.send\(input\.file\)/);
assert.ok(client.indexOf("xhr.send(input.file)") <
          client.indexOf("const form = new FormData()"));
assert.match(client,/0, sendStarted \|\| networkSent/);
assert.match(workspace,/requestId:id, signal:controller\.signal/);
assert.ok(!workspace.includes("requestId:crypto.randomUUID(), signal:controller.signal"));
assert.match(workspace,/phase:uncertain\?"CONFIRMATION_UNKNOWN"/);
for(const [name,source,scanned] of [
  ["form",form,"bytes.byteLength"],["stream",stream,"sizeBytes"],
]) {
  const section=source.slice(source.indexOf("if (prior) {"),
    source.indexOf("let contentObject ="));
  assert.match(section,/ensureReusablePersonalContentObject/);
  assert.match(section,/calculateDriveObjectSha256\(/);
  assert.match(section,/persisted.sha256 !== scanned.sha256/);
  assert.ok(section.includes("persisted.sizeBytes !== "+scanned),name);
  assert.ok(section.indexOf("calculateDriveObjectSha256") < section.indexOf("alreadyCompleted: true"),
    name+" must check S3 before claiming alreadyCompleted");
  assert.match(section,/PERSONAL_UPLOAD_PRIOR_OBJECT_INVALID/);
  assert.match(source,/resolvePersonalDriveContentActor\(request\)/);
  assert.match(source,/personalUploadFeatureEnabled\(process\.env\)/);
}
console.log("DIMPRO Drive V0.9.62 personal quota missing-object, stable request ID, uncertain 5xx, replay S3 integrity PASS");
