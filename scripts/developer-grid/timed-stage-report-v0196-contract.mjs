import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { parseDeveloperGridStageReport } = require(`${root}/desktop/benjadmin-developer-grid/src/task-launch/stage-report.cjs`);
const { buildStageActionPrompt } = require(`${root}/desktop/benjadmin-developer-grid/src/stage-actions-prompt-builder.cjs`);
const { buildWorkerTaskPrompt } = require(`${root}/desktop/benjadmin-developer-grid/src/task-launch/prompt-builder.cjs`);
const evidenceIngest = fs.readFileSync(`${root}/app/lib/developer-grid/evidence-ingest.ts`, "utf8");
const types = fs.readFileSync(`${root}/app/lib/developer-grid/types.ts`, "utf8");
let n=0; function check(name,fn){fn();n+=1;console.log(`PASS ${String(n).padStart(2,"0")} ${name}`);}

const report = {
  schemaVersion:2, workerCode:"OUTMINAI", taskId:"task-time-v2", sessionId:"session-time-v2", head:"a".repeat(40), stage:2, result:"PASS", summary:"timed stage",
  workUnit:"1/6 ELEMZÉS", startedAt:"2026-10-01T22:00:00+02:00", reportedAt:"2026-10-01T22:10:00+02:00", finishedAt:"2026-10-01T22:10:00+02:00", timezone:"Europe/Budapest",
  elapsedSeconds:600, estimatedSeconds:900, estimatedTotalSeconds:3600, estimateCreatedAt:"2026-10-01T21:59:00+02:00", estimateConfidence:"KOZEPES",
  revisedEstimatedSeconds:null, remainingEstimateSeconds:3000, actualElapsedSeconds:600, estimateVarianceSeconds:-300,
  evidence:[{kind:"TEST",status:"PASS",severity:"INFO",summary:"git diff --check",attributes:{testName:"git diff --check"}}],
};
const body = `BENJADMIN_STAGE_REPORT_V1\n${JSON.stringify(report)}\nBENJADMIN_STAGE_REPORT_END`;
check("V2 timed stage report parses",()=>{const p=parseDeveloperGridStageReport(body);assert.equal(p.ok,true);assert.equal(p.report.elapsedSeconds,600);assert.equal(p.report.estimatedSeconds,900);});
check("missing estimate fails closed",()=>{const x={...report};delete x.estimatedSeconds;const p=parseDeveloperGridStageReport(`BENJADMIN_STAGE_REPORT_V1\n${JSON.stringify(x)}\nBENJADMIN_STAGE_REPORT_END`);assert.equal(p.ok,false);assert.equal(p.code,"STAGE_REPORT_ESTIMATE_REQUIRED");});
check("wrong timezone fails closed",()=>{const x={...report,timezone:"UTC"};const p=parseDeveloperGridStageReport(`BENJADMIN_STAGE_REPORT_V1\n${JSON.stringify(x)}\nBENJADMIN_STAGE_REPORT_END`);assert.equal(p.ok,false);assert.equal(p.code,"STAGE_REPORT_TIMING_REQUIRED");});
check("elapsed mismatch fails closed",()=>{const x={...report,elapsedSeconds:500,actualElapsedSeconds:500,estimateVarianceSeconds:-400};const p=parseDeveloperGridStageReport(`BENJADMIN_STAGE_REPORT_V1\n${JSON.stringify(x)}\nBENJADMIN_STAGE_REPORT_END`);assert.equal(p.ok,false);assert.equal(p.code,"STAGE_REPORT_ELAPSED_MISMATCH");});
check("revised estimate variance validates",()=>{const x={...report,revisedEstimatedSeconds:500,estimateVarianceSeconds:100};const p=parseDeveloperGridStageReport(`BENJADMIN_STAGE_REPORT_V1\n${JSON.stringify(x)}\nBENJADMIN_STAGE_REPORT_END`);assert.equal(p.ok,true);});
check("legacy V1 stage report remains readable",()=>{const x={schemaVersion:1,workerCode:"OUTMINAI",taskId:"task",sessionId:"session",head:"b".repeat(40),stage:2,result:"PASS",summary:"legacy",evidence:[{kind:"TEST",status:"PASS",summary:"ok",attributes:{}}]};const p=parseDeveloperGridStageReport(`BENJADMIN_STAGE_REPORT_V1\n${JSON.stringify(x)}\nBENJADMIN_STAGE_REPORT_END`);assert.equal(p.ok,true);assert.equal(p.report.schemaVersion,1);});
const task={id:"task-time-v2",sessionId:"session-time-v2",title:"Timed task",status:"ready",projectId:"project_dimprover",scopeText:"module:Developer Grid V1",acceptance:["timing"],branchName:"worker/test",worktreePath:"/srv/dimpro-dev/worktrees/test",sourceHead:"c".repeat(40),sourceExecutionProof:{state:"VERIFIED",authority:"CENTRAL_CORE",handshakeStage:"READY",productionAccess:"DENY",sha256:"d".repeat(64),activeScopeLockCount:1,activeWorktreeLeaseCount:1,verifiedAt:"2026-10-01T20:00:00Z",engineSessionId:"dev-session"}};
const stagePrompt=buildStageActionPrompt({action:"advance-stage",workerCode:"OUTMINAI",workerLabel:"OutminAI",task,presence:{workStageIndex:1,mainModule:"BENJADMIN",moduleName:"Developer Grid V1",workItem:"timing",branch:"worker/test",worktree:"/srv/dimpro-dev/worktrees/test"}});
check("stage action requests schemaVersion 2",()=>assert.match(stagePrompt,/"schemaVersion":2/));
check("stage action requests Europe Budapest timestamps",()=>{assert.match(stagePrompt,/Europe\/Budapest/);assert.match(stagePrompt,/estimatedTotalSeconds/);assert.match(stagePrompt,/estimateVarianceSeconds/);});
const launchPrompt=buildWorkerTaskPrompt({task,workerCode:"OUTMINAI",workerLabel:"OutminAI",presence:{mainModule:"BENJADMIN",moduleName:"Developer Grid V1"}});
check("task launch requires timing on every status",()=>assert.match(launchPrompt,/KÖTELEZŐ IDŐMÉRÉS/));
check("task launch requires pre-start estimates",()=>assert.match(launchPrompt,/KÖTELEZŐ BECSLÉS/));
check("server enforces immutable original subtask estimate",()=>assert.match(evidenceIngest,/DEVELOPER_GRID_ORIGINAL_ESTIMATE_IMMUTABLE/));
check("server enforces immutable original total estimate",()=>assert.match(evidenceIngest,/DEVELOPER_GRID_TOTAL_ESTIMATE_IMMUTABLE/));
check("server persists timing fields in DevelopmentContext",()=>{assert.match(types,/workUnitStartedAt/);assert.match(types,/estimatedTotalSeconds/);assert.match(types,/estimateVarianceSeconds/);});
console.log(`Developer Grid timed stage report V2 contract PASS · ${n}/${n}`);
