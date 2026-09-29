"use strict";

const INTERNAL_REVIEW_REPORT_START = "BENJADMIN_INTERNAL_REVIEW_V1";
const INTERNAL_REVIEW_REPORT_END = "BENJADMIN_INTERNAL_REVIEW_END";
const RESULTS = new Set(["PASS", "PASS_WITH_NOTES", "FAIL"]);
const WORKERS = new Set(["ARMINAI", "OUTMINAI", "BENJAMINAI", "JAZMINAI", "DEVMINAI", "BENAI"]);

function text(value, max = 1200) { return String(value ?? "").trim().slice(0, max); }
function record(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

function parseDeveloperGridInternalReviewReport(raw) {
  const body = String(raw || "");
  const start = body.lastIndexOf(INTERNAL_REVIEW_REPORT_START);
  if (start < 0) return { ok:false, code:"INTERNAL_REVIEW_MARKER_MISSING", error:"A BENJADMIN_INTERNAL_REVIEW_V1 marker hiányzik." };
  const jsonStart = start + INTERNAL_REVIEW_REPORT_START.length;
  const end = body.indexOf(INTERNAL_REVIEW_REPORT_END, jsonStart);
  if (end < 0) return { ok:false, code:"INTERNAL_REVIEW_END_MISSING", error:"A BENJADMIN_INTERNAL_REVIEW_END marker hiányzik." };
  let parsed;
  try { parsed = JSON.parse(body.slice(jsonStart, end).trim()); }
  catch { return { ok:false, code:"INTERNAL_REVIEW_JSON_INVALID", error:"A belső review JSON nem érvényes." }; }
  const row = record(parsed);
  const workerRaw = text(row.workerCode, 40).toUpperCase();
  const workerCode = workerRaw === "BENAI" ? "BENJAMINAI" : workerRaw;
  const result = text(row.result, 40).toUpperCase();
  const taskId = text(row.taskId, 220);
  const sessionId = text(row.sessionId, 240);
  const head = text(row.head, 80).toLowerCase();
  const reviewMode = text(row.reviewMode, 80).toUpperCase();
  if (Number(row.schemaVersion) !== 1) return { ok:false, code:"INTERNAL_REVIEW_SCHEMA_INVALID", error:"Ismeretlen belső review schemaVersion." };
  if (!WORKERS.has(workerRaw)) return { ok:false, code:"INTERNAL_REVIEW_WORKER_INVALID", error:"Ismeretlen reviewer worker." };
  if (reviewMode !== "INTERNAL_REVIEW_FALLBACK") return { ok:false, code:"INTERNAL_REVIEW_MODE_INVALID", error:"A reviewMode kizárólag INTERNAL_REVIEW_FALLBACK lehet." };
  if (!taskId || !sessionId || !/^[0-9a-f]{40}$/.test(head)) return { ok:false, code:"INTERNAL_REVIEW_IDENTITY_INVALID", error:"A belső review task/session/current HEAD azonosítója hiányos." };
  if (!RESULTS.has(result)) return { ok:false, code:"INTERNAL_REVIEW_RESULT_INVALID", error:"Érvénytelen belső review result." };
  const findings = Array.isArray(row.findings) ? row.findings.slice(0, 100).map((value) => {
    const item = record(value);
    return {
      severity: text(item.severity, 40).toUpperCase(),
      category: text(item.category, 80).toUpperCase(),
      message: text(item.message, 800),
      path: text(item.path, 800) || null,
    };
  }) : [];
  const tests = Array.isArray(row.tests) ? row.tests.slice(0, 100).map((value) => text(value, 500)).filter(Boolean) : [];
  const high = findings.some((item) => item.severity === "HIGH" || item.severity === "BLOCKER" || item.severity === "CRITICAL");
  if ((result === "PASS" || result === "PASS_WITH_NOTES") && high) return { ok:false, code:"INTERNAL_REVIEW_PASS_WITH_BLOCKER", error:"PASS/PASS_WITH_NOTES eredmény nem tartalmazhat HIGH/BLOCKER/CRITICAL findingot." };
  if (result === "FAIL" && !high) return { ok:false, code:"INTERNAL_REVIEW_FAIL_WITHOUT_BLOCKER", error:"FAIL eredményhez legalább egy HIGH/BLOCKER/CRITICAL finding szükséges." };
  return {
    ok:true,
    report:{
      schemaVersion:1,
      reviewMode:"INTERNAL_REVIEW_FALLBACK",
      workerCode,
      taskId,
      sessionId,
      head,
      result,
      summary:text(row.summary, 1200),
      findings,
      tests,
    },
  };
}

module.exports = {
  INTERNAL_REVIEW_REPORT_START,
  INTERNAL_REVIEW_REPORT_END,
  parseDeveloperGridInternalReviewReport,
};
