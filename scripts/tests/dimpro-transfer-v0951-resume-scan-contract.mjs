import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {TRANSFER_CORE_VERSION,isTransferTerminal} from "../../app/lib/transfer-core/transferModel.ts";
import {classifyTransferRetry,transferResumeCapability,transferRetryDelayMs,waitForTransferDelay}
  from "../../app/lib/transfer-core/retryPolicy.mjs";
import {driveTransferScanStatusUrl,mapTransferScanStatus,pollDriveTransferScan,pollDriveUploadFinalization}
  from "../../app/lib/transfer-core/scanStatus.ts";
assert.ok(["0.9.51","0.9.52","0.9.53", "0.9.54", "0.9.55", "0.9.56", "0.9.57", "0.9.58", "0.9.59", "0.9.60", "0.9.61", "0.9.62", "0.9.63", "0.9.64", "0.9.65", "0.9.66", "0.9.67"].includes(TRANSFER_CORE_VERSION));
assert.equal(isTransferTerminal("SCAN_PENDING"),false);
assert.equal(isTransferTerminal("CONFIRMATION_UNKNOWN"),false);
assert.equal(isTransferTerminal("AWAITING_REVIEW"),true);
assert.equal(classifyTransferRetry(Object.assign(new Error("network"),{status:503})),"RETRYABLE");
assert.equal(classifyTransferRetry(Object.assign(new Error("network"),{status:429})),"RETRYABLE");
for (const status of [400,401,403,404,409,413,422,507]) {
 assert.equal(classifyTransferRetry(Object.assign(new Error("terminal"),{status})),"PERMANENT");
}
assert.equal(classifyTransferRetry(new DOMException("cancel","AbortError")),"ABORTED");
assert.equal(transferRetryDelayMs(1),600);
assert.equal(transferRetryDelayMs(4),4800);
assert.equal(transferRetryDelayMs(20),8000);
assert.equal(transferResumeCapability("single",false),"FULL_FILE_RETRY");
assert.equal(transferResumeCapability("multipart",true),"PART_CHECKPOINT");
assert.equal(transferResumeCapability("multipart",false),"NONE");
const aborted=new AbortController();
const cancelWait=waitForTransferDelay(10000,aborted.signal);
aborted.abort();
await assert.rejects(()=>cancelWait,/AbortError/);
for (const [status,phase] of [
 ["CLEAN","AWAITING_REVIEW"],["INFECTED","INFECTED"],["ERROR","SCAN_FAILED"],
 ["SCANNING","SCANNING"],["PENDING","SCAN_PENDING"],["UNKNOWN","SCAN_PENDING"]
]){
 assert.equal(mapTransferScanStatus(status).phase,phase);
}
assert.equal(driveTransferScanStatusUrl({projectId:"project-01",documentId:"doc-02",versionId:"version-03"}),
 "/api/projects/project-01/drive/documents/doc-02/versions/version-03/security-scan");
assert.equal(driveTransferScanStatusUrl({projectId:"../../admin",documentId:"foo",versionId:"bar"}),null);
const seen=[];
const fetcher=async(url,options)=>{
 seen.push({url,options});
 return {ok:true,status:200,json:async()=>({ok:true,status:"SCANNING",scan:{status:"CLEAN"}})};
};
const scan=await pollDriveTransferScan({projectId:"project-01",documentId:"doc-02",versionId:"v-1",fetcher});
assert.equal(scan.phase,"AWAITING_REVIEW");
assert.equal(scan.final,true);
assert.equal(seen[0].options.method,"GET");
assert.equal(seen[0].options.credentials,"same-origin");
assert.equal(seen[0].options.cache,"no-store");
assert.deepEqual(await pollDriveTransferScan({projectId:"p",documentId:"d",versionId:"v",fetcher:async()=>({status:403})}),
 {phase:"SCAN_PENDING",final:true,httpStatus:403,error:"A státuszlekérdezéshez nincs hozzáférés vagy a dokumentum már nem érhető el."});
const reconciled=await pollDriveUploadFinalization({projectId:"project-01",uploadId:"drive-upload-01",
 fetcher:async(url,options)=>{
   assert.equal(options.method,"GET");
   assert.ok(url.includes("/status"));
   return {ok:true,status:200,json:async()=>({ok:true,status:"FINALIZED",finalizedDocumentId:"doc-01",finalizedVersionId:"version-01"})};
 },
});
assert.deepEqual(reconciled,{status:"FINALIZED",documentId:"doc-01",versionId:"version-01"});
assert.equal((await pollDriveUploadFinalization({projectId:"p",uploadId:"upload",fetcher:async()=>({
 ok:true,status:200,json:async()=>({ok:true,status:"INITIATED"}),
})})).status,"INITIATED");
await assert.rejects(()=>pollDriveUploadFinalization({projectId:"p",uploadId:"upload",fetcher:async()=>({
 status:403,ok:false,
})}),/véglegesítési állapot/i);

const source=readFileSync("components/drive/DriveWorkspace.tsx","utf8");
const ui=readFileSync("components/drive/DriveTransferCenter.tsx","utf8");
const readRoute=readFileSync("app/api/projects/[projectId]/drive/uploads/[uploadId]/status/route.ts","utf8");
const scanRoute=readFileSync("app/api/projects/[projectId]/drive/documents/[documentId]/versions/[versionId]/security-scan/route.ts","utf8");
const service=readFileSync("app/lib/drive-core/storageService.ts","utf8");
for (const [label,okay] of [
 ["transport retry",source.includes("transferHttpUploadWithRetry({")],
 ["full file reset on retry",source.includes("retryCount:attempt,uploadedBytes:0")],
 ["not retry complete POST",source.includes("if (finalizeRequested)")&&source.includes('phase:"CONFIRMATION_UNKNOWN"')],
 ["reconcile without automatic POST",source.includes("pollDriveUploadFinalization({")],
 ["scan GET polling",source.includes("pollDriveTransferScan({")&&source.includes("window.setInterval(")],
 ["scan poll bounded",source.includes(".slice(0,3)")],
 ["scan endpoint doc ACL",scanRoute.includes("await requireDriveDocumentAccess(projectId, documentId, access.access)")],
 ["session endpoint owner-bound",service.includes("session.createdBy!==input.actorUserId")],
 ["session endpoint folder/document ACL",service.includes("await requireDriveUploadSessionAccess(input.projectId,session,input.access)")],
 ["session route read-only GET",readRoute.includes("export async function GET(")&&!readRoute.includes("export async function POST(")],
 ["manual retry user action",ui.includes("onRetry(task.id)")&&source.includes("function retryTransferTask(")],
 ["no unsafe backend chunk-preview reuse",!source.includes("/api/drive/uploads/")],
 ["no localStorage token",!ui.includes("localStorage")],
 ["no cross-project transfer history",source.includes("transferProjectIdRef.current === projectId") &&
   source.includes("transferRetryFilesRef.current.clear()")],
 ["Drop multipart adapter reuse",readFileSync("app/lib/transfer-core/dropResumeAdapter.ts","utf8")
   .includes("uploadDropInitialized(")],
 ["access loss not scan failed",source.includes('phase:"STATUS_UNAVAILABLE" as const')],

])assert.ok(okay,label);
console.log("DIMPRO Transfer Center V0.9.51 resume/scan contract PASS (16 security/integration checks)");
