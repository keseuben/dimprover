"use strict";
const control=require("./control.cjs"),protocol=require("./execution-result-protocol.cjs");

// Execution, delivery, the worker's ACK and Central Core acceptance are durable,
// separate transitions. A restart must never turn delivery retry into a write.
function createExecutionJournal({read,patch,execute,deliver,observe,receipt,lookup,conversation,allowed,running,hash,now=Date.now}) {
  return async function process({view,task,workerCode,request,expectedProof,localMismatch,manualRetry=false}) {
    const requestHash=hash(JSON.stringify(request)),key=control.requestKey(request,requestHash),lock=task.id+":"+task.sessionId;
    let record=read(task.id);
    const history=record.executionHistory||[];
    if(history.some(item=>item.key===key&&(item.completedAt||(!item.protocolVersion&&item.deliveredAt))))return {processed:false,duplicate:true};
    if(history.some(item=>item.requestId===request.requestId&&item.key!==key))return {processed:false,blocked:true,reason:"EXECUTION_REQUEST_ID_REUSED"};
    if(running.has(lock))return {processed:false,pending:true};
    if(record.pendingExecutionResult&&record.pendingExecutionResult.key!==key)return {processed:false,pending:true,reason:"PREVIOUS_RESULT_PENDING"};
    if(record.executionWorkflowBlocked)return {processed:false,blocked:true,reason:"PREVIOUS_RESULT_BLOCKED"};
    running.add(lock);
    const save=changes=>{patch(task,workerCode,changes);record=read(task.id);};
    const permission=()=>allowed(workerCode,task,read(task.id),expectedProof,conversation(view),request.action);
    try {
      let pending=record.pendingExecutionResult;
      if(!pending) {
        if(!permission()){save({executionBridgeState:"WAITING_MANUAL_EXECUTION",executionBridgeError:"MANUAL_PERMISSION_REQUIRED"});return {processed:false,pending:true,reason:"MANUAL_PERMISSION_REQUIRED"};}
        if(Number(record.executionRetryAt||0)>now())return {processed:false,pending:true,reason:"TRANSPORT_BACKOFF"};
        if(localMismatch){save({executionBridgeState:"BLOCKED",executionBridgeError:"EXECUTION_IDENTITY_MISMATCH"});return {processed:false,blocked:true,reason:"EXECUTION_IDENTITY_MISMATCH"};}
        let payload;
        const uncertain=record.executionRequest?.key===key&&["WRITE_FILE","RUN_DEV_COMMAND"].includes(request.action);
        if(uncertain) {
          const recovered=lookup?await lookup({...request,conversationId:conversation(view)}).catch(()=>null):null;
          if(recovered?.resultEnvelope)payload=recovered;
          else {save({executionBridgeState:"EXECUTION_UNCERTAIN",executionBridgeError:"A korábbi művelet eredménye még nem igazolt. Új írás nem indult.",executionRetryAt:now()+30000});return {processed:false,pending:true,reason:"EXECUTION_OUTCOME_UNCERTAIN"};}
        }
        if(!payload) {
          save({executionBridgeState:"REQUEST_RUNNING",executionResultStatus:null,executionBridgeCode:null,executionRequest:{key,request,conversationId:conversation(view),sourceProofSha256:expectedProof}});
          try{payload=await execute(request);}
          catch(error){
            if(error?.status&&error.status<500&&![408,429].includes(error.status)){save({executionRequest:null,executionBridgeState:"BLOCKED",executionBridgeError:error.code||"EXECUTION_HTTP_"+error.status,executionBridgeCode:error.code||"EXECUTION_HTTP_"+error.status});return {processed:false,blocked:true,payload:{execution:{status:"BLOCKED",code:error.code,summary:error.message}},reason:error.code};}
            save({executionBridgeState:["WRITE_FILE","RUN_DEV_COMMAND"].includes(request.action)?"EXECUTION_UNCERTAIN":"TRANSPORT_RETRY",executionBridgeError:error?.code||"EXECUTION_TRANSPORT_UNCERTAIN",executionRetryAt:now()+30000});return {processed:false,pending:true,reason:"TRANSPORT_RETRY"};
          }
        }
        const envelope=payload.resultEnvelope||protocol.makeEnvelope(payload,{...request,workerCode});
        if(!protocol.verifyEnvelope(envelope)||["taskId","sessionId","requestId","action","sourceProofSha256"].some(k=>envelope[k]!==request[k])||envelope.workerCode!==protocol.worker(workerCode)){save({executionBridgeState:"BLOCKED",executionBridgeError:"EXECUTION_RESULT_IDENTITY_MISMATCH"});return {processed:false,blocked:true,reason:"EXECUTION_RESULT_IDENTITY_MISMATCH"};}
        payload={...payload,resultEnvelope:envelope};
        pending={key,payload,sourceProofSha256:request.sourceProofSha256,conversationId:conversation(view),workerCode:control.worker(workerCode),taskId:task.id,sessionId:task.sessionId,protocolVersion:2,phase:"EXECUTED",executedAt:new Date(now()).toISOString()};
        save({pendingExecutionResult:pending,executionRetryAt:null,executionBridgeState:"EXECUTED",executionResultStatus:envelope.status,executionBridgeCode:envelope.code,executionBridgeError:null});
      }
      if(pending.taskId!==task.id||pending.sessionId!==task.sessionId||pending.conversationId!==conversation(view)||protocol.worker(pending.workerCode)!==protocol.worker(workerCode))return {processed:false,pending:true,reason:"DELIVERY_IDENTITY_OR_PERMISSION_CHANGED"};
      // A legacy stored result is upgraded from its original, already-bound
      // request; it is not executed again and its old source proof is retained.
      if(!pending.payload.resultEnvelope){pending={...pending,protocolVersion:2,phase:"EXECUTED",payload:{...pending.payload,resultEnvelope:protocol.makeEnvelope(pending.payload,{...request,workerCode})}};save({pendingExecutionResult:pending});}
      const envelope=pending.payload.resultEnvelope;
      const receiptInput={taskId:task.id,sessionId:task.sessionId,workerCode:envelope.workerCode,requestId:envelope.requestId,sourceProofSha256:envelope.sourceProofSha256,resultId:envelope.resultId,resultSha256:envelope.resultSha256,conversationId:pending.conversationId};
      let observed=observe?await observe(view,pending):{delivered:false};
      if(!pending.deliveredAt&&!observed.delivered) {
        // An explicit resend of an already executed, bound result does not grant
        // permission to execute anything, and may settle an expired-proof queue.
        if(!permission()&&!manualRetry)return {processed:false,pending:true,reason:"MANUAL_PERMISSION_REQUIRED"};
        if(pending.sourceProofSha256!==expectedProof&&!manualRetry)return {processed:false,pending:true,reason:"DELIVERY_IDENTITY_OR_PERMISSION_CHANGED"};
        if(pending.deliveryAttemptedAt&&!manualRetry){save({executionBridgeState:"DELIVERY_UNCERTAIN",executionBridgeError:observed.mismatch?"RESULT_PAYLOAD_MISMATCH":"A kézbesítés nem igazolt. Automatikus újraküldés nem történt."});return {processed:false,pending:true,reason:"DELIVERY_UNCERTAIN"};}
        pending={...pending,deliveryAttemptedAt:new Date(now()).toISOString()};save({pendingExecutionResult:pending,executionBridgeState:"RESULT_SEND_PENDING"});
        const sent=await deliver(view,pending.payload,()=>(permission()||manualRetry)&&pending.conversationId===conversation(view)).catch(error=>({sent:false,reason:error.message}));
        observed=observe?await observe(view,pending):{delivered:sent?.verified===true};
        if(!observed.delivered){save({executionBridgeState:"DELIVERY_UNCERTAIN",executionBridgeError:sent?.reason||"RESULT_NOT_VERIFIED"});return {processed:false,retryable:true,payload:pending.payload,sent};}
      }
      if(!pending.deliveredAt) {
        const accepted=await receipt({...receiptInput,stage:"DELIVERED",transcriptMessageId:observed.deliveryMessageId||""});
        if(!accepted?.ok)throw Error("Central Core nem fogadta el a kézbesítést.");
        pending={...pending,phase:"DELIVERED",deliveredAt:new Date(now()).toISOString(),deliveryMessageId:observed.deliveryMessageId||""};
        save({pendingExecutionResult:pending,executionBridgeState:"DELIVERED",executionBridgeError:null});
      }
      const acknowledged=pending.acknowledgedAt?pending.ack:observed.ack;
      if(!acknowledged){save({executionBridgeState:"WAITING_ACK",executionBridgeError:observed.ackMismatch?"EXECUTION_RESULT_ACK_MISMATCH":null});return {processed:false,pending:true,reason:"WORKER_ACK_REQUIRED"};}
      if(!protocol.ackMatches(acknowledged,envelope)){save({executionBridgeState:"WAITING_ACK",executionBridgeError:"EXECUTION_RESULT_ACK_MISMATCH"});return {processed:false,pending:true,reason:"EXECUTION_RESULT_ACK_MISMATCH"};}
      if(!pending.acknowledgedAt){pending={...pending,phase:"ACKNOWLEDGED",acknowledgedAt:new Date(now()).toISOString(),ack:acknowledged,ackMessageId:observed.ackMessageId||""};save({pendingExecutionResult:pending,executionBridgeState:"ACKNOWLEDGED"});}
      const accepted=await receipt({...receiptInput,stage:"ACKNOWLEDGED",decision:pending.ack.decision,transcriptMessageId:pending.ackMessageId});
      if(!accepted?.ok||accepted.stage!=="COMPLETED")throw Error("Central Core ACK elfogadása még függőben van.");
      const completed={key,protocolVersion:2,requestId:request.requestId,action:request.action,resultId:envelope.resultId,resultSha256:envelope.resultSha256,executedAt:pending.executedAt,deliveredAt:pending.deliveredAt,acknowledgedAt:pending.acknowledgedAt,completedAt:new Date(now()).toISOString(),resultStatus:envelope.status,workflowContinue:accepted.workflowContinue===true};
      const history=[...(read(task.id).executionHistory||[]),completed].slice(-128);
      save({pendingExecutionResult:null,executionRequest:null,executionHistory:history,lastExecutionRequestId:request.requestId,lastExecutionAction:request.action,executionBridgeState:"COMPLETED",executionResultStatus:envelope.status,executionBridgeCode:envelope.code,executionBridgeError:null,executionBridgeAt:new Date(now()).toISOString(),executionWorkflowBlocked:accepted.workflowContinue!==true,...(request.action==="GIT_STATUS"&&envelope.status==="PASS"?{executionPreflightProofSha256:envelope.sourceProofSha256}:{})});
      return {processed:true,payload:pending.payload,completed,workflowContinue:accepted.workflowContinue===true};
    } catch(error){save({executionBridgeError:error?.code||error.message||"EXECUTION_RECEIPT_FAILED"});return {processed:false,pending:true,reason:error?.code||"EXECUTION_RECEIPT_FAILED"};}
    finally{running.delete(lock);}
  };
}
module.exports={createExecutionJournal};
