"use strict";

const STAGE_REPORT_START = "BENJADMIN_STAGE_REPORT_V1";
const STAGE_REPORT_END = "BENJADMIN_STAGE_REPORT_END";
const KINDS = new Set(["FILE", "TEST", "ERROR"]);
const STATUSES = new Set(["RECORDED", "PASS", "FAIL", "BLOCKED"]);
const RESULTS = new Set(["PASS", "FAIL", "BLOCKED"]);
const WORKERS = new Set(["ARMINAI", "OUTMINAI", "BENJAMINAI", "JAZMINAI", "DEVMINAI", "BENAI"]);

function text(value, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function record(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

function parseDeveloperGridStageReport(raw) {
  const body = String(raw || "");
  const start = body.lastIndexOf(STAGE_REPORT_START);
  if (start < 0) return { ok:false, code:"STAGE_REPORT_MARKER_MISSING", error:"A BENJADMIN_STAGE_REPORT_V1 marker hiányzik." };
  const jsonStart = start + STAGE_REPORT_START.length;
  const end = body.indexOf(STAGE_REPORT_END, jsonStart);
  if (end < 0) return { ok:false, code:"STAGE_REPORT_END_MISSING", error:"A BENJADMIN_STAGE_REPORT_END marker hiányzik." };
  const jsonText = body.slice(jsonStart, end).trim();
  let parsed;
  try { parsed = JSON.parse(jsonText); } catch { return { ok:false, code:"STAGE_REPORT_JSON_INVALID", error:"A stage report JSON nem érvényes." }; }
  const row = record(parsed);
  const workerCodeRaw = text(row.workerCode,40).toUpperCase();
  const workerCode = workerCodeRaw === "BENAI" ? "BENJAMINAI" : workerCodeRaw;
  const taskId = text(row.taskId,220);
  const sessionId = text(row.sessionId,240);
  const head = text(row.head,80).toLowerCase();
  const result = text(row.result,40).toUpperCase();
  const stage = Number(row.stage);
  if (Number(row.schemaVersion) !== 1) return { ok:false, code:"STAGE_REPORT_SCHEMA_INVALID", error:"Ismeretlen stage report schemaVersion." };
  if (!WORKERS.has(workerCodeRaw)) return { ok:false, code:"STAGE_REPORT_WORKER_INVALID", error:"Ismeretlen stage report worker." };
  if (!taskId || !sessionId || !/^[0-9a-f]{40}$/.test(head)) return { ok:false, code:"STAGE_REPORT_IDENTITY_INVALID", error:"A stage report task/session/current HEAD azonosítója hiányos." };
  if (!RESULTS.has(result)) return { ok:false, code:"STAGE_REPORT_RESULT_INVALID", error:"Érvénytelen stage report result." };
  if (!Number.isInteger(stage) || stage < 1 || stage > 6) return { ok:false, code:"STAGE_REPORT_STAGE_INVALID", error:"A stage report stage 1–6 közötti egész szám legyen." };
  const source = Array.isArray(row.evidence) ? row.evidence.slice(0,60) : [];
  if (!source.length) return { ok:false, code:"STAGE_REPORT_EVIDENCE_REQUIRED", error:"A stage report legalább egy evidence bejegyzést igényel." };
  const evidence = [];
  for (const value of source) {
    const item = record(value);
    const kind = text(item.kind,40).toUpperCase();
    const status = text(item.status || "RECORDED",40).toUpperCase();
    if (!KINDS.has(kind) || !STATUSES.has(status)) return { ok:false, code:"STAGE_REPORT_EVIDENCE_INVALID", error:`Érvénytelen evidence kind/status: ${kind}/${status}.` };
    evidence.push({
      kind,
      status,
      severity: text(item.severity,40).toUpperCase() || undefined,
      summary: text(item.summary,600),
      occurredAt: text(item.occurredAt,100) || undefined,
      attributes: record(item.attributes),
    });
  }
  return { ok:true, report:{ schemaVersion:1, workerCode, taskId, sessionId, head, stage, result, summary:text(row.summary,600), evidence } };
}


function normalizeWorkerForAck(value) {
  const code = text(value, 40).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code === "BENAI" ? "BENJAMINAI" : code;
}
function normalizePathForAck(value) { return text(value,1200).replace(/\\/g,"/").replace(/\/+$/g,""); }
function validateStageReportAsBootAck(raw, expected = {}) {
  const parsed = parseDeveloperGridStageReport(raw);
  if (!parsed?.ok || !parsed.report) return { ok:false, validated:false, code:parsed?.code || "STAGE_REPORT_INVALID", mismatches:[parsed?.code || "STAGE_REPORT_INVALID"] };
  const report = parsed.report;
  const mismatches = [];
  const wantWorker = normalizeWorkerForAck(expected.workerCode);
  const wantTask = text(expected.taskId,220);
  const wantSession = text(expected.sessionId,240);
  const wantHead = text(expected.baseHead || expected.head,80).toLowerCase();
  const wantProof = text(expected.sourceProofSha256,80).toLowerCase();
  const wantBranch = text(expected.branch,600);
  const wantWorktree = normalizePathForAck(expected.worktree);
  if (report.stage !== 1) mismatches.push("stage");
  if (report.result !== "PASS") mismatches.push("result");
  if (wantWorker && normalizeWorkerForAck(report.workerCode) !== wantWorker) mismatches.push("worker");
  if (wantTask && report.taskId !== wantTask) mismatches.push("taskId");
  if (wantSession && report.sessionId !== wantSession) mismatches.push("sessionId");
  if (!wantHead || report.head !== wantHead) mismatches.push("head");
  if (!/^[0-9a-f]{64}$/.test(wantProof)) mismatches.push("sourceProofExpected");
  if (!wantBranch) mismatches.push("branchExpected");
  if (!wantWorktree) mismatches.push("worktreeExpected");
  if (report.evidence.some((item) => item.kind === "ERROR" || item.status === "FAIL" || item.status === "BLOCKED")) mismatches.push("negativeEvidence");
  const proofEvidence = report.evidence.find((item) => {
    const a = record(item.attributes);
    return item.kind === "TEST" && item.status === "PASS"
      && String(item.summary || "").toUpperCase().includes("CENTRAL_CORE_SOURCE_PREFLIGHT_VERIFIED")
      && text(a.authority,40).toUpperCase() === "CENTRAL_CORE"
      && text(a.proofSha256,80).toLowerCase() === wantProof
      && text(a.handshake,40).toUpperCase() === "READY"
      && Number(a.scopeLocks || 0) >= 1
      && Number(a.worktreeLeases || 0) >= 1
      && text(a.productionAccess,40).toUpperCase() === "DENY"
      && a.codingAllowed === true;
  });
  if (!proofEvidence) mismatches.push("centralCoreProofEvidence");
  const sourceContextEvidence = report.evidence.find((item) => {
    const a = record(item.attributes);
    return item.kind === "TEST" && item.status === "PASS"
      && a.sourceConflict === false
      && text(a.branch,600) === wantBranch
      && normalizePathForAck(a.worktree) === wantWorktree;
  });
  if (!sourceContextEvidence) mismatches.push("sourceContextEvidence");
  const validated = mismatches.length === 0;
  return {
    ok:true,
    validated,
    blocked:!validated,
    mismatches,
    report,
    fallback:true,
    parsed: validated ? {
      worker: wantWorker,
      taskId: wantTask,
      sessionId: wantSession,
      branch: wantBranch,
      worktree: wantWorktree,
      baseHead: wantHead,
      sourceProofSha256: wantProof,
      codingAllowed: true,
    } : {},
  };
}

module.exports = { STAGE_REPORT_START, STAGE_REPORT_END, parseDeveloperGridStageReport, validateStageReportAsBootAck };
