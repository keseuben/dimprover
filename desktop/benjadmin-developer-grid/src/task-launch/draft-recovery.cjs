"use strict";

const TASK_LAUNCH_KINDS = new Set(["TASK_LAUNCH_V3", "TASK_LAUNCH_V2", "TASK_LAUNCH_LEGACY"]);

function clean(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function classifyTaskLaunchDraft(value) {
  const text = clean(value);
  if (!text) return "EMPTY";
  if (text.includes("BENJADMIN_PROMPT_KIND: TASK_LAUNCH_V3")) return "TASK_LAUNCH_V3";
  if (text.includes("BENJADMIN_PROMPT_KIND: TASK_LAUNCH_V2")) return "TASK_LAUNCH_V2";
  if (text.includes("új BENJADMIN fejlesztési feladat érkezett") && text.includes("MUNKAFELVÉTEL:")) return "TASK_LAUNCH_LEGACY";
  return "OTHER";
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return "";
}

function parseTaskLaunchDraftIdentity(value) {
  const text = clean(value);
  const kind = classifyTaskLaunchDraft(text);
  const taskId = firstMatch(text, [
    /(?:^|\n)Task:\s*([^\n]+)/i,
    /(?:^|\n)TASK ID:\s*([^\n]+)/i,
  ]);
  const sessionId = firstMatch(text, [
    /(?:^|\n)Session:\s*([^\n]+)/i,
    /(?:^|\n)SESSION ID:\s*([^\n]+)/i,
  ]);
  const sourceProofSha256 = firstMatch(text, [
    /(?:^|\n)Proof SHA-256:\s*([0-9a-f]{64})\s*(?:\n|$)/i,
    /(?:^|\n)Source proof:\s*([0-9a-f]{64})\s*(?:\n|$)/i,
  ]).toLowerCase();
  return { kind, taskId, sessionId, sourceProofSha256, text };
}

function shouldReplaceStaleTaskLaunchDraft({ draft, taskId, sessionId, currentSourceProofSha256 }) {
  const identity = parseTaskLaunchDraftIdentity(draft);
  const expectedTaskId = clean(taskId);
  const expectedSessionId = clean(sessionId);
  const currentProof = clean(currentSourceProofSha256).toLowerCase();

  if (!TASK_LAUNCH_KINDS.has(identity.kind)) {
    return { replace:false, reason: identity.kind === "EMPTY" ? "empty" : "not-task-launch", identity };
  }
  if (!expectedTaskId || identity.taskId !== expectedTaskId) {
    return { replace:false, reason:"task-mismatch", identity };
  }
  if (!expectedSessionId || identity.sessionId !== expectedSessionId) {
    return { replace:false, reason:"session-mismatch", identity };
  }
  if (!/^[0-9a-f]{64}$/.test(currentProof) || !/^[0-9a-f]{64}$/.test(identity.sourceProofSha256)) {
    return { replace:false, reason:"proof-unverifiable", identity };
  }
  if (identity.sourceProofSha256 === currentProof) {
    return { replace:false, reason:"current-proof", identity };
  }
  return {
    replace:true,
    reason:"stale-source-proof",
    identity,
    previousSourceProofSha256:identity.sourceProofSha256,
    currentSourceProofSha256:currentProof,
  };
}

module.exports = {
  TASK_LAUNCH_KINDS,
  classifyTaskLaunchDraft,
  parseTaskLaunchDraftIdentity,
  shouldReplaceStaleTaskLaunchDraft,
};
