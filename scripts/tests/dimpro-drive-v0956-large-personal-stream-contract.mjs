import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PERSONAL_UPLOAD_MAX_BYTES, PERSONAL_UPLOAD_BUFFERED_FORM_MAX_BYTES,
  personalUploadEffectiveMaxBytes, validPersonalStreamSize,
  decodePersonalStreamFileName, normalizePersonalStreamMimeType,
} from "../../app/lib/content-core/personalUploadPolicy.ts";
import {
  checkedPersonalStreamChunks, PersonalStreamBodyError,
} from "../../app/lib/content-core/personalStreamGuard.ts";
import { TRANSFER_CORE_VERSION } from "../../app/lib/transfer-core/transferModel.ts";

const read = p => readFileSync(p, "utf8");
const route = read("app/api/drive/personal/uploads/stream/route.ts");
const formRoute = read("app/api/drive/personal/uploads/route.ts");
const client = read("app/lib/transfer-core/personalFormUpload.ts");
const scanner = read("app/lib/drive-core/securityScanService.ts");
const workspace = read("components/drive/PersonalDriveWorkspace.tsx");
const build = read("components/drive/driveBuildInfo.ts");

assert.ok(["0.9.56", "0.9.57", "0.9.58", "0.9.59", "0.9.60", "0.9.61", "0.9.62", "0.9.63", "0.9.64", "0.9.65", "0.9.66"].includes(TRANSFER_CORE_VERSION));
assert.match(build,/DRIVE_DEVELOPMENT_VERSION = "0\.9\.(56|57|58|59|60|61|62|63|64|65|66)"/);
assert.equal(PERSONAL_UPLOAD_MAX_BYTES,100*1024*1024);
assert.equal(PERSONAL_UPLOAD_BUFFERED_FORM_MAX_BYTES,16*1024*1024);
assert.equal(personalUploadEffectiveMaxBytes(100*1024*1024,500*1024*1024),100*1024*1024);
assert.equal(personalUploadEffectiveMaxBytes(80*1024*1024,500*1024*1024),80*1024*1024);
assert.equal(personalUploadEffectiveMaxBytes(110*1024*1024,60*1024*1024),60*1024*1024);
for (const n of [1,16*1024*1024,16*1024*1024+1,60*1024*1024,100*1024*1024]) {
  assert.equal(validPersonalStreamSize(n,100*1024*1024),true);
}
for (const n of [0,-1,100*1024*1024+1,Infinity,NaN,2.5]) {
  assert.equal(validPersonalStreamSize(n,100*1024*1024),false);
}
assert.equal(decodePersonalStreamFileName(encodeURIComponent("Fotó #10.heic")),"Fotó #10.heic");
assert.equal(decodePersonalStreamFileName(encodeURIComponent("é".repeat(180))),"é".repeat(180));
for(const s of [null,"..","%ZZ",encodeURIComponent("bad\/path.dxf")]) {
  assert.throws(()=>decodePersonalStreamFileName(s));
}
assert.equal(normalizePersonalStreamMimeType("image/heic"),"image/heic");
assert.equal(normalizePersonalStreamMimeType(null),"application/octet-stream");
for(const s of ["text/html; charset=utf-8","aa/aa\nBad: true","x", ""]) {
  if(s==="") assert.equal(normalizePersonalStreamMimeType(s),"application/octet-stream");
  else assert.throws(()=>normalizePersonalStreamMimeType(s));
}
async function drain(chunks, declared, max) {
  const output=[];
  for await (const chunk of checkedPersonalStreamChunks(chunks,declared,max)) output.push(...chunk);
  return output;
}
const chunks=(...s)=>({async *[Symbol.asyncIterator](){for(const chunk of s) yield Uint8Array.from(chunk);}});
assert.deepEqual(await drain(chunks([1,2],[3],[]),3,5),[1,2,3]);
await assert.rejects(()=>drain(chunks([1,2],[3]),2,5),e=>e instanceof PersonalStreamBodyError && e.code==="PERSONAL_UPLOAD_STREAM_OVERFLOW" && e.status===413);
await assert.rejects(()=>drain(chunks([1],[2]),3,5),e=>e instanceof PersonalStreamBodyError && e.code==="PERSONAL_UPLOAD_STREAM_LENGTH_MISMATCH" && e.status===409);
await assert.rejects(()=>drain(chunks([1]),6,5),e=>e instanceof PersonalStreamBodyError && e.code==="PERSONAL_UPLOAD_STREAM_SIZE_INVALID" && e.status===413);
await assert.rejects(()=>drain(chunks([1]),0,5),e=>e instanceof PersonalStreamBodyError && e.status===413);
assert.match(route,/resolvePersonalDriveContentActor\(request\)/);
assert.match(route,/personalUploadFeatureEnabled\(process.env\)/);
assert.match(route,/PERSONAL_UPLOAD_ORIGIN_INVALID/);
assert.match(route,/PERSONAL_UPLOAD_STREAM_CONTENT_TYPE_INVALID/);
assert.match(route,/getPersonalDriveStorageQuota/);
assert.match(route,/getUserContentFolder/);
assert.match(route,/validPersonalStreamSize\(sizeBytes, maxBytes\)/);
assert.match(route,/mkdtemp\(join\(tmpdir\(\)/);
assert.match(route,/mode: 0o600/);
assert.match(route,/checkedPersonalStreamChunks\(rawBody, sizeBytes, maxBytes\)/);
assert.match(route,/scanPersonalDriveStreamWithClamd\(createReadStream\(stagingFile\), sizeBytes\)/);
assert.match(route,/putDriveObjectStream\(\{/);
assert.match(route,/body: createReadStream\(stagingFile\)/);
assert.match(route,/calculateDriveObjectSha256/);
assert.match(route,/ensureUserContentRef\(\{/);
assert.match(route,/finally \{[\s\S]*?if \(temporaryDirectory\) await rm\(temporaryDirectory/);
assert.ok(route.indexOf("scanPersonalDriveStreamWithClamd(createReadStream(stagingFile), sizeBytes)")
  < route.indexOf("putDriveObjectStream({"),"S3 write must follow CLEAN scan");
assert.ok(route.indexOf("const checked = await calculateDriveObjectSha256") < route.indexOf("const registered = await registerVerifiedPersonalContentObject"));
assert.ok(!route.includes("await request.formData(") && !route.includes("await file.arrayBuffer("));
assert.match(scanner,/scanPersonalDriveStreamWithClamd/);
assert.match(formRoute,/Math\.min\(status\.maxBytes, PERSONAL_UPLOAD_BUFFERED_FORM_MAX_BYTES\)/);
assert.match(client,/input.file.size > PERSONAL_UPLOAD_BUFFERED_FORM_MAX_BYTES/);
assert.match(client,/if \(streaming\) \{[\s\S]*?xhr.send\(input.file\)/);
assert.ok(client.indexOf("xhr.send(input.file)") < client.indexOf("const form = new FormData()"));
assert.match(client,/sendStarted = true;[\s\S]*?xhr.send\(input.file\)/);
assert.match(client,/encodeURIComponent\(input.file.name\)/);
assert.match(workspace,/personalUploadMaxBytes/);
console.log("DIMPRO Drive V0.9.56 100 MiB bounded stream/ClamAV/security contract PASS");
