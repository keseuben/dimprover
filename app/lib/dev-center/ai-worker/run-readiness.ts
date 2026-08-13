import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getInternalExecutorReadiness } from "../internal-executor-readiness";
import { externalAiBudgetConfiguration, evaluateExternalAiBudget } from "./budget-policy";
import { probeWorkerModelAdapters, resolveWorkerModelAdapter, type WorkerProviderRole } from "./model-adapter";
import { summarizeExternalAiTaskUsage, summarizeExternalAiUsage } from "./run-ledger";

const CONTEXT_ROOT=path.resolve(process.env.DIMPRO_AI_WORKER_CONTEXT_ROOT?.trim()||"/srv/dimpro-dev/data/benjadmin-ai-worker-context");
type Row=Record<string,unknown>;
function record(value:unknown):Row{return value&&typeof value==="object"&&!Array.isArray(value)?value as Row:{}}
function text(value:unknown){return typeof value==="string"?value.trim():""}
function num(value:unknown,fallback=0){const parsed=Number(value);return Number.isFinite(parsed)&&parsed>=0?parsed:fallback}
function client():SupabaseClient{const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();if(!url||!key)throw new Error("A DEV adatbázis-kapcsolat nincs konfigurálva.");return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}})}

async function verifyContextPack(summary:Row){
 const filePath=path.resolve(text(summary.path));
 if(!filePath||filePath===CONTEXT_ROOT||!filePath.startsWith(`${CONTEXT_ROOT}${path.sep}`))return{valid:false,reason:"A Context Pack path kívül esik a BENJADMIN DEV context gyökéren.",filePath:null};
 try{
  const [bytes,fileStat]=await Promise.all([readFile(filePath),stat(filePath)]);
  if((fileStat.mode&0o777)!==0o600)return{valid:false,reason:"A Context Pack fájljogosultsága nem 0600.",filePath};
  const sha256=createHash("sha256").update(bytes).digest("hex");
  if(sha256!==text(summary.sha256))return{valid:false,reason:"A Context Pack SHA-256 eltér az adatbázis metaértéktől.",filePath};
  const pack=JSON.parse(bytes.toString("utf8")) as Row;
  if(pack.secretContentIncluded!==false)return{valid:false,reason:"A Context Pack secretContentIncluded értéke nem false.",filePath};
  if(text(pack.baselineCommit)!==text(summary.baselineCommit))return{valid:false,reason:"A Context Pack baseline meta eltér.",filePath};
  return{valid:true,reason:"Context Pack SHA és 0600 jogosultság rendben.",filePath,sha256,fileCount:num(pack.fileCount),totalBytes:num(pack.totalBytes),baselineCommit:text(pack.baselineCommit)};
 }catch(error){return{valid:false,reason:error instanceof Error?`A Context Pack nem olvasható: ${error.message}`:"A Context Pack nem olvasható.",filePath};}
}

