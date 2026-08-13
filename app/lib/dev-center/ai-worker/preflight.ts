import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getInternalExecutorReadiness, safeWorkerBranchName, safeWorkerWorktreePath } from "../internal-executor-readiness";
import { EXTERNAL_AI_WORKER_IDS } from "./external-worker-policy";

const execFileAsync=promisify(execFile);
const CHECKPOINT_ROOT=process.env.DIMPRO_AI_WORKER_CHECKPOINT_ROOT?.trim()||"/srv/dimpro-dev/data/benjadmin-ai-worker-checkpoints";

type Row=Record<string,unknown>;
function record(value:unknown):Row{return value&&typeof value==="object"&&!Array.isArray(value)?value as Row:{}}
function text(value:unknown){return typeof value==="string"?value.trim():""}
function scopeList(value:unknown){return Array.isArray(value)?value.filter((x):x is Row=>Boolean(x)&&typeof x==="object"&&!Array.isArray(x)).map(x=>({type:text(x.type)||"path",key:text(x.key)})).filter(x=>x.key):[]}
function overlaps(a:string,b:string){return a===b||a.startsWith(`${b}/`)||b.startsWith(`${a}/`)}

function client():SupabaseClient{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
 if(!url||!key)throw new Error("A DEV adatbázis-kapcsolat nincs konfigurálva.");
 return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false},global:{headers:{"x-client-info":"dimpro-external-ai-worker-preflight/1.1"}}});
}

async function baselineBlob(gitDir:string,commit:string,filePath:string){
 try{
  const {stdout}=await execFileAsync("/usr/bin/git",["--git-dir",gitDir,"ls-tree",commit,"--",filePath],{encoding:"utf8",timeout:5000,maxBuffer:1024*1024});
  const line=stdout.trim(); if(!line)return null;
  const match=/^\d+\s+blob\s+([0-9a-f]{40})\t(.+)$/i.exec(line);
  return match?{blob:match[1],path:match[2]}:null;
 }catch{return null}
}

