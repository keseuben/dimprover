import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSensitivePath, scanSensitiveText } from "./secret-scanner";

const execFileAsync=promisify(execFile);
const REPOSITORY_PATH="/srv/dimpro-dev/repositories/dimprover.git";
const CONTEXT_ROOT=process.env.DIMPRO_AI_WORKER_CONTEXT_ROOT?.trim()||"/srv/dimpro-dev/data/benjadmin-ai-worker-context";
const MAX_FILE_BYTES=128*1024;
const MAX_TOTAL_BYTES=768*1024;

type Row=Record<string,unknown>;
function record(value:unknown):Row{return value&&typeof value==="object"&&!Array.isArray(value)?value as Row:{}}
function text(value:unknown){return typeof value==="string"?value.trim():""}
function client():SupabaseClient{const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();if(!url||!key)throw new Error("A DEV adatbázis-kapcsolat nincs konfigurálva.");return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}})}
async function gitShow(commit:string,filePath:string){
 try{return (await execFileAsync("/usr/bin/git",["--git-dir",REPOSITORY_PATH,"show",`${commit}:${filePath}`],{encoding:"utf8",timeout:8000,maxBuffer:MAX_FILE_BYTES+64*1024})).stdout}
 catch{return null}
}

export async function buildAndPersistSafeContextPack(taskId:string){
 const db=client();const taskResult=await db.from("dev_center_tasks").select("id,project_id,title,description,status,scope,metadata").eq("id",taskId).maybeSingle();if(taskResult.error)throw new Error(taskResult.error.message);if(!taskResult.data)return{ok:false as const,error:"Az AI worker task nem található."};
 const task=taskResult.data as Row,meta=record(task.metadata),preflight=record(meta.preflight),workspace=record(meta.workspacePlan);
 if(meta.workflowTarget!=="EXTERNAL_AI_WORKER_V1"||meta.recordType!=="WORKER_TASK")return{ok:false as const,error:"A task nem Külső AI Worker V1 task."};
 if(meta.workflowState!=="PREFLIGHT"||preflight.state!=="PASS")return{ok:false as const,error:"Safe Context Pack csak sikeres PREFLIGHT után készíthető."};
 const baselineCommit=text(workspace.baselineCommit);if(!/^[0-9a-f]{40}$/i.test(baselineCommit))return{ok:false as const,error:"A trusted baseline commit hiányzik."};
 const scopes=Array.isArray(task.scope)?task.scope.map(record).filter((scope)=>text(scope.type)==="path"&&text(scope.key)).map((scope)=>text(scope.key)):[];if(!scopes.length)return{ok:false as const,error:"Nincs GREEN path scope."};
 const files:Array<{path:string;content:string;sha256:string;bytes:number}> = [];const excluded:Array<{path:string;reason:string}> = [];let totalBytes=0;
 for(const filePath of scopes){
  if(isSensitivePath(filePath)){excluded.push({path:filePath,reason:"SENSITIVE_PATH"});continue}
  const content=await gitShow(baselineCommit,filePath);if(content==null){excluded.push({path:filePath,reason:"NOT_AT_BASELINE_OR_UNREADABLE"});continue}
  const bytes=Buffer.byteLength(content,"utf8");if(bytes>MAX_FILE_BYTES){excluded.push({path:filePath,reason:"FILE_TOO_LARGE"});continue}
  if(totalBytes+bytes>MAX_TOTAL_BYTES){excluded.push({path:filePath,reason:"PACK_SIZE_LIMIT"});continue}
  const secretHits=scanSensitiveText(content);if(secretHits.length){excluded.push({path:filePath,reason:`SECRET_PATTERN:${secretHits.join("|")}`});continue}
  files.push({path:filePath,content,sha256:createHash("sha256").update(content).digest("hex"),bytes});totalBytes+=bytes;
 }
 if(!files.length)return{ok:false as const,error:"A safe context pack egyetlen biztonságosan átadható fájlt sem tartalmaz.",code:"AI_WORKER_CONTEXT_EMPTY"};
 const pack={version:"1.2-safe",id:`context-${randomUUID().slice(0,12)}`,taskId,projectId:task.project_id,title:task.title,goal:task.description,generatedAt:new Date().toISOString(),baselineCommit,scopeAnalysisState:meta.scopeAnalysisState,secretContentIncluded:false,totalBytes,fileCount:files.length,excludedCount:excluded.length,files,excluded};
 const json=JSON.stringify(pack,null,2)+"\n",sha256=createHash("sha256").update(json).digest("hex"),dir=path.join(CONTEXT_ROOT,taskId);await mkdir(dir,{recursive:true,mode:0o700});const filePath=path.join(dir,`${pack.id}.json`);await writeFile(filePath,json,{mode:0o600,flag:"wx"});
 const summary={id:pack.id,path:filePath,sha256,version:pack.version,generatedAt:pack.generatedAt,baselineCommit,fileCount:pack.fileCount,totalBytes,excludedCount:pack.excludedCount,secretContentIncluded:false};
 const update=await db.from("dev_center_tasks").update({metadata:{...meta,contextPackContent:summary},updated_at:new Date().toISOString()}).eq("id",taskId);if(update.error)throw new Error(update.error.message);
 const audit=await db.from("dev_center_audit_events").insert({id:`dev-audit-${randomUUID().slice(0,12)}`,actor_type:"system",actor_id:"BenAI",action:"AI_WORKER_CONTEXT_PACK_READY",entity_type:"task",entity_id:taskId,task_id:taskId,project_id:task.project_id,summary:`Safe Context Pack kész · ${files.length} fájl · ${totalBytes} byte · ${excluded.length} kizárva.`,metadata:summary});if(audit.error)throw new Error(audit.error.message);
 return{ok:true as const,taskId,contextPack:summary,excluded};
}
