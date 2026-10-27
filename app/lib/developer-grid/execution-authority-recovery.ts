type RecoverySession = {id:string;taskId:string|null;workerId:string|null;projectId:string|null;status:string};
type RecoveryTask = {id:string;projectId:string|null;status:string;requestedWorkerId:string|null;assignedWorkerId:string|null;claimedBySessionId:string|null;metadata:unknown};

// A previous recovery can have opened its engine session before failing to
// publish the Grid proof. Resume only that exact, server-recorded lineage.
export function interruptedAuthorityRecoverySession(input:{task:RecoveryTask;previous:RecoverySession;sessions:readonly RecoverySession[]}) {
  const {task,previous,sessions}=input;
  const metadata=task.metadata&&typeof task.metadata==="object"&&!Array.isArray(task.metadata)?task.metadata as Record<string,unknown>:{};
  const candidateId=String(metadata.activeSessionId||"");
  if(!candidateId||candidateId===previous.id)return null;
  const deny=()=>{throw Object.assign(new Error("A megszakadt helyreállítás session-kötése nem igazolt."),{code:"DEVELOPER_GRID_RECOVERY_PROGRESS_MISMATCH",status:409});};
  if(previous.status!=="closed"||previous.taskId!==task.id||!previous.workerId||!previous.projectId
      ||task.projectId!==previous.projectId||task.requestedWorkerId!==previous.workerId
      ||["completed","cancelled","testing"].includes(task.status)
      ||metadata.manualBridgeRecoveredFromSessionId!==previous.id)return deny();
  const candidate=sessions.find(s=>s.id===candidateId);
  if(!candidate||candidate.taskId!==task.id||candidate.workerId!==previous.workerId
      ||candidate.projectId!==previous.projectId||!["open","active","closed"].includes(candidate.status))return deny();
  if(sessions.some(s=>s.taskId===task.id&&s.status!=="closed"&&s.id!==candidateId))return deny();
  if(candidate.status!=="closed"){
    if(task.claimedBySessionId!==candidateId||task.assignedWorkerId!==candidate.workerId)return deny();
  }else if(task.claimedBySessionId&&task.claimedBySessionId!==candidateId)return deny();
  return candidateId;
}
