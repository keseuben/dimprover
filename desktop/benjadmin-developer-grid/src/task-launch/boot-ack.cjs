"use strict";

function clean(value, max = 2000) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function field(body, label, max = 1200) {
  const source = String(body || "");
  const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*:\\s*([^\\n]+)`, "i"));
  return clean(match?.[1] || "", max);
}

function normalizeWorker(value) {
  const code = clean(value, 40).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code === "BENJAMINAI") return "BENAI";
  return code;
}

function normalizePath(value) {
  return clean(value, 1200).replace(/\\/g, "/").replace(/\/+$/g, "");
}

function parseBootAcknowledgement(body) {
  const text = clean(body, 190000);
  if (!/BOOT\s+ACKNOWLEDGEMENT/i.test(text)) {
    return { ok: false, code: "BOOT_ACK_NOT_FOUND", error: "A worker válaszában nincs BOOT ACKNOWLEDGEMENT blokk." };
  }
  const codingRaw = field(text, "Coding allowed", 40).toUpperCase();
  const parsed = {
    worker: normalizeWorker(field(text, "Worker", 80)),
    taskId: field(text, "Task", 240),
    sessionId: field(text, "Session", 260),
    projectModule: field(text, "Project/Module", 500),
    branch: field(text, "Branch", 600),
    worktree: normalizePath(field(text, "Worktree", 1200)),
    baseHead: field(text, "Base HEAD", 80).toLowerCase(),
    readWriteScope: field(text, "Read/Write scope", 1600),
    denyScope: field(text, "Deny scope", 1600),
    activeDirective: field(text, "Active directive", 1000),
    priorState: field(text, "Prior state", 1600),
    firstCheck: field(text, "First check", 1600),
    riskBlocker: field(text, "Risk/blocker", 1600),
    codingAllowed: codingRaw === "YES" ? true : codingRaw === "NO" ? false : null,
  };
  const required = ["worker", "taskId", "sessionId", "branch", "worktree", "baseHead", "readWriteScope", "activeDirective", "firstCheck"];
  const missing = required.filter((key) => !parsed[key]);
  if (parsed.codingAllowed === null) missing.push("codingAllowed");
  if (missing.length) return { ok: false, code: "BOOT_ACK_INCOMPLETE", error: `Hiányos BOOT ACK: ${missing.join(", ")}.`, parsed };
  return { ok: true, parsed };
}

function validateBootAcknowledgement(body, expected = {}) {
  const result = parseBootAcknowledgement(body);
  if (!result.ok) return { ...result, validated: false, mismatches: [] };
  const ack = result.parsed;
  const mismatches = [];
  const wantWorker = normalizeWorker(expected.workerCode);
  if (wantWorker && ack.worker !== wantWorker) mismatches.push(`worker:${ack.worker || "—"}!=${wantWorker}`);
  const wantTask = clean(expected.taskId, 240);
  if (wantTask && ack.taskId !== wantTask) mismatches.push("taskId");
  const wantSession = clean(expected.sessionId, 260);
  if (wantSession && ack.sessionId !== wantSession) mismatches.push("sessionId");
  const wantBranch = clean(expected.branch, 600);
  if (wantBranch && ack.branch !== wantBranch) mismatches.push("branch");
  const wantWorktree = normalizePath(expected.worktree);
  if (wantWorktree && ack.worktree !== wantWorktree) mismatches.push("worktree");
  const wantHead = clean(expected.baseHead, 80).toLowerCase();
  if (wantHead && ack.baseHead !== wantHead) mismatches.push("baseHead");
  if (!/PROD\s*DENY/i.test(`${ack.activeDirective} ${ack.denyScope}`)) mismatches.push("PROD_DENY");
  if (ack.codingAllowed !== true) mismatches.push("codingAllowed");
  return {
    ok: true,
    validated: mismatches.length === 0,
    blocked: mismatches.length > 0,
    mismatches,
    parsed: ack,
  };
}

module.exports = { parseBootAcknowledgement, validateBootAcknowledgement, normalizeWorker };
