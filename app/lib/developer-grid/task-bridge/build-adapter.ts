"server-only";

import { createHash, randomUUID } from "node:crypto";
import { appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { classifyScopePath } from "@/app/lib/dev-center/ai-worker/scope-policy";
import { isSensitivePath } from "@/app/lib/dev-center/ai-worker/secret-scanner";
import { reconcileDeveloperGridBuildRuns, requestDeveloperGridReviewedBuild } from "../build-runs";
import { getCodexTaskBridge } from "./core";
import { inspectTaskBridgeGit } from "./workspace";

const sha=(value:string)=>createHash("sha256").update(value).digest("hex");
const text=(value:unknown,max=1200)=>String(value??"").trim().slice(0,max);
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
function fail(message:string,code:string,status=409):never{const error=new Error(message);Object.assign(error,{code,status});throw error}
function db(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();if(!url||!key)throw new Error("A DEV adatbázis-kapcsolat nincs konfigurálva.");return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false},global:{headers:{"x-client-info":"dimpro-task-bridge-build/0.1.53"}}})}
async function auditFile(taskDir:string,event:Record<string,unknown>){await appendFile(path.join(taskDir,"audit.jsonl"),`${JSON.stringify({at:new Date().toISOString(),environment:"DEV",productionAccess:"DENY",...event})}\n`,{encoding:"utf8",mode:0o600})}
async function dbAudit(taskId:string,projectId:string,action:string,summary:string,metadata:Record<string,unknown>){const client=db();const {error}=await client.from("dev_center_audit_events").insert({id:`dev-audit-${randomUUID().slice(0,12)}`,actor_type:"system",actor_id:"BenAI",action,entity_type:"task",entity_id:taskId,task_id:taskId,project_id:projectId,summary,metadata:{surfaceType:"CODEX",executionMode:"TASK_BRIDGE",productionAccess:"DENY",...metadata}});if(error)throw new Error(error.message)}
async function updateBridge(taskId:string,nextBridge:Record<string,unknown>){const client=db();const current=await client.from("dev_center_tasks").select("metadata").eq("id",taskId).maybeSingle();if(current.error||!current.data)throw new Error(current.error?.message||"Task Bridge task nem található.");const metadata=record(current.data.metadata);const update=await client.from("dev_center_tasks").update({metadata:{...metadata,taskBridge:nextBridge},updated_at:new Date().toISOString()}).eq("id",taskId);if(update.error)throw new Error(update.error.message)}
function changedPathsAllowed(paths:string[],expected:string[]){const expectedSorted=[...expected].sort();const actual=[...paths].sort();if(JSON.stringify(expectedSorted)!==JSON.stringify(actual))return false;return actual.every((p)=>!isSensitivePath(p)&&classifyScopePath(p).riskLevel!=="RED"&&!/^supabase\/migrations(?:\/|$)/i.test(p))}
function bridgeBuildState(status:string){if(status==="QUEUED")return {state:"BUILD_PENDING",buildState:"PENDING",devAcceptanceState:"WAIT"};if(status==="ASSIGNED"||status==="RUNNING")return {state:"BUILD_RUNNING",buildState:"RUNNING",devAcceptanceState:"WAIT"};if(status==="PASS")return {state:"DEV_ACCEPTANCE_PENDING",buildState:"PASS",devAcceptanceState:"PENDING"};return {state:"ERROR",buildState:status||"ERROR",devAcceptanceState:"BLOCKED"}}
async function syncTaskManifest(bridge:Record<string,unknown>,patch:Record<string,unknown>){const taskDir=path.resolve(text(bridge.taskDir)),taskJsonPath=path.resolve(text(bridge.taskJsonPath));if(taskJsonPath!==path.join(taskDir,"task.json"))fail("A task.json provenance hibás.","TASK_BRIDGE_TASK_JSON_PATH_INVALID");const fs=await import("node:fs/promises");let current:Record<string,unknown>={};try{current=record(JSON.parse(await fs.readFile(taskJsonPath,"utf8")))}catch{fail("A task.json nem olvasható.","TASK_BRIDGE_TASK_JSON_INVALID")}await writeFile(taskJsonPath,`${JSON.stringify({...current,...patch,updatedAt:new Date().toISOString()},null,2)}
`,{encoding:"utf8",mode:0o600})}
async function persistBuildArtifact(bridge:Record<string,unknown>,run:Record<string,unknown>){const taskDir=path.resolve(text(bridge.taskDir)),buildPath=path.resolve(text(bridge.buildPath));if(buildPath!==path.join(taskDir,"build.json"))fail("A build.json útvonala eltér a Task Bridge könyvtártól.","TASK_BRIDGE_BUILD_PATH_INVALID");const payload={schemaVersion:"dimpro.task-bridge.build.v1",taskId:text(run.taskId),environment:"DEV",productionAccess:"DENY",runId:text(run.id),status:text(run.status),nodeId:run.nodeId||null,sourceCommit:text(run.sourceCommit),sourceBranch:text(run.sourceBranch),buildId:run.buildId||null,artifactSha256:run.artifactSha256||null,queuedAt:run.queuedAt||null,startedAt:run.startedAt||null,finishedAt:run.finishedAt||null,updatedAt:new Date().toISOString()};const raw=`${JSON.stringify(payload,null,2)}\n`;await writeFile(buildPath,raw,{encoding:"utf8",mode:0o600});return {payload,sha256:sha(raw)}}
async function persistAcceptanceRequest(bridge:Record<string,unknown>,run:Record<string,unknown>){
  const taskDir=path.resolve(text(bridge.taskDir)),requestPath=path.resolve(text(bridge.acceptanceRequestPath));if(requestPath!==path.join(taskDir,"ACCEPTANCE.md"))fail("Az ACCEPTANCE.md útvonala eltér a Task Bridge könyvtártól.","TASK_BRIDGE_ACCEPTANCE_PATH_INVALID");
  const content=`# BENJADMIN Developer Grid · DEV Acceptance

**Task ID:** ${text(run.taskId)}

**Environment:** DEV ONLY · PROD DENY

## Build proof

- Run: ${text(run.id)}
- Runner: ${text(run.nodeId)||"—"}
- Build ID: ${text(run.buildId)||"—"}
- Source commit: ${text(run.sourceCommit)}
- Artifact SHA-256: ${text(run.artifactSha256)||"—"}

## Kötelező ellenőrzés

A DEV acceptance során ellenőrizd a funkcionális acceptance feltételeket, a releváns smoke/regressziós teszteket és azt, hogy PROD művelet nem történt. A végén írj acceptance.json fájlt a task könyvtárba.

## acceptance.json séma

\`\`\`json
{
  "schemaVersion": "dimpro.task-bridge.acceptance.v1",
  "taskId": "${text(run.taskId)}",
  "status": "DEV_ACCEPTANCE_PASS",
  "buildRunId": "${text(run.id)}",
  "buildId": "${text(run.buildId)}",
  "sourceCommit": "${text(run.sourceCommit)}",
  "checks": [{"name":"...","status":"PASS"}],
  "summary": "...",
  "finishedAt": "<ISO-8601>"
}
\`\`\`
`;
  await writeFile(requestPath,content,{encoding:"utf8",mode:0o600});return {path:requestPath,sha256:sha(content)};
}


