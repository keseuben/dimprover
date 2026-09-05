"server-only";

import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { DEFAULT_DEVELOPER_GRID_STATE_ROOT } from "./state-store";
import type { GridBuildRun } from "./types";

export type BuildRunStore = {
  schemaVersion: 1;
  revision: number;
  runs: GridBuildRun[];
  updatedAt: string;
};

export type BuildJobEvidence = {
  schemaVersion: 1;
  environment: "DEV";
  productionAccess: "DENY";
  runId: string;
  status: "RUNNING" | "PASS" | "FAIL" | "BLOCKED";
  nodeId: "build01" | "build02";
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  code: string | null;
  buildId: string | null;
  artifactSha256: string | null;
  artifactDir: string | null;
  evidenceRef: string;
  outputSha256: string | null;
};

const MAX_RUNS = 250;

function paths(root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  const base = path.resolve(root);
  const jobs = path.join(base, "build-runs");
  return { root: base, jobs, state: path.join(base, "build-runs.json"), lock: path.join(base, "build-runs.lock") };
}

async function ensureRoot(root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  const target = paths(root);
  await mkdir(target.root, { recursive: true, mode: 0o700 });
  await mkdir(target.jobs, { recursive: true, mode: 0o700 });
  return target;
}

async function atomic(file: string, payload: unknown) {
  const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, file);
}

async function mutate<T>(root: string, fn: (state: BuildRunStore) => Promise<{ state: BuildRunStore; result: T }> | { state: BuildRunStore; result: T }) {
  const target = await ensureRoot(root);
  let handle = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { handle = await open(target.lock, "wx", 0o600); break; }
    catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
      if (code !== "EEXIST") throw error;
      await sleep(50);
    }
  }
  if (!handle) throw Object.assign(new Error("Build Run store lock timeout."), { code: "BUILD_RUN_STORE_LOCK_TIMEOUT" });
  try {
    const current = await readBuildRunStore(root);
    const { state, result } = await fn(current);
    await atomic(target.state, { ...state, runs: state.runs.slice(-MAX_RUNS) });
    return result;
  } finally {
    await handle.close().catch(() => undefined);
    await unlink(target.lock).catch(() => undefined);
  }
}

export async function readBuildRunStore(root = DEFAULT_DEVELOPER_GRID_STATE_ROOT): Promise<BuildRunStore> {
  const target = await ensureRoot(root);
  try {
    const parsed = JSON.parse(await readFile(target.state, "utf8")) as Partial<BuildRunStore>;
    return { schemaVersion: 1, revision: Math.max(0, Math.trunc(Number(parsed.revision) || 0)), runs: Array.isArray(parsed.runs) ? parsed.runs.slice(-MAX_RUNS) : [], updatedAt: String(parsed.updatedAt || "") };
  } catch { return { schemaVersion: 1, revision: 0, runs: [], updatedAt: "" }; }
}

export async function createBuildRunIfTaskIdle(run: GridBuildRun, root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  return mutate(root, (state) => {
    const existing = state.runs.find((item) => item.taskId === run.taskId && !["PASS","FAIL","BLOCKED"].includes(item.status));
    if (existing) return { state, result: { created:false, run:existing, revision:state.revision, updatedAt:state.updatedAt } };
    const now = new Date().toISOString();
    const runs = [...state.runs, { ...run }];
    const next = { ...state, revision: state.revision + 1, runs, updatedAt: now };
    return { state: next, result: { created:true, run:{...run}, revision:next.revision, updatedAt:now } };
  });
}

export async function upsertBuildRun(run: GridBuildRun, root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  return mutate(root, (state) => {
    const now = new Date().toISOString();
    const runs = [...state.runs.filter((item) => item.id !== run.id), { ...run }];
    const next = { ...state, revision: state.revision + 1, runs, updatedAt: now };
    return { state: next, result: { run: { ...run }, revision: next.revision, updatedAt: now } };
  });
}

export async function patchBuildRun(runId: string, patch: Partial<GridBuildRun>, root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  return mutate(root, (state) => {
    const existing = state.runs.find((item) => item.id === runId);
    if (!existing) throw Object.assign(new Error(`Build run nem található: ${runId}`), { code: "BUILD_RUN_NOT_FOUND" });
    const run = { ...existing, ...patch, id: existing.id, taskId: existing.taskId, sessionId: existing.sessionId, workerCode: existing.workerCode, sourceCommit: existing.sourceCommit, sourceBranch: existing.sourceBranch, productionAccess: "DENY" as const };
    const now = new Date().toISOString();
    const runs = [...state.runs.filter((item) => item.id !== runId), run];
    const next = { ...state, revision: state.revision + 1, runs, updatedAt: now };
    return { state: next, result: { run, revision: next.revision, updatedAt: now } };
  });
}

export async function claimQueuedBuildRun(runId: string, nodeId: "build01" | "build02", assignedAt = new Date().toISOString(), root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  return mutate(root, (state) => {
    const existing = state.runs.find((item) => item.id === runId);
    if (!existing || existing.status !== "QUEUED") return { state, result: { claimed: false, run: existing || null, revision: state.revision } };
    const run: GridBuildRun = { ...existing, status: "ASSIGNED", nodeId, assignedAt, dispatchStartedAt: null };
    const now = new Date().toISOString();
    const runs = [...state.runs.filter((item) => item.id !== runId), run];
    const next = { ...state, revision: state.revision + 1, runs, updatedAt: now };
    return { state: next, result: { claimed: true, run, revision: next.revision } };
  });
}

export async function claimBuildRunDispatch(runId: string, root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  return mutate(root, (state) => {
    const existing = state.runs.find((item) => item.id === runId);
    if (!existing || existing.status !== "ASSIGNED" || existing.dispatchStartedAt) return { state, result: { claimed: false, run: existing || null, revision: state.revision } };
    const now = new Date().toISOString();
    const run: GridBuildRun = { ...existing, dispatchStartedAt: now };
    const runs = [...state.runs.filter((item) => item.id !== runId), run];
    const next = { ...state, revision: state.revision + 1, runs, updatedAt: now };
    return { state: next, result: { claimed: true, run, revision: next.revision } };
  });
}

export function buildJobEvidencePath(runId: string, root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  return path.join(paths(root).jobs, `${runId}.result.json`);
}

export async function readBuildJobEvidence(runId: string, root = DEFAULT_DEVELOPER_GRID_STATE_ROOT): Promise<BuildJobEvidence | null> {
  try {
    const parsed = JSON.parse(await readFile(buildJobEvidencePath(runId, root), "utf8")) as BuildJobEvidence;
    return parsed?.schemaVersion === 1 && parsed?.runId === runId && parsed?.environment === "DEV" && parsed?.productionAccess === "DENY" ? parsed : null;
  } catch { return null; }
}
