import { execFile } from "node:child_process";
import { hostname } from "node:os";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getBenAiBridgeStatus } from "./benai-dispatch";
import { resolveProjectRepositoryId } from "./partner-isolation";
import { getInternalExecutorReadiness } from "./internal-executor-readiness";
import { getDevelopmentSchedulerSnapshot } from "./development-scheduler";
import { buildDevelopmentContextKey, DEVELOPMENT_STAGE_LABELS, resolveTaskDevelopmentContext, safeDevelopmentStage } from "./development-context";

const execFileAsync = promisify(execFile);

export type ConsoleTarget = "BENAI" | "ARMINAI" | "JAZMINAI" | "OUTMINAI" | "EVERYONE";
export type ConsoleAuthor = "BENJADMIN" | "BENAI" | "ARMINAI" | "JAZMINAI" | "OUTMINAI" | "MFORGE" | "VGUARD" | "SYSTEM";
export type ConsoleMessageKind = "MESSAGE" | "INSTRUCTION" | "TASK_ASSIGNMENT" | "TASK_UPDATE" | "DECISION" | "APPROVAL_REQUEST" | "CODE_ACTIVITY" | "FILE_CHANGE" | "DIFF" | "TERMINAL_ACTIVITY" | "BUILD_EVENT" | "TEST_RESULT" | "ERROR" | "WARNING" | "COMMIT" | "RELEASE" | "ARCHIVE_SUMMARY" | "SYSTEM";

export type ConsoleMessage = {
  id: string;
  author: ConsoleAuthor;
  target: ConsoleTarget | null;
  kind: ConsoleMessageKind;
  summary: string;
  detail: string;
  level: "info" | "success" | "warning" | "error";
  progressPercent: number | null;
  taskId: string | null;
  projectId: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
};

type Row = Record<string, unknown>;

function resolveProjectRoot() {
  const cwd = process.cwd();
  const standaloneSuffix = `${path.sep}.next${path.sep}standalone`;
  if (cwd.endsWith(standaloneSuffix)) return cwd.slice(0, -standaloneSuffix.length);
  return process.env.DIMPRO_PROJECT_ROOT?.trim() || cwd;
}

function safeDistRoot(root: string, configured: string) {
  const value = configured.trim();
  if (!value) return null;
  const distRoot = path.resolve(root, value);
  const relative = path.relative(root, distRoot);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return distRoot;
}

export type DeveloperConsoleReleaseIdentity = {
  buildId: string;
  branch: string;
  commit: string;
  distDir: string;
  metadataReady: boolean;
};

async function developerConsoleDistCandidates(root: string) {
  const candidates: string[] = [];
  const configured = process.env.NEXT_DIST_DIR?.trim();
  if (configured) candidates.push(configured);
  try {
    const pointer = (await readFile(path.join(root, ".dimprover", "active-next-release"), "utf8")).trim();
    if (pointer && !candidates.includes(pointer)) candidates.push(pointer);
  } catch { /* active release pointer még nincs */ }
  if (!candidates.includes(".next")) candidates.push(".next");
  return candidates;
}

export async function resolveDeveloperConsoleReleaseIdentity(root: string): Promise<DeveloperConsoleReleaseIdentity> {
  const candidates = await developerConsoleDistCandidates(root);
  for (const candidate of candidates) {
    const distRoot = safeDistRoot(root, candidate);
    if (!distRoot) continue;
    let buildId = "";
    try { buildId = (await readFile(path.join(distRoot, "BUILD_ID"), "utf8")).trim(); } catch { continue; }
    if (!buildId) continue;

    try {
      const raw = await readFile(path.join(distRoot, ".dimpro-release.json"), "utf8");
      const metadata = JSON.parse(raw) as { buildId?: unknown; gitCommit?: unknown; gitBranch?: unknown };
      const gitCommit = text(metadata.gitCommit).toLowerCase();
      const gitBranch = text(metadata.gitBranch);
      if (text(metadata.buildId) === buildId && /^[0-9a-f]{40}$/.test(gitCommit)) {
        return { buildId, branch: gitBranch, commit: gitCommit.slice(0, 12), distDir: candidate, metadataReady: true };
      }
    } catch { /* legacy release: Git fallback következik */ }
    return { buildId, branch: "", commit: "", distDir: candidate, metadataReady: false };
  }
  return { buildId: "", branch: "", commit: "", distDir: "", metadataReady: false };
}

export async function resolveDeveloperConsoleBuildId(root: string) {
  return (await resolveDeveloperConsoleReleaseIdentity(root)).buildId;
}

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || key.includes("<") || key.includes(">")) throw new Error("A BENJADMIN fejlesztői konzol adatbázis-kapcsolata nincs beállítva.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-benjadmin-developer-console/1.0" } },
  });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function level(value: unknown): ConsoleMessage["level"] {
  const normalized = text(value).toLowerCase();
  return (["info", "success", "warning", "error"] as const).includes(normalized as ConsoleMessage["level"])
    ? normalized as ConsoleMessage["level"]
    : "info";
}

function targetFromMetadata(metadata: Record<string, unknown>) {
  const value = text(metadata.target).toUpperCase();
  return (["BENAI", "ARMINAI", "JAZMINAI", "OUTMINAI", "EVERYONE"] as const).includes(value as ConsoleTarget)
    ? value as ConsoleTarget
    : null;
}

function kindFromWorklog(row: Row): ConsoleMessageKind {
  const metadata = record(row.metadata);
  const explicit = text(metadata.kind).toUpperCase();
  if (["MESSAGE", "INSTRUCTION", "TASK_ASSIGNMENT", "TASK_UPDATE", "DECISION", "APPROVAL_REQUEST", "CODE_ACTIVITY", "FILE_CHANGE", "DIFF", "TERMINAL_ACTIVITY", "BUILD_EVENT", "TEST_RESULT", "ERROR", "WARNING", "COMMIT", "RELEASE", "ARCHIVE_SUMMARY", "SYSTEM"].includes(explicit)) return explicit as ConsoleMessageKind;
  const phase = text(row.phase).toLowerCase();
  const rowLevel = level(row.level);
  if (rowLevel === "error") return "ERROR";
  if (rowLevel === "warning") return "WARNING";
  if (phase === "instruction") return "INSTRUCTION";
  if (phase.includes("build")) return "BUILD_EVENT";
  if (phase.includes("test")) return "TEST_RESULT";
  return "MESSAGE";
}

function authorFromWorklog(row: Row): ConsoleAuthor {
  const source = text(row.source).toLowerCase();
  const worker = text(row.worker_code).toUpperCase();
  if (source === "benjadmin") return "BENJADMIN";
  if (worker === "ARMINAI") return "ARMINAI";
  if (worker === "JAZMINAI") return "JAZMINAI";
  if (worker === "OUTMINAI") return "OUTMINAI";
  if (worker === "MFORGE") return "MFORGE";
  if (worker === "VGUARD") return "VGUARD";
  if (worker === "BENAI" || source === "benai") return "BENAI";
  return "SYSTEM";
}

function mapWorklogRow(row: Row): ConsoleMessage {
  const metadata = record(row.metadata);
  return {
    id: `worklog:${text(row.id)}`,
    author: authorFromWorklog(row),
    target: targetFromMetadata(metadata),
    kind: kindFromWorklog(row),
    summary: text(row.summary),
    detail: text(row.detail),
    level: level(row.level),
    progressPercent: row.progress_percent == null || !Number.isFinite(Number(row.progress_percent)) ? null : Number(row.progress_percent),
    taskId: text(row.task_id) || null,
    projectId: text(metadata.projectId) || null,
    createdAt: text(row.created_at),
    metadata,
  };
}

