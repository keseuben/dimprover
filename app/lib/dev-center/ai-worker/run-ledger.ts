import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type WorkerCode="MFORGE"|"VGUARD";
type UsageRecord={taskId:string;workerCode:WorkerCode;provider:string;model:string|null;runId:string;inputTokens:number;outputTokens:number;totalTokens:number;costHuf:number;wallTimeMs:number;activeTimeMs:number;retryIndex:number;changedFiles:number;testsPassed:number;testsFailed:number;reviewResult:string|null;stopReason:string|null;finishedAt:string};
function client():SupabaseClient{const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();if(!url||!key)throw new Error("A DEV adatbázis-kapcsolat nincs konfigurálva.");return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}})}
function n(value:unknown){const parsed=Number(value);return Number.isFinite(parsed)&&parsed>=0?parsed:0}
function record(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{} }

export async function recordExternalAiUsage(input:UsageRecord){
 const db=client();
 const result=await db.from("dev_center_live_worklog").insert({worker_code:input.workerCode,task_id:input.taskId,phase:"provider_usage",level:input.testsFailed>0?"warning":"success",summary:`${input.workerCode} provider usage · ${input.provider}${input.model?` / ${input.model}`:""} · ${input.costHuf.toFixed(2)} Ft`,detail:"",progress_percent:100,source:"external-ai-worker",metadata:{recordType:"EXTERNAL_AI_RUN_USAGE",...input}}).select("id,created_at").single();
 if(result.error)throw new Error(result.error.message);return{ok:true as const,id:result.data.id,createdAt:result.data.created_at};
}

export function newExternalAiRunId(workerCode:WorkerCode){return`ai-run-${workerCode.toLowerCase()}-${randomUUID().slice(0,12)}`}

export async function summarizeExternalAiUsage(){
 const db=client();const now=new Date();const monthStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString();const dayStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())).toISOString();
 const result=await db.from("dev_center_live_worklog").select("task_id,worker_code,metadata,created_at").eq("source","external-ai-worker").gte("created_at",monthStart).order("created_at",{ascending:false}).limit(2000);if(result.error)throw new Error(result.error.message);
 const rows=(result.data||[]).filter((row)=>record(row.metadata).recordType==="EXTERNAL_AI_RUN_USAGE");
 let monthlyCostHuf=0,dailyCostHuf=0,inputTokens=0,outputTokens=0,totalTokens=0,runCount=0;
 const workers:Record<string,{costHuf:number;runs:number;tokens:number}>={MFORGE:{costHuf:0,runs:0,tokens:0},VGUARD:{costHuf:0,runs:0,tokens:0}};
 for(const row of rows){const meta=record(row.metadata);const cost=n(meta.costHuf),input=n(meta.inputTokens),output=n(meta.outputTokens),total=n(meta.totalTokens)||input+output;monthlyCostHuf+=cost;inputTokens+=input;outputTokens+=output;totalTokens+=total;runCount+=1;if(row.created_at>=dayStart)dailyCostHuf+=cost;const code=String(row.worker_code||"");if(workers[code]){workers[code].costHuf+=cost;workers[code].runs+=1;workers[code].tokens+=total}}
 return{monthStart,dayStart,runCount,dailyCostHuf,monthlyCostHuf,inputTokens,outputTokens,totalTokens,workers,source:"dev_center_live_worklog"};
}

export async function summarizeExternalAiTaskUsage(taskId:string){
 const db=client();
 const result=await db.from("dev_center_live_worklog").select("worker_code,metadata,created_at").eq("source","external-ai-worker").eq("task_id",taskId).order("created_at",{ascending:true}).limit(500);
 if(result.error)throw new Error(result.error.message);
 const rows=(result.data||[]).filter((row)=>record(row.metadata).recordType==="EXTERNAL_AI_RUN_USAGE");
 let costHuf=0,inputTokens=0,outputTokens=0,totalTokens=0,wallTimeMs=0,activeTimeMs=0,maxRetryIndex=0;
 const workers:Record<string,{costHuf:number;runs:number;tokens:number;activeTimeMs:number}>={MFORGE:{costHuf:0,runs:0,tokens:0,activeTimeMs:0},VGUARD:{costHuf:0,runs:0,tokens:0,activeTimeMs:0}};
 for(const row of rows){const meta=record(row.metadata);const cost=n(meta.costHuf),input=n(meta.inputTokens),output=n(meta.outputTokens),total=n(meta.totalTokens)||input+output,wall=n(meta.wallTimeMs),active=n(meta.activeTimeMs),retry=n(meta.retryIndex);costHuf+=cost;inputTokens+=input;outputTokens+=output;totalTokens+=total;wallTimeMs+=wall;activeTimeMs+=active;maxRetryIndex=Math.max(maxRetryIndex,retry);const code=String(row.worker_code||"");if(workers[code]){workers[code].costHuf+=cost;workers[code].runs+=1;workers[code].tokens+=total;workers[code].activeTimeMs+=active}}
 return{taskId,runCount:rows.length,costHuf,inputTokens,outputTokens,totalTokens,wallTimeMs,activeTimeMs,maxRetryIndex,workers};
}
