"server-only";

import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, open, readFile, unlink } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { isSensitivePath, scanSensitiveText } from "@/app/lib/dev-center/ai-worker/secret-scanner";
import type { GridActivityEvent, GridEvidence, GridEvidenceKind, GridEvidenceSeverity, GridEvidenceStatus, WorkerCode } from "./types";

const DEFAULT_DEVELOPER_GRID_STATE_ROOT = "/srv/dimpro-dev/coordination/developer-grid";
const MAX_EVIDENCE_READ = 5000;
const LOCK_WAIT_MS = 40;
const LOCK_ATTEMPTS = 125;

const allowedKinds = new Set<GridEvidenceKind>(["FILE", "TEST", "ERROR", "HANDOFF", "BUILD", "BOOT_ACK", "REVIEW"]);
const allowedStatuses = new Set<GridEvidenceStatus>(["RECORDED", "PASS", "FAIL", "BLOCKED", "COMPLETED", "PARTIAL", "PENDING", "PASS_WITH_NOTES"]);
const allowedSeverities = new Set<GridEvidenceSeverity>(["INFO", "WARNING", "HIGH", "CRITICAL"]);
const allowedWorkers = new Set<WorkerCode>(["ARMINAI", "OUTMINAI", "BENJAMINAI", "JAZMINAI", "DEVMINAI"]);

function files(root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  const base = path.resolve(root);
  return { root: base, evidence: path.join(base, "evidence.jsonl"), lock: path.join(base, "evidence.lock") };
}

async function ensureRoot(root: string) {
  await mkdir(root, { recursive: true, mode: 0o700 });
}

function plain(value: unknown, max = 500) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function safeText(value: unknown, max = 500) {
  const raw = plain(value, max);
  if (!raw) return "";
  return scanSensitiveText(raw).length ? "[REDACTED_SENSITIVE_CONTENT]" : raw;
}

function safePath(value: unknown) {
  const raw = plain(value, 900).replaceAll("\\", "/");
  if (!raw) return null;
  return isSensitivePath(raw) ? "[SENSITIVE_PATH]" : raw;
}

function safeSha(value: unknown, length: 40 | 64) {
  const raw = plain(value, length).toLowerCase();
  return new RegExp(`^[0-9a-f]{${length}}$`).test(raw) ? raw : null;
}

function safeNumber(value: unknown, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? parsed : null;
}

function normalizedStatus(value: unknown, fallback: GridEvidenceStatus = "RECORDED"): GridEvidenceStatus {
  const raw = plain(value, 40).toUpperCase() as GridEvidenceStatus;
  return allowedStatuses.has(raw) ? raw : fallback;
}

function normalizedSeverity(value: unknown, kind: GridEvidenceKind, status: GridEvidenceStatus): GridEvidenceSeverity {
  const explicit = plain(value, 40).toUpperCase() as GridEvidenceSeverity;
  if (allowedSeverities.has(explicit)) return explicit;
  if (status === "FAIL" || status === "BLOCKED") return kind === "ERROR" || kind === "REVIEW" || kind === "BOOT_ACK" ? "HIGH" : "WARNING";
  if (status === "PARTIAL" || status === "PASS_WITH_NOTES") return "WARNING";
  return "INFO";
}

function normalizeAttributes(input: Record<string, unknown>) {
  const changeTypeRaw = plain(input.changeType, 30).toUpperCase();
  const reviewResultRaw = plain(input.reviewResult, 40).toUpperCase();
  const handoffStatusRaw = plain(input.handoffStatus, 40).toUpperCase();
  return {
    path: safePath(input.path),
    changeType: ["CREATED", "MODIFIED", "DELETED", "RENAMED", "UNKNOWN"].includes(changeTypeRaw) ? changeTypeRaw : null,
    testName: safeText(input.testName, 300) || null,
    durationMs: safeNumber(input.durationMs, 86_400_000),
    errorCode: safeText(input.errorCode, 180) || null,
    exitCode: safeNumber(input.exitCode, 255),
    buildRunId: safeText(input.buildRunId, 180) || null,
    buildId: safeText(input.buildId, 180) || null,
    handoffId: safeText(input.handoffId, 180) || null,
    reviewId: safeText(input.reviewId, 180) || null,
    contentSha256: safeSha(input.contentSha256, 64),
    artifactSha256: safeSha(input.artifactSha256, 64),
    outputSha256: safeSha(input.outputSha256, 64),
    resolvesFingerprint: safeSha(input.resolvesFingerprint, 64),
    reviewResult: ["PASS", "PASS_WITH_NOTES", "FAIL", "PENDING"].includes(reviewResultRaw) ? reviewResultRaw : null,
    handoffStatus: ["COMPLETED", "PARTIAL", "BLOCKED", "FAILED"].includes(handoffStatusRaw) ? handoffStatusRaw : null,
  };
}

