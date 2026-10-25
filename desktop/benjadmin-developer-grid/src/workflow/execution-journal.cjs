"use strict";
const control = require("./control.cjs");

// Store the server result before touching the composer. Delivery retries never
// re-run a completed file operation, including after a desktop restart.
function createExecutionJournal({ read, patch, execute, deliver, conversation, allowed, running, hash, now = Date.now }) {
  return async function process({ view, task, workerCode, request, expectedProof, localMismatch }) {
    const requestHash = hash(JSON.stringify(request));
    const key = control.requestKey(request, requestHash);
    const lock = `${task.id}:${task.sessionId}`;
    let record = read(task.id);
    if (control.wasDelivered(record, key) || (!record.executionHistory?.length && record.lastExecutionRequestId === request.requestId && !record.pendingExecutionResult)) return {processed:false, duplicate:true};
    if (running.has(lock)) return {processed:false, pending:true};
    if (!allowed(workerCode, task, record, expectedProof, conversation(view), request.action)) {
      if (record.executionBridgeState !== "WAITING_MANUAL_EXECUTION") patch(task, workerCode, {executionBridgeState:"WAITING_MANUAL_EXECUTION", executionBridgeError:"MANUAL_PERMISSION_REQUIRED"});
      return {processed:false, pending:true, reason:"MANUAL_PERMISSION_REQUIRED"};
    }
    const conflict = (record.executionHistory || []).find(item => item.requestId === request.requestId && item.key !== key);
    if (conflict) return {processed:false, blocked:true, reason:"EXECUTION_REQUEST_ID_REUSED"};
    if (record.pendingExecutionResult && record.pendingExecutionResult.key !== key) return {processed:false, pending:true, reason:"PREVIOUS_RESULT_PENDING"};
    if (!record.pendingExecutionResult && record.executionRequest?.key === key && ["WRITE_FILE", "RUN_DEV_COMMAND"].includes(request.action)) {
      patch(task, workerCode, {executionBridgeState:"EXECUTION_UNCERTAIN",executionBridgeError:"A korábbi művelet eredménye nem ismert. Szerveres ellenőrzés szükséges; automatikus újrafuttatás tiltva."});
      return {processed:false, pending:true, reason:"EXECUTION_OUTCOME_UNCERTAIN"};
    }
    if (Number(record.executionRetryAt || 0) > now()) return {processed:false, pending:true, reason:"TRANSPORT_BACKOFF"};
    running.add(lock);
    try {
      let pending = record.pendingExecutionResult;
      if (!pending) {
        const identity = {requestId:request.requestId, taskId:task.id, sessionId:task.sessionId, action:request.action, replayed:false};
        // A crash while this is RUNNING must retry the same request ID; the API
        // provides idempotency for that ID, never a newly generated write request.
        patch(task, workerCode, {executionBridgeState:"REQUEST_RUNNING", executionRequest:{key, request, conversationId:conversation(view), sourceProofSha256:expectedProof}});
        let payload;
        if (localMismatch) payload = {...identity, execution:{status:"BLOCKED", code:"EXECUTION_IDENTITY_MISMATCH", summary:"A task/session/worker/source proof eltér az aktív Grid állapottól.", data:{}}};
        else {
          try { payload = await execute(request); }
          catch (error) {
            if (!error?.status) {
              patch(task, workerCode, {executionBridgeState:["WRITE_FILE", "RUN_DEV_COMMAND"].includes(request.action)?"EXECUTION_UNCERTAIN":"TRANSPORT_RETRY", executionBridgeError:error?.code || "EXECUTION_TRANSPORT_UNCERTAIN", executionRetryAt:now()+30000});
              return {processed:false, pending:true, reason:"TRANSPORT_RETRY"};
            }
            payload = {...identity, execution:{status:"BLOCKED", code:error.code || `EXECUTION_HTTP_${error.status}`, summary:error.message || "Execution API hiba", data:{httpStatus:error.status}}};
          }
        }
        pending = {key, payload, sourceProofSha256:expectedProof, conversationId:conversation(view), workerCode:control.worker(workerCode), taskId:task.id, sessionId:task.sessionId};
        patch(task, workerCode, {pendingExecutionResult:pending, executionRetryAt:null, executionBridgeState:"RESULT_SEND_PENDING", executionBridgeError:null});
      }
      record = read(task.id);
      if (pending.taskId !== task.id || pending.sessionId !== task.sessionId || pending.conversationId !== conversation(view) || pending.sourceProofSha256 !== expectedProof || !allowed(workerCode, task, record, expectedProof, conversation(view), request.action)) return {processed:false, pending:true, reason:"DELIVERY_IDENTITY_OR_PERMISSION_CHANGED"};
      const canDeliver = () => pending.conversationId === conversation(view) && allowed(workerCode,task,read(task.id),expectedProof,conversation(view),request.action);
      const sent = await deliver(view, pending.payload, canDeliver).catch(error => ({sent:false, reason:error.message}));
      if (!sent?.sent || !sent?.verified) {
        patch(task, workerCode, {executionBridgeState:"RESULT_SEND_PENDING", executionBridgeError:sent?.reason || "RESULT_NOT_VERIFIED"});
        return {processed:false, retryable:true, payload:pending.payload, sent};
      }
      const history = [...(read(task.id).executionHistory || []), {key, requestId:request.requestId, action:request.action, deliveredAt:new Date(now()).toISOString()}].slice(-128);
      if (request.action === "GIT_STATUS" && pending.payload?.execution?.status === "PASS") patch(task,workerCode,{executionPreflightProofSha256:expectedProof});
      patch(task, workerCode, {pendingExecutionResult:null, executionRequest:null, executionHistory:history, lastExecutionRequestId:request.requestId, lastExecutionAction:request.action, executionBridgeState:pending.payload?.execution?.status || "DELIVERED", executionBridgeCode:pending.payload?.execution?.code || "", executionBridgeError:null, executionBridgeAt:new Date(now()).toISOString()});
      return {processed:true, payload:pending.payload, sent};
    } finally { running.delete(lock); }
  };
}
module.exports = {createExecutionJournal};
