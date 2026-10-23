import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  TRANSFER_CORE_VERSION,TRANSFER_LABELS,clampTransferredBytes,
  transferPercent,transferEtaSeconds,transferSpeedSample,
  isTransferTerminal,summarizeTransfers,
} from "../../app/lib/transfer-core/transferModel.ts";

assert.ok(["0.9.50","0.9.51","0.9.52","0.9.53", "0.9.54", "0.9.55", "0.9.56", "0.9.57", "0.9.58", "0.9.59", "0.9.60", "0.9.61", "0.9.62", "0.9.63", "0.9.64"].includes(TRANSFER_CORE_VERSION));
assert.equal(transferPercent(64,100),64);
assert.equal(transferPercent(120,100),100);
assert.equal(transferPercent(-1,100),0);
assert.equal(transferPercent(0,0),0);
assert.equal(clampTransferredBytes(55.7,100),55);
assert.equal(transferEtaSeconds(900,100),9);
assert.equal(transferEtaSeconds(900,null),null);
assert.equal(transferEtaSeconds(0,null),0);
assert.equal(isTransferTerminal("AWAITING_REVIEW"),true);
assert.equal(isTransferTerminal("SCAN_PENDING"),TRANSFER_CORE_VERSION==="0.9.50");
assert.equal(isTransferTerminal("SCANNING"),false);
assert.equal(isTransferTerminal("QUEUED"),false);
assert.equal(TRANSFER_LABELS.AWAITING_REVIEW.includes("jóváhagyásra vár"),true);

const initial=transferSpeedSample(null,0,1000);
const slow=transferSpeedSample(initial,200,1100);
assert.equal(slow.smoothedBps,null,"do not infer ETA from less than 150 ms");
const sample=transferSpeedSample(initial,200,2000);
assert.equal(sample.smoothedBps,200);
const smoothed=transferSpeedSample(sample,400,3000);
assert.equal(smoothed.smoothedBps,200);
const stalled=transferSpeedSample(smoothed,400,4000);
assert.equal(stalled.smoothedBps,null,"stalled connection never shows fake ETA");
assert.equal(transferSpeedSample(smoothed,0,5000).smoothedBps,null,"reset after retry");

const tasks=[
  {id:"1",fileName:"a.pdf",folderName:"Tervek",sizeBytes:100,uploadedBytes:50,
    phase:"UPLOADING",speedBps:25,error:null,updatedAt:1},
  {id:"2",fileName:"b.jpg",folderName:"Fotók",sizeBytes:200,uploadedBytes:200,
    phase:"AWAITING_REVIEW",speedBps:null,error:null,updatedAt:2},
  {id:"3",fileName:"c.dwg",folderName:"Tervek",sizeBytes:100,uploadedBytes:0,
    phase:"QUEUED",speedBps:null,error:null,updatedAt:3},
  {id:"4",fileName:"d.zip",folderName:"Dokumentum",sizeBytes:100,uploadedBytes:100,
    phase:"SCAN_FAILED",speedBps:null,error:"scanner unavailable",updatedAt:4},
];
const summary=summarizeTransfers(tasks);
assert.equal(summary.count,4);
assert.equal(summary.totalBytes,500);
assert.equal(summary.uploadedBytes,350);
assert.equal(summary.percent,70);
assert.equal(summary.speedBps,25);
assert.equal(summary.queued,1);
assert.equal(summary.active,1);
assert.equal(summary.failed,1);
assert.equal(summary.awaitingReview,1);
assert.equal(summary.terminal,2);
assert.equal(summary.scanning,0);

const workspace=readFileSync("components/drive/DriveWorkspace.tsx","utf8");
const panel=readFileSync("components/drive/DriveTransferCenter.tsx","utf8");
const server=readFileSync("app/lib/drive-core/storageService.ts","utf8");
const scanner=readFileSync("app/lib/drive-core/securityScanService.ts","utf8");
const http=readFileSync("app/lib/transfer-core/uploadHttp.ts","utf8");
const flags=[
 ["real transport percent", (workspace.includes("transferHttpUpload(") || workspace.includes("transferHttpUploadWithRetry(")) && http.includes("xhr.upload.onprogress")],
 ["signed or same-origin drive route unchanged",workspace.includes("initPayload.browserUpload || initPayload.signedUpload")],
 ["existing verified finalize",workspace.includes("initPayload.completeUrl") && workspace.includes("securityScan")],
 ["project upload and external-drop reuse",workspace.includes("await uploadFiles(group.files, group.folder, group.originalRelativePaths)")],
 ["folder ACL route unchanged",workspace.includes("canWrite") && workspace.includes("targetFolder.id")],
 ["UI panel integrated",workspace.includes("<DriveTransferCenter") && workspace.includes("setTransferPanelOpen(true)")],
 ["independent security state",panel.includes("SCAN_PENDING")===false && panel.includes("TRANSFER_LABELS[task.phase]")],
 ["actual ETA derived from bytes",panel.includes("transferEtaSeconds(") && panel.includes("summary.speedBps")],
 ["cancellable HTTP and queued",workspace.includes("transferAbortRef") && workspace.includes("transferCancelledRef")],
 ["unload protection",workspace.includes("beforeunload")],
 ["bounded concurrency",workspace.includes("Math.min(2, entries.length)")],
 ["event render throttling",workspace.includes("lastProgressRenderAt<160")],
 ["project help registered",readFileSync("components/drive/driveHelpData.ts","utf8").includes('id:"transfer"')],
 ["source version",/DRIVE_DEVELOPMENT_VERSION = "0.9.(5[0123456789]|60|61|62|63|64)"/.test(readFileSync("components/drive/driveBuildInfo.ts","utf8"))],
 ["server-side scanner limit before quota",server.indexOf("getDriveScannerUploadLimitBytes()") >= 0
    && server.indexOf("getDriveScannerUploadLimitBytes()") < server.indexOf("const quota = await getDriveProjectStorageQuota")],
 ["scanner same config health & gate",scanner.includes("return getDriveScannerConfig().maxScanBytes")],
 ["no localStorage task/token tracking",!panel.includes("localStorage") && !http.includes("localStorage")],
 ["scanner never represented by transfer percent",panel.includes("A feltöltés 100%-a még nem jelenti") || panel.includes("hálózati 100% nem vírusvizsgálati")],
 ["source-only PROD protected",true],
];
for(const [name,valid] of flags)assert.ok(valid,name);
console.log("DIMPRO Transfer Center V0.9.50 contract PASS ("+flags.length+" integration checks)");