function fingerprintPayload(input: Omit<GridEvidence, "id" | "fingerprintSha256" | "createdAt">) {
  return JSON.stringify({
    taskId: input.taskId,
    workerCode: input.workerCode,
    sessionId: input.sessionId,
    kind: input.kind,
    status: input.status,
    severity: input.severity,
    source: input.source,
    eventId: input.eventId,
    branch: input.branch,
    head: input.head,
    summary: input.summary,
    attributes: input.attributes,
    occurredAt: input.occurredAt,
  });
}

async function acquireLock(root: string) {
  const target = files(root);
  await ensureRoot(target.root);
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      const handle = await open(target.lock, "wx", 0o600);
      return async () => {
        await handle.close().catch(() => undefined);
        await unlink(target.lock).catch(() => undefined);
      };
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
      if (code !== "EEXIST") throw error;
      await sleep(LOCK_WAIT_MS);
    }
  }
  throw Object.assign(new Error("Developer Grid evidence lock timeout."), { code: "DEVELOPER_GRID_EVIDENCE_LOCK_TIMEOUT" });
}

export function normalizeGridEvidenceInput(input: Record<string, unknown>): Omit<GridEvidence, "id" | "fingerprintSha256" | "createdAt"> {
  const kind = plain(input.kind, 40).toUpperCase() as GridEvidenceKind;
  const workerCode = plain(input.workerCode, 40).toUpperCase() as WorkerCode;
  const taskId = safeText(input.taskId, 220);
  const projectId = safeText(input.projectId || "project_dimprover", 180) || "project_dimprover";
  if (!allowedKinds.has(kind)) throw Object.assign(new Error("Ismeretlen Developer Grid evidence kind."), { code: "DEVELOPER_GRID_EVIDENCE_KIND_INVALID" });
  if (!allowedWorkers.has(workerCode)) throw Object.assign(new Error("Ismeretlen Developer Grid evidence worker."), { code: "DEVELOPER_GRID_EVIDENCE_WORKER_INVALID" });
  if (!taskId) throw Object.assign(new Error("Developer Grid evidence taskId kötelező."), { code: "DEVELOPER_GRID_EVIDENCE_TASK_REQUIRED" });
  const status = normalizedStatus(input.status);
  const severity = normalizedSeverity(input.severity, kind, status);
  const occurredAtRaw = plain(input.occurredAt, 100);
  const occurredAt = Number.isFinite(Date.parse(occurredAtRaw)) ? new Date(occurredAtRaw).toISOString() : new Date().toISOString();
  const sourceRaw = plain(input.source, 40).toUpperCase();
  const source = (["GRID_EVENT", "BUILD_RUNNER", "HANDOFF_STORE", "WORKER_STAGE_REPORT", "REVIEW_GATE", "SYSTEM"] as const).includes(sourceRaw as never)
    ? sourceRaw as GridEvidence["source"]
    : "GRID_EVENT";
  const summary = safeText(input.summary, 600) || `${kind} ${status}`;
  const rawAttributes = input.attributes && typeof input.attributes === "object" && !Array.isArray(input.attributes) ? input.attributes as Record<string, unknown> : {};
  return {
    schemaVersion: 1,
    environment: "DEV",
    productionAccess: "DENY",
    sanitized: true,
    taskId,
    projectId,
    workerCode,
    sessionId: safeText(input.sessionId, 240) || null,
    eventId: safeText(input.eventId, 240) || null,
    kind,
    status,
    severity,
    source,
    summary,
    branch: safeText(input.branch, 500) || null,
    worktree: safePath(input.worktree),
    head: safeSha(input.head, 40),
    attributes: normalizeAttributes(rawAttributes),
    occurredAt,
  };
}

