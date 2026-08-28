import fs from "node:fs";
import path from "node:path";
import type {
  DeveloperGridSessionState,
  DeveloperGridStateChange,
  DeveloperGridStateSnapshot,
  DeveloperGridTaskState,
} from "./types";

const MAX_CHANGES = 1000;

function emptyState(): DeveloperGridStateSnapshot {
  return { schemaVersion: 1, revision: 0, tasks: [], sessions: [], changes: [] };
}

function safeState(value: unknown): DeveloperGridStateSnapshot {
  if (!value || typeof value !== "object") return emptyState();
  const candidate = value as Partial<DeveloperGridStateSnapshot>;
  return {
    schemaVersion: 1,
    revision: Math.max(0, Math.floor(Number(candidate.revision) || 0)),
    tasks: Array.isArray(candidate.tasks) ? candidate.tasks : [],
    sessions: Array.isArray(candidate.sessions) ? candidate.sessions : [],
    changes: Array.isArray(candidate.changes) ? candidate.changes.slice(-MAX_CHANGES) : [],
  };
}

export class DeveloperGridStateStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private read() {
    try {
      return safeState(JSON.parse(fs.readFileSync(this.filePath, "utf8")));
    } catch {
      return emptyState();
    }
  }

  private write(state: DeveloperGridStateSnapshot) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
  }

  snapshot() { return this.read(); }

  upsertTask(task: DeveloperGridTaskState) {
    const state = this.read();
    const index = state.tasks.findIndex((item) => item.id === task.id);
    if (index >= 0) state.tasks[index] = task;
    else state.tasks.push(task);
    this.bump(state, "task-upsert", task.id, task.id, task.updatedAt);
    this.write(state);
    return task;
  }

  upsertSession(session: DeveloperGridSessionState) {
    const state = this.read();
    const index = state.sessions.findIndex((item) => item.id === session.id);
    if (index >= 0) state.sessions[index] = session;
    else state.sessions.push(session);
    this.bump(state, "session-upsert", session.id, session.taskId, session.updatedAt);
    this.write(state);
    return session;
  }

  closeSession(sessionId: string, updatedAt = new Date().toISOString()) {
    const state = this.read();
    const session = state.sessions.find((item) => item.id === sessionId);
    if (!session) return null;
    session.status = "CLOSED";
    session.updatedAt = updatedAt;
    this.bump(state, "session-close", session.id, session.taskId, updatedAt);
    this.write(state);
    return session;
  }

  delta(afterRevision = 0, taskId = "", limit = 100) {
    const state = this.read();
    const after = Math.max(0, Math.floor(Number(afterRevision) || 0));
    const max = Math.max(1, Math.min(200, Math.floor(Number(limit) || 100)));
    const changes = state.changes.filter((item) => item.revision > after && (!taskId || item.taskId === taskId)).slice(0, max);
    const entityIds = new Set(changes.map((item) => item.entityId));
    const taskIds = new Set(changes.map((item) => item.taskId));
    const cursor = changes.at(-1)?.revision ?? after;
    return {
      schemaVersion: 1 as const,
      cursor,
      hasMore: state.changes.some((item) => item.revision > cursor && (!taskId || item.taskId === taskId)),
      changes,
      tasks: state.tasks.filter((item) => taskIds.has(item.id)),
      sessions: state.sessions.filter((item) => entityIds.has(item.id) || taskIds.has(item.taskId)),
    };
  }

  private bump(state: DeveloperGridStateSnapshot, kind: DeveloperGridStateChange["kind"], entityId: string, taskId: string, createdAt: string) {
    state.revision += 1;
    state.changes.push({ revision: state.revision, kind, entityId, taskId, createdAt });
    if (state.changes.length > MAX_CHANGES) state.changes.splice(0, state.changes.length - MAX_CHANGES);
  }
}

export function developerGridStateFile() {
  const configured = process.env.DIMPRO_DEVELOPER_GRID_STATE_FILE?.trim();
  return configured || "/srv/dimpro-dev/runtime/developer-grid/state-v1.json";
}

export function createDefaultDeveloperGridStateStore() {
  return new DeveloperGridStateStore(developerGridStateFile());
}