function workerAuthor(value: unknown): ConsoleAuthor | null {
  const worker = text(value).toUpperCase().replace(/[^A-Z]/g, "");
  if (worker === "ARMINAI") return "ARMINAI";
  if (worker === "JAZMINAI") return "JAZMINAI";
  if (worker === "OUTMINAI") return "OUTMINAI";
  if (worker === "MFORGE" || worker === "MFORGEAI") return "MFORGE";
  if (worker === "VGUARD" || worker === "VGUARDAI") return "VGUARD";
  return null;
}

function auditAuthor(row: Row): ConsoleAuthor {
  const action = text(row.action).toUpperCase();
  const metadata = record(row.metadata);
  if (action.includes("TASK_BENAI_") || action === "BENAI_ASSIGNED") return "BENAI";
  const operationalWorker = workerAuthor(metadata.workerCode);
  if (operationalWorker && (action.includes("SESSION_") || action.includes("TASK_BRIDGE_") || action.includes("TASK_PLUS_BRIDGE_") || action.includes("TASK_MANUAL_BRIDGE_") || action === "TASK_TESTING" || action === "TASK_COMPLETED" || action === "TASK_FAILED" || action.includes("WORKTREE_") || action.includes("SCOPE_"))) return operationalWorker;
  const actor = text(row.actor_id).toUpperCase().replace(/[^A-Z]/g, "");
  if (actor === "BENJADMIN") return "BENJADMIN";
  const actorWorker = workerAuthor(actor);
  if (actorWorker) return actorWorker;
  if (actor === "BENAI") return "BENAI";
  if (action.includes("PARTNER_") || action.includes("HANDOFF")) return "OUTMINAI";
  if (action.includes("TASK_") || action.includes("SESSION_") || action.includes("SCOPE_") || action.includes("WORKTREE_")) return "BENAI";
  return "SYSTEM";
}

function auditKind(row: Row): ConsoleMessageKind {
  const action = text(row.action).toUpperCase();
  if (action.includes("BUILD")) return "BUILD_EVENT";
  if (action.includes("TEST") || action.includes("SMOKE")) return "TEST_RESULT";
  if (action.includes("RELEASE") || action.includes("HANDOFF")) return "RELEASE";
  if (action.includes("COMMIT")) return "COMMIT";
  if (action.includes("APPROVAL")) return "APPROVAL_REQUEST";
  if (action.includes("TASK_CREATED") || action.includes("TASK_ASSIGNED")) return "TASK_ASSIGNMENT";
  if (action.includes("TASK_") || action.includes("SESSION_")) return "TASK_UPDATE";
  if (action.includes("FAILED") || action.includes("ERROR") || action.includes("DENIED")) return "ERROR";
  return "SYSTEM";
}

function mapAuditRow(row: Row): ConsoleMessage {
  const metadata = record(row.metadata);
  const kind = auditKind(row);
  return {
    id: `audit:${text(row.id)}`,
    author: auditAuthor(row),
    target: null,
    kind,
    summary: text(row.summary) || text(row.action).replaceAll("_", " "),
    detail: text(metadata.detail),
    level: kind === "ERROR" ? "error" : kind === "APPROVAL_REQUEST" ? "warning" : "info",
    progressPercent: null,
    taskId: text(row.task_id) || null,
    projectId: text(row.project_id) || null,
    createdAt: text(row.created_at),
    metadata: { ...metadata, action: text(row.action), entityType: text(row.entity_type), entityId: text(row.entity_id) },
  };
}


type ConsoleTaskContext = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: string;
  scope: Array<{ type: string; key: string }>;
  metadata: Record<string, unknown>;
};

function stageForMessage(message: ConsoleMessage) {
  const explicit = safeDevelopmentStage(message.metadata.workStageIndex);
  if (explicit) return explicit;
  const phase = text(message.metadata.activityPhase || message.metadata.phase).toLowerCase();
  if (message.kind === "RELEASE" || text(message.metadata.action).toUpperCase() === "COMPLETE") return 6;
  if (message.kind === "BUILD_EVENT" || message.kind === "COMMIT" || phase === "build" || phase === "commit") return 5;
  if (message.kind === "ERROR" || message.kind === "WARNING" || ["error", "review", "fix"].includes(phase)) return 4;
  if (message.kind === "TEST_RESULT" || ["test", "testing"].includes(phase)) return 3;
  if (["CODE_ACTIVITY", "FILE_CHANGE", "DIFF", "TERMINAL_ACTIVITY"].includes(message.kind) || ["coding", "file-change", "diff", "terminal"].includes(phase)) return 2;
  return 1;
}

function scopeEntries(value: unknown) {
  if (!Array.isArray(value)) return [] as Array<{ type: string; key: string }>;
  return value.map((item) => record(item)).map((item) => ({ type: text(item.type), key: text(item.key) })).filter((item) => item.type && item.key);
}


function actionForStage(stage: number, message: ConsoleMessage) {
  const explicit = text(message.metadata.activityAction);
  if (explicit) return explicit;
  if (stage === 1) return 'Elemzi a feladatot, a technikai scope-ot és a szükséges módosításokat.';
  if (stage === 2) return 'A kijelölt funkció kódját fejleszti és a kapcsolódó fájlokat módosítja.';
  if (stage === 3) return 'Célzott teszteket és regressziós ellenőrzéseket futtat az elkészült módosításon.';
  if (stage === 4) return 'A teszteredményeket ellenőrzi, hibát javít vagy minőségi felülvizsgálatot végez.';
  if (stage === 5) return 'TypeScript/lint/build kapukat futtat, és előkészíti a DEV release-t.';
  return 'Lezárja a fejlesztési munkarészt, rögzíti az eredményt és átadja a következő láncszemnek.';
}

function narrativeForMessage(message: ConsoleMessage, task: ConsoleTaskContext | null, stage: number) {
  const explicit = text(message.metadata.activityNarrative);
  if (explicit) return explicit;
  const parts: string[] = [actionForStage(stage, message)];
  const taskDescription = task?.description ? task.description.replace(/\s+/g, ' ').trim() : '';
  if (taskDescription && !message.detail) parts.push(`Feladatcél: ${taskDescription.slice(0, 420)}${taskDescription.length > 420 ? '…' : ''}`);
  if (message.detail) parts.push(message.detail);
  return parts.slice(0, 3).join(' ');
}

async function enrichMessagesWithTaskContext(client: SupabaseClient, messages: ConsoleMessage[]) {
  const taskIds = [...new Set(messages.map((message) => message.taskId).filter((value): value is string => Boolean(value)))];
  const taskMap = new Map<string, ConsoleTaskContext>();
  if (taskIds.length) {
    const taskResult = await client.from('dev_center_tasks').select('id,project_id,title,description,status,scope,metadata').in('id', taskIds);
    if (taskResult.error) throw new Error(taskResult.error.message || 'A fejlesztési task kontextusa nem tölthető be.');
    for (const raw of taskResult.data || []) {
      const row = raw as Row;
      const id = text(row.id);
      if (!id) continue;
      taskMap.set(id, {
        id,
        projectId: text(row.project_id),
        title: text(row.title),
        description: text(row.description),
        status: text(row.status),
        scope: scopeEntries(row.scope),
        metadata: record(row.metadata),
      });
    }
  }

  return messages.map((message) => {
    const task = message.taskId ? taskMap.get(message.taskId) || null : null;
    const hierarchy = task ? resolveTaskDevelopmentContext(task) : {
      projectId: text(message.metadata.projectId) || message.projectId || "",
      projectName: text(message.metadata.projectName),
      mainModule: text(message.metadata.mainModule),
      moduleName: text(message.metadata.moduleName),
      submoduleName: text(message.metadata.submoduleName),
      workItem: text(message.metadata.workItem),
    };
    const stage = stageForMessage(message);
    return {
      ...message,
      metadata: {
        ...(task?.metadata || {}),
        ...message.metadata,
        projectId: text(message.metadata.projectId) || (task ? hierarchy.projectId : message.projectId || ""),
        projectName: text(message.metadata.projectName) || (task ? hierarchy.projectName : ""),
        mainModule: text(message.metadata.mainModule) || hierarchy.mainModule,
        moduleName: text(message.metadata.moduleName) || hierarchy.moduleName,
        submoduleName: text(message.metadata.submoduleName) || hierarchy.submoduleName,
        workItem: text(message.metadata.workItem) || hierarchy.workItem,
        taskTitle: task?.title || text(message.metadata.taskTitle),
        taskStatus: task?.status || text(message.metadata.taskStatus),
        workStageIndex: stage,
        workStageLabel: text(message.metadata.workStageLabel) || DEVELOPMENT_STAGE_LABELS[stage],
        activityAction: actionForStage(stage, message),
        activityNarrative: narrativeForMessage(message, task, stage),
      },
    };
  });
}