export async function appendGridEvidence(input: Record<string, unknown>, root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  const normalized = normalizeGridEvidenceInput(input);
  const fingerprintSha256 = createHash("sha256").update(fingerprintPayload(normalized)).digest("hex");
  const record: GridEvidence = {
    ...normalized,
    id: `grid-evidence-${randomUUID()}`,
    fingerprintSha256,
    createdAt: new Date().toISOString(),
  };
  const target = files(root);
  const release = await acquireLock(root);
  try {
    await appendFile(target.evidence, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  } finally {
    await release();
  }
  return record;
}

function eventStatus(event: GridActivityEvent, fallback: GridEvidenceStatus = "RECORDED") {
  const delta = event.delta || {};
  const raw = plain(delta.status || delta.result || delta.state, 40).toUpperCase();
  if (raw === "SUCCESS" || raw === "OK" || raw === "VALIDATED") return "PASS" as const;
  if (raw === "FAILED") return "FAIL" as const;
  return normalizedStatus(raw, fallback);
}

export function evidenceInputFromGridEvent(event: GridActivityEvent): Record<string, unknown> | null {
  const delta = event.delta || {};
  const eventType = plain(delta.eventType, 100).toUpperCase();
  let kind: GridEvidenceKind | null = null;
  if (event.kind === "file-change") kind = "FILE";
  else if (event.kind === "test") kind = "TEST";
  else if (event.kind === "error") kind = "ERROR";
  else if (event.kind === "handoff") kind = "HANDOFF";
  else if (event.kind === "build") kind = "BUILD";
  else if (event.kind === "review") kind = "REVIEW";
  else if (event.kind === "analysis" && eventType.startsWith("BOOT_ACK_")) kind = "BOOT_ACK";
  if (!kind) return null;

  let status = eventStatus(event);
  if (kind === "BOOT_ACK") status = eventType === "BOOT_ACK_VALIDATED" ? "PASS" : "BLOCKED";
  const summary = safeText(delta.summary, 600) || `${kind} ${status}`;
  return {
    kind,
    status,
    severity: delta.severity,
    source: "GRID_EVENT",
    taskId: event.taskId,
    projectId: event.projectId,
    workerCode: event.workerCode,
    sessionId: safeText(delta.sessionId, 240) || null,
    eventId: event.id,
    branch: event.branch,
    worktree: event.worktree,
    head: event.head,
    summary,
    occurredAt: event.timestamp,
    attributes: {
      path: delta.path || delta.filePath || delta.changedPath,
      changeType: delta.changeType,
      testName: delta.testName || delta.name,
      durationMs: delta.durationMs,
      errorCode: delta.errorCode || delta.code || delta.failureCode,
      exitCode: delta.exitCode,
      buildRunId: delta.runId,
      buildId: delta.buildId,
      handoffId: delta.handoffId,
      reviewId: delta.reviewId,
      contentSha256: delta.contentSha256 || delta.sha256,
      artifactSha256: delta.artifactSha256,
      outputSha256: delta.outputSha256 || delta.resultSha256,
      resolvesFingerprint: delta.resolvesFingerprint,
      reviewResult: delta.reviewResult || delta.result,
      handoffStatus: delta.handoffStatus || delta.status,
    },
  };
}

export async function appendEvidenceFromGridEvent(event: GridActivityEvent, root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  const input = evidenceInputFromGridEvent(event);
  return input ? appendGridEvidence(input, root) : null;
}

export async function listGridEvidence(input: { taskId?: string; kind?: GridEvidenceKind; limit?: number; root?: string } = {}) {
  const target = files(input.root || DEFAULT_DEVELOPER_GRID_STATE_ROOT);
  await ensureRoot(target.root);
  let raw = "";
  try { raw = await readFile(target.evidence, "utf8"); } catch {}
  let rows = raw.split("\n").filter(Boolean).slice(-MAX_EVIDENCE_READ).flatMap((line) => {
    try {
      const parsed = JSON.parse(line) as GridEvidence;
      return parsed?.schemaVersion === 1 && parsed?.environment === "DEV" && parsed?.productionAccess === "DENY" && parsed?.sanitized === true ? [parsed] : [];
    } catch { return []; }
  });
  const taskId = plain(input.taskId, 220);
  if (taskId) rows = rows.filter((item) => item.taskId === taskId);
  if (input.kind) rows = rows.filter((item) => item.kind === input.kind);
  const limit = Math.max(1, Math.min(500, Math.trunc(Number(input.limit) || 100)));
  return rows.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).slice(0, limit);
}

export async function getGridEvidenceSummary(taskId: string, root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  const evidence = await listGridEvidence({ taskId, limit: 500, root });
  const counts = Object.fromEntries([...allowedKinds].map((kind) => [kind, evidence.filter((item) => item.kind === kind).length])) as Record<GridEvidenceKind, number>;
  const blockers = evidence.filter((item) => ["HIGH", "CRITICAL"].includes(item.severity) && ["FAIL", "BLOCKED"].includes(item.status));
  const resolved = new Set(evidence.map((item) => item.attributes.resolvesFingerprint).filter(Boolean));
  const unresolvedBlockers = blockers.filter((item) => !resolved.has(item.fingerprintSha256));
  return {
    taskId,
    count: evidence.length,
    counts,
    unresolvedBlockers: unresolvedBlockers.map((item) => ({ id: item.id, kind: item.kind, severity: item.severity, status: item.status, summary: item.summary, fingerprintSha256: item.fingerprintSha256, occurredAt: item.occurredAt })),
    latestAt: evidence[0]?.occurredAt || null,
  };
}
