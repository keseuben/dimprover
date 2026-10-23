import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessPersonalUploadConfirmation }
  from "../../app/lib/content-core/personalUploadConfirmation.ts";
import { TRANSFER_CORE_VERSION } from "../../app/lib/transfer-core/transferModel.ts";

const owner="00000000-0000-4000-8000-000000000001";
const requestId="10000000-0000-4000-8000-000000000001";
const bucket="isolated-dev-only";
const hash="a".repeat(64);
const file={
  id:"00000000-0000-4000-8000-000000000002",
  sha256:hash,size_bytes:17*1024**2,storage_provider:"S3",
  storage_bucket:bucket,storage_key:"users/test/objects/file.pdf",
  security_status:"clean",virus_scan_status:"clean",status:"ACTIVE",
};
const receipt={contentRefId:"00000000-0000-4000-8000-000000000003",object:file};
const make=(overrides={})=>({
  ownerUserId:owner,requestId,expectedBucket:bucket,
  findOwnedReceipt:async (user,id)=>{
    assert.equal(user,owner);
    assert.equal(id,requestId);
    return receipt;
  },
  hashStoredObject:async (foundBucket,key)=>{
    assert.equal(foundBucket,bucket);
    assert.equal(key,file.storage_key);
    return {sha256:hash,sizeBytes:file.size_bytes};
  },
  ...overrides,
});
assert.ok(["0.9.65","0.9.66", "0.9.67"].includes(TRANSFER_CORE_VERSION));
assert.deepEqual(await assessPersonalUploadConfirmation(make()),
  {ok:true,state:"VERIFIED_CLEAN",contentRefId:receipt.contentRefId,
   sizeBytes:file.size_bytes,retryAllowed:false});
let hashed=false;
assert.deepEqual(await assessPersonalUploadConfirmation(make({
  findOwnedReceipt:async()=>null,
  hashStoredObject:async()=>{hashed=true;throw Error("not called");},
})),{ok:true,state:"PENDING_OR_NOT_FOUND",retryAllowed:false});
assert.equal(hashed,false);
for(const bad of [
  null,{...file,status:"DELETED"},{...file,security_status:"quarantined"},
  {...file,virus_scan_status:"infected"},{...file,storage_provider:"OTHER"},
  {...file,storage_bucket:"prod-bucket"},{...file,storage_key:""},
  {...file,sha256:"malformed"},{...file,size_bytes:-1},
  {...file,size_bytes:1.1},
]) {
  let attempted=false;
  const result=await assessPersonalUploadConfirmation(make({
    findOwnedReceipt:async()=>({...receipt,object:bad}),
    hashStoredObject:async()=>{attempted=true;throw Error("must not read unsafe ref");},
  }));
  assert.deepEqual(result,{ok:false,state:"OBJECT_UNVERIFIED",retryAllowed:false});
  assert.equal(attempted,false);
}
for(const broken of [
  {sha256:"b".repeat(64),sizeBytes:file.size_bytes},
  {sha256:hash,sizeBytes:file.size_bytes-1},
  {sha256:hash,sizeBytes:0},
  {sha256:hash,sizeBytes:NaN},
]) assert.deepEqual(await assessPersonalUploadConfirmation(make({
    hashStoredObject:async()=>broken,
  })),{ok:false,state:"OBJECT_UNVERIFIED",retryAllowed:false});
await assert.rejects(()=>assessPersonalUploadConfirmation(make({
  findOwnedReceipt:async()=>{throw Error("DB_UNAVAILABLE");},
})),/DB_UNAVAILABLE/);
await assert.rejects(()=>assessPersonalUploadConfirmation(make({
  hashStoredObject:async()=>{throw Error("S3_UNAVAILABLE");},
})),/S3_UNAVAILABLE/);

const read=p=>readFileSync(p,"utf8");
const route=read("app/api/drive/personal/uploads/status/[requestId]/route.ts");
const repo=read("app/lib/content-core/repository.ts");
const workspace=read("components/drive/PersonalDriveWorkspace.tsx");
const panel=read("components/drive/DriveTransferCenter.tsx");
const transport=read("app/lib/transfer-core/personalFormUpload.ts");
for(const marker of [
 "resolvePersonalDriveContentActor(request)",'process.env.DIMPRO_PRODUCTION_ACCESS !== "DENY"',
 'process.env.DIMPRO_AUTH_ENVIRONMENT !== "DEV"',
 "validPersonalUploadRequestId(requestId)",
 "assessPersonalUploadConfirmation({",
 "findOwnedPersonalUploadReceipt({ userId, requestId: id })",
 "calculateDriveObjectSha256({ bucket, storageKey: key })",
 'confirmation.state === "PENDING_OR_NOT_FOUND"',
 'confirmation.state === "OBJECT_UNVERIFIED"',
 '"PERSONAL_UPLOAD_STATUS_UNAVAILABLE"',
 '"cache-control": "private, no-store"',
]) assert.ok(route.includes(marker),"status API missing: "+marker);
assert.ok(route.indexOf("resolvePersonalDriveContentActor(request)") <
 route.indexOf("findOwnedPersonalUploadReceipt({"));
assert.ok(route.indexOf("validPersonalUploadRequestId(requestId)") <
 route.indexOf("findOwnedPersonalUploadReceipt({"));
assert.match(repo,/findUserContentRef\(\{[\s\S]*?userId: input.userId, sourceSystem: "DRIVE"/);
assert.match(repo,/\.eq\("id", ref.content_object_id\)/);
assert.match(panel,/title="Csak ellenőrzés: nem tölti fel újra a fájlt"/);
assert.match(workspace,/async function verifyPersonalTransfer\(id: string\)/);
assert.match(workspace,/onVerify=\{id => \{ void verifyPersonalTransfer\(id\); \}\}/);
assert.match(workspace,/result.state === "VERIFIED_CLEAN" && result.sizeBytes === task.sizeBytes/);
assert.match(workspace,/response.status === 202 && result.state === "PENDING_OR_NOT_FOUND"/);
assert.ok(!workspace.includes("window.localStorage.setItem(\"personal-upload-file"));
assert.match(transport,/0, sendStarted \|\| networkSent/);
assert.ok(!route.includes("ensureUserContentRef"));
assert.ok(!route.includes("putDriveObjectStream"));
assert.ok(!route.includes("registerVerifiedPersonalContentObject"));
assert.ok(!route.includes("deleteDriveObject"));
console.log("DIMPRO Drive V0.9.65 owner-scoped read-only upload receipt: verified, missing, unsafe, corrupt, S3/DB failure, UI no-retry contract PASS");
