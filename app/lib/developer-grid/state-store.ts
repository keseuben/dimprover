"server-only";

import { randomUUID } from "node:crypto";
import { appendFile, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { paginateEvents } from "./events";
import type { DeveloperGridRuntimeState, DeveloperGridTask, GridActivityEvent, GridStateChange, GridStateChangeKind, GridStateDelta, WorkerSession } from "./types";

export const DEFAULT_DEVELOPER_GRID_STATE_ROOT = "/srv/dimpro-dev/coordination/developer-grid";
const MAX_STATE_CHANGES = 1000;

export type GridPersistentState = DeveloperGridRuntimeState;

const emptyState: GridPersistentState = {
  schemaVersion: 1,
  revision: 0,
  task: null,
  sessions: [],
  changes: [],
  lastSequence: 0,
  updatedAt: "",
};

function files(root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  const base = path.resolve(root);
  return { root: base, state: path.join(base, "state.json"), events: path.join(base, "events.jsonl") };
}

async function ensureRoot(root: string) {
  await mkdir(root, { recursive: true, mode: 0o700 });
}

async function atomic(file: string, payload: unknown) {
  const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, file);
}

async function serializeMutation<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const target = files(root);
  await ensureRoot(target.root);
  const lockPath = path.join(target.root, "mutation.lock");
  let handle = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      handle = await open(lockPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`);
      break;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
      if (code !== "EEXIST") throw error;
      await sleep(50);
    }
  }
  if (!handle) {
    const error = new Error("Developer Grid state mutation lock nem szabadult fel 5 másodpercen belül.");
    Object.assign(error, { code: "DEVELOPER_GRID_STATE_LOCK_TIMEOUT", lockPath });
    throw error;
  }
  try {
    return await operation();
  } finally {
    await handle.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
  }
}

function normalizeState(parsed: Partial<GridPersistentState>): GridPersistentState {
  return {
    schemaVersion: 1,
    revision: Math.max(0, Math.trunc(Number(parsed.revision) || 0)),
    task: parsed.task || null,
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    changes: Array.isArray(parsed.changes) ? parsed.changes.slice(-MAX_STATE_CHANGES) : [],
    lastSequence: Math.max(0, Number(parsed.lastSequence) || 0),
    updatedAt: parsed.updatedAt || "",
  };
}

function bumpStateChange(state: GridPersistentState, kind: GridStateChangeKind, entityId: string, taskId: string, timestamp = new Date().toISOString()) {
  const revision = state.revision + 1;
  const change: GridStateChange = { revision, kind, entityId, taskId, timestamp };
  const changes = [...state.changes, change].slice(-MAX_STATE_CHANGES);
  return { ...state, revision, changes, updatedAt: timestamp };
}

export async function readGridState(root = DEFAULT_DEVELOPER_GRID_STATE_ROOT): Promise<GridPersistentState> {
  const target = files(root);
  await ensureRoot(target.root);
  try {
    return normalizeState(JSON.parse(await readFile(target.state, "utf8")) as Partial<GridPersistentState>);
  } catch {
    return { ...emptyState, sessions: [], changes: [] };
  }
}

export async function upsertGridTask(task: DeveloperGridTask, root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  return serializeMutation(root, async () => {
    const target = files(root);
    const state = await readGridState(root);
    const next = bumpStateChange({ ...state, task: { ...task } }, "task-upsert", task.id, task.id);
    await atomic(target.state, next);
    return next;
  });
}

export async function upsertWorkerSession(session: WorkerSession, root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  return serializeMutation(root, async () => {
    const target = files(root);
    const state = await readGridState(root);
    const sessions = state.sessions.filter((item) => item.id !== session.id && !(item.workerCode === session.workerCode && item.endedAt === null));
    sessions.push({ ...session });
    const next = bumpStateChange({ ...state, sessions }, "session-upsert", session.id, session.taskId);
    await atomic(target.state, next);
    return next;
  });
}

export async function materializeGridTaskSession(input: { task: DeveloperGridTask; session: WorkerSession }, root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  return serializeMutation(root, async () => {
    const target = files(root);
    const state = await readGridState(root);
    const existingActive = state.sessions.find((item) => item.workerCode === input.session.workerCode && item.endedAt === null);
    const canonicalSession = existingActive?.taskId === input.session.taskId
      ? { ...input.session, id: existingActive.id, startedAt: existingActive.startedAt }
      : input.session;
    const sessions = state.sessions.filter((item) => item.id !== canonicalSession.id && !(item.workerCode === canonicalSession.workerCode && item.endedAt === null));
    sessions.push(canonicalSession);
    let next = bumpStateChange({ ...state, task: { ...input.task }, sessions }, "task-upsert", input.task.id, input.task.id);
    next = bumpStateChange(next, "session-upsert", canonicalSession.id, canonicalSession.taskId);
    await atomic(target.state, next);
    return { state: next, session: canonicalSession, reusedActiveSession: Boolean(existingActive?.taskId === input.session.taskId) };
  });
}

export async function getActiveWorkerSession(workerCode: WorkerSession["workerCode"], root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  return (await readGridState(root)).sessions.find((session) => session.workerCode === workerCode && session.endedAt === null) || null;
}

export async function getGridStateDelta(input: { after?: number; limit?: number; root?: string } = {}): Promise<GridStateDelta> {
  const state = await readGridState(input.root || DEFAULT_DEVELOPER_GRID_STATE_ROOT);
  const after = Math.max(0, Math.trunc(Number(input.after) || 0));
  const limit = Math.max(1, Math.min(200, Math.trunc(Number(input.limit) || 50)));
  const pending = state.changes.filter((change) => change.revision > after);
  const changes = pending.slice(0, limit);
  const cursor = changes.at(-1)?.revision ?? after;
  const sessionIds = new Set(changes.filter((change) => change.kind !== "task-upsert").map((change) => change.entityId));
  const taskTouched = Boolean(state.task && changes.some((change) => change.taskId === state.task?.id));
  return {
    mode: "DELTA_STATE",
    cursor,
    hasMore: pending.length > changes.length,
    changes,
    task: taskTouched ? state.task : null,
    sessions: state.sessions.filter((session) => sessionIds.has(session.id)),
  };
}

export async function appendGridEvent(
  event: Omit<GridActivityEvent, "id" | "sequence" | "timestamp"> & Partial<Pick<GridActivityEvent, "id" | "timestamp">>,
  root = DEFAULT_DEVELOPER_GRID_STATE_ROOT,
) {
  return serializeMutation(root, async () => {
    const target = files(root);
    const state = await readGridState(root);
    const sequence = state.lastSequence + 1;
    const record: GridActivityEvent = {
      ...event,
      id: event.id || `grid-event-${randomUUID()}`,
      sequence,
      timestamp: event.timestamp || new Date().toISOString(),
    };
    await appendFile(target.events, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    await atomic(target.state, { ...state, lastSequence: sequence, updatedAt: record.timestamp });
    return record;
  });
}

export async function listGridEvents(input: { cursor?: string | null; limit?: number; root?: string } = {}) {
  const target = files(input.root || DEFAULT_DEVELOPER_GRID_STATE_ROOT);
  await ensureRoot(target.root);
  let raw = "";
  try {
    raw = await readFile(target.events, "utf8");
  } catch {}
  const events = raw.split("\n").filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line) as GridActivityEvent];
    } catch {
      return [];
    }
  });
  return paginateEvents(events, input.cursor, input.limit || 50);
}
