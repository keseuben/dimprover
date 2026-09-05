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

module.exports = { STAGE_REPORT_START, STAGE_REPORT_END, parseDeveloperGridStageReport };
