"server-only";
import {readFile,stat} from "node:fs/promises";
import path from "node:path";
import {assertDevEngineOperation,getDevCenterEngineState} from "@/app/lib/dev-center/engine-repository";
import {classifyScopePath} from "@/app/lib/dev-center/ai-worker/scope-policy";
import {boundReviewedWritePaths,normalizeReviewedWritePaths} from "./reviewed-write-scope";
import {checkpointHash,validSourceCheckpointPolicy} from "./source-checkpoint-policy";
import type {SourceCheckpointReceipt} from "./source-checkpoint-policy";
import {createScopedSourceCheckpoint} from "./source-checkpoint-git";
import {resolveDeveloperGridModuleSource} from "./module-source";
import {verifyCurrentSourceExecutionState} from "./source-provenance";
import {developerWorkerBranchName,developerWorkerWorktreePath,DEVELOPER_WORKER_REPOSITORY} from "./worker-workspace";
import {patchGridWorkerSession,appendGridEvent} from "./state-store";
import type {SourceExecutionProof,WorkerSession,DeveloperGridTask} from "./types";
function fail(code:string,message:string):never{throw Object.assign(new Error(message),{code,status:409});}
export async function assertCheckpointExecutionSettled(taskId:string){
 const root=process.env.BENJADMIN_DEVELOPER_GRID_EXECUTION_ROOT?.trim()||"/srv/dimpro-dev/coordination/developer-grid/execution";
 const file=path.join(root,`${taskId}.jsonl`);let body="";
 try{if((await stat(file)).size>8*1024*1024)fail("CHECKPOINT_AUDIT_TOO_LARGE","A végrehajtási napló külön ellenőrzést igényel.");body=await readFile(file,"utf8");}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
 const rows:Record<string,unknown>[]=[];
 for(const line of body.split(/\r?\n/).filter(Boolean)){let row;try{row=JSON.parse(line);}catch{fail("CHECKPOINT_AUDIT_INVALID","Sérült végrehajtási napló mellett Git-mentés nem indul.");}
  if(row.taskId!==taskId)fail("CHECKPOINT_AUDIT_IDENTITY_INVALID","A napló feladata eltér.");rows.push(row);
 }
 for(const request of rows.filter(r=>r.event==="REQUEST")){
  const sameRequest=(r:Record<string,unknown>)=>r.taskId===request.taskId&&r.sessionId===request.sessionId&&r.workerCode===request.workerCode&&r.requestId===request.requestId;
  // REQUEST/RESULT carry requestHash. Receipt events deliberately bind the
  // concrete resultId + resultSha256 instead; never require an absent field.
  const result=rows.find(r=>r.event==="RESULT"&&sameRequest(r)&&r.requestHash===request.requestHash);
  const validResult=result&&typeof result.resultSha256==="string"&&/^[a-f0-9]{64}$/.test(result.resultSha256)&&result.resultId==="res-"+result.resultSha256;
  const sameResult=(r:Record<string,unknown>)=>validResult&&sameRequest(r)&&r.resultId===result!.resultId&&r.resultSha256===result!.resultSha256&&r.sourceProofSha256===request.sourceProofSha256;
  if(!validResult||!rows.some(r=>r.event==="DELIVERED"&&sameResult(r))||!rows.some(r=>r.event==="ACKNOWLEDGED"&&sameResult(r)&&r.decision==="ACCEPTED")||!rows.some(r=>r.event==="COMPLETED"&&sameResult(r)&&r.workflowContinue===true))
   fail("CHECKPOINT_EXECUTION_PENDING","A Git-mentéshez minden művelet eredményének feldolgozását vissza kell igazolni.");
 }
}
// Called under the same task operation lock as execution and replacement.
export async function checkpointDeveloperGridSource(session:WorkerSession,task:DeveloperGridTask,reportSha256:string,reportedHead:string){
 const context=session.developmentContext,policy=context.sourceCheckpointPolicy,previous=context.sourceExecutionProof;
 if(!policy)return {session,receipt:null};
 if(session.endedAt!==null||!previous||context.bootAckState!=="VALIDATED"||context.bootAckCodingAllowed!==true||task.environment!=="DEV"||task.productionAccess!=="DENY"||["COMPLETED","CANCELLED","BLOCKED"].includes(task.status))fail("CHECKPOINT_AUTHORITY_DENIED","A task nem engedélyezett DEV fejlesztési munka.");
 const {sha256,...proofBody}=previous;
 if(checkpointHash(proofBody)!==sha256||previous.schemaVersion!==1||previous.state!=="VERIFIED"||previous.authority!=="CENTRAL_CORE"||previous.handshakeStage!=="READY"||previous.productionAccess!=="DENY"||previous.activeScopeLockCount<1||previous.activeWorktreeLeaseCount<1)fail("CHECKPOINT_PROOF_INVALID","Érvénytelen forrásigazolás.");
 const p=session.sourceProvenance;
 if(p.sourceState!=="VERIFIED"||p.blockCode||p.repository!==DEVELOPER_WORKER_REPOSITORY||p.worktree!==developerWorkerWorktreePath(session.workerCode,task.id)||p.branch!==developerWorkerBranchName(session.workerCode,task.id)||previous.repository!==p.repository||previous.worktree!==p.worktree||previous.branch!==p.branch||previous.head!==p.head||previous.engineSessionId!==context.engineSessionId)fail("CHECKPOINT_SOURCE_BINDING_INVALID","A task saját munkakönyvtárának forráskötése eltér.");
 const engine=await getDevCenterEngineState(),engineTask=engine.tasks.find(t=>t.id===task.id),metadata=engineTask?.metadata as Record<string,unknown>|undefined;
 const paths=normalizeReviewedWritePaths(metadata?.reviewedWritePaths,task.projectId,context.moduleName);
 if(!engineTask||["completed","cancelled","blocked"].includes(engineTask.status)||metadata?.sourceCheckpointMode!=="SCOPED_GIT"||!validSourceCheckpointPolicy(policy,{taskId:task.id,sessionId:session.id,workerCode:session.workerCode,sourcePrompt:String(metadata.sourcePrompt||""),paths})||String(metadata.sourcePrompt||"")!==context.sourcePrompt)fail("CHECKPOINT_APPROVAL_INVALID","A Git-mentés nincs a feladat indulásakor jóváhagyott fájlkörhöz kötve.");
 const approved=boundReviewedWritePaths(context.reviewedWriteApproval,{taskId:task.id,sessionId:session.id,workerCode:session.workerCode,head:p.head,proofSha256:sha256});
 if(JSON.stringify(approved)!==JSON.stringify(paths))fail("CHECKPOINT_WRITE_APPROVAL_INVALID","A fájlírás jóváhagyása nem egyezik a Git-mentési körrel.");
 const authorize=async()=>{
  const a=await assertDevEngineOperation(previous.engineSessionId,"write");
  if(a.environment.kind!=="DEV"||a.session.taskId!==task.id||a.session.projectId!==task.projectId||a.session.workerId!==`worker_${session.workerCode.toLowerCase()}`||a.session.worktreePath!==p.worktree||a.session.branchName!==p.branch||engineTask.claimedBySessionId!==a.session.id||engineTask.assignedWorkerId!==a.session.workerId)fail("CHECKPOINT_ENGINE_BINDING_INVALID","A végrehajtó task/session/worker kötése eltér.");return a;
 };
 await authorize();await assertCheckpointExecutionSettled(task.id);
 await resolveDeveloperGridModuleSource({projectId:task.projectId,moduleName:context.moduleName,fallbackHead:policy.initialHead,pinnedHead:context.moduleSourceBinding?.head||policy.initialHead});
 const saved=context.sourceCheckpointReceipt;
 if(saved){
  if(saved.reportSha256!==reportSha256||saved.head!==p.head||saved.previousHead!==reportedHead||saved.proofSha256!==sha256)fail("CHECKPOINT_REPORT_REPLAY_MISMATCH","A megőrzött Git-mentéshez másik jelentés tartozik.");
  await verifyCurrentSourceExecutionState(p,{requireClean:true});return {session,receipt:saved};
 }
 if(reportedHead!==p.head||p.head!==policy.initialHead)fail("CHECKPOINT_REPORT_HEAD_MISMATCH","A fejlesztési jelentés nem a jóváhagyott kiinduló forráshoz tartozik.");
 const result=await createScopedSourceCheckpoint({taskId:task.id,sessionId:session.id,workerCode:session.workerCode,repository:p.repository,worktree:p.worktree,branch:p.branch,head:p.head,reportSha256,approvalSha256:policy.sha256,paths},{beforeCommit:async()=>{await authorize();},validateContent:file=>{if(classifyScopePath(file).decision==="DENIED")fail("CHECKPOINT_PATH_DENIED","Tiltott forrásfájl nem menthető Gitbe.");}});
 if(!result.changed)return {session,receipt:null};
 const authorization=await authorize(),verifiedAt=new Date().toISOString();
 const freshBody={...proofBody,verifiedAt,head:result.head,activeScopeLockCount:authorization.activeLockCount,activeWorktreeLeaseCount:authorization.activeWorktreeLeaseCount};
 const fresh:SourceExecutionProof={...freshBody,sha256:checkpointHash(freshBody)};
 const receipt:SourceCheckpointReceipt={schemaVersion:1,id:result.id,previousHead:p.head,head:result.head,reportSha256,previousProofSha256:sha256,proofSha256:fresh.sha256,files:result.files,gitClean:true,completedAt:verifiedAt};
 const updated=await patchGridWorkerSession({taskId:task.id,sessionId:session.id,workerCode:session.workerCode,expectedSourceProofSha256:sha256,sourceProvenance:{...p,head:result.head,verifiedAt},developmentContext:{sourceExecutionProof:fresh,sourceCheckpointReceipt:receipt,reviewedWriteApproval:{...context.reviewedWriteApproval!,head:result.head,proofSha256:fresh.sha256}}});
 await appendGridEvent({kind:"commit",origin:"LIVE",workerCode:session.workerCode,taskId:task.id,projectId:task.projectId,productionAccess:"DENY",branch:p.branch,worktree:p.worktree,head:result.head,delta:{eventType:"SCOPED_SOURCE_CHECKPOINT_COMPLETED",sessionId:session.id,previousHead:p.head,currentHead:result.head,sourceProofSha256:fresh.sha256,checkpointId:result.id,status:"PASS",summary:"A kijelölt forrásfájlok központi Git-mentése és a forrásigazolás frissítése sikeres."}});
 return {session:updated,receipt};
}
