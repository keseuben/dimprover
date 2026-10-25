"server-only";
import {normalizeReviewedWritePaths} from "./reviewed-write-scope";
import {withDeveloperGridTaskOperation} from "./task-operation-lock";
import {createHash} from "node:crypto";
import {readFile,stat} from "node:fs/promises";
import path from "node:path";
import {finalizeDevEngineTask} from "@/app/lib/dev-center/engine-repository";
import {releaseSessionAtomic} from "@/app/lib/dev-center/orchestration-repository";
import {getDeveloperGridFoundation} from "./foundation";
import {resolveDeveloperGridModuleSource} from "./module-source";
import {verifyCurrentSourceExecutionState} from "./source-provenance";
import {appendGridEvent,listGridEvents,readGridState,upsertWorkerSession} from "./state-store";
import {encodeEventCursor} from "./events";
import {getDeveloperGridTaskById,normalizeWorkStartInput,startDeveloperGridWork,workStartTaskId} from "./work-start";

const processing=new Set<string>();
function fail(code:string,message:string):never{throw Object.assign(new Error(message),{code,status:409});}
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function assertNoPendingExecution(taskId:string){
 const root=process.env.BENJADMIN_DEVELOPER_GRID_EXECUTION_ROOT?.trim()||"/srv/dimpro-dev/coordination/developer-grid/execution";
 const file=path.join(root,`${taskId.replace(/[^A-Za-z0-9._-]/g,"_")}.jsonl`);
 let body="";try{if((await stat(file)).size>8*1024*1024)fail("WORK_REPLACEMENT_AUDIT_TOO_LARGE","A végrehajtási napló külön ellenőrzést igényel.");body=await readFile(file,"utf8");}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return;throw error;}
 const pending=new Set<string>();
 for(const line of body.split(/\r?\n/).filter(Boolean)){
  let row;try{row=JSON.parse(line);}catch{fail("WORK_REPLACEMENT_AUDIT_INVALID","Sérült végrehajtási napló mellett a task nem váltható le.");}
  if(row.event==="REQUEST")pending.add(`${row.requestId}:${row.requestHash}`);
  if(row.event==="RESULT")pending.delete(`${row.requestId}:${row.requestHash}`);
 }
 if(pending.size)fail("WORK_REPLACEMENT_EXECUTION_PENDING","Folyamatban lévő vagy bizonytalan végrehajtás mellett nem indítható új kör.");
}

async function replacementPlan(raw:Record<string,unknown>,allowAuthorizedReplay=false){
 const taskId=String(raw.taskId||""),sessionId=String(raw.sessionId||""),worker=String(raw.workerCode||"").toUpperCase().replace(/^BENAI$/,"BENJAMINAI");
 const input=normalizeWorkStartInput({...raw,preferredWorkerCode:worker,idempotencyKey:"replacement-preflight",chatLaunchMode:"EXISTING_CHAT",surfaceType:"CHATGPT"});
 const state=await readGridState();
 const session=state.sessions.find(s=>s.id===sessionId&&s.taskId===taskId&&s.workerCode===worker);
 const task=await getDeveloperGridTaskById(taskId);
 if(!session||!task||task.projectId!==input.projectId)fail("WORK_REPLACEMENT_IDENTITY_MISMATCH","Eltérő task/session/worker/projekt.");
 const proof=String(session.developmentContext.sourceExecutionProof?.sha256||"");
 if(!proof||proof!==String(raw.expectedSourceProofSha256||""))fail("WORK_REPLACEMENT_PROOF_CHANGED","A forrásigazolás megváltozott. Új előnézet szükséges.");
 if(Number(session.developmentContext.workStageIndex||1)!==1)fail("WORK_REPLACEMENT_STAGE_DENIED","Ez az átállítás csak az 1/6 ELEMZÉS szakaszban használható.");
 if(session.endedAt&&!allowAuthorizedReplay)fail("WORK_REPLACEMENT_SESSION_ENDED","A régi session már lezárult.");
 await verifyCurrentSourceExecutionState(session.sourceProvenance,{requireClean:true});
 await assertNoPendingExecution(taskId);
 const foundation=await getDeveloperGridFoundation();
 const source=await resolveDeveloperGridModuleSource({projectId:input.projectId,moduleName:input.moduleName,fallbackHead:String(foundation.sourceProvenance.head||""),pinnedHead:input.sourceCommit});
 if(source.authority!=="MODULE_CATALOG")fail("WORK_REPLACEMENT_MODULE_SOURCE_REQUIRED","Új fejlesztési körhöz ellenőrzött modulforrás-kötés szükséges.");
 const reviewedWritePaths=normalizeReviewedWritePaths(raw.reviewedWritePaths,input.projectId,input.moduleName);
 const plan={reviewedWritePaths,schemaVersion:1,previousTaskId:taskId,previousSessionId:sessionId,workerCode:worker,previousHead:session.sourceProvenance.head,previousSourceProofSha256:proof,sourcePrompt:input.sourcePrompt,projectId:input.projectId,moduleName:input.moduleName,targetSource:source,requiresNewBootAck:true,preservesPreviousWorktree:true,productionAccess:"DENY"};
 return {plan,planSha256:hash(plan),task,session,input};
}
export async function prepareDeveloperGridWorkReplacement(raw:Record<string,unknown>){const {plan,planSha256}=await replacementPlan(raw);return {plan,planSha256};}

