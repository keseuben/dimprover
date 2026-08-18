"server-only";

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { getDeveloperConsoleWorkspaceActivitySource } from "../developer-console";
import { resolveTaskDevelopmentContext } from "../development-context";
import { getTerminalHubFeatureFlags } from "./config";
import { sanitizeTerminalText } from "./data-policy";
import { LiveWorkspaceError, resolveLiveWorkspaceRoot } from "./live-workspace";
import { isWorkspacePathDenied } from "./workspace-policy";

const execFileAsync = promisify(execFile);
const MAX_GIT_EVENTS = 18;
const MAX_ACTIVITY_EVENTS = 60;

type Row = Record<string, unknown>;

export type LiveWorkspaceWorkerActivity = {
  workerId: string;
  code: string;
  name: string;
  role: string;
  workerStatus: string;
  freshness: "LIVE" | "STALE" | "IDLE" | "OFFLINE";
  selectedWorkspace: boolean;
  workspaceLabel: string | null;
  sessionId: string | null;
  sessionStatus: string | null;
  handshakeStage: string | null;
  taskId: string | null;
  taskTitle: string | null;
  taskStatus: string | null;
  projectId: string | null;
  projectName: string | null;
  branch: string | null;
  lastHeartbeatAt: string | null;
  updatedAt: string | null;
  mainModule: string | null;
  moduleName: string | null;
  submoduleName: string | null;
  workItem: string | null;
  workStageIndex: number | null;
  workStageLabel: string | null;
  activityAction: string | null;
  activityNarrative: string | null;
};

export type LiveWorkspaceActivityEvent = {
  id: string;
  kind: "AUDIT" | "COMMIT" | "FILE_STATE";
  level: "info" | "success" | "warning" | "error";
  actor: string;
  action: string;
  summary: string;
  relativePath: string | null;
  gitStatus: string | null;
  taskId: string | null;
  projectId: string | null;
  createdAt: string;
};

