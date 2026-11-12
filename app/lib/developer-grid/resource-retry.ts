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
    &&value?.status==="BLOCKED"&&value.code==="EXECUTION_TEST_MEMORY_UNAVAILABLE"&&["TSC","LINT"].includes(String(data?.command))
    &&data!==undefined&&data.requiredAvailableBytes===6*1024**3&&typeof data.availableBytes==="number"&&data.availableBytes<data.requiredAvailableBytes;
}
export function recoverableTestCommand(rows:ExecutionAuditRow[],result:ExecutionAuditRow):"TSC"|"LINT"|null {
  const value=result.result as ExecutionAuditRow|undefined,data=value?.data as ExecutionAuditRow|undefined;
  const request=rows.find(r=>r.event==="REQUEST"&&sameExecution(r,result)&&r.requestHash===result.requestHash);
  if(!request||!["TSC","LINT"].includes(String(request.command))||request.command!==data?.command)return null;
  if(isMemoryPreflight(result))return request.command as "TSC"|"LINT";
  if(result.event!=="RESULT"||result.protocolVersion!==2||result.action!=="RUN_DEV_COMMAND"||value?.status!=="FAIL"||data?.signal!=="SIGTERM")return null;
  const elapsed=Date.parse(String(result.at))-Date.parse(String(request.at));
  // v0.1.134 recorded the bounded SIGTERM as COMMAND_FAIL. Recover only its
  // measured 240-second LINT termination, never an ordinary lint diagnostic.
  const legacy=value.code==="EXECUTION_COMMAND_FAIL"&&request.command==="LINT"&&data.exitCode===1&&elapsed>=240000&&elapsed<=245000;
  const explicit=value.code==="EXECUTION_COMMAND_TIMEOUT"&&data.timedOut===true&&[240000,600000].includes(Number(data.timeoutMs))&&elapsed>=Number(data.timeoutMs)-250;
  return legacy||explicit?request.command as "TSC"|"LINT":null;
}
export function resourceRetryResolved(rows:ExecutionAuditRow[],blocked:ExecutionAuditRow) {
  const command=recoverableTestCommand(rows,blocked);
  if(!command||!resultSettled(rows,blocked,false))return false;
  return rows.some(auth=>auth.event==="RESOURCE_RETRY_AUTHORIZED"&&auth.taskId===blocked.taskId&&auth.sessionId===blocked.sessionId&&auth.workerCode===blocked.workerCode
    &&auth.command===command&&Array.isArray(auth.blockedResultIds)&&auth.blockedResultIds.includes(blocked.resultId)
    &&rows.some(request=>request.event==="REQUEST"&&request.resourceRetryAuthorizationId===auth.authorizationId
      &&request.taskId===auth.taskId&&request.sessionId===auth.sessionId&&request.workerCode===auth.workerCode&&request.sourceProofSha256===auth.sourceProofSha256
      &&request.action==="RUN_DEV_COMMAND"&&request.command===command
      &&rows.some(result=>result.event==="RESULT"&&sameExecution(result,request)&&result.requestHash===request.requestHash
        &&(result.result as ExecutionAuditRow)?.status==="PASS"&&resultSettled(rows,result))));
}