export async function listDeveloperConsoleMessages(limit = 180) {
  const client = getClient();
  const safeLimit = Math.max(20, Math.min(240, Math.floor(limit)));
  const [worklog, audits] = await Promise.all([
    client.from("dev_center_live_worklog").select("id,task_id,worker_code,phase,level,summary,detail,progress_percent,source,metadata,created_at").order("created_at", { ascending: false }).limit(safeLimit),
    client.from("dev_center_audit_events").select("id,actor_type,actor_id,action,entity_type,entity_id,task_id,project_id,summary,metadata,created_at").order("created_at", { ascending: false }).limit(safeLimit),
  ]);
  if (worklog.error) throw new Error(worklog.error.message || "A fejlesztői konzol munkanaplója nem tölthető be.");
  if (audits.error) throw new Error(audits.error.message || "A fejlesztői konzol auditja nem tölthető be.");
  const messages = [
    ...(worklog.data || []).map((row) => mapWorklogRow(row as Row)),
    ...(audits.data || []).map((row) => mapAuditRow(row as Row)),
  ]
    .filter((item) => item.createdAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-safeLimit);
  return enrichMessagesWithTaskContext(client, messages);
}

export async function createBenjadminConsoleMessage(input: { text: string; target?: string; detail?: string; taskId?: string | null; projectId?: string | null; kind?: ConsoleMessageKind }) {
  const summary = text(input.text).slice(0, 4000);
  if (!summary) throw new Error("Az üzenet nem lehet üres.");
  const targetRaw = text(input.target).toUpperCase() || "BENAI";
  const target = (["BENAI", "ARMINAI", "JAZMINAI", "OUTMINAI", "EVERYONE"] as const).includes(targetRaw as ConsoleTarget) ? targetRaw as ConsoleTarget : "BENAI";
  const kind = input.kind || "INSTRUCTION";
  const client = getClient();
  const result = await client.from("dev_center_live_worklog").insert({
    worker_code: null,
    task_id: input.taskId || null,
    phase: kind === "DECISION" ? "decision" : "instruction",
    level: "info",
    summary,
    detail: text(input.detail).slice(0, 4000),
    progress_percent: null,
    source: "benjadmin",
    metadata: { target, kind, projectId: input.projectId || null, origin: "BENJADMIN_DEVELOPER_CONSOLE" },
  }).select("id,task_id,worker_code,phase,level,summary,detail,progress_percent,source,metadata,created_at").single();
  if (result.error || !result.data) throw new Error(result.error?.message || "A BENJADMIN üzenet nem rögzíthető.");
  return mapWorklogRow(result.data as Row);
}


export async function resolveDeveloperConsoleRepositoryId(projectId: string) {
  return resolveProjectRepositoryId(getClient(), projectId);
}

export async function createBenAiConsoleMessage(input: { summary: string; detail?: string; taskId?: string | null; projectId?: string | null; metadata?: Record<string, unknown>; kind?: ConsoleMessageKind; level?: ConsoleMessage["level"]; progressPercent?: number | null }) {
  const summary = text(input.summary).slice(0, 4000);
  if (!summary) throw new Error("A Ben-AI üzenet nem lehet üres.");
  const client = getClient();
  const result = await client.from("dev_center_live_worklog").insert({
    worker_code: "BENAI",
    task_id: input.taskId || null,
    phase: input.kind === "ERROR" ? "error" : input.kind === "TEST_RESULT" ? "test" : input.kind === "TASK_UPDATE" ? "task-update" : "coordination",
    level: input.level || (input.kind === "ERROR" ? "error" : "info"),
    summary,
    detail: text(input.detail).slice(0, 4000),
    progress_percent: input.progressPercent ?? null,
    source: "benai",
    metadata: { kind: input.kind || "TASK_ASSIGNMENT", projectId: input.projectId || null, origin: "BENJADMIN_DEVELOPER_CONSOLE", ...(input.metadata || {}) },
  }).select("id,task_id,worker_code,phase,level,summary,detail,progress_percent,source,metadata,created_at").single();
  if (result.error || !result.data) throw new Error(result.error?.message || "A Ben-AI koordinációs üzenet nem rögzíthető.");
  return mapWorklogRow(result.data as Row);
}

type WorkerPresenceView = {
  id: string;
  workerCode: string;
  active: boolean;
  state: "active" | "inactive";
  lifecycleState: "ACTIVE" | "ENDED" | "STALE" | "UNKNOWN";
  phase: string;
  summary: string;
  detail: string;
  taskId: string | null;
  projectId: string | null;
  mainModule: string;
  moduleName: string;
  submoduleName: string;
  workItem: string;
  operation: string | null;
  owner: string | null;
  worktree: string | null;
  branch: string | null;
  target: string | null;
  workStageIndex: number | null;
  startedAt: string | null;
  heartbeatAt: string | null;
  nextStep: string | null;
  buildLockWaiting: boolean;
  schedulerRunId: string | null;
  schedulerSlotAt: string | null;
  inferredBy: string;
  confidence: string;
  presenceKey: string | null;
  detectedAt: string;
  lastSeenAt: string;
  endedAt: string | null;
  endReason: string | null;
  source: string;
  createdAt: string;
  productionAccess: "DENY";
};

type WorkerPresenceTransitionView = {
  id: string;
  contextKey: string;
  fromWorkerCode: string;
  toWorkerCode: string;
  changedAt: string;
  reason: "TASK_HANDOFF" | "CONTEXT_HANDOFF";
  taskId: string | null;
  projectId: string | null;
  mainModule: string;
  moduleName: string;
  submoduleName: string;
  workItem: string;
};