export async function requestCodexTaskBridgeBuild(taskIdValue:string){
  const taskId=text(taskIdValue,180);const current=await getCodexTaskBridge({taskId});if(!current)fail("A Task Bridge task nem található.","TASK_BRIDGE_TASK_NOT_FOUND",404);
  const bridge=record(current.bridge),state=text(bridge.state,80),reviewState=text(bridge.reviewState,80),reviewProof=text(bridge.reviewResultSha256,80),resultCommit=text(bridge.resultCommit,64).toLowerCase(),baseCommit=text(bridge.baseCommit,64).toLowerCase(),branchName=text(bridge.branchName,220),worktreePath=text(bridge.worktreePath,1200),sessionId=text(bridge.sessionId,180),workerCode=text(bridge.workerCode,40).toUpperCase();
  if(!["ARMINAI","OUTMINAI","BENJAMINAI","JAZMINAI"].includes(workerCode))fail("A Task Bridge build worker identitása érvénytelen.","TASK_BRIDGE_BUILD_WORKER_INVALID",409);
  if(state!=="REVIEW_PASS"||reviewState!=="PASS")fail("Task Bridge build csak REVIEW_PASS után indítható.","TASK_BRIDGE_BUILD_REVIEW_REQUIRED");
  if(!/^[0-9a-f]{64}$/.test(reviewProof)||!/^[0-9a-f]{40}$/.test(resultCommit))fail("A review/build provenance hiányos.","TASK_BRIDGE_BUILD_PROVENANCE_INVALID");
  const git=await inspectTaskBridgeGit({worktreePath,branchName,baseCommit,resultCommit});if(git.dirty)fail("Build csak tiszta Task Bridge worktree-ből indítható.","TASK_BRIDGE_BUILD_WORKTREE_DIRTY");
  const expected=Array.isArray(bridge.changedPaths)?bridge.changedPaths.map((x)=>text(x,600)).filter(Boolean):[];if(!changedPathsAllowed(git.changedPaths,expected))fail("A build előtti Git diff eltér a review-zott scope-tól.","TASK_BRIDGE_BUILD_SCOPE_MISMATCH");
  const requested=await requestDeveloperGridReviewedBuild({taskId,sessionId,workerCode:workerCode as "ARMINAI"|"OUTMINAI"|"BENJAMINAI"|"JAZMINAI",sourceCommit:resultCommit,sourceBranch:branchName,reviewState:"REVIEW_PASS",reviewedCommit:resultCommit,reviewResultSha256:reviewProof});
  const run=record(requested.run),phase=bridgeBuildState(text(run.status,40));const artifact=await persistBuildArtifact(bridge,run);const next={...bridge,...phase,buildRunId:text(run.id,180),buildState:phase.buildState,devAcceptanceState:phase.devAcceptanceState,buildRequestedAt:new Date().toISOString(),buildJsonSha256:artifact.sha256};await updateBridge(taskId,next);await syncTaskManifest(next,{status:phase.state,buildState:phase.buildState,buildRunId:text(run.id,180)});await auditFile(text(bridge.taskDir),{event:"BUILD_REQUESTED",taskId,runId:run.id,status:run.status,sourceCommit:resultCommit,reviewResultSha256:reviewProof});await dbAudit(taskId,current.projectId,"TASK_BRIDGE_BUILD_REQUESTED",`${current.title} · Task Bridge build ${text(run.status,40)}.`,{runId:run.id,status:run.status,sourceCommit:resultCommit,reviewResultSha256:reviewProof});return {ok:true as const,taskId,reused:requested.reused,run,bridge:next,productionAccess:"DENY" as const};
}

