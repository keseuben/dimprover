"server-only";

import { appendGridEvidence } from "./evidence";
import { appendGridEvent, readGridState, upsertWorkerSession } from "./state-store";
import { verifySourceHeadAdvance } from "./source-provenance";
import type { GridEvidenceKind, GridEvidenceStatus, WorkerCode } from "./types";

const allowedKinds = new Set<GridEvidenceKind>(["FILE", "TEST", "ERROR"]);
const allowedStatuses = new Set<GridEvidenceStatus>(["RECORDED", "PASS", "FAIL", "BLOCKED"]);
const workers = new Set<WorkerCode>(["ARMINAI", "OUTMINAI", "BENJAMINAI", "JAZMINAI", "DEVMINAI"]);
const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);

function fail(code: string, message: string, status = 409): never {
  throw Object.assign(new Error(message), { code, status });
}

export async function ingestDeveloperGridWorkerEvidence(rawInput: Record<string, unknown>) {
  const state = await readGridState();
  const taskId = text(rawInput.taskId, 220);
  const sessionId = text(rawInput.sessionId, 240);
  const workerCode = text(rawInput.workerCode, 40).toUpperCase() as WorkerCode;
  const reportedHead = text(rawInput.head, 80).toLowerCase();
  const reportedStage = Number(rawInput.stage);
  if (!state.task || state.task.id !== taskId) fail("DEVELOPER_GRID_EVIDENCE_TASK_MISMATCH", "A worker evidence nem az authoritative aktuális taskhoz tartozik.");
  if (!workers.has(workerCode)) fail("DEVELOPER_GRID_EVIDENCE_WORKER_INVALID", "Ismeretlen Developer Grid evidence worker.", 400);
  const session = state.sessions.find((item) => item.id === sessionId && item.taskId === taskId && item.workerCode === workerCode && item.endedAt === null);
  if (!session) fail("DEVELOPER_GRID_EVIDENCE_SESSION_MISMATCH", "Az evidence-hez tartozó aktív worker session nem található.");
  if (session.developmentContext.bootAckState !== "VALIDATED") fail("DEVELOPER_GRID_EVIDENCE_BOOT_ACK_REQUIRED", "Worker evidence csak validált BOOT ACK után rögzíthető.");
  if (session.sourceProvenance.sourceState !== "VERIFIED" || session.sourceProvenance.blockCode) fail("SOURCE_BASELINE_MISMATCH", "Az evidence source provenance nem VERIFIED.");
  if (!reportedHead || !/^[0-9a-f]{40}$/.test(reportedHead)) fail("DEVELOPER_GRID_EVIDENCE_HEAD_REQUIRED", "A worker stage reporthoz teljes current HEAD szükséges.", 400);
  if (!Number.isInteger(reportedStage) || reportedStage < 1 || reportedStage > 6) fail("DEVELOPER_GRID_EVIDENCE_STAGE_INVALID", "A worker stage reporthoz 1–6 közötti stage szükséges.", 400);
  const previousStage = Number(session.developmentContext.workStageIndex || 1);
  if (reportedStage < previousStage) fail("DEVELOPER_GRID_STAGE_REGRESSION_BLOCKED", `A stage nem léphet vissza: ${previousStage}/6 → ${reportedStage}/6.`);

  const entries = Array.isArray(rawInput.entries) ? rawInput.entries.slice(0, 60) : [];
  if (!entries.length) fail("DEVELOPER_GRID_EVIDENCE_ENTRIES_REQUIRED", "Legalább egy evidence bejegyzés szükséges.", 400);
  const validatedEntries = entries.map((value) => {
    const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const kind = text(row.kind, 40).toUpperCase() as GridEvidenceKind;
    const status = text(row.status || "RECORDED", 40).toUpperCase() as GridEvidenceStatus;
    if (!allowedKinds.has(kind)) fail("DEVELOPER_GRID_EVIDENCE_KIND_NOT_INGESTIBLE", `Worker stage reportból nem fogadható evidence kind: ${kind || "NINCS"}.`, 400);
    if (!allowedStatuses.has(status)) fail("DEVELOPER_GRID_EVIDENCE_STATUS_INVALID", `Érvénytelen worker evidence status: ${status || "NINCS"}.`, 400);
    return { row, kind, status };
  });

  let authoritativeSession = { ...session, developmentContext: { ...session.developmentContext, workStageIndex: reportedStage, resolvedAt: new Date().toISOString() } };
  if (reportedHead !== session.sourceProvenance.head.toLowerCase()) {
    const advanced = await verifySourceHeadAdvance(session.sourceProvenance, reportedHead);
    authoritativeSession = { ...authoritativeSession, sourceProvenance: advanced };
    await upsertWorkerSession(authoritativeSession);
    await appendGridEvent({
      kind: "commit", origin: "LIVE", workerCode, taskId, projectId: state.task.projectId, productionAccess: "DENY",
      developmentContext: authoritativeSession.developmentContext, branch: advanced.branch, worktree: advanced.worktree, head: advanced.head,
      delta: { eventType: "SOURCE_HEAD_ADVANCED", summary: `Authoritative source HEAD előrehaladt: ${session.sourceProvenance.head.slice(0,12)} → ${advanced.head.slice(0,12)}.`, previousHead: session.sourceProvenance.head, currentHead: advanced.head, sessionId, sanitized: true },
    });
  } else if (reportedStage !== previousStage) {
    await upsertWorkerSession(authoritativeSession);
    await appendGridEvent({
      kind: "analysis", origin: "LIVE", workerCode, taskId, projectId: state.task.projectId, productionAccess: "DENY",
      developmentContext: authoritativeSession.developmentContext, branch: authoritativeSession.sourceProvenance.branch, worktree: authoritativeSession.sourceProvenance.worktree, head: authoritativeSession.sourceProvenance.head,
      delta: { eventType: "WORK_STAGE_ADVANCED", summary: `Fejlesztési szakasz előrehaladt: ${previousStage}/6 → ${reportedStage}/6.`, status: "PASS", severity: "INFO", sessionId, workStageIndex: reportedStage, sanitized: true },
    });
  }

  const evidence = [];
  for (const { row, kind, status } of validatedEntries) {
    evidence.push(await appendGridEvidence({
      kind,
      status,
      severity: row.severity,
      source: "WORKER_STAGE_REPORT",
      taskId,
      projectId: state.task.projectId,
      workerCode,
      sessionId,
      branch: authoritativeSession.sourceProvenance.branch,
      worktree: authoritativeSession.sourceProvenance.worktree,
      head: authoritativeSession.sourceProvenance.head,
      summary: row.summary,
      occurredAt: row.occurredAt,
      attributes: row.attributes,
    }));
  }
  return { taskId, sessionId, workerCode, sourceHead: authoritativeSession.sourceProvenance.head, baseHead: authoritativeSession.sourceProvenance.baseHead, stage: reportedStage, count: evidence.length, evidence, productionAccess: "DENY" as const };
}