function mapWorkerPresenceRow(row: Row, nowMs: number): WorkerPresenceView {
  const metadata = record(row.metadata);
  const createdAt = text(row.created_at);
  const detectedAt = text(metadata.detectedAt) || createdAt;
  const lastSeenAt = text(metadata.lastSeenAt) || createdAt;
  const lastSeenMs = Date.parse(lastSeenAt);
  const rawLifecycle = text(metadata.presenceState).toUpperCase();
  const active = rawLifecycle === "ACTIVE" && Number.isFinite(lastSeenMs) && nowMs - lastSeenMs <= 5 * 60_000;
  const lifecycleState: WorkerPresenceView["lifecycleState"] = active
    ? "ACTIVE"
    : rawLifecycle === "ENDED"
      ? "ENDED"
      : rawLifecycle === "ACTIVE"
        ? "STALE"
        : "UNKNOWN";
  return {
    id: text(row.id),
    workerCode: text(row.worker_code).toUpperCase(),
    active,
    state: active ? "active" : "inactive",
    lifecycleState,
    phase: text(row.phase),
    summary: text(row.summary),
    detail: text(row.detail),
    taskId: text(row.task_id) || null,
    projectId: text(metadata.projectId) || null,
    mainModule: text(metadata.mainModule),
    moduleName: text(metadata.moduleName),
    submoduleName: text(metadata.submoduleName),
    workItem: text(metadata.workItem),
    operation: text(metadata.operation) || null,
    owner: text(metadata.owner) || null,
    worktree: text(metadata.worktree) || null,
    branch: text(metadata.branch) || null,
    target: text(metadata.target) || null,
    workStageIndex: Number.isFinite(Number(metadata.workStageIndex)) ? Math.max(1, Math.min(6, Math.round(Number(metadata.workStageIndex)))) : null,
    startedAt: text(metadata.startedAt) || null,
    heartbeatAt: text(metadata.heartbeatAt) || null,
    nextStep: text(metadata.nextStep) || null,
    buildLockWaiting: metadata.buildLockWaiting === true,
    schedulerRunId: text(metadata.schedulerRunId) || null,
    schedulerSlotAt: text(metadata.schedulerSlotAt) || null,
    inferredBy: text(metadata.inferredBy),
    confidence: text(metadata.confidence),
    presenceKey: text(metadata.presenceKey) || null,
    detectedAt,
    lastSeenAt,
    endedAt: text(metadata.endedAt) || null,
    endReason: text(metadata.endReason) || (lifecycleState === "STALE" ? "TTL_EXPIRED" : null),
    source: text(row.source) || "worker-presence-bridge",
    createdAt,
    productionAccess: "DENY",
  };
}

function workerPresenceContextKey(presence: WorkerPresenceView) {
  if (presence.taskId) return `task:${presence.taskId}`;
  const normalize = (value: string) => value.trim().toLocaleLowerCase("hu-HU").replace(/\s+/g, " ");
  if (!presence.mainModule || !presence.moduleName || !presence.submoduleName || !presence.workItem) return "";
  return ["context", presence.projectId || "global", presence.mainModule, presence.moduleName, presence.submoduleName, presence.workItem]
    .map(normalize)
    .join(":");
}

function deriveWorkerPresenceTransitions(history: WorkerPresenceView[]): WorkerPresenceTransitionView[] {
  const lastByContext = new Map<string, WorkerPresenceView>();
  const transitions: WorkerPresenceTransitionView[] = [];
  const chronological = [...history].sort((a, b) => (a.detectedAt || a.createdAt).localeCompare(b.detectedAt || b.createdAt));
  for (const current of chronological) {
    const contextKey = workerPresenceContextKey(current);
    if (!contextKey || !current.workerCode) continue;
    const previous = lastByContext.get(contextKey);
    if (previous && previous.workerCode !== current.workerCode) {
      transitions.push({
        id: previous.id + ":" + current.id,
        contextKey,
        fromWorkerCode: previous.workerCode,
        toWorkerCode: current.workerCode,
        changedAt: current.detectedAt || current.createdAt,
        reason: current.taskId ? "TASK_HANDOFF" : "CONTEXT_HANDOFF",
        taskId: current.taskId,
        projectId: current.projectId,
        mainModule: current.mainModule,
        moduleName: current.moduleName,
        submoduleName: current.submoduleName,
        workItem: current.workItem,
      });
    }
    lastByContext.set(contextKey, current);
  }
  return transitions.sort((a, b) => b.changedAt.localeCompare(a.changedAt));
}

function buildWorkerPresenceTransitions(history: WorkerPresenceView[]): WorkerPresenceTransitionView[] {
  return deriveWorkerPresenceTransitions(history).slice(0, 30);
}

export async function getDeveloperConsoleLiveStatus() {
  const client = getClient();
  const [projects, workers, tasks, sessions, builds, releases, approvals, audits, presenceRows] = await Promise.all([
    client.from("dev_center_projects").select("id,name,slug,status,updated_at").order("name"),
    client.from("dev_center_workers").select("id,code,name,role,status,updated_at").order("code"),
    client.from("dev_center_tasks").select("id,project_id,title,description,status,priority,requested_worker_id,assigned_worker_id,claimed_by_session_id,branch_name,worktree_path,scope,acceptance,blocked_reason,started_at,completed_at,metadata,updated_at,created_at").order("updated_at", { ascending: false }).limit(80),
    client.from("dev_center_worker_sessions").select("id,worker_id,task_id,status,handshake_stage,branch_name,worktree_path,opened_at,updated_at,last_heartbeat_at").order("updated_at", { ascending: false }).limit(50),
    client.from("dev_center_build_runs").select("id,session_id,task_id,environment_id,run_type,status,command_name,git_commit,build_id,started_at,finished_at,duration_seconds,summary,created_at").order("created_at", { ascending: false }).limit(50),
    client.from("dev_center_releases").select("id,project_id,status,git_commit,build_id,approved_by,approved_at,released_at,created_at,updated_at").order("created_at", { ascending: false }).limit(30),
    client.from("dev_center_approvals").select("id,approval_type,target_environment,operation,status,requested_by,requested_at,approved_by,approved_at,expires_at,reason,metadata").order("requested_at", { ascending: false }).limit(30),
    client.from("dev_center_audit_events").select("id,actor_type,actor_id,action,entity_type,entity_id,task_id,project_id,summary,created_at").order("created_at", { ascending: false }).limit(60),
    client.from("dev_center_live_worklog").select("id,worker_code,task_id,phase,summary,detail,source,metadata,created_at").eq("source", "worker-presence-bridge").order("created_at", { ascending: false }).limit(120),
  ]);
  for (const result of [projects, workers, tasks, sessions, builds, releases, approvals, audits, presenceRows]) {
    if (result.error) throw new Error(result.error.message || "A fejlesztői konzol élő állapota nem tölthető be.");
  }
  const nowMs = Date.now();
  const workerPresenceHistory = (presenceRows.data || [])
    .map((raw) => mapWorkerPresenceRow(raw as Row, nowMs))
    .filter((item) => Boolean(item.id && item.workerCode))
    .slice(0, 80);
  const presenceLatest = new Map<string, WorkerPresenceView>();
  for (const item of workerPresenceHistory) {
    if (!presenceLatest.has(item.workerCode)) presenceLatest.set(item.workerCode, item);
  }
  const workerPresence = [...presenceLatest.values()];
  const workerTransitions = buildWorkerPresenceTransitions(workerPresenceHistory);
  return {
    projects: projects.data || [],
    workers: workers.data || [],
    tasks: tasks.data || [],
    sessions: sessions.data || [],
    builds: builds.data || [],
    releases: releases.data || [],
    approvals: approvals.data || [],
    audits: audits.data || [],
    workerPresence,
    workerPresenceHistory,
    workerTransitions,
    generatedAt: new Date().toISOString(),
    refreshIntervalMs: 1000,
  };
}