export async function getExternalAiRunReadiness(taskId:string,role:WorkerProviderRole="MFORGE"){
 const db=client();
 const taskResult=await db.from("dev_center_tasks").select("id,project_id,repository_id,status,requested_worker_id,metadata,scope").eq("id",taskId).maybeSingle();
 if(taskResult.error)throw new Error(taskResult.error.message);
 if(!taskResult.data)return{ok:false as const,error:"Az AI worker task nem található."};
 const task=taskResult.data as Row,meta=record(task.metadata),contextSummary=record(meta.contextPackContent),workspace=record(meta.workspacePlan),preflight=record(meta.preflight);
 if(meta.workflowTarget!=="EXTERNAL_AI_WORKER_V1"||meta.recordType!=="WORKER_TASK")return{ok:false as const,error:"A task nem Külső AI Worker V1 task."};
 const blockers:string[]=[];
 const warnings:string[]=[];
 if(meta.workflowState!=="PREFLIGHT")blockers.push(`Workflow nem PREFLIGHT: ${String(meta.workflowState||"DRAFT")}.`);
 if(preflight.state!=="PASS")blockers.push("A preflight nem PASS.");
 if(!text(contextSummary.id))blockers.push("Safe Context Pack még nincs elkészítve.");
 const contextVerification=text(contextSummary.id)?await verifyContextPack(contextSummary):{valid:false,reason:"Context Pack hiányzik.",filePath:null};
 if(!contextVerification.valid)blockers.push(contextVerification.reason);
 const engineReadiness=await getInternalExecutorReadiness(db);
 if(!engineReadiness.repositoryReady||!engineReadiness.baselineReady)blockers.push("A DEV repository/trusted baseline nem READY.");
 if(text(workspace.repositoryId)!==engineReadiness.repositoryId||text(task.repository_id)!==engineReadiness.repositoryId)blockers.push("A task/workspace repository-kötés eltér a trusted baseline repositorytól.");
 if(text(workspace.baselineCommit)!==engineReadiness.baselineCommit)blockers.push("A workspace terv baseline commitja elavult; új preflight szükséges.");
 if(text(contextSummary.baselineCommit)!==engineReadiness.baselineCommit)blockers.push("A Safe Context Pack baseline commitja elavult; új Context Pack szükséges.");
 const expectedWorker=role==="MFORGE"?"worker_mforge":"worker_vguard";
 const worker=await db.from("dev_center_workers").select("id,code,status,metadata").eq("id",expectedWorker).maybeSingle();if(worker.error)throw new Error(worker.error.message);
 if(!worker.data||worker.data.status!=="ready"||worker.data.metadata?.productionAccess!=="DENY")blockers.push(`${role} worker policy nem READY/PROD-DENY.`);
 const [taskUsage,systemUsage,probes]=await Promise.all([summarizeExternalAiTaskUsage(taskId),summarizeExternalAiUsage(),probeWorkerModelAdapters()]);
 const config=externalAiBudgetConfiguration();
 const taskBudget=num(meta.taskBudgetHuf,config.taskBudgetHuf),workerBudget=role==="MFORGE"?num(meta.forgeBudgetHuf,config.forgeBudgetHuf):num(meta.guardBudgetHuf,config.guardBudgetHuf),workerUsage=taskUsage.workers[role];
 const budget=evaluateExternalAiBudget({taskCostHuf:taskUsage.costHuf,workerCostHuf:workerUsage?.costHuf||0,dailyCostHuf:systemUsage.dailyCostHuf,monthlyCostHuf:systemUsage.monthlyCostHuf,activeMinutes:(workerUsage?.activeTimeMs||0)/60000,retryCount:taskUsage.maxRetryIndex,taskLimitHuf:taskBudget,workerLimitHuf:workerBudget,dailyLimitHuf:config.dailyLimitHuf,monthlyLimitHuf:config.monthlyLimitHuf,maxActiveMinutes:num(meta.maxActiveMinutesPerWorker,config.maxActiveMinutesPerWorker),maxRetries:num(meta.maxFixRounds,config.maxFixRounds)});
 if(budget.hardStop)blockers.push(...budget.reasons.map((reason)=>`Budget hard stop: ${reason}`));else if(budget.state!=="OK")warnings.push(...budget.reasons);
 const preference=(text(meta.modelPreference)||"AUTO") as "AUTO"|"CLAUDE"|"OPENAI_CODEX";
 const provider=await resolveWorkerModelAdapter(preference,role);
 const requestedProvider=preference==="CLAUDE"?"anthropic":preference==="OPENAI_CODEX"?"openai":null;
 if(!provider){
  const requestedProbe=requestedProvider?probes.find((item)=>item.provider===requestedProvider):null;
  if(requestedProbe){
   if(!requestedProbe.configured)blockers.push(`${requestedProbe.label}: provider/model nincs konfigurálva.`);
   if(!requestedProbe.executionGateEnabled)blockers.push(`${requestedProbe.label}: provider execution global gate kikapcsolva.`);
   if(!requestedProbe.executionImplemented)blockers.push(`${requestedProbe.label}: provider executor még nincs implementálva.`);
  }else{
   const real=probes.filter((item)=>item.provider!=="mock");
   if(!real.some((item)=>item.configured))blockers.push("Nincs konfigurált külső AI provider és modell.");
   if(!real.some((item)=>item.executionGateEnabled))blockers.push("A külső provider execution global gate ki van kapcsolva.");
   if(!real.some((item)=>item.executionImplemented))blockers.push("Nincs implementált külső provider executor.");
  }
 }
 const ready=blockers.length===0&&Boolean(provider);
 return{ok:true as const,taskId,role,ready,state:ready?"READY":"BLOCKED",checkedAt:new Date().toISOString(),provider:provider?{provider:provider.provider,label:provider.label,modelId:provider.modelId}:null,providerProbes:probes.map((item)=>({provider:item.provider,label:item.label,configured:item.configured,executionGateEnabled:item.executionGateEnabled,executionImplemented:item.executionImplemented,ready:item.ready,modelId:item.modelId,detail:item.detail})),context:{valid:contextVerification.valid,reason:contextVerification.reason,fileCount:"fileCount" in contextVerification?contextVerification.fileCount:0,totalBytes:"totalBytes" in contextVerification?contextVerification.totalBytes:0,baselineCommit:"baselineCommit" in contextVerification?contextVerification.baselineCommit:null},workspace:{repositoryId:text(workspace.repositoryId),baselineCommit:text(workspace.baselineCommit),branchName:text(workspace.branchName),worktreePath:text(workspace.worktreePath),workerId:text(workspace.workerId)},budget,usage:{task:taskUsage,system:{dailyCostHuf:systemUsage.dailyCostHuf,monthlyCostHuf:systemUsage.monthlyCostHuf}},blockers,warnings};
}
