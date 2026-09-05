import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root=process.cwd();
const read=(f)=>fs.readFileSync(path.join(root,f),"utf8");
const require=createRequire(import.meta.url);
const { parseDeveloperGridStageReport }=require(path.join(root,"desktop/benjadmin-developer-grid/src/task-launch/stage-report.cjs"));
const evidence=read("app/lib/developer-grid/evidence.ts");
const ingest=read("app/lib/developer-grid/evidence-ingest.ts");
const stateStore=read("app/lib/developer-grid/state-store.ts");
const reviewGate=read("app/lib/developer-grid/review-gate.ts");
const vguard=read("app/lib/developer-grid/vguard-review.ts");
const build=read("app/lib/developer-grid/build-runs.ts");
const stagePrompt=read("desktop/benjadmin-developer-grid/src/stage-actions-prompt-builder.cjs");
const main=read("desktop/benjadmin-developer-grid/src/main.cjs");
const preload=read("desktop/benjadmin-developer-grid/src/preload.cjs");
const workspace=read("desktop/benjadmin-developer-grid/src/renderer/context-workspace.js");
let n=0;
function check(name,fn){fn();n+=1;console.log(`PASS ${String(n).padStart(2,"0")} ${name}`);}

const report={schemaVersion:1,workerCode:"OUTMINAI",taskId:"dev-task-grid-123",sessionId:"grid-work-dev-task-grid-123-outminai",head:"a".repeat(40),stage:3,result:"PASS",summary:"tests ready",evidence:[{kind:"TEST",status:"PASS",severity:"INFO",summary:"contract",attributes:{testName:"contract",durationMs:12}}]};
const body=`ok\nBENJADMIN_STAGE_REPORT_V1\n${JSON.stringify(report)}\nBENJADMIN_STAGE_REPORT_END`;
check("valid machine stage report parses",()=>{const p=parseDeveloperGridStageReport(body);assert.equal(p.ok,true);assert.equal(p.report.stage,3);assert.equal(p.report.evidence[0].kind,"TEST");});
check("invalid stage report HEAD fails closed",()=>{const p=parseDeveloperGridStageReport(body.replace("a".repeat(40),"bad"));assert.equal(p.ok,false);assert.equal(p.code,"STAGE_REPORT_IDENTITY_INVALID");});
check("stage report requires at least one evidence row",()=>{const p=parseDeveloperGridStageReport(`BENJADMIN_STAGE_REPORT_V1\n${JSON.stringify({...report,evidence:[]})}\nBENJADMIN_STAGE_REPORT_END`);assert.equal(p.ok,false);assert.equal(p.code,"STAGE_REPORT_EVIDENCE_REQUIRED");});
check("stage prompt requires machine markers and current HEAD",()=>{assert.match(stagePrompt,/BENJADMIN_STAGE_REPORT_V1/);assert.match(stagePrompt,/REPLACE_WITH_CURRENT_40_CHAR_HEAD/);assert.match(stagePrompt,/SESSION ID/);});
check("worker FULL BUILD fallback is explicitly forbidden",()=>{assert.match(stagePrompt,/FULL BUILD-et a worker NEM indíthat/);assert.match(stagePrompt,/DEV-host FULL BUILD fallback/);assert.match(stagePrompt,/BUILD01/);assert.match(stagePrompt,/BUILD02/);});
check("desktop monitors stage report and submits evidence",()=>{assert.match(main,/monitorWorkerStageReport/);assert.match(main,/submitDeveloperGridEvidence/);assert.match(main,/stage:report\.stage/);});
check("evidence model is DEV PROD-DENY sanitized and fingerprinted",()=>{for(const token of ['environment: "DEV"','productionAccess: "DENY"','sanitized: true','fingerprintSha256'])assert.ok(evidence.includes(token));});
check("evidence payload is technical allowlist without arbitrary detail body",()=>{for(const token of ["path:","testName:","errorCode:","artifactSha256:","resolvesFingerprint:"])assert.ok(evidence.includes(token));assert.ok(!/attributes:[\s\S]{0,700}detail:/.test(evidence));});
check("worker evidence requires validated BOOT ACK and verified source",()=>{assert.match(ingest,/bootAckState !== "VALIDATED"/);assert.match(ingest,/sourceState !== "VERIFIED"/);});
check("worker stage is monotonic and advances authoritative source HEAD",()=>{assert.match(ingest,/DEVELOPER_GRID_STAGE_REGRESSION_BLOCKED/);assert.match(ingest,/verifySourceHeadAdvance/);assert.match(ingest,/SOURCE_HEAD_ADVANCED/);});
check("automatic evidence hook cannot invalidate persisted authoritative event",()=>{assert.match(stateStore,/appendEvidenceFromGridEvent/);assert.match(stateStore,/event evidence persistence failed/);});
check("review gate is current-HEAD aware",()=>{assert.match(reviewGate,/headEvidence/);assert.match(reviewGate,/currentFailures/);assert.match(reviewGate,/latestReviews/);assert.match(reviewGate,/latestBuilds/);});
check("closure requires current-HEAD BUILD and COMPLETED HANDOFF",()=>{assert.match(reviewGate,/target === "CLOSURE"/);assert.match(reviewGate,/item\.kind === "BUILD" && item\.status === "PASS"/);assert.match(reviewGate,/item\.kind === "HANDOFF" && item\.status === "COMPLETED"/);});
check("VGuard remains review-only through clean diff provider path",()=>{assert.match(vguard,/verifyCurrentSourceExecutionState\(session\.sourceProvenance,\{requireClean:true\}\)/);assert.match(vguard,/diff","--no-ext-diff/);assert.match(vguard,/parseVGuardReviewOutput/);assert.match(vguard,/resolveWorkerModelAdapter\(pref,"VGUARD"\)/);});
check("VGuard protects secrets and enforces budget",()=>{assert.match(vguard,/scanSensitiveText/);assert.match(vguard,/isSensitivePath/);assert.match(vguard,/evaluateExternalAiBudget/);assert.match(vguard,/hardStop/);});
check("stage 5 FULL BUILD requires review gate and clean current source",()=>{assert.match(build,/workStageIndex \|\| 1\) >= 5/);assert.match(build,/evaluateDeveloperGridReviewGate\(\{ taskId, target:"BUILD" \}\)/);assert.match(build,/requireClean:true/);});
check("desktop evidence/review IPC chain is exposed",()=>{assert.match(preload,/getDeveloperGridEvidence/);assert.match(preload,/getDeveloperGridReviewGate/);assert.match(preload,/requestDeveloperGridVGuardReview/);assert.match(main,/review-gate:run/);});
check("central control panel renders evidence, three gates and VGuard action",()=>{assert.match(workspace,/DIAGNOSTIC EVIDENCE ENGINE/);assert.match(workspace,/REVIEW READINESS/);assert.match(workspace,/BUILD GATE/);assert.match(workspace,/CLOSURE \/ HANDOFF/);assert.match(workspace,/FÜGGETLEN REVIEW INDÍTÁSA/);});

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"grid-evidence-contract-"));
const activity=path.join(root,"scripts/developer-grid/activity.mjs");
const head="b".repeat(40);
const run=spawnSync(process.execPath,[activity,"kind=error","workerCode=OUTMINAI","taskId=task-fixture","sessionId=session-fixture",`head=${head}`,"status=FAIL","severity=CRITICAL","summary=token=super-secret-value","path=config/.env.local","errorCode=FIXTURE_ERROR"],{env:{...process.env,DIMPRO_DEVELOPER_GRID_STATE_ROOT:tmp},encoding:"utf8"});
check("legacy activity fixture writes evidence successfully",()=>assert.equal(run.status,0,run.stderr));
const rows=fs.readFileSync(path.join(tmp,"evidence.jsonl"),"utf8").trim().split("\n").map(JSON.parse);
check("legacy activity evidence redacts secret-like summary",()=>assert.equal(rows[0].summary,"[REDACTED_SENSITIVE_CONTENT]"));
check("legacy activity evidence redacts sensitive path and keeps severity enum",()=>{assert.equal(rows[0].attributes.path,"[SENSITIVE_PATH]");assert.equal(rows[0].severity,"CRITICAL");assert.equal(rows[0].productionAccess,"DENY");});
check("legacy activity evidence lock is released",()=>assert.equal(fs.existsSync(path.join(tmp,"evidence.lock")),false));
fs.rmSync(tmp,{recursive:true,force:true});

console.log(`Developer Grid Diagnostic Evidence contract PASS · ${n}/${n}`);
