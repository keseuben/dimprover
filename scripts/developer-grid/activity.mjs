import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const stateRoot = process.env.DIMPRO_DEVELOPER_GRID_STATE_ROOT || "/srv/dimpro-dev/coordination/developer-grid";
const args = Object.fromEntries(process.argv.slice(2).map((entry) => { const at = entry.indexOf("="); return at < 0 ? [entry, ""] : [entry.slice(0, at), entry.slice(at + 1)]; }));
const allowed = new Set(["analysis","coding","file-change","diff","test","build","commit","release","handoff","error","review"]);
const kind = allowed.has(args.kind) ? args.kind : "analysis";
const allowedWorkers = new Set(["ARMINAI","OUTMINAI","BENJAMINAI","JAZMINAI","DEVMINAI"]);
const workerCode = allowedWorkers.has(String(args.workerCode || "").toUpperCase()) ? String(args.workerCode).toUpperCase() : "OUTMINAI";
const origin = args.origin === "BACKFILL" ? "BACKFILL" : "LIVE";
function appendLocked(file, lockFile, payload) {
  let fd = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { fd = fs.openSync(lockFile, "wx", 0o600); break; }
    catch (error) { if (error?.code !== "EEXIST") throw error; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25); }
  }
  if (fd === null) throw new Error("Developer Grid evidence lock timeout.");
  try { fs.appendFileSync(file, payload, { mode:0o600 }); }
  finally { try { fs.closeSync(fd); } catch {} try { fs.unlinkSync(lockFile); } catch {} }
}
fs.mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
const statePath = path.join(stateRoot, "state.json");
let state = { schemaVersion: 1, task: null, sessions: [], lastSequence: 0, updatedAt: "" };
try { state = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch {}
const sequence = Math.max(0, Number(state.lastSequence) || 0) + 1;
const timestamp = new Date().toISOString();
const event = {
  id: `grid-event-${crypto.randomUUID()}`,
  sequence,
  kind,
  origin,
  workerCode,
  taskId: args.taskId || "dev-task-benjadmin-developer-grid-v1-night-20260827",
  projectId: args.projectId || "project_dimprover",
  branch: args.branch || "feature/benjadmin-developer-grid-v1-20260827",
  worktree: args.worktree || "/srv/dimpro-dev/worktrees/benjadmin-developer-grid-v1-20260827",
  head: args.head || null,
  timestamp,
  productionAccess: "DENY",
  delta: {
    summary: String(args.summary || "").slice(0, 1000), mainModule: "BENJADMIN", moduleName: "Developer Grid V1", submoduleName: args.submodule || null, workItem: args.workItem || null, workStageIndex: Number(args.stage) || null,
    status: String(args.status || "").toUpperCase() || null, severity: String(args.severity || "").toUpperCase() || null, sessionId: args.sessionId || null,
    path: args.path || null, changeType: String(args.changeType || "").toUpperCase() || null, testName: args.testName || null, durationMs: Number(args.durationMs) || null,
    errorCode: args.errorCode || null, exitCode: Number.isFinite(Number(args.exitCode)) ? Number(args.exitCode) : null, runId: args.runId || null, buildId: args.buildId || null,
    handoffId: args.handoffId || null, reviewId: args.reviewId || null, contentSha256: args.contentSha256 || null, artifactSha256: args.artifactSha256 || null, outputSha256: args.outputSha256 || null,
    resolvesFingerprint: args.resolvesFingerprint || null, reviewResult: String(args.reviewResult || "").toUpperCase() || null, handoffStatus: String(args.handoffStatus || "").toUpperCase() || null, sanitized: true
  },
};
fs.appendFileSync(path.join(stateRoot, "events.jsonl"), `${JSON.stringify(event)}\n`, { mode: 0o600 });
fs.writeFileSync(statePath, `${JSON.stringify({ ...state, lastSequence: sequence, updatedAt: timestamp }, null, 2)}\n`, { mode: 0o600 });

const evidenceKind = kind === "file-change" ? "FILE" : kind === "test" ? "TEST" : kind === "error" ? "ERROR" : kind === "handoff" ? "HANDOFF" : kind === "build" ? "BUILD" : kind === "review" ? "REVIEW" : null;
if (evidenceKind) {
  const rawStatus = String(args.status || (evidenceKind === "ERROR" ? "FAIL" : "RECORDED")).toUpperCase();
  const status = ["RECORDED","PASS","FAIL","BLOCKED","COMPLETED","PARTIAL","PENDING","PASS_WITH_NOTES"].includes(rawStatus) ? rawStatus : "RECORDED";
  const rawSummary = String(args.summary || `${evidenceKind} ${status}`).slice(0, 600);
  const containsSecret = /(?:api[_-]?key|secret|password|token)\s*[:=]|-----BEGIN .*PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{20,}\b|\bgh[pousr]_[A-Za-z0-9]{20,}\b/i.test(rawSummary);
  const safeSummary = containsSecret ? "[REDACTED_SENSITIVE_CONTENT]" : rawSummary;
  const normalizedPath = String(args.path || "").replaceAll("\\", "/").slice(0, 900);
  const safePath = /(^|\/)\.env(?:\.|$)|secret|credential|private[-_]?key|\.pem$|\.p12$|\.pfx$/i.test(normalizedPath) ? "[SENSITIVE_PATH]" : (normalizedPath || null);
  const attributes = {
    path: safePath, changeType: args.changeType || null, testName: String(args.testName || "").slice(0,300) || null, durationMs: Number(args.durationMs) || null,
    errorCode: String(args.errorCode || "").slice(0,180) || null, exitCode: Number.isFinite(Number(args.exitCode)) ? Number(args.exitCode) : null,
    buildRunId: String(args.runId || "").slice(0,180) || null, buildId: String(args.buildId || "").slice(0,180) || null, handoffId: String(args.handoffId || "").slice(0,180) || null,
    reviewId: String(args.reviewId || "").slice(0,180) || null, contentSha256: /^[0-9a-f]{64}$/i.test(args.contentSha256 || "") ? String(args.contentSha256).toLowerCase() : null,
    artifactSha256: /^[0-9a-f]{64}$/i.test(args.artifactSha256 || "") ? String(args.artifactSha256).toLowerCase() : null, outputSha256: /^[0-9a-f]{64}$/i.test(args.outputSha256 || "") ? String(args.outputSha256).toLowerCase() : null,
    resolvesFingerprint: /^[0-9a-f]{64}$/i.test(args.resolvesFingerprint || "") ? String(args.resolvesFingerprint).toLowerCase() : null,
    reviewResult: args.reviewResult || null, handoffStatus: args.handoffStatus || null,
  };
  const occurredAt = timestamp;
  const fingerprintSha256 = crypto.createHash("sha256").update(JSON.stringify({ taskId:event.taskId, workerCode, kind:evidenceKind, status, summary:safeSummary, head:event.head, attributes, occurredAt })).digest("hex");
  const severityCandidate = String(args.severity || ((status === "FAIL" || status === "BLOCKED") ? "HIGH" : "INFO")).toUpperCase();
  const severity = ["INFO","WARNING","HIGH","CRITICAL"].includes(severityCandidate) ? severityCandidate : ((status === "FAIL" || status === "BLOCKED") ? "HIGH" : "INFO");
  const evidence = { schemaVersion:1, id:`grid-evidence-${crypto.randomUUID()}`, environment:"DEV", productionAccess:"DENY", sanitized:true, taskId:event.taskId, projectId:event.projectId, workerCode,
    sessionId:args.sessionId || null, eventId:event.id, kind:evidenceKind, status, severity,
    source:"GRID_EVENT", summary:safeSummary, branch:event.branch || null, worktree:event.worktree || null, head:/^[0-9a-f]{40}$/i.test(event.head || "") ? String(event.head).toLowerCase() : null, attributes, fingerprintSha256, occurredAt, createdAt:new Date().toISOString() };
  appendLocked(path.join(stateRoot, "evidence.jsonl"), path.join(stateRoot, "evidence.lock"), `${JSON.stringify(evidence)}\n`);
}

console.log(JSON.stringify({ ok: true, sequence, kind, origin, timestamp }));