export async function runExternalAiWorkerPreflight(taskId:string){
 const db=client();
 const taskResult=await db.from("dev_center_tasks").select("id,project_id,repository_id,title,description,status,scope,metadata,updated_at").eq("id",taskId).maybeSingle();
 if(taskResult.error)throw new Error(taskResult.error.message);
 if(!taskResult.data)return{ok:false as const,error:"Az AI worker task nem található."};
 const task=taskResult.data as Row,meta=record(task.metadata);
 if(meta.workflowTarget!=="EXTERNAL_AI_WORKER_V1"||meta.recordType!=="WORKER_TASK")return{ok:false as const,error:"A task nem Külső AI Worker V1 task."};
 if(meta.workflowState!=="READY")return{ok:false as const,error:`Preflight csak READY állapotból indítható. Jelenlegi állapot: ${String(meta.workflowState||"DRAFT")}.`};
 const analysisState=text(meta.scopeAnalysisState)||"PENDING";
 if(analysisState==="NEEDS_REVIEW")return{ok:false as const,error:"YELLOW technikai scope még felülvizsgálatra vár. Használd a biztonságos scope döntést vagy várd meg a Ben-AI review-t.",code:"AI_WORKER_SCOPE_REVIEW_REQUIRED"};
 if(analysisState==="BLOCKED_RED")return{ok:false as const,error:"PIROS technikai scope miatt a preflight tiltott.",code:"AI_WORKER_SCOPE_RED_BLOCKED"};
 if(!["AUTO_APPROVED","REVIEW_RESOLVED_SAFE"].includes(analysisState))return{ok:false as const,error:"A technikai scope még nincs végrehajtható állapotban.",code:"AI_WORKER_SCOPE_NOT_READY"};
 const scopes=scopeList(task.scope);
 if(!scopes.length)return{ok:false as const,error:"Nincs végrehajtható GREEN scope.",code:"AI_WORKER_SCOPE_EMPTY"};
 const readiness=await getInternalExecutorReadiness(db);
 if(!readiness.repositoryReady||!readiness.baselineReady||!readiness.baselineCommit||!readiness.repositoryPath)return{ok:false as const,error:"A közös DEV repository vagy trusted baseline nem READY.",code:"AI_WORKER_BASELINE_NOT_READY"};
 if(text(task.repository_id)!==readiness.repositoryId)return{ok:false as const,error:"A task repository-kötése eltér a trusted baseline repositorytól.",code:"AI_WORKER_REPOSITORY_MISMATCH"};
 const worker=await db.from("dev_center_workers").select("id,code,status,metadata").eq("id",EXTERNAL_AI_WORKER_IDS.MFORGE).maybeSingle();
 if(worker.error)throw new Error(worker.error.message);
 if(!worker.data||worker.data.code!=="MFORGE"||worker.data.status!=="ready"||worker.data.metadata?.productionAccess!=="DENY")return{ok:false as const,error:"M.Forge-AI DEV worker policy nem READY.",code:"AI_WORKER_MFORGE_NOT_READY"};
 const locks=await db.from("dev_center_scope_locks").select("id,scope_type,scope_key,session_id,task_id,status,expires_at").eq("repository_id",readiness.repositoryId).eq("status","active");
 if(locks.error)throw new Error(locks.error.message);
 const now=Date.now();
 const active=(locks.data||[]).filter(l=>!l.expires_at||Date.parse(l.expires_at)>now);
 const conflicts=active.filter(lock=>scopes.some(scope=>scope.type===lock.scope_type&&(scope.type!=="path"?scope.key===lock.scope_key:overlaps(scope.key,String(lock.scope_key||"")))));
 if(conflicts.length)return{ok:false as const,error:"A javasolt scope egy másik aktív worker scope-lockjával ütközik.",code:"AI_WORKER_SCOPE_CONFLICT",conflicts:conflicts.map(x=>({id:x.id,scopeType:x.scope_type,scopeKey:x.scope_key,sessionId:x.session_id,taskId:x.task_id}))};
 const contextFiles=[];
 for(const scope of scopes.filter(x=>x.type==="path").slice(0,64)){
  const blob=await baselineBlob(readiness.repositoryPath,readiness.baselineCommit,scope.key);
  contextFiles.push({path:scope.key,baselineBlob:blob?.blob||null,presentAtBaseline:Boolean(blob)});
 }
 const workspacePlan={workerId:EXTERNAL_AI_WORKER_IDS.MFORGE,workerCode:"MFORGE",baselineRef:readiness.baselineRef,baselineCommit:readiness.baselineCommit,branchName:safeWorkerBranchName({workerCode:"MFORGE",taskId}),worktreePath:safeWorkerWorktreePath({workerCode:"MFORGE",taskId}),repositoryId:readiness.repositoryId,environmentId:"env_dev"};
 const checkpointPayload={version:"1.1",taskId,createdAt:new Date().toISOString(),task:{id:task.id,projectId:task.project_id,repositoryId:task.repository_id,title:task.title,description:task.description,status:task.status,scope:scopes,metadata:meta},baseline:{ref:readiness.baselineRef,commit:readiness.baselineCommit},workspacePlan};
 const checkpointJson=JSON.stringify(checkpointPayload,null,2)+"\n",checkpointSha256=createHash("sha256").update(checkpointJson).digest("hex");
 const taskDir=path.join(CHECKPOINT_ROOT,taskId); await mkdir(taskDir,{recursive:true,mode:0o700});
 const checkpointId=`checkpoint-${new Date().toISOString().replaceAll("-", "").replaceAll(":", "").replaceAll(".", "")}-${randomUUID().slice(0,8)}`;
 const checkpointPath=path.join(taskDir,`${checkpointId}.json`); await writeFile(checkpointPath,checkpointJson,{mode:0o600,flag:"wx"});
 const contextPack={version:"1.1-meta",generatedAt:new Date().toISOString(),baselineCommit:readiness.baselineCommit,scopeCount:scopes.length,fileCount:contextFiles.length,files:contextFiles,secretContentIncluded:false,yellowExcluded:analysisState==="REVIEW_RESOLVED_SAFE"};
 const preflight={state:"PASS",checkedAt:new Date().toISOString(),repositoryReady:true,baselineReady:true,mforgeReady:true,scopeConflictCount:0,providerRequired:false,executorRequired:false};
 const nextMeta={...meta,workflowState:"PREFLIGHT",preflight,checkpoint:{id:checkpointId,path:checkpointPath,sha256:checkpointSha256,createdAt:checkpointPayload.createdAt},contextPack,workspacePlan};
 const update=await db.from("dev_center_tasks").update({metadata:nextMeta,status:"ready",requested_worker_id:EXTERNAL_AI_WORKER_IDS.MFORGE,updated_at:new Date().toISOString()}).eq("id",taskId).select("id,status,requested_worker_id,metadata,scope,updated_at").single();
 if(update.error)throw new Error(update.error.message);
 const audit=await db.from("dev_center_audit_events").insert({id:`dev-audit-${randomUUID().slice(0,12)}`,actor_type:"system",actor_id:"BenAI",action:"AI_WORKER_PREFLIGHT_PASSED",entity_type:"task",entity_id:taskId,task_id:taskId,project_id:task.project_id,summary:`Külső AI Worker V1.1 preflight PASS · ${scopes.length} scope · M.Forge workspace terv kész.`,metadata:{checkpointId,checkpointSha256,baselineCommit:readiness.baselineCommit,scopeCount:scopes.length,workspacePlan}});
 if(audit.error)throw new Error(audit.error.message);
 return{ok:true as const,taskId,workflowState:"PREFLIGHT" as const,preflight,checkpoint:{id:checkpointId,sha256:checkpointSha256},contextPack,workspacePlan};
}