export async function replaceDeveloperGridWork(raw:Record<string,unknown>){
 return withDeveloperGridTaskOperation(String(raw.taskId||""),()=>replaceDeveloperGridWorkLocked(raw));
}
async function replaceDeveloperGridWorkLocked(raw:Record<string,unknown>){
 const expected=String(raw.planSha256||"");if(!/^[0-9a-f]{64}$/.test(expected))fail("WORK_REPLACEMENT_PLAN_REQUIRED","Előbb ellenőrzött átállítási előnézet szükséges.");
 const key=String(raw.taskId||"");if(processing.has(key))fail("WORK_REPLACEMENT_BUSY","Az átállítás folyamatban van.");processing.add(key);
 try{
  const state=await readGridState();
  const events=await listGridEvents({cursor:encodeEventCursor(Math.max(0,Number(state.lastSequence||0)-200)),limit:200});
  const authorized=events.events.some(e=>e.origin==="LIVE"&&e.taskId===raw.taskId&&e.delta?.eventType==="WORK_REPLACEMENT_AUTHORIZED"&&e.delta?.planSha256===expected&&e.delta?.sessionId===raw.sessionId);
  const {plan,planSha256,task,session,input}=await replacementPlan(raw,authorized);
  if(planSha256!==expected)fail("WORK_REPLACEMENT_PLAN_CHANGED","Az átállítás forrása vagy utasítása megváltozott. Új előnézet szükséges.");
  const idempotencyKey=`replace:${session.id}:${expected}`.slice(0,160),nextTaskId=workStartTaskId(idempotencyKey);
  if(!authorized)await appendGridEvent({kind:"analysis",origin:"LIVE",workerCode:session.workerCode,taskId:task.id,projectId:task.projectId,productionAccess:"DENY",delta:{eventType:"WORK_REPLACEMENT_AUTHORIZED",sessionId:session.id,planSha256,nextTaskId,previousHead:plan.previousHead,targetHead:plan.targetSource.head,summary:"Explicit új fejlesztési kör; régi forrás és audit megőrizve."}});
  if(!session.endedAt){
   const engine=String(session.developmentContext.engineSessionId||"");if(engine)await releaseSessionAtomic(engine,"Explicit source replacement",false);
   await finalizeDevEngineTask({taskId:task.id,outcome:"failed",note:`SOURCE_REPLACED_BY:${nextTaskId}; korábbi task nem készre jelentve.`,rebalance:false});
   await assertNoPendingExecution(task.id);
   await upsertWorkerSession({...session,endedAt:new Date().toISOString()});
  }
  const work=await startDeveloperGridWork({...input,idempotencyKey,sourceCommit:plan.targetSource.head,autoRetireStalePreBoot:false});
  if(work.session&&plan.reviewedWritePaths.length){
   const updated={...work.session,developmentContext:{...work.session.developmentContext,reviewedWriteApproval:{authority:"MANUAL_REPLACEMENT_PLAN" as const,taskId:nextTaskId,sessionId:work.session.id,workerCode:work.session.workerCode,head:plan.targetSource.head,proofSha256:String(work.session.developmentContext.sourceExecutionProof?.sha256||""),planSha256,paths:plan.reviewedWritePaths}}};
   await upsertWorkerSession(updated);work.session=updated;
  }
  await appendGridEvent({kind:"analysis",origin:"LIVE",workerCode:session.workerCode,taskId:nextTaskId,projectId:task.projectId,productionAccess:"DENY",delta:{eventType:"WORK_REPLACEMENT_CREATED",sessionId:work.session?.id||null,previousTaskId:task.id,previousSessionId:session.id,targetHead:plan.targetSource.head,routingState:work.routingState,summary:"Új fejlesztési task új BOOT ACK-kal; korábbi tiltások a korábbi taskhoz kötve maradnak."}});
  return {work,previousTaskId:task.id,previousSessionId:session.id,planSha256};
 }finally{processing.delete(key);}
}
