"server-only";

import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { paginateEvents } from "./events";
import type { DeveloperGridTask, GridActivityEvent, WorkerSession } from "./types";

export const DEFAULT_DEVELOPER_GRID_STATE_ROOT = "/srv/dimpro-dev/coordination/developer-grid";

type GridPersistentState = { schemaVersion: 1; task: DeveloperGridTask | null; sessions: WorkerSession[]; lastSequence: number; updatedAt: string };
const emptyState: GridPersistentState = { schemaVersion: 1, task: null, sessions: [], lastSequence: 0, updatedAt: "" };

function files(root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  const base = path.resolve(root);
  return { root: base, state: path.join(base, "state.json"), events: path.join(base, "events.jsonl") };
}
async function ensureRoot(root: string) { await mkdir(root, { recursive: true, mode: 0o700 }); }
async function atomic(file: string, payload: unknown) {
  const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, file);
}

export async function readGridState(root = DEFAULT_DEVELOPER_GRID_STATE_ROOT): Promise<GridPersistentState> {
  const target = files(root); await ensureRoot(target.root);
  try {
    const parsed = JSON.parse(await readFile(target.state, "utf8")) as GridPersistentState;
    return { schemaVersion: 1, task: parsed.task || null, sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [], lastSequence: Math.max(0, Number(parsed.lastSequence) || 0), updatedAt: parsed.updatedAt || "" };
  } catch { return { ...emptyState }; }
}

export async function upsertGridTask(task: DeveloperGridTask, root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  const target = files(root); await ensureRoot(target.root); const state = await readGridState(root);
  const next = { ...state, task: { ...task }, updatedAt: new Date().toISOString() }; await atomic(target.state, next); return next;
}

export async function upsertWorkerSession(session: WorkerSession, root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  const target = files(root); await ensureRoot(target.root); const state = await readGridState(root);
  const sessions = state.sessions.filter((item) => item.id !== session.id && !(item.workerCode === session.workerCode && item.endedAt === null));
  sessions.push({ ...session }); const next = { ...state, sessions, updatedAt: new Date().toISOString() }; await atomic(target.state, next); return next;
}

export async function getActiveWorkerSession(workerCode: WorkerSession["workerCode"], root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  return (await readGridState(root)).sessions.find((session) => session.workerCode === workerCode && session.endedAt === null) || null;
}

export async function appendGridEvent(event: Omit<GridActivityEvent, "id" | "sequence" | "timestamp"> & Partial<Pick<GridActivityEvent, "id" | "timestamp">>, root = DEFAULT_DEVELOPER_GRID_STATE_ROOT) {
  const target = files(root); await ensureRoot(target.root); const state = await readGridState(root); const sequence = state.lastSequence + 1;
  const record: GridActivityEvent = { ...event, id: event.id || `grid-event-${randomUUID()}`, sequence, timestamp: event.timestamp || new Date().toISOString() };
  await appendFile(target.events, `${JSON.stringify(record)}\n`, { mode: 0o600 }); await atomic(target.state, { ...state, lastSequence: sequence, updatedAt: record.timestamp }); return record;
}

export async function listGridEvents(input: { cursor?: string | null; limit?: number; root?: string } = {}) {
  const target = files(input.root || DEFAULT_DEVELOPER_GRID_STATE_ROOT); await ensureRoot(target.root); let raw = "";
  try { raw = await readFile(target.events, "utf8"); } catch {}
  const events = raw.split("\n").filter(Boolean).flatMap((line) => { try { return [JSON.parse(line) as GridActivityEvent]; } catch { return []; } });
  return paginateEvents(events, input.cursor, input.limit || 50);
}
