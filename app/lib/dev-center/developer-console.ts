import { execFile } from "node:child_process";
import { hostname } from "node:os";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getBenAiBridgeStatus } from "./benai-dispatch";
import { resolveProjectRepositoryId } from "./partner-isolation";
import { getInternalExecutorReadiness } from "./internal-executor-readiness";

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

function auditAuthor(row: Row): ConsoleAuthor {
  const actor = text(row.actor_id).toUpperCase().replace(/[^A-Z]/g, "");
  if (actor === "BENJADMIN") return "BENJADMIN";
  if (actor === "BENAI") return "BENAI";
  if (actor === "ARMINAI") return "ARMINAI";
  if (actor === "JAZMINAI") return "JAZMINAI";
  if (actor === "OUTMINAI") return "OUTMINAI";
  if (actor === "MFORGE" || actor === "MFORGEAI") return "MFORGE";
  if (actor === "VGUARD" || actor === "VGUARDAI") return "VGUARD";
  const action = text(row.action).toUpperCase();
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

const WORK_STAGE_LABELS = ["", "ELEMZÉS / ELŐKÉSZÍTÉS", "FEJLESZTÉS", "TESZTELÉS", "ELLENŐRZÉS / JAVÍTÁS", "BUILD / KIADÁS", "LEZÁRÁS / ÁTADÁS"] as const;

function safeStageIndex(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(6, Math.round(numeric))) : 0;
}

