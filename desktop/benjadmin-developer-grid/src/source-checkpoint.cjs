"use strict";
const {createHash}=require('node:crypto');
function checkpointRecordPatch({task,record={},response,workerCode,conversationId}){
 const r=response?.sourceCheckpoint,s=response?.session,p=s?.developmentContext?.sourceExecutionProof;
 const owner=v=>String(v||'').toUpperCase().replace(/^BENAI$/,'BENJAMINAI');
 const deny=()=>{throw Error('SOURCE_CHECKPOINT_RESPONSE_MISMATCH');};
 if(!r||!s||!p)deny();const {sha256,...body}=p;
 if(createHash('sha256').update(JSON.stringify(body)).digest('hex')!==sha256||p.state!=='VERIFIED'||p.authority!=='CENTRAL_CORE'||p.handshakeStage!=='READY'||p.productionAccess!=='DENY'||p.activeScopeLockCount<1||p.activeWorktreeLeaseCount<1)deny();
 if(s.id!==task.sessionId||s.taskId!==task.id||owner(s.workerCode)!==owner(workerCode)||s.endedAt!==null||s.sourceProvenance?.sourceState!=='VERIFIED'||s.sourceProvenance?.blockCode||p.head!==r.head||s.sourceProvenance.head!==r.head||p.worktree!==task.worktreePath||p.branch!==task.branchName||p.repository!==task.sourceExecutionProof?.repository||r.proofSha256!==sha256||r.gitClean!==true||!Array.isArray(r.files)||!r.files.length||r.files.some(f=>!/^[a-f0-9]{64}$/.test(f.sha256))||!/^[a-f0-9]{64}$/.test(r.id)||!/^[a-f0-9]{40}$/.test(r.head)||!/^[a-f0-9]{64}$/.test(r.previousProofSha256))deny();
 const oldProof=task.sourceProofSha256||task.sourceExecutionProof?.sha256;
 if(!((task.sourceHead===r.previousHead&&oldProof===r.previousProofSha256)||(task.sourceHead===r.head&&oldProof===sha256)))deny();
 if(record.executionRequest||record.pendingExecutionResult)deny();
 const grant=record.manualExecutionPermission;
 const bound=grant&&grant.taskId===task.id&&grant.sessionId===task.sessionId&&owner(grant.workerCode)===owner(workerCode)&&grant.conversationId===conversationId&&grant.access==='DEV'&&[r.previousProofSha256,sha256].includes(grant.sourceProofSha256);
 return {sourceHead:r.head,sourceExecutionProof:p,sourceProofSha256:sha256,sourceCheckpointReceipt:r,reviewedWriteApproval:s.developmentContext.reviewedWriteApproval,manualContinuationPreview:null,executionPreflightProofSha256:sha256,manualExecutionPermission:bound?{...grant,sourceProofSha256:sha256}:null};
}
module.exports={checkpointRecordPatch};