export async function getDeveloperConsoleRuntimeContext() {
  const root = resolveProjectRoot();
  const safeGit = async (args: string[]) => {
    try {
      const result = await execFileAsync("git", ["-C", root, ...args], { timeout: 4000, maxBuffer: 256 * 1024 });
      return result.stdout.trim();
    } catch {
      return "";
    }
  };
  const releaseIdentity = await resolveDeveloperConsoleReleaseIdentity(root);
  const [gitBranch, gitCommit] = await Promise.all([safeGit(["branch", "--show-current"]), safeGit(["rev-parse", "--short=12", "HEAD"])]);
  const branch = releaseIdentity.branch || gitBranch;
  const commit = releaseIdentity.commit || gitCommit;
  const buildId = releaseIdentity.buildId;
  let latestProductDoc = "";
  try {
    const docs = await readdir(path.join(root, "DIMPROVER_PRODUCT_DOCS"));
    latestProductDoc = docs.filter((name) => /^\d+_.*\.md$/i.test(name)).sort((a, b) => a.localeCompare(b, "hu", { numeric: true })).at(-1) || "";
  } catch { /* dokumentumtár nem elérhető */ }
  const bridge = getBenAiBridgeStatus();
  const executorReadiness = await getInternalExecutorReadiness(getClient());
  return {
    environment: "DEV",
    productionDefault: "READ_ONLY",
    hostname: hostname(),
    branch,
    commit,
    buildId,
    releaseIdentity: { distDir: releaseIdentity.distDir, metadataReady: releaseIdentity.metadataReady },
    worktree: root,
    latestProductDoc,
    aiBridge: { mode: bridge.mode, label: bridge.label, providerConfigured: bridge.providerConfigured, executorConfigured: bridge.executorConfigured },
    executorReadiness,
    generatedAt: new Date().toISOString(),
  };
}

export async function getDeveloperConsoleWorkspaceActivitySource() {
  const client = getClient();
  const [workers, tasks, sessions, audits] = await Promise.all([
    client.from("dev_center_workers")
      .select("id,code,name,role,status,updated_at")
      .order("code"),
    client.from("dev_center_tasks")
      .select("id,project_id,title,description,status,priority,assigned_worker_id,branch_name,worktree_path,scope,metadata,updated_at,created_at")
      .order("updated_at", { ascending: false })
      .limit(120),
    client.from("dev_center_worker_sessions")
      .select("id,worker_id,task_id,status,handshake_stage,branch_name,worktree_path,opened_at,updated_at,last_heartbeat_at,closed_at")
      .order("updated_at", { ascending: false })
      .limit(100),
    client.from("dev_center_audit_events")
      .select("id,actor_type,actor_id,action,entity_type,entity_id,task_id,project_id,summary,created_at")
      .order("created_at", { ascending: false })
      .limit(120),
  ]);
  for (const result of [workers, tasks, sessions, audits]) {
    if (result.error) throw new Error(result.error.message || "A Live Workspace worker activity adatforrás nem tölthető be.");
  }
  return {
    workers: workers.data || [],
    tasks: tasks.data || [],
    sessions: sessions.data || [],
    audits: audits.data || [],
    generatedAt: new Date().toISOString(),
  };
}

export type DeveloperWeeklySummary = {
  ready: true;
  period: {
    startAt: string;
    endAt: string;
    label: string;
    timezone: "Europe/Budapest";
    weekKey: string;
    currentWeekKey: string;
    previousWeekKey: string;
    nextWeekKey: string;
    isCurrentWeek: boolean;
  };
  projectId: string | null;
  stats: {
    activities: number;
    workers: number;
    contexts: number;
    openTasks: number;
    completedTasks: number;
    blockedTasks: number;
    builds: number;
    tests: number;
    errors: number;
  };
  workers: Array<{ code: string; name: string; activityCount: number; contextCount: number; latestAt: string; latestStage: number }>;
  contexts: Array<{
    key: string;
    projectId: string;
    projectName: string;
    mainModule: string;
    moduleName: string;
    submoduleName: string;
    workItem: string;
    activityCount: number;
    workers: string[];
    latestAt: string;
    latestStage: number;
    latestAction: string;
    stageCounts: Record<string, number>;
  }>;
  flowAnalytics: {
    schedulerReady: boolean;
    schedulerRuns: { total: number; completed: number; failed: number; readyForPull: number; workerActive: number; noTask: number; skipped: number; retries: number };
    handoffs: number;
    buildLockWaits: number;
    waitingForWorker: number;
    taskFailures: number;
    stageCounts: Record<string, number>;
    transitions: Array<{ fromWorkerCode: string; toWorkerCode: string; changedAt: string; reason: "TASK_HANDOFF" | "CONTEXT_HANDOFF"; workItem: string; projectId: string | null }>;
    blockers: Array<{ kind: "TASK_FAILED" | "WAITING_WORKER" | "BUILD_LOCK_WAIT" | "SCHEDULER_FAILED"; label: string; detail: string; at: string; workerCode: string | null; taskId: string | null; projectId: string | null }>;
    trend: {
      available: boolean;
      previousWeekKey: string;
      metrics: Array<{ key: "activities" | "completed" | "handoffs" | "waiting" | "errors"; label: string; current: number; previous: number; delta: number; deltaPercent: number | null; direction: "up" | "down" | "flat"; tone: "positive" | "negative" | "neutral" }>;
    };
    workerLoad: Array<{ code: string; activityCount: number; contextCount: number; handoffCount: number; waitCount: number; blockerCount: number; loadSharePercent: number; signal: "normal" | "watch" | "high"; previousActivityCount: number | null; activityDelta: number | null }>;
  };
  truncated: boolean;
  generatedAt: string;
  productionAccess: "DENY";
};

const WEEKLY_SUMMARY_TIMEZONE = "Europe/Budapest" as const;
const WEEKLY_SUMMARY_LIMIT = 1000;
const WEEKLY_WORKERS = new Set<ConsoleAuthor>(["BENAI", "ARMINAI", "JAZMINAI", "OUTMINAI", "MFORGE", "VGUARD"]);

function timezoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

function timezoneOffsetMs(date: Date, timeZone: string) {
  const parts = timezoneParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

function localMidnightUtc(year: number, month: number, day: number, timeZone: string) {
  const baseMs = Date.UTC(year, month - 1, day, 0, 0, 0);
  let result = new Date(baseMs);
  for (let index = 0; index < 3; index += 1) result = new Date(baseMs - timezoneOffsetMs(result, timeZone));
  return result;
}

function localDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function budapestWeekFromCalendarDate(year: number, month: number, day: number) {
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  const mondayShift = (calendarDate.getUTCDay() + 6) % 7;
  calendarDate.setUTCDate(calendarDate.getUTCDate() - mondayShift);
  const weekKey = localDateKey(calendarDate);
  const start = localMidnightUtc(calendarDate.getUTCFullYear(), calendarDate.getUTCMonth() + 1, calendarDate.getUTCDate(), WEEKLY_SUMMARY_TIMEZONE);
  const previous = new Date(calendarDate);
  previous.setUTCDate(previous.getUTCDate() - 7);
  const next = new Date(calendarDate);
  next.setUTCDate(next.getUTCDate() + 7);
  const end = localMidnightUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), WEEKLY_SUMMARY_TIMEZONE);
  const formatter = new Intl.DateTimeFormat("hu-HU", { timeZone: WEEKLY_SUMMARY_TIMEZONE, year: "numeric", month: "short", day: "2-digit" });
  const label = typeof formatter.formatRange === "function" ? formatter.formatRange(start, new Date(end.getTime() - 1)) : `${formatter.format(start)} – ${formatter.format(new Date(end.getTime() - 1))}`;
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    label,
    timezone: WEEKLY_SUMMARY_TIMEZONE,
    weekKey,
    previousWeekKey: localDateKey(previous),
    nextWeekKey: localDateKey(next),
  };
}

function budapestWeek(weekInput?: string | null, now = new Date()) {
  const localNow = timezoneParts(now, WEEKLY_SUMMARY_TIMEZONE);
  const current = budapestWeekFromCalendarDate(localNow.year, localNow.month, localNow.day);
  const raw = text(weekInput);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const requested = match
    ? budapestWeekFromCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
    : current;
  const selected = requested.weekKey > current.weekKey ? current : requested;
  return { ...selected, currentWeekKey: current.weekKey, isCurrentWeek: selected.weekKey === current.weekKey };
}

