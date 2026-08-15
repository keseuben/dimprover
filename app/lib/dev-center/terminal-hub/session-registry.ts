import { randomUUID } from "node:crypto";
import { getTerminalCoreReadiness } from "./readiness";
import type { TerminalAiVisibility, TerminalOutputChunk, TerminalSessionCreateRequest, TerminalSessionSummary } from "./session-types";
import { resolveAllowedWorkspacePath } from "./workspace-policy";

export class TerminalSessionError extends Error {
  status: number;
  code: string;
  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "TerminalSessionError";
    this.status = status;
    this.code = code;
  }
}

export type TerminalProcessHandle = {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
  onData(listener: (data: string) => void): () => void;
  onExit(listener: (exitCode: number | null) => void): () => void;
};

export type TerminalProcessAdapter = {
  open(input: { cwd: string; cols: number; rows: number }): Promise<TerminalProcessHandle>;
};

type RuntimeSession = {
  summary: TerminalSessionSummary;
  output: TerminalOutputChunk[];
  handle: TerminalProcessHandle | null;
  touchedAt: number;
};

const MAX_OUTPUT_CHUNKS = 800;
const MAX_INPUT_BYTES = 16 * 1024;
const MAX_SESSION_COUNT = 8;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_LIFETIME_MS = 4 * 60 * 60 * 1000;
const MIN_COLS = 20;
const MAX_COLS = 300;
const MIN_ROWS = 8;
const MAX_ROWS = 120;

const globalState = globalThis as typeof globalThis & { __benjadminTerminalSessions?: Map<string, RuntimeSession> };
const sessions = globalState.__benjadminTerminalSessions || new Map<string, RuntimeSession>();
globalState.__benjadminTerminalSessions = sessions;

