"use strict";

const WORKERS = Object.freeze(["ARMINAI", "OUTMINAI", "BENAI", "JAZMINAI"]);
function worker(code) {
  const value = String(code || "").toUpperCase();
  return value === "BENJAMINAI" ? "BENAI" : value;
}
function mode(config, code) {
  return config?.workflowControlModes?.[worker(code)] === "AUTO" ? "AUTO" : "MANUAL";
}
function isManual(config, code) { return mode(config, code) === "MANUAL"; }
function executionAllowed(config, code, task, record, proof, conversationId, action = "") {
  if (!isManual(config, code)) return true;
  const permission = record?.manualExecutionPermission;
  return Boolean(permission && permission.taskId === task?.id
    && permission.sessionId === task?.sessionId && permission.workerCode === worker(code)
    && permission.sourceProofSha256 === proof && permission.conversationId === conversationId
    && (permission.access === "DEV" || ["LIST_FILES", "READ_FILE", "SEARCH_FILES", "GIT_STATUS", "GIT_DIFF", "GIT_DIFF_CHECK"].includes(action)));
}
function executionPending(record) {
  // Older clients could leave this label after a later successful send. They
  // stored neither the request nor its result; it cannot be a v104 queue item.
  // Keep the legacy label for inspection, and never reconstruct/re-run a write.
  if (record?.executionBridgeState === "RESULT_SEND_PENDING" && !record.pendingExecutionResult && !record.executionRequest) return false;
  // Waiting for permission has not started an operation. It must not prevent
  // the operator from recovering the connection or sending fresh instructions.
  return Boolean(record?.pendingExecutionResult || record?.executionRequest || ["REQUEST_RUNNING", "RESULT_SEND_PENDING", "TRANSPORT_RETRY", "EXECUTION_UNCERTAIN"].includes(record?.executionBridgeState));
}
function requestKey(request, hash) {
  return `${request.taskId}:${request.sessionId}:${request.requestId}:${hash}`;
}
function wasDelivered(record, key) {
  return (record?.executionHistory || []).some(item => item.key === key && item.deliveredAt);
}
function continuationPrompt(task, code, proof, protocolLines) {
  const source = String(task?.description || task?.sourcePrompt || "").trim();
  if (!source) throw new Error("MANUAL_ORIGINAL_INSTRUCTION_REQUIRED");
  return [
    "BENJADMIN_PROMPT_KIND: MANUAL_CONTINUE_V1",
    "KÉZI FOLYTATÁS · UGYANAZ A FELADAT · DEV ONLY · PROD DENY",
    `Worker: ${worker(code) === "BENAI" ? "BENJAMINAI" : worker(code)}`,
    `Task: ${task.id}`, `Session: ${task.sessionId}`,
    `Branch: ${task.branchName}`, `Worktree: ${task.worktreePath}`,
    `HEAD: ${task.sourceHead}`, `Source proof: ${proof}`,
    "EREDETI FELHASZNÁLÓI UTASÍTÁS ÉS KORLÁTAI:", source,
    "A kézi folytatás nem bővíti ezt a scope-ot és nem oldja fel a fennálló tiltásokat.",
    "A csevegésben kapott KÉSŐBBI felhasználói korlátozások is változatlanul érvényesek; ez az összefoglaló nem írja felül őket.",
    "Ha későbbi utasítás szerint új végrehajtási kérést ne indíts, akkor csak az állapot átvételét igazold vissza, majd várj. Ezt a tiltást csak új, kifejezett felhasználói utasítás oldhatja fel.",
    "Ne hozz létre új taskot vagy sessiont. A fázisok jóváhagyását a kezelő végzi.",
    "Ha az eredeti utasítás tiltja a végrehajtást, csak az átvett állapotot igazold vissza, majd várj.",
    "Ha az eredeti utasítás megengedi az olvasást, először egyetlen GIT_STATUS kérést adj ki, majd várd meg a hozzá tartozó végrehajtási választ.",
    ...protocolLines.map(line=>String(line).replaceAll("req-001",`req-manual-${Date.now().toString(36)}`)),
    "Minden további művelet új requestId-t kapjon; korábbi req-001 azonosítót ne használj újra.",
  ].join("\n");
}
module.exports = { WORKERS, worker, mode, isManual, executionAllowed, executionPending, requestKey, wasDelivered, continuationPrompt };
