import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"../..");
const require=createRequire(import.meta.url);
const parser=require(path.join(root,"desktop/benjadmin-developer-grid/src/task-launch/internal-review-report.cjs"));
const promptBuilder=require(path.join(root,"desktop/benjadmin-developer-grid/src/internal-review-prompt-builder.cjs"));
const main=fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/src/main.cjs"),"utf8");
const stage=fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/src/stage-actions-prompt-builder.cjs"),"utf8");
const vguard=fs.readFileSync(path.join(root,"app/lib/developer-grid/vguard-review.ts"),"utf8");
const gate=fs.readFileSync(path.join(root,"app/lib/developer-grid/review-gate.ts"),"utf8");
const route=fs.readFileSync(path.join(root,"app/api/dev/grid/review-gate/route.ts"),"utf8");
const readme=fs.readFileSync(path.join(root,"app/lib/developer-grid/README.md"),"utf8");
const pkg=JSON.parse(fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/package.json"),"utf8"));
let n=0;
function check(name,fn){fn();n+=1;console.log("PASS",name);}

check("desktop v0.1.94",()=>assert.equal(pkg.version,"0.1.94"));
const task={id:"task-1",sessionId:"session-1",sourceHead:"a".repeat(40),branchName:"worker/test",worktreePath:"/srv/dimpro-dev/worktrees/test"};
const reviewPrompt=promptBuilder.buildInternalReviewFallbackPrompt({workerCode:"BENAI",workerLabel:"BenjáminAI",task,presence:{branch:"worker/test",worktree:"/srv/dimpro-dev/worktrees/test"}});
check("internal review prompt is explicit non-independent fallback",()=>{assert.match(reviewPrompt,/INTERNAL_REVIEW_FALLBACK/);assert.match(reviewPrompt,/NEM független V\.Guard review/);assert.match(reviewPrompt,/DEV ONLY · PROD DENY/);});
const good=`x\nBENJADMIN_INTERNAL_REVIEW_V1\n${JSON.stringify({schemaVersion:1,reviewMode:"INTERNAL_REVIEW_FALLBACK",workerCode:"BENAI",taskId:"task-1",sessionId:"session-1",head:"a".repeat(40),result:"PASS",summary:"ok",findings:[],tests:["git diff --check PASS"]})}\nBENJADMIN_INTERNAL_REVIEW_END`;
check("internal review report parses and normalizes BENAI",()=>{const p=parser.parseDeveloperGridInternalReviewReport(good);assert.equal(p.ok,true);assert.equal(p.report.workerCode,"BENJAMINAI");assert.equal(p.report.result,"PASS");});
const bad=`BENJADMIN_INTERNAL_REVIEW_V1\n${JSON.stringify({schemaVersion:1,reviewMode:"INTERNAL_REVIEW_FALLBACK",workerCode:"BENAI",taskId:"task-1",sessionId:"session-1",head:"a".repeat(40),result:"PASS",summary:"bad",findings:[{severity:"HIGH",category:"SECURITY",message:"x"}],tests:[]})}\nBENJADMIN_INTERNAL_REVIEW_END`;
check("PASS with blocker is fail-closed",()=>assert.equal(parser.parseDeveloperGridInternalReviewReport(bad).ok,false));
check("conversation monitor drives autopilot without human stage click",()=>assert.match(main,/await continueDeveloperGridAutopilot\(code\)/));
check("stages 1-3 automatically send next stage",()=>{assert.match(main,/stage>=1 && stage<=3/);assert.match(main,/prepareWorkerStageAction\(uiCode,"advance-stage",context\)/);});
check("stage 4 chooses external VGuard when ready",()=>{assert.match(main,/gate\?\.vguard\?\.providerReady===true/);assert.match(main,/requestDeveloperGridVGuardReview/);});
check("stage 4 falls back to same worker internal review",()=>{assert.match(main,/prepareInternalReviewFallback\(uiCode,context\)/);assert.match(main,/submitDeveloperGridInternalReviewFallback/);});
check("review and build failures have autonomous rework prompts",()=>{assert.match(stage,/"review-rework"/);assert.match(stage,/"build-rework"/);assert.match(main,/prepareWorkerStageAction\(uiCode,"build-rework",context\)/);});
check("stage 5 automatically requests Central Core full build",()=>assert.match(main,/requestDeveloperGridFullBuild\(\{baseUrl:config\.benjadminBaseUrl/));
check("stage 6 forces memory refresh then closure",()=>{assert.match(main,/syncConversationMemoryForWorker\(uiCode,true\)/);assert.match(main,/closeDeveloperGridWork/);});
check("internal fallback is disabled when external provider is ready",()=>assert.match(vguard,/DEVELOPER_GRID_EXTERNAL_VGUARD_READY/));
check("server validates fallback stage and boot ack",()=>{assert.match(vguard,/workStageIndex \|\| 1\) !== 4/);assert.match(vguard,/bootAckState !== "VALIDATED"/);assert.match(vguard,/bootAckCodingAllowed !== true/);});
check("server records explicit internal review audit mode",()=>{assert.match(vguard,/reviewMode:"INTERNAL_REVIEW_FALLBACK"/);assert.match(vguard,/reviewerWorkerCode:session\.workerCode/);});
check("internal review PASS advances 4 to 5",()=>assert.match(vguard,/INTERNAL_REVIEW_FALLBACK PASS; fejlesztési szakasz: 4\/6 → 5\/6 BUILD \/ KIADÁS/));
check("review gate accepts audited review evidence",()=>{assert.match(gate,/item\.kind === "REVIEW"/);assert.match(gate,/review\?\.attributes\.reviewMode/);});
check("review route has explicit internal fallback action",()=>assert.match(route,/INTERNAL_REVIEW_FALLBACK/));
check("README declares autonomous no-folytasd workflow",()=>{assert.match(readme,/desktop autopilot PASS után automatikusan folytatja az 1\/6→6\/6 láncot/);assert.match(readme,/nincs köztes felhasználói „folytasd”/);});

console.log("Developer Grid v0.1.94 autonomous 1/6→6/6 workflow contract PASS · "+n+"/"+n);