export type LiveWorkspaceActivitySnapshot = {
  workspace: { id: string; name: string; plane: "INTERNAL" | "PARTNER"; branch: string };
  workers: LiveWorkspaceWorkerActivity[];
  events: LiveWorkspaceActivityEvent[];
  summary: {
    liveWorkers: number;
    selectedWorkspaceWorkers: number;
    dirtyFiles: number;
    recentCommits: number;
  };
  watcherEnabled: false;
  writeEnabled: false;
  refreshIntervalMs: 4000;
  generatedAt: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

function safeText(value: unknown, limit = 800) {
  return sanitizeTerminalText(text(value)).replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalizeFsPath(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  return path.resolve(raw).replace(/\/+$/, "");
}

function freshness(workerStatus: string, heartbeatAt: string) {
  if (workerStatus === "offline") return "OFFLINE" as const;
  if (!heartbeatAt) return "IDLE" as const;
  const parsed = Date.parse(heartbeatAt);
  if (!Number.isFinite(parsed)) return "IDLE" as const;
  const age = Math.max(0, Date.now() - parsed);
  if (age <= 60_000) return "LIVE" as const;
  if (age <= 5 * 60_000) return "STALE" as const;
  return "IDLE" as const;
}

async function gitRead(worktree: string, args: string[], maxBuffer = 512 * 1024) {
  try {
    const result = await execFileAsync("git", ["-C", worktree, ...args], {
      timeout: 4000,
      maxBuffer,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    return result.stdout;
  } catch {
    return "";
  }
}

function parsePorcelainStatus(raw: string, generatedAt: string): LiveWorkspaceActivityEvent[] {
  const records = raw.split("\0");
  const events: LiveWorkspaceActivityEvent[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || record.length < 4) continue;
    const code = record.slice(0, 2);
    const relativePath = record.slice(3).replaceAll("\\", "/");
    if (!relativePath || path.posix.isAbsolute(relativePath) || relativePath.split("/").includes("..") || isWorkspacePathDenied(relativePath)) continue;
    if (code.includes("R") || code.includes("C")) index += 1;
    const severity = code.includes("D") ? "warning" : code === "??" ? "info" : "info";
    events.push({
      id: `file:${code}:${relativePath}`,
      kind: "FILE_STATE",
      level: severity,
      actor: "GIT",
      action: code === "??" ? "UNTRACKED" : code.includes("D") ? "DELETED" : code.includes("A") ? "ADDED" : code.includes("R") ? "RENAMED" : "MODIFIED",
      summary: `${code === "??" ? "Új" : code.includes("D") ? "Törölt" : code.includes("A") ? "Hozzáadott" : code.includes("R") ? "Átnevezett" : "Módosított"} fájl · ${relativePath}`,
      relativePath,
      gitStatus: code,
      taskId: null,
      projectId: null,
      createdAt: generatedAt,
    });
  }
  return events.slice(0, MAX_GIT_EVENTS);
}

function parseGitLog(raw: string): LiveWorkspaceActivityEvent[] {
  return raw.split("\x1e").map((entry) => entry.trim()).filter(Boolean).slice(0, 12).flatMap((entry) => {
    const [fullHash, shortHash, author, createdAt, ...subjectParts] = entry.split("\x1f");
    const subject = safeText(subjectParts.join("\x1f"), 500);
    if (!fullHash || !shortHash || !createdAt || !subject) return [];
    return [{
      id: `commit:${fullHash}`,
      kind: "COMMIT" as const,
      level: "success" as const,
      actor: safeText(author, 100) || "GIT",
      action: "COMMIT",
      summary: `${shortHash} · ${subject}`,
      relativePath: null,
      gitStatus: shortHash,
      taskId: null,
      projectId: null,
      createdAt,
    }];
  });
}

function auditLevel(action: string): LiveWorkspaceActivityEvent["level"] {
  const upper = action.toUpperCase();
  if (/(FAILED|ERROR|DENIED|BLOCKED|CONFLICT)/.test(upper)) return "error";
  if (/(WARNING|PAUSED|EXPIRED)/.test(upper)) return "warning";
  if (/(COMPLETED|READY|PASSED|RELEASED|APPROVED)/.test(upper)) return "success";
  return "info";
}

export function assertWorkspaceActivityEnabled() {
  const flags = getTerminalHubFeatureFlags();
  if (!flags.liveWorkspaceEnabled || !flags.workspaceActivityEnabled) {
    throw new LiveWorkspaceError("A Live Workspace P5 worker activity feature flag jelenleg ki van kapcsolva.", "LIVE_WORKSPACE_ACTIVITY_DISABLED", 409);
  }
}

export async function getLiveWorkspaceActivity(workspaceId: string): Promise<LiveWorkspaceActivitySnapshot> {
  assertWorkspaceActivityEnabled();
  const workspace = await resolveLiveWorkspaceRoot(workspaceId);
  const workspacePath = normalizeFsPath(workspace.path);
  const generatedAt = new Date().toISOString();
  const [source, branch, statusRaw, logRaw] = await Promise.all([
    getDeveloperConsoleWorkspaceActivitySource(),
    gitRead(workspace.path, ["branch", "--show-current"]),
    gitRead(workspace.path, ["status", "--porcelain=v1", "-z", "--untracked-files=normal"], 1024 * 1024),
    gitRead(workspace.path, ["log", "-n", "12", "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1e", "--", "."]),
  ]);

  const workers = source.workers as Row[];
  const tasks = source.tasks as Row[];
  const sessions = source.sessions as Row[];
  const audits = source.audits as Row[];
  const tasksById = new Map(tasks.map((row) => [text(row.id), row]));
  const activeSessions = sessions.filter((row) => text(row.status) !== "closed");

  const workerActivity: LiveWorkspaceWorkerActivity[] = workers.map((worker) => {
    const workerId = text(worker.id);
    const session = activeSessions.find((row) => text(row.worker_id) === workerId) || null;
    const task = session ? tasksById.get(text(session.task_id)) || null : tasks.find((row) => text(row.assigned_worker_id) === workerId && !["completed", "cancelled"].includes(text(row.status))) || null;
    const sessionWorktree = normalizeFsPath(session?.worktree_path);
    const taskWorktree = normalizeFsPath(task?.worktree_path);
    const activePath = sessionWorktree || taskWorktree;
    const selectedWorkspace = Boolean(activePath && activePath === workspacePath);
    const heartbeat = text(session?.last_heartbeat_at);
    const development = task ? resolveTaskDevelopmentContext({
      projectId: text(task.project_id), title: text(task.title), description: text(task.description), status: text(task.status), scope: task.scope, metadata: record(task.metadata),
    }) : null;
    return {
      workerId,
      code: safeText(worker.code, 40) || workerId,
      name: safeText(worker.name, 120) || safeText(worker.code, 40) || workerId,
      role: safeText(worker.role, 160),
      workerStatus: safeText(worker.status, 40) || "unknown",
      freshness: freshness(text(worker.status), heartbeat),
      selectedWorkspace,
      workspaceLabel: activePath ? selectedWorkspace ? workspace.name : path.basename(activePath) : null,
      sessionId: text(session?.id) || null,
      sessionStatus: text(session?.status) || null,
      handshakeStage: text(session?.handshake_stage) || null,
      taskId: text(task?.id) || null,
      taskTitle: safeText(task?.title, 300) || null,
      taskStatus: text(task?.status) || null,
      projectId: development?.projectId || text(task?.project_id) || null,
      projectName: development?.projectName || null,
      branch: safeText(session?.branch_name || task?.branch_name, 200) || null,
      lastHeartbeatAt: heartbeat || null,
      updatedAt: text(session?.updated_at || worker.updated_at) || null,
      mainModule: development?.mainModule || null,
      moduleName: development?.moduleName || null,
      submoduleName: development?.submoduleName || null,
      workItem: development?.workItem || null,
      workStageIndex: development?.workStageIndex || null,
      workStageLabel: development?.workStageLabel || null,
      activityAction: development?.activityAction || null,
      activityNarrative: development?.activityNarrative || null,
    };
  });

  const selectedTaskIds = new Set(tasks.filter((row) => normalizeFsPath(row.worktree_path) === workspacePath).map((row) => text(row.id)).filter(Boolean));
  const selectedSessionIds = new Set(sessions.filter((row) => normalizeFsPath(row.worktree_path) === workspacePath).map((row) => text(row.id)).filter(Boolean));
  const auditEvents: LiveWorkspaceActivityEvent[] = audits.filter((row) => {
    const taskId = text(row.task_id);
    const entityId = text(row.entity_id);
    return (taskId && selectedTaskIds.has(taskId)) || (entityId && selectedSessionIds.has(entityId));
  }).map((row) => {
    const action = safeText(row.action, 120) || "AUDIT";
    return {
      id: `audit:${text(row.id)}`,
      kind: "AUDIT" as const,
      level: auditLevel(action),
      actor: safeText(row.actor_id, 100) || "SYSTEM",
      action,
      summary: safeText(row.summary, 700) || action.replaceAll("_", " "),
      relativePath: null,
      gitStatus: null,
      taskId: text(row.task_id) || null,
      projectId: text(row.project_id) || null,
      createdAt: text(row.created_at) || generatedAt,
    };
  });

  const fileEvents = parsePorcelainStatus(statusRaw, generatedAt);
  const commitEvents = parseGitLog(logRaw);
  const events = [...fileEvents, ...auditEvents, ...commitEvents]
    .filter((event) => Boolean(event.createdAt))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_ACTIVITY_EVENTS);

  return {
    workspace: { id: workspace.id, name: workspace.name, plane: workspace.plane, branch: branch.trim() },
    workers: workerActivity,
    events,
    summary: {
      liveWorkers: workerActivity.filter((worker) => worker.freshness === "LIVE").length,
      selectedWorkspaceWorkers: workerActivity.filter((worker) => worker.selectedWorkspace).length,
      dirtyFiles: fileEvents.length,
      recentCommits: commitEvents.length,
    },
    watcherEnabled: false,
    writeEnabled: false,
    refreshIntervalMs: 4000,
    generatedAt,
  };
}
