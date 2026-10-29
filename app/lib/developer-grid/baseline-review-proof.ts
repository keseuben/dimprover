// A review of an unchanged baseline is a validation of recorded checks, not a code-change audit.
export function baselineReviewProof(rows: unknown[], identity: {taskId:string;sessionId:string;workerCode:string;proof:string;head:string;baseHead:string;requiredPaths:string[]}) {
  function fail(code:string):never { throw Object.assign(new Error(code),{code}); }
  if(identity.head!==identity.baseHead || !/^[a-f0-9]{40}$/.test(identity.head) || !/^[a-f0-9]{64}$/.test(identity.proof)) fail("BASELINE_REVIEW_IDENTITY_INVALID");
  const events=rows.filter((r):r is Record<string,any>=>Boolean(r && typeof r==='object' && !Array.isArray(r))).filter(r=>r.taskId===identity.taskId && r.sessionId===identity.sessionId && r.workerCode===identity.workerCode && r.sourceProofSha256===identity.proof && r.environment==='DEV' && r.productionAccess==='DENY');
  if(events.some(r=>r.event==='REQUEST' && ['WRITE_FILE','APPLY_PATCH','DELETE_FILE'].includes(r.action))) fail("BASELINE_REVIEW_MUTATION_OBSERVED");
  function completed(action:string,command?:string,path?:string) {
    const request=events.filter(r=>r.event==='REQUEST' && r.action===action && (!command || r.command===command) && (!path || r.path===path)).at(-1);
    if(!request) fail("BASELINE_REVIEW_CHECK_MISSING");
    const result=events.find(r=>r.event==='RESULT' && r.requestId===request.requestId && r.requestHash===request.requestHash);
    if(!result || result.action!==request.action || result.result?.status!=='PASS' || !/^[a-f0-9]{64}$/.test(result.resultSha256) || result.resultId!==`res-${result.resultSha256}`) fail("BASELINE_REVIEW_CHECK_NOT_PASS");
    const same=(r:Record<string,any>)=>r.requestId===request.requestId && r.resultId===result.resultId && r.resultSha256===result.resultSha256;
    const delivered=events.findIndex((r,i)=>i>events.indexOf(result) && r.event==='DELIVERED' && same(r));
    const ack=events.findIndex((r,i)=>i>delivered && r.event==='ACKNOWLEDGED' && same(r) && r.decision==='ACCEPTED');
    const done=events.findIndex((r,i)=>i>ack && r.event==='COMPLETED' && same(r) && r.decision==='ACCEPTED' && r.resultStatus==='PASS' && r.workflowContinue===true);
    if(delivered<0 || ack<0 || done<0) fail("BASELINE_REVIEW_ACK_REQUIRED");
    return {request,result};
  }
  const tsc=completed('RUN_DEV_COMMAND','TSC');
  if(tsc.result.result.data?.command!=='TSC' || tsc.result.result.data?.exitCode!==0) fail("BASELINE_REVIEW_TSC_NOT_PASS");
  const status=completed('GIT_STATUS'),diff=completed('GIT_DIFF_CHECK');
  if(status.result.result.data?.exitCode!==0 || status.result.result.data?.output!=='' || status.result.result.data?.outOfScope?.length!==0 || diff.result.result.data?.exitCode!==0) fail("BASELINE_REVIEW_GIT_NOT_CLEAN");
  if(!identity.requiredPaths.length) fail("BASELINE_REVIEW_READ_SCOPE_MISSING");
  const reads=identity.requiredPaths.map(path=>completed('READ_FILE',undefined,path));
  if(reads.some(r=>r.result.result.data?.path!==r.request.path || r.result.result.data?.completeFile!==true || !/^[a-f0-9]{64}$/.test(String(r.result.result.data?.fileSha256 || '')))) fail("BASELINE_REVIEW_FILE_HASH_REQUIRED");
  const testTime=Date.parse(tsc.result.at);
  if(!Number.isFinite(testTime) || [status,diff].some(r=>Date.parse(r.request.at)<testTime || !Number.isFinite(Date.parse(r.request.at)))) fail("BASELINE_REVIEW_POST_TEST_GIT_REQUIRED");
  return {reviewScope:'BASELINE_VALIDATION' as const,requestIds:[...reads,tsc,status,diff].map(r=>r.request.requestId),resultIds:[...reads,tsc,status,diff].map(r=>r.result.resultId)};
}
