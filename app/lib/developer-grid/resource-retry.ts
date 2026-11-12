// Resource preflight failures are immutable failures, never rewritten as PASS.
// A later, separately acknowledged test can resolve only an explicitly linked failure.
export type ExecutionAuditRow = Record<string, unknown>;
const identity = ["taskId", "sessionId", "workerCode", "requestId", "sourceProofSha256"];
export function sameExecution(a:ExecutionAuditRow,b:ExecutionAuditRow) {
  return identity.every(k=>typeof a[k]==="string"&&a[k]===b[k]);
}
export function resultSettled(rows:ExecutionAuditRow[],result:ExecutionAuditRow,continueRequired=true) {
  const same=(r:ExecutionAuditRow)=>sameExecution(r,result)&&r.resultId===result.resultId&&r.resultSha256===result.resultSha256;
  return typeof result.resultSha256==="string"&&/^[a-f0-9]{64}$/.test(result.resultSha256)&&result.resultId==="res-"+result.resultSha256
    &&rows.some(r=>r.event==="REQUEST"&&sameExecution(r,result)&&r.requestHash===result.requestHash)
    &&rows.some(r=>r.event==="DELIVERED"&&same(r))
    &&rows.some(r=>r.event==="ACKNOWLEDGED"&&same(r)&&r.decision==="ACCEPTED")
    &&rows.some(r=>r.event==="COMPLETED"&&same(r)&&r.decision==="ACCEPTED"&&(!continueRequired||r.workflowContinue===true));
}
export function isMemoryPreflight(result:ExecutionAuditRow) {
  const value=result.result as ExecutionAuditRow|undefined,data=value?.data as ExecutionAuditRow|undefined;
  return result.event==="RESULT"&&result.protocolVersion===2&&result.action==="RUN_DEV_COMMAND"
    &&value?.status==="BLOCKED"&&value.code==="EXECUTION_TEST_MEMORY_UNAVAILABLE"&&data?.command==="TSC"
    &&data.requiredAvailableBytes===6*1024**3&&typeof data.availableBytes==="number"&&data.availableBytes<data.requiredAvailableBytes;
}
export function resourceRetryResolved(rows:ExecutionAuditRow[],blocked:ExecutionAuditRow) {
  if(!isMemoryPreflight(blocked)||!resultSettled(rows,blocked,false))return false;
  return rows.some(auth=>auth.event==="RESOURCE_RETRY_AUTHORIZED"&&auth.taskId===blocked.taskId&&auth.sessionId===blocked.sessionId&&auth.workerCode===blocked.workerCode
    &&Array.isArray(auth.blockedResultIds)&&auth.blockedResultIds.includes(blocked.resultId)
    &&rows.some(request=>request.event==="REQUEST"&&request.resourceRetryAuthorizationId===auth.authorizationId
      &&request.taskId===auth.taskId&&request.sessionId===auth.sessionId&&request.workerCode===auth.workerCode&&request.sourceProofSha256===auth.sourceProofSha256
      &&request.action==="RUN_DEV_COMMAND"&&request.command==="TSC"
      &&rows.some(result=>result.event==="RESULT"&&sameExecution(result,request)&&result.requestHash===request.requestHash
        &&(result.result as ExecutionAuditRow)?.status==="PASS"&&resultSettled(rows,result))));
}