export async function reconcileCodexTaskBridgeBuild(currentInput:Awaited<ReturnType<typeof getCodexTaskBridge>>){
  if(!currentInput)return null;const bridge=record(currentInput.bridge),runId=text(bridge.buildRunId,180);if(!runId)return currentInput;
  const store=await reconcileDeveloperGridBuildRuns();const run=store.runs.find((item)=>item.id===runId&&item.taskId===currentInput.taskId);if(!run)return currentInput;
  const phase=bridgeBuildState(run.status);const previousState=text(bridge.state,80),previousBuild=text(bridge.buildState,80);if(previousState===phase.state&&previousBuild===phase.buildState)return {...currentInput,buildRun:run};
  const artifact=await persistBuildArtifact(bridge,run as unknown as Record<string,unknown>);const acceptance=run.status==="PASS"?await persistAcceptanceRequest(bridge,run as unknown as Record<string,unknown>):null;const next={...bridge,...phase,buildState:phase.buildState,devAcceptanceState:phase.devAcceptanceState,buildId:run.buildId||null,artifactSha256:run.artifactSha256||null,buildFinishedAt:run.finishedAt||null,buildJsonSha256:artifact.sha256,...(acceptance?{acceptanceRequestSha256:acceptance.sha256,acceptanceRequestPath:acceptance.path}:{})};await updateBridge(currentInput.taskId,next);await syncTaskManifest(next,{status:phase.state,buildState:phase.buildState,devAcceptanceState:phase.devAcceptanceState,buildId:run.buildId||null,artifactSha256:run.artifactSha256||null});await auditFile(text(bridge.taskDir),{event:`BUILD_${run.status}`,taskId:currentInput.taskId,runId:run.id,status:run.status,buildId:run.buildId||null,artifactSha256:run.artifactSha256||null});await dbAudit(currentInput.taskId,currentInput.projectId,`TASK_BRIDGE_BUILD_${run.status}`,`${currentInput.title} · Task Bridge build ${run.status}.`,{runId:run.id,buildId:run.buildId||null,artifactSha256:run.artifactSha256||null});return {...currentInput,bridge:next,buildRun:run};
}