function nowIso() { return new Date().toISOString(); }
function clampInt(value: number | undefined, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function publicSummary(session: RuntimeSession): TerminalSessionSummary {
  return { ...session.summary };
}

function expireSession(session: RuntimeSession) {
  if (!["STARTING", "RUNNING", "DISCONNECTED"].includes(session.summary.state)) return;
  const createdAt = Date.parse(session.summary.createdAt);
  const idleExpired = Date.now() - session.touchedAt >= IDLE_TIMEOUT_MS;
  const lifetimeExpired = Number.isFinite(createdAt) && Date.now() - createdAt >= MAX_LIFETIME_MS;
  if (!idleExpired && !lifetimeExpired) return;
  try { session.handle?.close(); } catch { /* timeout cleanup best effort */ }
  session.handle = null;
  session.summary.state = "CLOSED";
  session.summary.exitedAt = nowIso();
}

function pruneTerminalSessions() {
  for (const session of sessions.values()) expireSession(session);
}

function appendOutput(session: RuntimeSession, data: string) {
  const next = session.summary.sequence + 1;
  session.summary.sequence = next;
  session.summary.lastActivityAt = nowIso();
  session.touchedAt = Date.now();
  session.output.push({ sequence: next, data, createdAt: session.summary.lastActivityAt });
  if (session.output.length > MAX_OUTPUT_CHUNKS) session.output.splice(0, session.output.length - MAX_OUTPUT_CHUNKS);
}

export function getTerminalProcessAdapter(): TerminalProcessAdapter | null {
  return null;
}

export function listTerminalSessions(owner: string) {
  pruneTerminalSessions();
  return [...sessions.values()].filter((item) => item.summary.owner === owner).map(publicSummary).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getTerminalSession(owner: string, id: string) {
  pruneTerminalSessions();
  const session = sessions.get(id);
  if (!session || session.summary.owner !== owner) throw new TerminalSessionError("A terminál session nem található.", "TERMINAL_SESSION_NOT_FOUND", 404);
  return session;
}

export async function createTerminalSession(owner: string, input: TerminalSessionCreateRequest) {
  const readiness = getTerminalCoreReadiness();
  if (!readiness.ready) throw new TerminalSessionError(readiness.blockers.join(" ") || "A Terminal Core nem READY.", "TERMINAL_CORE_BLOCKED", 409);
  const adapter = getTerminalProcessAdapter();
  if (!adapter) throw new TerminalSessionError("A P2 process-adapter még nincs aktiválva.", "TERMINAL_PROCESS_ADAPTER_INACTIVE", 503);
  if (listTerminalSessions(owner).filter((item) => ["STARTING", "RUNNING", "DISCONNECTED"].includes(item.state)).length >= MAX_SESSION_COUNT) {
    throw new TerminalSessionError("Elérted az egyidejű terminál session limitet.", "TERMINAL_SESSION_LIMIT", 429);
  }
  const resolved = await resolveAllowedWorkspacePath(input.cwd);
  const cols = clampInt(input.cols, MIN_COLS, MAX_COLS, 110);
  const rows = clampInt(input.rows, MIN_ROWS, MAX_ROWS, 32);
  const createdAt = nowIso();
  const session: RuntimeSession = {
    summary: { id: randomUUID(), state: "STARTING", environment: "DEV", cwd: resolved.path, cols, rows, createdAt, lastActivityAt: createdAt, exitedAt: null, exitCode: null, sequence: 0, owner, aiVisibility: "FILTERED" },
    output: [], handle: null, touchedAt: Date.now(),
  };
  sessions.set(session.summary.id, session);
  try {
    const handle = await adapter.open({ cwd: resolved.path, cols, rows });
    session.handle = handle;
    session.summary.state = "RUNNING";
    handle.onData((data) => appendOutput(session, data));
    handle.onExit((exitCode) => {
      session.summary.state = "EXITED";
      session.summary.exitCode = exitCode;
      session.summary.exitedAt = nowIso();
      session.handle = null;
    });
    return publicSummary(session);
  } catch (error) {
    session.summary.state = "FAILED";
    session.summary.exitedAt = nowIso();
    throw new TerminalSessionError(error instanceof Error ? error.message : "A terminál session nem indítható.", "TERMINAL_SESSION_START_FAILED", 500);
  }
}

export function writeTerminalSession(owner: string, id: string, data: string) {
  const session = getTerminalSession(owner, id);
  if (!session.handle || session.summary.state !== "RUNNING") throw new TerminalSessionError("A terminál session nem írható.", "TERMINAL_SESSION_NOT_RUNNING", 409);
  if (!data || Buffer.byteLength(data, "utf8") > MAX_INPUT_BYTES) throw new TerminalSessionError("A terminál input üres vagy túl nagy.", "TERMINAL_INPUT_INVALID", 400);
  session.handle.write(data);
  session.summary.lastActivityAt = nowIso();
  session.touchedAt = Date.now();
  return publicSummary(session);
}


export function setTerminalSessionAiVisibility(owner: string, id: string, mode: TerminalAiVisibility) {
  const session = getTerminalSession(owner, id);
  if (!["FILTERED", "BLOCKED"].includes(mode)) throw new TerminalSessionError("Érvénytelen AI visibility mód.", "TERMINAL_AI_VISIBILITY_INVALID", 400);
  session.summary.aiVisibility = mode;
  session.summary.lastActivityAt = nowIso();
  session.touchedAt = Date.now();
  return publicSummary(session);
}

export function resizeTerminalSession(owner: string, id: string, cols: number, rows: number) {
  const session = getTerminalSession(owner, id);
  if (!session.handle || session.summary.state !== "RUNNING") throw new TerminalSessionError("A terminál session nem méretezhető.", "TERMINAL_SESSION_NOT_RUNNING", 409);
  const safeCols = clampInt(cols, MIN_COLS, MAX_COLS, session.summary.cols);
  const safeRows = clampInt(rows, MIN_ROWS, MAX_ROWS, session.summary.rows);
  session.handle.resize(safeCols, safeRows);
  session.summary.cols = safeCols;
  session.summary.rows = safeRows;
  session.summary.lastActivityAt = nowIso();
  session.touchedAt = Date.now();
  return publicSummary(session);
}

export function closeTerminalSession(owner: string, id: string) {
  const session = getTerminalSession(owner, id);
  try { session.handle?.close(); } catch { /* adapter cleanup best effort */ }
  session.handle = null;
  session.summary.state = "CLOSED";
  session.summary.exitedAt = nowIso();
  return publicSummary(session);
}

export function readTerminalOutput(owner: string, id: string, afterSequence = 0) {
  const session = getTerminalSession(owner, id);
  const after = Number.isFinite(Number(afterSequence)) ? Math.max(0, Math.floor(Number(afterSequence))) : 0;
  return { session: publicSummary(session), chunks: session.output.filter((chunk) => chunk.sequence > after) };
}