function weeklyContextKey(message: ConsoleMessage) {
  const metadata = record(message.metadata);
  return buildDevelopmentContextKey({
    projectId: text(metadata.projectId) || message.projectId,
    mainModule: metadata.mainModule,
    moduleName: metadata.moduleName,
    submoduleName: metadata.submoduleName,
    workItem: metadata.workItem,
  });
}

export async function getDeveloperConsoleWeeklySummary(projectIdInput?: string | null, weekInput?: string | null, includeComparison = true): Promise<DeveloperWeeklySummary> {
  const client = getClient();
  const projectId = text(projectIdInput) || null;
  const period = budapestWeek(weekInput);
  let openTaskQuery = client.from("dev_center_tasks")
    .select("id,project_id,title,status,blocked_reason,metadata,updated_at,completed_at,created_at")
    .in("status", ["queued", "ready", "claimed", "in_progress", "testing", "blocked", "failed"])
    .order("created_at", { ascending: false })
    .limit(WEEKLY_SUMMARY_LIMIT);
  let completedTaskQuery = client.from("dev_center_tasks")
    .select("id,project_id,status,completed_at,created_at")
    .eq("status", "completed")
    .gte("completed_at", period.startAt)
    .lt("completed_at", period.endAt)
    .order("completed_at", { ascending: false })
    .limit(WEEKLY_SUMMARY_LIMIT);
  if (projectId) {
    openTaskQuery = openTaskQuery.eq("project_id", projectId);
    completedTaskQuery = completedTaskQuery.eq("project_id", projectId);
  }
  const [worklog, audits, openTasks, completedTasks, workers, projects] = await Promise.all([
    client.from("dev_center_live_worklog")
      .select("id,task_id,worker_code,phase,level,summary,detail,progress_percent,source,metadata,created_at")
      .gte("created_at", period.startAt).lt("created_at", period.endAt).order("created_at", { ascending: true }).limit(WEEKLY_SUMMARY_LIMIT),
    client.from("dev_center_audit_events")
      .select("id,actor_type,actor_id,action,entity_type,entity_id,task_id,project_id,summary,metadata,created_at")
      .gte("created_at", period.startAt).lt("created_at", period.endAt).order("created_at", { ascending: true }).limit(WEEKLY_SUMMARY_LIMIT),
    openTaskQuery,
    completedTaskQuery,
    client.from("dev_center_workers").select("code,name").order("code"),
    client.from("dev_center_projects").select("id,name").order("name"),
  ]);
  for (const result of [worklog, audits, openTasks, completedTasks, workers, projects]) {
    if (result.error) throw new Error(result.error.message || "A heti fejlesztési összesítő adatforrása nem tölthető be.");
  }
  let schedulerSnapshot: Awaited<ReturnType<typeof getDevelopmentSchedulerSnapshot>> | null = null;
  try { schedulerSnapshot = await getDevelopmentSchedulerSnapshot(projectId); } catch { schedulerSnapshot = null; }
  const merged = [
    ...(worklog.data || []).map((row) => mapWorklogRow(row as Row)),
    ...(audits.data || []).map((row) => mapAuditRow(row as Row)),
  ].filter((message) => message.createdAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const enriched = await enrichMessagesWithTaskContext(client, merged);
  const messages = enriched.filter((message) => {
    if (!projectId) return true;
    return (text(message.metadata.projectId) || message.projectId || "") === projectId;
  });
  const workerNameMap = new Map((workers.data || []).map((row) => [text(row.code).toUpperCase(), text(row.name)]));
  const projectNameMap = new Map((projects.data || []).map((row) => [text(row.id), text(row.name)]));
  const contextMap = new Map<string, DeveloperWeeklySummary["contexts"][number]>();
  const workerMap = new Map<string, { code: string; name: string; activityCount: number; contextKeys: Set<string>; latestAt: string; latestStage: number }>();
  let builds = 0;
  let tests = 0;
  let errors = 0;
  const weeklyStageCounts: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
  for (const message of messages) {
    if (message.kind === "BUILD_EVENT") builds += 1;
    if (message.kind === "TEST_RESULT") tests += 1;
    if (message.kind === "ERROR" || message.level === "error") errors += 1;
    const metadata = record(message.metadata);
    const stage = safeDevelopmentStage(metadata.workStageIndex) || stageForMessage(message);
    const contextKey = weeklyContextKey(message);
    if (contextKey) {
      const messageProjectId = text(metadata.projectId) || message.projectId || "";
      const current = contextMap.get(contextKey) || {
        key: contextKey,
        projectId: messageProjectId,
        projectName: text(metadata.projectName) || projectNameMap.get(messageProjectId) || messageProjectId || "DIMPRO",
        mainModule: text(metadata.mainModule) || "DIMPRO",
        moduleName: text(metadata.moduleName) || "Fejlesztési munkarész",
        submoduleName: text(metadata.submoduleName) || "Aktuális funkció",
        workItem: text(metadata.workItem) || text(message.summary) || "Aktuális munkarész",
        activityCount: 0,
        workers: [],
        latestAt: "",
        latestStage: 1,
        latestAction: "",
        stageCounts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 },
      };
      current.activityCount += 1;
      current.stageCounts[String(stage)] = (current.stageCounts[String(stage)] || 0) + 1;
      weeklyStageCounts[String(stage)] = (weeklyStageCounts[String(stage)] || 0) + 1;
      if (!current.latestAt || message.createdAt >= current.latestAt) {
        current.latestAt = message.createdAt;
        current.latestStage = stage;
        current.latestAction = text(metadata.activityAction) || message.summary;
      }
      if (WEEKLY_WORKERS.has(message.author) && !current.workers.includes(message.author)) current.workers.push(message.author);
      contextMap.set(contextKey, current);
    }
    if (WEEKLY_WORKERS.has(message.author)) {
      const code = message.author;
      const current = workerMap.get(code) || { code, name: workerNameMap.get(code) || code, activityCount: 0, contextKeys: new Set<string>(), latestAt: "", latestStage: 1 };
      current.activityCount += 1;
      if (contextKey) current.contextKeys.add(contextKey);
      if (!current.latestAt || message.createdAt >= current.latestAt) {
        current.latestAt = message.createdAt;
        current.latestStage = stage;
      }
      workerMap.set(code, current);
    }
  }
  const contexts = [...contextMap.values()]
    .map((item) => ({ ...item, workers: [...item.workers].sort() }))
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt) || b.activityCount - a.activityCount);
  const workerSummary = [...workerMap.values()]
    .map((item) => ({ code: item.code, name: item.name, activityCount: item.activityCount, contextCount: item.contextKeys.size, latestAt: item.latestAt, latestStage: item.latestStage }))
    .sort((a, b) => b.activityCount - a.activityCount || a.code.localeCompare(b.code));
  const inPeriod = (value: string | null | undefined) => Boolean(value && value >= period.startAt && value < period.endAt);
  const schedulerRuns = schedulerSnapshot?.ready
    ? schedulerSnapshot.runs.filter((run) => inPeriod(run.slotAt || run.startedAt || run.createdAt))
    : [];
  const schedulerRunStats = {
    total: schedulerRuns.length,
    completed: schedulerRuns.filter((run) => run.status === "completed").length,
    failed: schedulerRuns.filter((run) => run.status === "failed").length,
    readyForPull: schedulerRuns.filter((run) => run.status === "ready_for_pull").length,
    workerActive: schedulerRuns.filter((run) => run.status === "worker_active").length,
    noTask: schedulerRuns.filter((run) => run.status === "no_task").length,
    skipped: schedulerRuns.filter((run) => run.status === "skipped").length,
    retries: schedulerRuns.reduce((sum, run) => sum + Math.max(0, Number(run.attemptCount || 1) - 1), 0),
  };
  const weeklyPresenceHistory = (worklog.data || [])
    .filter((row) => text((row as Row).source) === "worker-presence-bridge")
    .map((row) => mapWorkerPresenceRow(row as Row, Date.now()))
    .filter((item) => !projectId || item.projectId === projectId);
  const weeklyTransitions = deriveWorkerPresenceTransitions(weeklyPresenceHistory)
    .filter((item) => inPeriod(item.changedAt))
    .filter((item) => !projectId || item.projectId === projectId);
  const buildLockWaits = weeklyPresenceHistory.filter((item) => item.buildLockWaiting);
  const relevantAudits = (audits.data || []).filter((raw) => {
    const row = raw as Row;
    return !projectId || text(row.project_id) === projectId;
  });
  const waitingAudits = relevantAudits.filter((raw) => text((raw as Row).action) === "TASK_BENAI_WAITING_FOR_WORKER");
  const failedAudits = relevantAudits.filter((raw) => text((raw as Row).action) === "TASK_FAILED");
  const blockers: DeveloperWeeklySummary["flowAnalytics"]["blockers"] = [];
  for (const raw of failedAudits) {
    const row = raw as Row;
    const meta = record(row.metadata);
    blockers.push({ kind: "TASK_FAILED", label: text(row.summary) || "Task hibával leállt", detail: text(meta.note) || "Task blokkolt / sikertelen.", at: text(row.created_at), workerCode: text(meta.workerCode) || null, taskId: text(row.task_id) || null, projectId: text(row.project_id) || null });
  }
  for (const raw of waitingAudits) {
    const row = raw as Row;
    blockers.push({ kind: "WAITING_WORKER", label: text(row.summary) || "Workerre várakozó task", detail: "Ben-AI várólista: nincs szabad, jogosult worker.", at: text(row.created_at), workerCode: null, taskId: text(row.task_id) || null, projectId: text(row.project_id) || null });
  }
  for (const item of buildLockWaits) {
    blockers.push({ kind: "BUILD_LOCK_WAIT", label: item.summary || "Build lock várakozás", detail: item.nextStep || "Közös build lock felszabadulására vár.", at: item.detectedAt || item.createdAt, workerCode: item.workerCode || null, taskId: item.taskId, projectId: item.projectId });
  }
  for (const run of schedulerRuns.filter((item) => item.status === "failed")) {
    blockers.push({ kind: "SCHEDULER_FAILED", label: run.summary || "Scheduler futás hibázott", detail: "Scheduler run sikertelen · próbálkozás: " + String(run.attemptCount || 1), at: run.finishedAt || run.startedAt || run.slotAt, workerCode: run.workerCode || null, taskId: run.taskId, projectId });
  }
  blockers.sort((a, b) => b.at.localeCompare(a.at));
  const totalWorkerActivities = workerSummary.reduce((sum, worker) => sum + worker.activityCount, 0);
  const workerLoad: DeveloperWeeklySummary["flowAnalytics"]["workerLoad"] = workerSummary.map((worker) => {
    const handoffCount = weeklyTransitions.filter((item) => item.fromWorkerCode === worker.code || item.toWorkerCode === worker.code).length;
    const waitCount = buildLockWaits.filter((item) => item.workerCode === worker.code).length;
    const blockerCount = blockers.filter((item) => item.workerCode === worker.code && item.kind !== "BUILD_LOCK_WAIT").length;
    const loadSharePercent = totalWorkerActivities ? Math.round((worker.activityCount / totalWorkerActivities) * 100) : 0;
    const signal = blockerCount >= 2 || waitCount >= 2 || (workerSummary.length >= 2 && loadSharePercent >= 60 && worker.activityCount >= 20)
      ? "high"
      : blockerCount > 0 || waitCount > 0 || handoffCount >= 3 || (workerSummary.length >= 2 && loadSharePercent >= 45)
        ? "watch"
        : "normal";
    return { code: worker.code, activityCount: worker.activityCount, contextCount: worker.contextCount, handoffCount, waitCount, blockerCount, loadSharePercent, signal, previousActivityCount: null, activityDelta: null };
  });
  const flowAnalytics: DeveloperWeeklySummary["flowAnalytics"] = {
    schedulerReady: Boolean(schedulerSnapshot?.ready),
    schedulerRuns: schedulerRunStats,
    handoffs: weeklyTransitions.length,
    buildLockWaits: buildLockWaits.length,
    waitingForWorker: waitingAudits.length,
    taskFailures: failedAudits.length,
    stageCounts: weeklyStageCounts,
    transitions: weeklyTransitions.slice(0, 8).map((item) => ({ fromWorkerCode: item.fromWorkerCode, toWorkerCode: item.toWorkerCode, changedAt: item.changedAt, reason: item.reason, workItem: item.workItem, projectId: item.projectId })),
    blockers: blockers.slice(0, 8),
    trend: { available: false, previousWeekKey: period.previousWeekKey, metrics: [] },
    workerLoad,
  };
  const summary: DeveloperWeeklySummary = {
    ready: true,
    period,
    projectId,
    stats: {
      activities: messages.length,
      workers: workerSummary.length,
      contexts: contexts.length,
      openTasks: (openTasks.data || []).length,
      completedTasks: (completedTasks.data || []).length,
      blockedTasks: (openTasks.data || []).filter((row) => text(row.status) === "blocked").length,
      builds,
      tests,
      errors,
    },
    workers: workerSummary,
    contexts,
    flowAnalytics,
    truncated: [worklog, audits, openTasks, completedTasks].some((result) => (result.data || []).length >= WEEKLY_SUMMARY_LIMIT),
    generatedAt: new Date().toISOString(),
    productionAccess: "DENY",
  };
  if (includeComparison) {
    try {
      const previous = await getDeveloperConsoleWeeklySummary(projectId, period.previousWeekKey, false);
      const previousWorkers = new Map(previous.workers.map((worker) => [worker.code, worker.activityCount]));
      summary.flowAnalytics.workerLoad = summary.flowAnalytics.workerLoad.map((worker) => {
        const previousActivityCount = previousWorkers.get(worker.code) ?? 0;
        return { ...worker, previousActivityCount, activityDelta: worker.activityCount - previousActivityCount };
      });
      const currentWaiting = flowAnalytics.buildLockWaits + flowAnalytics.waitingForWorker;
      const previousWaiting = previous.flowAnalytics.buildLockWaits + previous.flowAnalytics.waitingForWorker;
      const metric = (key: "activities" | "completed" | "handoffs" | "waiting" | "errors", label: string, current: number, prior: number, preference: "higher" | "lower" | "neutral") => {
        const delta = current - prior;
        const direction = delta > 0 ? "up" as const : delta < 0 ? "down" as const : "flat" as const;
        const deltaPercent = prior > 0 ? Math.round((delta / prior) * 100) : current > 0 ? null : 0;
        const tone = preference === "neutral" || delta === 0 ? "neutral" as const : preference === "higher" ? (delta > 0 ? "positive" as const : "negative" as const) : (delta < 0 ? "positive" as const : "negative" as const);
        return { key, label, current, previous: prior, delta, deltaPercent, direction, tone };
      };
      summary.flowAnalytics.trend = {
        available: true,
        previousWeekKey: previous.period.weekKey,
        metrics: [
          metric("activities", "Aktivitás", summary.stats.activities, previous.stats.activities, "neutral"),
          metric("completed", "Lezárt task", summary.stats.completedTasks, previous.stats.completedTasks, "higher"),
          metric("handoffs", "Átadás", flowAnalytics.handoffs, previous.flowAnalytics.handoffs, "neutral"),
          metric("waiting", "Várakozás", currentWaiting, previousWaiting, "lower"),
          metric("errors", "Hiba", summary.stats.errors + flowAnalytics.taskFailures, previous.stats.errors + previous.flowAnalytics.taskFailures, "lower"),
        ],
      };
    } catch {
      summary.flowAnalytics.trend = { available: false, previousWeekKey: period.previousWeekKey, metrics: [] };
    }
  }
  return summary;
}