function stageForMessage(message: ConsoleMessage) {
  const explicit = safeStageIndex(message.metadata.workStageIndex);
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

function inferHierarchy(task: ConsoleTaskContext) {
  const meta = task.metadata;
  const haystack = `${task.title} ${task.description}`.toLowerCase();
  let mainModule = text(meta.mainModule || meta.main_module || meta.productArea || meta.product);
  let moduleName = text(meta.moduleName || meta.module || meta.module_name || meta.moduleHint);
  let submoduleName = text(meta.submoduleName || meta.submodule || meta.sub_module || meta.featureArea);
  const workItem = text(meta.workItem || meta.work_item || meta.currentWorkItem) || task.title;

  if (!mainModule) {
    if (haystack.includes('benjadmin')) mainModule = 'BENJADMIN';
    else if (haystack.includes('gyorssend') || haystack.includes('gyorskép') || haystack.includes('drop')) mainModule = 'DIMPRO Drop';
    else if (haystack.includes('drive')) mainModule = 'DIMPRO Drive';
    else if (haystack.includes('fájlműhely') || haystack.includes('fajlmuhely')) mainModule = 'DIMPRO Fájlműhely';
    else if (haystack.includes('projektkapu')) mainModule = 'DIMPROVER Projektkapu';
    else if (haystack.includes('értekez') || haystack.includes('teams')) mainModule = 'DIMPRO Értekezleti Asszisztens';
    else mainModule = task.projectId === 'project_dimprover' ? 'DIMPROVER' : task.projectId || 'DIMPRO';
  }

  if (!moduleName) {
    if (mainModule === 'BENJADMIN') {
      if (haystack.includes('scheduler') || haystack.includes('éjszak') || haystack.includes('ébreszt')) moduleName = 'Fejlesztési ütemező';
      else if (haystack.includes('worker') || haystack.includes('live workspace')) moduleName = 'AI Fejlesztői Tér';
      else moduleName = 'Fejlesztői Konzol';
    } else if (mainModule === 'DIMPRO Drop') moduleName = haystack.includes('gyors') ? 'GyorsSend / Gyorskép' : 'Drop Core';
    else if (mainModule === 'DIMPRO Drive') moduleName = 'Drive munkatér';
    else moduleName = 'Fejlesztési munkarész';
  }

  if (!submoduleName) {
    if (haystack.includes('közös fejlesztői') || haystack.includes('worker context') || haystack.includes('kárty')) submoduleName = 'Közös fejlesztői csevegés';
    else if (haystack.includes('voice') || haystack.includes('diktál')) submoduleName = 'Hang / diktálás';
    else if (haystack.includes('multipart') || haystack.includes('upload') || haystack.includes('feltölt')) submoduleName = 'Feltöltési folyamat';
    else if (haystack.includes('scheduler') || haystack.includes('éjszak')) submoduleName = 'Éjszakai / órás futási lánc';
    else if (haystack.includes('pwa')) submoduleName = 'PWA';
    else if (haystack.includes('chat') || haystack.includes('cseveg')) submoduleName = 'Csevegés és aktivitás';
    else {
      const moduleScope = task.scope.find((item) => item.type === 'module');
      const pathScope = task.scope.find((item) => item.type === 'path');
      submoduleName = moduleScope?.key || pathScope?.key || 'Aktuális funkció';
    }
  }
  return { mainModule, moduleName, submoduleName, workItem };
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
    const hierarchy = task ? inferHierarchy(task) : {
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
        mainModule: text(message.metadata.mainModule) || hierarchy.mainModule,
        moduleName: text(message.metadata.moduleName) || hierarchy.moduleName,
        submoduleName: text(message.metadata.submoduleName) || hierarchy.submoduleName,
        workItem: text(message.metadata.workItem) || hierarchy.workItem,
        taskTitle: task?.title || text(message.metadata.taskTitle),
        taskStatus: task?.status || text(message.metadata.taskStatus),
        workStageIndex: stage,
        workStageLabel: text(message.metadata.workStageLabel) || WORK_STAGE_LABELS[stage],
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

export async function getDeveloperConsoleLiveStatus() {
  const client = getClient();
  const [projects, workers, tasks, sessions, builds, releases, approvals, audits] = await Promise.all([
    client.from("dev_center_projects").select("id,name,slug,status,updated_at").order("name"),
    client.from("dev_center_workers").select("id,code,name,role,status,updated_at").order("code"),
    client.from("dev_center_tasks").select("id,project_id,title,description,status,priority,requested_worker_id,assigned_worker_id,claimed_by_session_id,branch_name,worktree_path,scope,acceptance,blocked_reason,started_at,completed_at,metadata,updated_at,created_at").order("updated_at", { ascending: false }).limit(80),
    client.from("dev_center_worker_sessions").select("id,worker_id,task_id,status,handshake_stage,branch_name,worktree_path,opened_at,updated_at,last_heartbeat_at").order("updated_at", { ascending: false }).limit(50),
    client.from("dev_center_build_runs").select("id,session_id,task_id,environment_id,run_type,status,command_name,git_commit,build_id,started_at,finished_at,duration_seconds,summary,created_at").order("created_at", { ascending: false }).limit(50),
    client.from("dev_center_releases").select("id,project_id,status,git_commit,build_id,approved_by,approved_at,released_at,created_at,updated_at").order("created_at", { ascending: false }).limit(30),
    client.from("dev_center_approvals").select("id,approval_type,target_environment,operation,status,requested_by,requested_at,approved_by,approved_at,expires_at,reason,metadata").order("requested_at", { ascending: false }).limit(30),
    client.from("dev_center_audit_events").select("id,actor_type,actor_id,action,entity_type,entity_id,task_id,project_id,summary,created_at").order("created_at", { ascending: false }).limit(60),
  ]);
  for (const result of [projects, workers, tasks, sessions, builds, releases, approvals, audits]) {
    if (result.error) throw new Error(result.error.message || "A fejlesztői konzol élő állapota nem tölthető be.");
  }
  return {
    projects: projects.data || [],
    workers: workers.data || [],
    tasks: tasks.data || [],
    sessions: sessions.data || [],
    builds: builds.data || [],
    releases: releases.data || [],
    approvals: approvals.data || [],
    audits: audits.data || [],
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
      .select("id,project_id,title,status,priority,assigned_worker_id,branch_name,worktree_path,updated_at,created_at")
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
      productionAccess: "DENY",
      ...(input.metadata || {}),
    },
  }).select("id,task_id,worker_code,phase,level,summary,detail,progress_percent,source,metadata,created_at").single();
  if (result.error || !result.data) throw new Error(result.error?.message || "A worker activity nem rögzíthető.");
  return mapWorklogRow(result.data as Row);
}