export type DeveloperConsoleMessagePage = {
  messages: ConsoleMessage[];
  page: {
    limit: number;
    before: string | null;
    oldestAt: string | null;
    newestAt: string | null;
    hasMore: boolean;
  };
};

export async function listDeveloperConsoleMessagesPage(input: { limit?: number; before?: string | null } = {}): Promise<DeveloperConsoleMessagePage> {
  const client = getClient();
  const safeLimit = Math.max(20, Math.min(240, Math.floor(input.limit || 180)));
  const fetchLimit = safeLimit + 1;
  const before = text(input.before) || null;
  let worklogQuery = client.from("dev_center_live_worklog")
    .select("id,task_id,worker_code,phase,level,summary,detail,progress_percent,source,metadata,created_at")
    .order("created_at", { ascending: false })
    .limit(fetchLimit);
  let auditQuery = client.from("dev_center_audit_events")
    .select("id,actor_type,actor_id,action,entity_type,entity_id,task_id,project_id,summary,metadata,created_at")
    .order("created_at", { ascending: false })
    .limit(fetchLimit);
  if (before) {
    worklogQuery = worklogQuery.lt("created_at", before);
    auditQuery = auditQuery.lt("created_at", before);
  }
  const [worklog, audits] = await Promise.all([worklogQuery, auditQuery]);
  if (worklog.error) throw new Error(worklog.error.message || "A fejlesztői konzol munkanaplója nem tölthető be.");
  if (audits.error) throw new Error(audits.error.message || "A fejlesztői konzol auditja nem tölthető be.");
  const merged = [
    ...(worklog.data || []).map((row) => mapWorklogRow(row as Row)),
    ...(audits.data || []).map((row) => mapAuditRow(row as Row)),
  ]
    .filter((item) => item.createdAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const messages = await enrichMessagesWithTaskContext(client, merged.slice(-safeLimit));
  return {
    messages,
    page: {
      limit: safeLimit,
      before,
      oldestAt: messages[0]?.createdAt || null,
      newestAt: messages.at(-1)?.createdAt || null,
      hasMore: merged.length > safeLimit || (worklog.data || []).length >= fetchLimit || (audits.data || []).length >= fetchLimit,
    },
  };
}

async function syncTaskDevelopmentContext(client: SupabaseClient, input: {
  taskId: string;
  message: ConsoleMessage;
  metadata: Record<string, unknown>;
}) {
  const taskResult = await client.from("dev_center_tasks").select("id,project_id,title,description,status,scope,metadata").eq("id", input.taskId).maybeSingle();
  if (taskResult.error || !taskResult.data) return false;
  const row = taskResult.data as Row;
  const task: ConsoleTaskContext = {
    id: text(row.id), projectId: text(row.project_id), title: text(row.title), description: text(row.description), status: text(row.status),
    scope: scopeEntries(row.scope), metadata: record(row.metadata),
  };
  const hierarchy = resolveTaskDevelopmentContext(task);
  const stage = stageForMessage(input.message);
  const currentMeta = record(row.metadata);
  const developmentContext = {
    projectId: text(input.metadata.projectId) || hierarchy.projectId,
    projectName: text(input.metadata.projectName) || hierarchy.projectName,
    mainModule: text(input.metadata.mainModule) || hierarchy.mainModule,
    moduleName: text(input.metadata.moduleName) || hierarchy.moduleName,
    submoduleName: text(input.metadata.submoduleName) || hierarchy.submoduleName,
    workItem: text(input.metadata.workItem) || hierarchy.workItem,
    activityAction: text(input.metadata.activityAction) || actionForStage(stage, input.message),
    activityNarrative: text(input.metadata.activityNarrative) || narrativeForMessage(input.message, task, stage),
    workStageIndex: stage,
    workStageLabel: text(input.metadata.workStageLabel) || DEVELOPMENT_STAGE_LABELS[stage],
    source: "WORKER_ACTIVITY",
    workerCode: input.message.author,
    updatedAt: input.message.createdAt || new Date().toISOString(),
    productionAccess: "DENY",
  };
  const update = await client.from("dev_center_tasks").update({ metadata: { ...currentMeta, developmentContext }, updated_at: new Date().toISOString() }).eq("id", input.taskId);
  return !update.error;
}

export async function createWorkerActivityConsoleMessage(input: {
  workerCode: string;
  taskId?: string | null;
  projectId?: string | null;
  phase: string;
  kind: ConsoleMessageKind;
  summary: string;
  detail?: string;
  level?: ConsoleMessage["level"];
  progressPercent?: number | null;
  metadata?: Record<string, unknown>;
}) {
  const workerCode = text(input.workerCode).toUpperCase();
  if (!["BENAI", "ARMINAI", "JAZMINAI", "OUTMINAI", "MFORGE", "VGUARD"].includes(workerCode)) throw new Error("Ismeretlen worker kód.");
  const summary = text(input.summary).slice(0, 4000);
  if (!summary) throw new Error("A worker activity összefoglaló nem lehet üres.");
  const client = getClient();
  const inputMetadata = input.metadata || {};
  const dedupeKey = [
    workerCode,
    text(input.phase).toLowerCase(),
    input.kind,
    text(input.taskId),
    text(input.projectId),
    summary.replace(/\s+/g, " ").toLowerCase(),
    text(input.detail).replace(/\s+/g, " ").toLowerCase(),
    text(inputMetadata.workStageIndex),
    text(inputMetadata.activityAction),
    text(inputMetadata.activityNarrative),
    text(inputMetadata.mainModule),
    text(inputMetadata.moduleName),
    text(inputMetadata.submoduleName),
    text(inputMetadata.workItem),
  ].join("|");
  const recent = await client.from("dev_center_live_worklog")
    .select("id,task_id,worker_code,phase,level,summary,detail,progress_percent,source,metadata,created_at")
    .eq("source", "worker-activity")
    .eq("worker_code", workerCode)
    .order("created_at", { ascending: false })
    .limit(1);
  if (!recent.error && recent.data?.[0]) {
    const previous = recent.data[0] as Row;
    const previousMeta = record(previous.metadata);
    const previousAt = Date.parse(text(previous.created_at));
    if (text(previousMeta.activityDedupeKey) === dedupeKey && Number.isFinite(previousAt) && Date.now() - previousAt <= 30 * 60_000) {
      return mapWorklogRow(previous);
    }
  }
  const result = await client.from("dev_center_live_worklog").insert({
    worker_code: workerCode,
    task_id: input.taskId || null,
    phase: text(input.phase).slice(0, 80) || "development",
    level: input.level || "info",
    summary,
    detail: text(input.detail).slice(0, 8000),
    progress_percent: input.progressPercent == null ? null : Math.max(0, Math.min(100, Math.round(input.progressPercent))),
    source: "worker-activity",
    metadata: {
      kind: input.kind,
      projectId: input.projectId || null,
      origin: "BENJADMIN_WORKER_ACTIVITY",
      ...inputMetadata,
      activityDedupeKey: dedupeKey,
      productionAccess: "DENY",
    },
  }).select("id,task_id,worker_code,phase,level,summary,detail,progress_percent,source,metadata,created_at").single();
  if (result.error || !result.data) throw new Error(result.error?.message || "A worker activity nem rögzíthető.");
  const message = mapWorklogRow(result.data as Row);
  if (input.taskId) await syncTaskDevelopmentContext(client, { taskId: input.taskId, message, metadata: input.metadata || {} }).catch(() => false);
  return message;
}
