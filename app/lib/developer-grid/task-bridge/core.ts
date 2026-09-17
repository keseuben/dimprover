"server-only";

import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ensureDeveloperGridCodingWorkerRegistry, openDevEngineSession, advanceDevEngineSession, createDevEngineTask, assertDevEngineOperation, setDevEngineTaskTesting, finalizeDevEngineTask } from "@/app/lib/dev-center/engine-repository";
import { acquireScopeBundleAtomic, claimTaskAtomic, releaseSessionAtomic } from "@/app/lib/dev-center/orchestration-repository";
import { getInternalExecutorReadiness } from "@/app/lib/dev-center/internal-executor-readiness";
import { resolveProjectRepositoryId, resolveDevelopmentPlane } from "@/app/lib/dev-center/partner-isolation";
import { isSensitivePath, scanSensitiveText } from "@/app/lib/dev-center/ai-worker/secret-scanner";
import { classifyScopePath } from "@/app/lib/dev-center/ai-worker/scope-policy";
import { prepareTaskBridgeWorkspace, removeTaskBridgeWorkspace, taskBridgeBranchName, taskBridgeWorktreePath, inspectTaskBridgeGit } from "./workspace";
import type { WorkerExecutionMode, WorkerProviderFamily } from "../types";

export const TASK_BRIDGE_SCHEMA = "dimpro.task-bridge.v1" as const;
export const TASK_BRIDGE_RESULT_SCHEMA = "dimpro.task-bridge.result.v1" as const;
export const TASK_BRIDGE_REVIEW_SCHEMA = "dimpro.task-bridge.review.v1" as const;
export const TASK_BRIDGE_ACCEPTANCE_SCHEMA = "dimpro.task-bridge.acceptance.v1" as const;
export type TaskBridgeProviderFamily = Extract<WorkerProviderFamily, "OPENAI_FIRST_PARTY">;
export type TaskBridgeSurface = "CODEX";
export type TaskBridgeExecutionMode = Extract<WorkerExecutionMode, "TASK_BRIDGE">;
export type TaskBridgeWorkerCode = "ARMINAI" | "OUTMINAI" | "BENJAMINAI" | "JAZMINAI";
export type TaskBridgeState = "DRAFT" | "READY_FOR_WORKER" | "WORKER_RUNNING" | "WORKER_COMPLETED" | "REVIEW_PENDING" | "REVIEW_IN_PROGRESS" | "REVIEW_PASS" | "REVIEW_CHANGES_REQUESTED" | "BUILD_PENDING" | "BUILD_RUNNING" | "BUILD_PASS" | "DEV_ACCEPTANCE_PENDING" | "DEV_ACCEPTANCE_PASS" | "CLOSED" | "ERROR";

const WORKER_IDS: Record<TaskBridgeWorkerCode, string> = {
  ARMINAI: "worker_arminai",
  OUTMINAI: "worker_outminai",
  BENJAMINAI: "worker_benjaminai",
  JAZMINAI: "worker_jazminai",
};
const TASK_ROOT_REL = ".devgrid/tasks";
const MAX_RESULT_BYTES = 1024 * 1024;

function dbClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("A DEV adatbázis-kapcsolat nincs konfigurálva.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { "x-client-info": "dimpro-developer-grid-task-bridge/0.1.46" } } });
}
function text(value: unknown, max = 12000) { return String(value ?? "").trim().slice(0, max); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function sha(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function fail(message: string, code: string, status = 409): never { const error = new Error(message); Object.assign(error, { code, status }); throw error; }
function workerCode(value: unknown): TaskBridgeWorkerCode {
  const code = text(value, 40).toUpperCase();
  if (code === "BENAI") return "BENJAMINAI";
  if (["ARMINAI", "OUTMINAI", "BENJAMINAI", "JAZMINAI"].includes(code)) return code as TaskBridgeWorkerCode;
  return fail("A Task Bridge explicit Developer Grid workert igényel.", "TASK_BRIDGE_WORKER_INVALID", 400);
}
function normalizedScope(value: unknown) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\r\n,;]+/) : [];
  const result = [...new Set(raw.map((item) => text(typeof item === "string" ? item : record(item).key, 600).replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/g, "")).filter(Boolean))];
  if (!result.length) fail("A Codex Task Bridge indításához legalább egy engedélyezett path-scope kötelező.", "TASK_BRIDGE_SCOPE_REQUIRED", 400);
  for (const item of result) {
    if (path.posix.isAbsolute(item) || item.startsWith("../") || item.includes("/../") || item === ".git" || item.startsWith(".git/") || isSensitivePath(item)) {
      fail(`Tiltott vagy érzékeny Task Bridge scope: ${item}`, "TASK_BRIDGE_SCOPE_INVALID", 400);
    }
    const policy = classifyScopePath(item);
    if (policy.riskLevel === "RED" || /^supabase\/migrations(?:\/|$)/i.test(item)) {
      fail(`A Task Bridge V1 nem írhat RED/migration scope-ba: ${item}`, "TASK_BRIDGE_SCOPE_POLICY_DENIED", 403);
    }
  }
  return result.slice(0, 64);
}
function inScope(filePath: string, allowedPaths: string[]) {
  const p = filePath.replaceAll("\\", "/").replace(/^\.\//, "");
  return allowedPaths.some((allowed) => p === allowed || p.startsWith(`${allowed}/`));
}
function taskIdFor(key: string) { return `dev-task-bridge-${sha(`CODEX:${key}`).slice(0, 20)}`; }
function taskDirectory(worktreePath: string, taskId: string) { return path.join(worktreePath, TASK_ROOT_REL, taskId); }

async function appendAudit(taskDir: string, event: Record<string, unknown>) {
  const line = `${JSON.stringify({ at: new Date().toISOString(), environment: "DEV", productionAccess: "DENY", ...event })}\n`;
  await appendFile(path.join(taskDir, "audit.jsonl"), line, { encoding: "utf8", mode: 0o600 });
}
async function dbAudit(db: SupabaseClient, input: { taskId: string; projectId: string; action: string; summary: string; metadata?: Record<string, unknown> }) {
  const { error } = await db.from("dev_center_audit_events").insert({
    id: `dev-audit-${randomUUID().slice(0, 12)}`, actor_type: "system", actor_id: "BenAI", action: input.action,
    entity_type: "task", entity_id: input.taskId, task_id: input.taskId, project_id: input.projectId,
    summary: input.summary, metadata: { providerFamily: "OPENAI_FIRST_PARTY", surfaceType: "CODEX", executionMode: "TASK_BRIDGE", productionAccess: "DENY", ...(input.metadata || {}) },
  });
  if (error) throw new Error(`Task Bridge audit hiba: ${error.message}`);
}

function renderTaskMarkdown(input: { taskId: string; title: string; goal: string; projectId: string; moduleName: string; workerCode: TaskBridgeWorkerCode; baseCommit: string; branchName: string; worktreePath: string; allowedPaths: string[] }) {
  return `# BENJADMIN Developer Grid · Codex Task Bridge\n\n`+
    `**Task ID:** ${input.taskId}\n\n**Provider family:** OPENAI_FIRST_PARTY\n\n**Surface:** CODEX\n\n**Execution:** TASK_BRIDGE\n\n**Environment:** DEV ONLY · PROD DENY\n\n`+
    `## Feladat\n\n${input.goal}\n\n## Kontextus\n\n- Projekt: ${input.projectId}\n- Modul: ${input.moduleName}\n- Worker: ${input.workerCode}\n- Base commit: ${input.baseCommit}\n- Branch: ${input.branchName}\n- Worktree: ${input.worktreePath}\n\n`+
    `## Engedélyezett path-scope\n\n${input.allowedPaths.map((p) => `- \`${p}\``).join("\n")}\n\n`+
    `## Kötelező szabályok\n\n1. Csak a fenti scope-ban módosíts fájlt.\n2. PROD, deploy, restart, migration és release tiltott.\n3. Ne módosítsd a ".devgrid/tasks/${input.taskId}" kontrollfájlokat a result.json kivételével.\n4. Futtass célzott teszteket és \'git diff --check\' ellenőrzést.\n5. Commitold a kódmódosítást erre a branchre.\n6. A végén írj \'result.json\'-t a task könyvtárba a megadott sémával.\n\n`+
    `## result.json séma\n\n\`\`\`json\n{\n  "schemaVersion": "${TASK_BRIDGE_RESULT_SCHEMA}",\n  "taskId": "${input.taskId}",\n  "status": "WORKER_COMPLETED",\n  "provider": "CODEX",\n  "baseCommit": "${input.baseCommit}",\n  "commit": "<40-char-git-sha>",\n  "changedFiles": ["..."],\n  "tests": [{"name":"...","status":"PASS"}],\n  "risks": [],\n  "workerSummary": "...",\n  "finishedAt": "<ISO-8601>"\n}\n\`\`\`\n`;
}

function renderCodexBootstrapPrompt(input: { taskId: string; worktreePath: string }) {
  return [
    "You are the CODEX worker for BENJADMIN Developer Grid.",
    "",
    `Task: ${input.taskId}`,
    `Worktree: ${input.worktreePath}`,
    "",
    "Read first:",
    `.devgrid/tasks/${input.taskId}/TASK.md`,
    `.devgrid/tasks/${input.taskId}/task.json`,
    "",
    "Use only the assigned branch/worktree and allowed path scope.",
    "Do not modify PROD. Do not use secrets or unsanitized personal data.",
    "",
    "When complete:",
    "1. run all acceptance checks;",
    "2. commit changes;",
    "3. write result.json;",
    "4. report the commit SHA.",
  ].join("\n");
}

function renderBenAiReviewMarkdown(input: { taskId: string; title: string; baseCommit: string; resultCommit: string; changedFiles: string[]; workerSummary: string; tests: Array<Record<string, unknown>>; risks: unknown[] }) {
  return `# BENJADMIN Developer Grid · BenAI Review

`+
    `**Task ID:** ${input.taskId}

**Reviewer:** BENAI

**Environment:** DEV ONLY · PROD DENY

`+
    `## Provenance

- Base commit: ${input.baseCommit}
- Result commit: ${input.resultCommit}

`+
    `## Worker összefoglaló

${input.workerSummary}

`+
    `## Módosított fájlok

${input.changedFiles.map((item)=>`- \`${item}\``).join("\n") || "- —"}

`+
    `## Worker tesztek

\`\`\`json
${JSON.stringify(input.tests,null,2)}
\`\`\`

`+
    `## Jelzett kockázatok

\`\`\`json
${JSON.stringify(input.risks,null,2)}
\`\`\`

`+
    `## Review feladat

Ellenőrizd kizárólag a fenti result commit diffjét a base commit ellen. Ellenőrizd a scope-ot, regressziót, biztonsági kockázatot, tesztlefedettséget és azt, hogy nincs PROD/deploy/restart/migration művelet. Ne módosíts kódot ebben a review körben.

`+
    `## review.json séma

\`\`\`json
{
  "schemaVersion": "${TASK_BRIDGE_REVIEW_SCHEMA}",
  "taskId": "${input.taskId}",
  "reviewer": "BENAI",
  "result": "PASS",
  "baseCommit": "${input.baseCommit}",
  "resultCommit": "${input.resultCommit}",
  "summary": "...",
  "findings": [],
  "finishedAt": "<ISO-8601>"
}
\`\`\`
`;
}

async function persistTaskArtifacts(input: { taskId: string; title: string; goal: string; projectId: string; moduleName: string; workerCode: TaskBridgeWorkerCode; sessionId: string; baseCommit: string; branchName: string; worktreePath: string; allowedPaths: string[] }) {
  const taskDir = taskDirectory(input.worktreePath, input.taskId);
  await mkdir(taskDir, { recursive: true, mode: 0o700 });
  const taskMd = renderTaskMarkdown(input);
  const bootstrapPrompt = renderCodexBootstrapPrompt({ taskId: input.taskId, worktreePath: input.worktreePath });
  const payload = {
    schemaVersion: TASK_BRIDGE_SCHEMA, taskId: input.taskId, title: input.title, goal: input.goal, projectId: input.projectId, moduleName: input.moduleName,
    provider: "CODEX" as const, status: "READY_FOR_WORKER" as const,
    workerCode: input.workerCode, providerFamily: "OPENAI_FIRST_PARTY" as const, surfaceType: "CODEX" as const, executionMode: "TASK_BRIDGE" as const,
    worker: { provider: "CODEX" as const, name: "Codex", mode: "TASK_BRIDGE" as const, providerFamily: "OPENAI_FIRST_PARTY" as const },
    environment: "DEV" as const, productionAccess: "DENY" as const, sessionId: input.sessionId, baseCommit: input.baseCommit, branchName: input.branchName, worktreePath: input.worktreePath,
    repository: "keseuben/dimprover",
    scope: { allowedPaths: input.allowedPaths, readOnlyPaths: [] as string[], deniedPaths: ["ops/prod/**", ".env*", "secrets/**"], productionAccess: false },
    acceptance: ["git diff --check PASS", "targeted TypeScript PASS", "targeted ESLint PASS", "static contract PASS", "runtime contract PASS", "no PROD modification", "no secret in source or logs", "commit required"],
    allowedPaths: input.allowedPaths, taskMarkdownPath: path.join(taskDir, "TASK.md"), taskJsonPath: path.join(taskDir, "task.json"), bootstrapPath: path.join(taskDir, "CODEX_BOOTSTRAP.txt"), resultPath: path.join(taskDir, "result.json"), reviewPath: path.join(taskDir, "REVIEW.md"), reviewResultPath: path.join(taskDir, "review.json"), buildPath: path.join(taskDir, "build.json"), acceptanceRequestPath: path.join(taskDir, "ACCEPTANCE.md"), acceptancePath: path.join(taskDir, "acceptance.json"), auditPath: path.join(taskDir, "audit.jsonl"), sanitizedDataOnly: true, costSource: "UNKNOWN", createdAt: new Date().toISOString(),
  };
  const taskJson = `${JSON.stringify(payload, null, 2)}\n`;
  await writeFile(path.join(taskDir, "TASK.md"), taskMd, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await writeFile(path.join(taskDir, "task.json"), taskJson, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await writeFile(path.join(taskDir, "CODEX_BOOTSTRAP.txt"), `${bootstrapPrompt}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await appendAudit(taskDir, { event: "TASK_PREPARED", taskId: input.taskId, sessionId: input.sessionId, baseCommit: input.baseCommit, branchName: input.branchName, allowedPaths: input.allowedPaths });
  return { ...payload, taskDir, taskMdSha256: sha(taskMd), taskJsonInitialSha256: sha(taskJson), bootstrapSha256: sha(bootstrapPrompt), bootstrapPrompt };
}

async function taskRow(db: SupabaseClient, taskId: string) {
  const result = await db.from("dev_center_tasks").select("id,project_id,repository_id,title,description,status,requested_worker_id,assigned_worker_id,claimed_by_session_id,branch_name,worktree_path,scope,metadata,updated_at").eq("id", taskId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as Record<string, unknown> | null;
}
async function syncTaskManifest(bridge: Record<string, unknown>, patch: Record<string, unknown>) {
  const taskJsonPath=text(bridge.taskJsonPath,1200),taskDir=path.resolve(text(bridge.taskDir,1200));
  if(!taskJsonPath||path.resolve(taskJsonPath)!==path.join(taskDir,"task.json")) fail("A task.json provenance hibás.","TASK_BRIDGE_TASK_JSON_PATH_INVALID",409);
  let current:Record<string,unknown>={};try{current=record(JSON.parse(await readFile(taskJsonPath,"utf8")))}catch{fail("A task.json nem olvasható.","TASK_BRIDGE_TASK_JSON_INVALID",409)}
  const next={...current,...patch,updatedAt:new Date().toISOString()};
  await writeFile(taskJsonPath,`${JSON.stringify(next,null,2)}
`,{encoding:"utf8",mode:0o600});
  return next;
}


export async function startCodexTaskBridge(raw: Record<string, unknown>) {
  const sourcePrompt = text(raw.sourcePrompt);
  if (sourcePrompt.length < 12) fail("A Task Bridge fejlesztési utasítás legalább 12 karakter legyen.", "TASK_BRIDGE_PROMPT_TOO_SHORT", 400);
  const promptSensitive = scanSensitiveText(sourcePrompt);
  if (promptSensitive.length) fail(`A Task Bridge feladat szövege érzékeny adatmintát tartalmaz: ${promptSensitive.join(", ")}. Csak SANITIZED DATA adható át.`, "TASK_BRIDGE_SECRET_DETECTED", 400);
  const projectId = text(raw.projectId, 180) || "project_dimprover";
  const moduleName = text(raw.moduleName, 180) || "Developer Grid V1";
  const preferredWorkerCode = workerCode(raw.preferredWorkerCode);
  const workerId = WORKER_IDS[preferredWorkerCode];
  const idempotencyKey = text(raw.idempotencyKey, 160);
  if (idempotencyKey.length < 8) fail("Érvényes Task Bridge idempotencyKey szükséges.", "TASK_BRIDGE_IDEMPOTENCY_REQUIRED", 400);
  const allowedPaths = normalizedScope(raw.allowedPaths);
  const taskId = taskIdFor(idempotencyKey);
  const db = dbClient();
  await ensureDeveloperGridCodingWorkerRegistry();
  const plane = await resolveDevelopmentPlane(db, projectId);
  if (plane.plane !== "INTERNAL") fail("A Codex Task Bridge V1 csak belső DIMPRO DEV projekten engedélyezett.", "TASK_BRIDGE_INTERNAL_DEV_ONLY", 403);
  const readiness = await getInternalExecutorReadiness(db);
  if (!readiness.repositoryReady || !readiness.baselineReady || !readiness.baselineCommit || !readiness.repositoryPath) {
    fail("A Task Bridge trusted DEV baseline nincs READY állapotban.", "TASK_BRIDGE_BASELINE_NOT_READY", 409);
  }
  const repositoryId = await resolveProjectRepositoryId(db, projectId);
  if (!repositoryId || repositoryId !== readiness.repositoryId) fail("A Task Bridge repository-kötés eltér a trusted DEV repositorytól.", "TASK_BRIDGE_REPOSITORY_MISMATCH", 409);
  const existing = await taskRow(db, taskId);
  if (existing) {
    const meta = record(existing.metadata); const bridge = record(meta.taskBridge);
    if (bridge.schemaVersion === TASK_BRIDGE_SCHEMA && bridge.idempotencyKey === idempotencyKey) return { ok: true as const, reused: true as const, taskId, task: existing, bridge };
    fail("A determinisztikus Task Bridge taskId már másik feladathoz tartozik.", "TASK_BRIDGE_IDEMPOTENCY_CONFLICT", 409);
  }
  const branchName = taskBridgeBranchName(preferredWorkerCode, taskId);
  const worktreePath = taskBridgeWorktreePath(preferredWorkerCode, taskId);
  const title = sourcePrompt.split(/\r?\n/).map((x) => x.trim()).find(Boolean)?.slice(0, 180) || "Codex Task Bridge feladat";
  const created = await createDevEngineTask({
    id: taskId, projectId, repositoryId, title, description: sourcePrompt, priority: 90, requestedWorkerId: workerId,
    scope: allowedPaths.map((key) => ({ type: "path", key })), acceptance: [], createdBy: "BenAI",
    metadata: { origin: "BENJADMIN_DEVELOPER_GRID_TASK_BRIDGE", moduleName, providerFamily: "OPENAI_FIRST_PARTY", surfaceType: "CODEX", executionMode: "TASK_BRIDGE", productionAccess: "DENY", taskBridge: { schemaVersion: TASK_BRIDGE_SCHEMA, state: "DRAFT", idempotencyKey, workerCode: preferredWorkerCode, baseCommit: readiness.baselineCommit, branchName, worktreePath, allowedPaths } },
  });
  if (!created.ok) fail(created.error || "A Task Bridge task nem hozható létre.", "TASK_BRIDGE_TASK_CREATE_FAILED", 409);
  let sessionId = ""; let workspaceCreated = false;
  try {
    const opened = await openDevEngineSession({ openedBy: "BenAI", environmentId: "env_dev", note: `Codex Task Bridge · ${taskId}`, metadata: { origin: "DEVELOPER_GRID_TASK_BRIDGE", taskId, projectId, workerCode: preferredWorkerCode, providerFamily: "OPENAI_FIRST_PARTY", surfaceType: "CODEX", executionMode: "TASK_BRIDGE", productionAccess: "DENY" } });
    sessionId = opened.session.id;
    await advanceDevEngineSession(sessionId, "assign_benai", {});
    const worker = await advanceDevEngineSession(sessionId, "bind_worker", { workerId }); if (!worker.ok) throw new Error(worker.error || "Worker binding sikertelen.");
    await claimTaskAtomic({ sessionId, workerId, taskId, leaseSeconds: 900 });
    const branch = await advanceDevEngineSession(sessionId, "bind_branch", { branchName }); if (!branch.ok) throw new Error(branch.error || "Branch binding sikertelen.");
    await prepareTaskBridgeWorkspace({ workerCode: preferredWorkerCode, taskId, branchName, worktreePath, baseCommit: readiness.baselineCommit }); workspaceCreated = true;
    const worktree = await advanceDevEngineSession(sessionId, "bind_worktree", { worktreePath }); if (!worktree.ok) throw new Error(worktree.error || "Worktree binding sikertelen.");
    await acquireScopeBundleAtomic({ sessionId, scope: allowedPaths.map((key) => ({ type: "path", key })), leaseSeconds: 900 });
    await assertDevEngineOperation(sessionId, "write");
    const artifacts = await persistTaskArtifacts({ taskId, title, goal: sourcePrompt, projectId, moduleName, workerCode: preferredWorkerCode, sessionId, baseCommit: readiness.baselineCommit, branchName, worktreePath, allowedPaths });
    const bridge = { schemaVersion: TASK_BRIDGE_SCHEMA, state: "READY_FOR_WORKER", idempotencyKey, workerCode: preferredWorkerCode, providerFamily: "OPENAI_FIRST_PARTY", surfaceType: "CODEX", executionMode: "TASK_BRIDGE", productionAccess: "DENY", sessionId, baseCommit: readiness.baselineCommit, branchName, worktreePath, allowedPaths, taskDir: artifacts.taskDir, taskMarkdownPath: artifacts.taskMarkdownPath, taskJsonPath: artifacts.taskJsonPath, bootstrapPath: artifacts.bootstrapPath, resultPath: artifacts.resultPath, reviewPath: artifacts.reviewPath, reviewResultPath: artifacts.reviewResultPath, buildPath: artifacts.buildPath, acceptanceRequestPath: artifacts.acceptanceRequestPath, acceptancePath: artifacts.acceptancePath, auditPath: artifacts.auditPath, taskMdSha256: artifacts.taskMdSha256, taskJsonInitialSha256: artifacts.taskJsonInitialSha256, bootstrapSha256: artifacts.bootstrapSha256, sanitizedDataOnly: true, costSource: "UNKNOWN", createdAt: artifacts.createdAt };
    const current = await taskRow(db, taskId); const meta = record(current?.metadata);
    const update = await db.from("dev_center_tasks").update({ metadata: { ...meta, taskBridge: bridge }, updated_at: new Date().toISOString() }).eq("id", taskId);
    if (update.error) throw new Error(update.error.message);
    await syncTaskManifest(bridge,{status:"READY_FOR_WORKER",provider:"CODEX",sessionId});
    await dbAudit(db, { taskId, projectId, action: "TASK_BRIDGE_READY", summary: `${title} · Codex Task Bridge READY_FOR_WORKER.`, metadata: { sessionId, branchName, worktreePath, allowedPaths, baseCommit: readiness.baselineCommit } });
    return { ok: true as const, reused: false as const, taskId, bridge };
  } catch (error) {
    if (sessionId) await releaseSessionAtomic(sessionId, "Codex Task Bridge előkészítés megszakadt.", true).catch(() => undefined);
    if (workspaceCreated) await removeTaskBridgeWorkspace({ workerCode: preferredWorkerCode, taskId, branchName, worktreePath, baseCommit: readiness.baselineCommit }).catch(() => undefined);
    const current = await taskRow(db, taskId).catch(() => null); const meta = record(current?.metadata); const prior = record(meta.taskBridge);
    try { await db.from("dev_center_tasks").update({ status: "blocked", blocked_reason: error instanceof Error ? error.message.slice(0, 500) : "Task Bridge előkészítési hiba", metadata: { ...meta, taskBridge: { ...prior, state: "ERROR", blockedAt: new Date().toISOString(), error: error instanceof Error ? error.message.slice(0, 500) : "ismeretlen hiba" } }, updated_at: new Date().toISOString() }).eq("id", taskId); } catch { /* az eredeti előkészítési hibát őrizzük meg */ }
    throw error;
  }
}

export async function getCodexTaskBridge(input: { taskId?: string | null; workerCode?: string | null }) {
  const db = dbClient();
  const taskId = text(input.taskId, 180);
  const select = "id,project_id,title,description,status,requested_worker_id,assigned_worker_id,claimed_by_session_id,branch_name,worktree_path,scope,metadata,created_at,updated_at";
  let row: Record<string, unknown> | null = null;
  if (taskId) {
    const result = await db.from("dev_center_tasks").select(select).contains("metadata", { origin: "BENJADMIN_DEVELOPER_GRID_TASK_BRIDGE" }).eq("id", taskId).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    row = result.data as Record<string, unknown> | null;
  } else {
    const code = workerCode(input.workerCode);
    const result = await db.from("dev_center_tasks").select(select).contains("metadata", { origin: "BENJADMIN_DEVELOPER_GRID_TASK_BRIDGE" }).eq("requested_worker_id", WORKER_IDS[code]).order("created_at", { ascending: false }).limit(1);
    if (result.error) throw new Error(result.error.message);
    row = (result.data?.[0] || null) as Record<string, unknown> | null;
  }
  if (!row) return null;
  const bridge=record(record(row.metadata).taskBridge);
  const detection=await taskBridgeDetection(bridge);
  return { taskId: text(row.id, 180), projectId: text(row.project_id, 180), title: text(row.title, 500), status: text(row.status, 60), branchName: text(row.branch_name, 600), worktreePath: text(row.worktree_path, 1200), scope: row.scope, bridge, detection, updatedAt: text(row.updated_at, 100) };
}

type TaskBridgeResult = {
  schemaVersion: string; taskId: string; status: string; provider: string; baseCommit: string; commit: string;
  changedFiles: string[]; tests: Array<Record<string, unknown>>; risks: unknown[]; workerSummary: string; finishedAt: string;
};
function parseResult(raw: string, taskId: string, baseCommit: string): TaskBridgeResult {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return fail("A result.json nem érvényes JSON.", "TASK_BRIDGE_RESULT_JSON_INVALID", 400); }
  const r = record(value);
  const result: TaskBridgeResult = {
    schemaVersion: text(r.schemaVersion, 80), taskId: text(r.taskId, 180), status: text(r.status, 40).toUpperCase(), provider: text(r.provider, 40).toUpperCase(),
    baseCommit: text(r.baseCommit, 64).toLowerCase(), commit: text(r.commit, 64).toLowerCase(),
    changedFiles: Array.isArray(r.changedFiles) ? r.changedFiles.map((x) => text(x, 600).replaceAll("\\", "/")).filter(Boolean).sort() : [],
    tests: Array.isArray(r.tests) ? r.tests.filter((x) => x && typeof x === "object").slice(0, 100) as Array<Record<string, unknown>> : [],
    risks: Array.isArray(r.risks) ? r.risks.slice(0, 100) : [], workerSummary: text(r.workerSummary, 4000), finishedAt: text(r.finishedAt, 100),
  };
  if (result.schemaVersion !== TASK_BRIDGE_RESULT_SCHEMA || result.taskId !== taskId || result.baseCommit !== baseCommit || result.status !== "WORKER_COMPLETED" || result.provider !== "CODEX" || !/^[0-9a-f]{40}$/.test(result.commit) || !result.workerSummary || !Number.isFinite(Date.parse(result.finishedAt))) {
    fail("A result.json kötelező mezői vagy provenance adatai hibásak.", "TASK_BRIDGE_RESULT_INVALID", 400);
  }
  return result;
}


export async function importCodexTaskBridgeResult(taskIdValue: string) {
  const taskId = text(taskIdValue, 180); if (!taskId) fail("A taskId kötelező.", "TASK_BRIDGE_TASK_REQUIRED", 400);
  const db = dbClient(); const row = await taskRow(db, taskId); if (!row) fail("A Task Bridge task nem található.", "TASK_BRIDGE_TASK_NOT_FOUND", 404);
  const meta = record(row.metadata); const bridge = record(meta.taskBridge);
  if (bridge.schemaVersion !== TASK_BRIDGE_SCHEMA || bridge.surfaceType !== "CODEX" || bridge.providerFamily !== "OPENAI_FIRST_PARTY") fail("A task nem Codex first-party Task Bridge feladat.", "TASK_BRIDGE_TASK_TYPE_MISMATCH", 409);
  const resultPath = text(bridge.resultPath, 1200), worktreePath = text(bridge.worktreePath, 1200), branchName = text(bridge.branchName, 600), baseCommit = text(bridge.baseCommit, 64).toLowerCase(), sessionId = text(bridge.sessionId, 180);
  if (!resultPath || !worktreePath || !branchName || !baseCommit || !sessionId) fail("A Task Bridge provenance hiányos.", "TASK_BRIDGE_PROVENANCE_INCOMPLETE", 409);
  const resolved = path.resolve(resultPath), expectedRoot = path.resolve(taskDirectory(worktreePath, taskId));
  if (resolved !== path.join(expectedRoot, "result.json")) fail("A result.json útvonala eltér a Task Bridge task könyvtártól.", "TASK_BRIDGE_RESULT_PATH_INVALID", 409);
  const fileStat = await stat(resolved); if (!fileStat.isFile() || fileStat.size > MAX_RESULT_BYTES) fail("A result.json mérete vagy típusa érvénytelen.", "TASK_BRIDGE_RESULT_FILE_INVALID", 400);
  const raw = await readFile(resolved, "utf8");
  const resultSensitive = scanSensitiveText(raw);
  if (resultSensitive.length) fail(`A result.json érzékeny adatmintát tartalmaz: ${resultSensitive.join(", ")}.`, "TASK_BRIDGE_RESULT_SECRET_DETECTED", 400);
  const parsed = parseResult(raw, taskId, baseCommit);
  const allowedPaths = Array.isArray(bridge.allowedPaths) ? bridge.allowedPaths.map((x) => text(x, 600)).filter(Boolean) : [];
  const git = await inspectTaskBridgeGit({ worktreePath, branchName, baseCommit, resultCommit: parsed.commit });
  if (git.dirty) fail("A Codex worktree nem tiszta; result import csak commitolt állapotból engedélyezett.", "TASK_BRIDGE_WORKTREE_DIRTY", 409);
  const outOfScope = git.changedPaths.filter((p) => !inScope(p, allowedPaths) || isSensitivePath(p) || classifyScopePath(p).riskLevel === "RED" || /^supabase\/migrations(?:\/|$)/i.test(p)); if (outOfScope.length) fail(`Scope-on kívüli vagy tiltott módosítás: ${outOfScope.join(", ")}`, "TASK_BRIDGE_SCOPE_VIOLATION", 409);
  if (JSON.stringify([...parsed.changedFiles].sort()) !== JSON.stringify(git.changedPaths)) fail("A result.json changedFiles nem egyezik a Git diff-fel.", "TASK_BRIDGE_CHANGED_PATHS_MISMATCH", 409);
  await setDevEngineTaskTesting(taskId);
  const reviewMarkdown=renderBenAiReviewMarkdown({ taskId, title:text(row.title,500), baseCommit, resultCommit:parsed.commit, changedFiles:git.changedPaths, workerSummary:parsed.workerSummary, tests:parsed.tests, risks:parsed.risks });
  const reviewPath=text(bridge.reviewPath,1200); const reviewResultPath=text(bridge.reviewResultPath,1200);
  if(path.resolve(reviewPath)!==path.join(expectedRoot,"REVIEW.md")||path.resolve(reviewResultPath)!==path.join(expectedRoot,"review.json")) fail("A review artefaktum útvonala eltér a Task Bridge task könyvtártól.","TASK_BRIDGE_REVIEW_PATH_INVALID",409);
  await writeFile(reviewPath,reviewMarkdown,{encoding:"utf8",mode:0o600});
  await appendAudit(expectedRoot, { event: "RESULT_IMPORTED", taskId, sessionId, resultCommit: parsed.commit, changedPaths: git.changedPaths, resultSha256: sha(raw), reviewSha256:sha(reviewMarkdown), tests: parsed.tests });
  const nextBridge = { ...bridge, state: "REVIEW_PENDING", resultCommit: parsed.commit, changedPaths: git.changedPaths, resultSha256: sha(raw), summary: parsed.workerSummary, workerSummary: parsed.workerSummary, risks: parsed.risks, tests: parsed.tests, resultImportedAt: new Date().toISOString(), reviewState: "PENDING", reviewSha256:sha(reviewMarkdown), reviewResultPath };
  const update = await db.from("dev_center_tasks").update({ metadata: { ...meta, taskBridge: nextBridge }, updated_at: new Date().toISOString() }).eq("id", taskId); if (update.error) throw new Error(update.error.message);
  await syncTaskManifest(nextBridge,{status:"REVIEW_PENDING",provider:"CODEX",resultCommit:parsed.commit,changedFiles:git.changedPaths,reviewState:"PENDING"});
  await releaseSessionAtomic(sessionId, "Codex Task Bridge result importálva; review gate következik.", false);
  await dbAudit(db, { taskId, projectId: text(row.project_id, 180), action: "TASK_BRIDGE_RESULT_IMPORTED", summary: `${text(row.title, 500)} · Codex result import PASS.`, metadata: { sessionId, resultCommit: parsed.commit, changedPaths: git.changedPaths, resultSha256: sha(raw), reviewState: "PENDING" } });
  return { ok: true as const, taskId, state: "REVIEW_PENDING" as const, result: parsed, git, bridge: nextBridge };
}

type TaskBridgeReviewResult={schemaVersion:string;taskId:string;reviewer:string;result:"PASS"|"CHANGES_REQUESTED";baseCommit:string;resultCommit:string;summary:string;findings:unknown[];finishedAt:string};
function parseReviewResult(raw:string,taskId:string,baseCommit:string,resultCommit:string):TaskBridgeReviewResult{
  let value:unknown;try{value=JSON.parse(raw)}catch{return fail("A review.json nem érvényes JSON.","TASK_BRIDGE_REVIEW_JSON_INVALID",400)}
  const r=record(value),result=text(r.result,40).toUpperCase();
  if(result!=="PASS"&&result!=="CHANGES_REQUESTED")fail("A BenAI review eredmény csak PASS vagy CHANGES_REQUESTED lehet.","TASK_BRIDGE_REVIEW_RESULT_INVALID",400);
  const parsed:TaskBridgeReviewResult={schemaVersion:text(r.schemaVersion,80),taskId:text(r.taskId,180),reviewer:text(r.reviewer,40).toUpperCase(),result:result as "PASS"|"CHANGES_REQUESTED",baseCommit:text(r.baseCommit,64).toLowerCase(),resultCommit:text(r.resultCommit,64).toLowerCase(),summary:text(r.summary,4000),findings:Array.isArray(r.findings)?r.findings.slice(0,200):[],finishedAt:text(r.finishedAt,100)};
  if(parsed.schemaVersion!==TASK_BRIDGE_REVIEW_SCHEMA||parsed.taskId!==taskId||parsed.reviewer!=="BENAI"||parsed.baseCommit!==baseCommit||parsed.resultCommit!==resultCommit||!parsed.summary||!Number.isFinite(Date.parse(parsed.finishedAt)))fail("A review.json provenance vagy kötelező mezői hibásak.","TASK_BRIDGE_REVIEW_INVALID",400);
  return parsed;
}
export async function getCodexTaskBridgeReviewPrompt(taskIdValue:string){
  const taskId=text(taskIdValue,180);const state=await getCodexTaskBridge({taskId});if(!state)fail("A Task Bridge task nem található.","TASK_BRIDGE_TASK_NOT_FOUND",404);
  const bridge=record(state.bridge),reviewPath=text(bridge.reviewPath,1200),taskDir=text(bridge.taskDir,1200),bridgeState=text(bridge.state,60);
  if(!["REVIEW_PENDING","REVIEW_IN_PROGRESS"].includes(bridgeState))fail(`A BenAI review nem indítható ${bridgeState||"NINCS"} állapotból.`,"TASK_BRIDGE_REVIEW_STATE_INVALID",409);
  if(path.resolve(reviewPath)!==path.join(path.resolve(taskDir),"REVIEW.md"))fail("A REVIEW.md provenance hibás.","TASK_BRIDGE_REVIEW_PATH_INVALID",409);
  const prompt=await readFile(reviewPath,"utf8");if(scanSensitiveText(prompt).length)fail("A REVIEW.md érzékeny adatot tartalmaz.","TASK_BRIDGE_REVIEW_SECRET_DETECTED",409);
  return {ok:true as const,taskId,prompt,sha256:sha(prompt),path:reviewPath};
}
export async function markCodexTaskBridgeReviewStarted(taskIdValue:string){
  const taskId=text(taskIdValue,180),db=dbClient();const row=await taskRow(db,taskId);if(!row)fail("A Task Bridge task nem található.","TASK_BRIDGE_TASK_NOT_FOUND",404);
  const meta=record(row.metadata),bridge=record(meta.taskBridge),state=text(bridge.state,60);
  if(!["REVIEW_PENDING","REVIEW_IN_PROGRESS"].includes(state))fail(`A BenAI review nem indítható ${state||"NINCS"} állapotból.`,"TASK_BRIDGE_REVIEW_STATE_INVALID",409);
  const next={...bridge,state:"REVIEW_IN_PROGRESS",reviewState:"RUNNING",reviewStartedAt:text(bridge.reviewStartedAt,100)||new Date().toISOString(),reviewer:"BENAI"};
  const update=await db.from("dev_center_tasks").update({metadata:{...meta,taskBridge:next},updated_at:new Date().toISOString()}).eq("id",taskId);if(update.error)throw new Error(update.error.message);
  await syncTaskManifest(next,{status:"REVIEW_IN_PROGRESS",reviewState:"RUNNING",reviewer:"BENAI"});
  await appendAudit(text(bridge.taskDir,1200),{event:"REVIEW_STARTED",taskId,reviewer:"BENAI",resultCommit:text(bridge.resultCommit,64)});
  await dbAudit(db,{taskId,projectId:text(row.project_id,180),action:"TASK_BRIDGE_REVIEW_STARTED",summary:`${text(row.title,500)} · BenAI review indítva.`,metadata:{reviewer:"BENAI",resultCommit:text(bridge.resultCommit,64)}});
  return {ok:true as const,taskId,bridge:next};
}
export async function importCodexTaskBridgeReview(taskIdValue:string){
  const taskId=text(taskIdValue,180),db=dbClient();const row=await taskRow(db,taskId);if(!row)fail("A Task Bridge task nem található.","TASK_BRIDGE_TASK_NOT_FOUND",404);
  const meta=record(row.metadata),bridge=record(meta.taskBridge),state=text(bridge.state,60);
  if(!["REVIEW_PENDING","REVIEW_IN_PROGRESS"].includes(state))fail(`A review import nem engedélyezett ${state||"NINCS"} állapotból.`,"TASK_BRIDGE_REVIEW_IMPORT_STATE_INVALID",409);
  const taskDir=path.resolve(text(bridge.taskDir,1200)),reviewResultPath=path.resolve(text(bridge.reviewResultPath,1200)),baseCommit=text(bridge.baseCommit,64).toLowerCase(),resultCommit=text(bridge.resultCommit,64).toLowerCase(),worktreePath=text(bridge.worktreePath,1200),branchName=text(bridge.branchName,600);
  if(reviewResultPath!==path.join(taskDir,"review.json"))fail("A review.json útvonala eltér a Task Bridge könyvtártól.","TASK_BRIDGE_REVIEW_PATH_INVALID",409);
  const st=await stat(reviewResultPath);if(!st.isFile()||st.size>MAX_RESULT_BYTES)fail("A review.json mérete vagy típusa érvénytelen.","TASK_BRIDGE_REVIEW_FILE_INVALID",400);
  const raw=await readFile(reviewResultPath,"utf8");const sensitive=scanSensitiveText(raw);if(sensitive.length)fail(`A review.json érzékeny adatmintát tartalmaz: ${sensitive.join(", ")}.`,"TASK_BRIDGE_REVIEW_SECRET_DETECTED",400);
  const parsed=parseReviewResult(raw,taskId,baseCommit,resultCommit);
  const git=await inspectTaskBridgeGit({worktreePath,branchName,baseCommit,resultCommit});if(git.dirty)fail("A review csak tiszta, commitolt Codex worktree-re fogadható el.","TASK_BRIDGE_REVIEW_WORKTREE_DIRTY",409);
  const pass=parsed.result==="PASS",nextState=pass?"REVIEW_PASS":"REVIEW_CHANGES_REQUESTED",next={...bridge,state:nextState,reviewState:pass?"PASS":"CHANGES_REQUESTED",reviewResultSha256:sha(raw),reviewSummary:parsed.summary,reviewFindings:parsed.findings,reviewFinishedAt:parsed.finishedAt,reviewer:"BENAI",buildState:pass?"PENDING":"BLOCKED"};
  const update=await db.from("dev_center_tasks").update({metadata:{...meta,taskBridge:next},updated_at:new Date().toISOString()}).eq("id",taskId);if(update.error)throw new Error(update.error.message);
  await syncTaskManifest(next,{status:nextState,reviewState:pass?"PASS":"CHANGES_REQUESTED",reviewer:"BENAI"});
  await appendAudit(taskDir,{event:pass?"REVIEW_PASS":"REVIEW_CHANGES_REQUESTED",taskId,reviewer:"BENAI",resultCommit,reviewResultSha256:sha(raw)});
  await dbAudit(db,{taskId,projectId:text(row.project_id,180),action:pass?"TASK_BRIDGE_REVIEW_PASS":"TASK_BRIDGE_REVIEW_CHANGES_REQUESTED",summary:`${text(row.title,500)} · BenAI review ${parsed.result}.`,metadata:{reviewer:"BENAI",resultCommit,reviewResultSha256:sha(raw)}});
  return {ok:true as const,taskId,state:nextState,review:parsed,bridge:next};
}

export async function resumeCodexTaskBridgeAfterReviewChanges(taskIdValue:string){
  const taskId=text(taskIdValue,180),db=dbClient();const row=await taskRow(db,taskId);if(!row)fail("A Task Bridge task nem található.","TASK_BRIDGE_TASK_NOT_FOUND",404);
  const meta=record(row.metadata),bridge=record(meta.taskBridge),state=text(bridge.state,80),worker=workerCode(bridge.workerCode),workerId=WORKER_IDS[worker];
  if(state!=="REVIEW_CHANGES_REQUESTED"||text(bridge.reviewState,80)!=="CHANGES_REQUESTED")fail("Rework csak REVIEW_CHANGES_REQUESTED állapotból indítható.","TASK_BRIDGE_REWORK_STATE_INVALID",409);
  const sessions=await db.from("dev_center_worker_sessions").select("id,status").eq("task_id",taskId).neq("status","closed");if(sessions.error)throw new Error(sessions.error.message);if((sessions.data||[]).length)fail("Rework előtt minden korábbi worker sessionnek zártnak kell lennie.","TASK_BRIDGE_REWORK_ACTIVE_SESSION",409);
  const locks=await db.from("dev_center_scope_locks").select("id").eq("task_id",taskId).eq("status","active");if(locks.error)throw new Error(locks.error.message);if((locks.data||[]).length)fail("Rework előtt a korábbi scope lockoknak fel kell szabadulniuk.","TASK_BRIDGE_REWORK_SCOPE_LOCK_ACTIVE",409);
  const reset=await db.from("dev_center_tasks").update({status:"ready",assigned_worker_id:null,claimed_by_session_id:null,claim_expires_at:null,blocked_reason:null,updated_at:new Date().toISOString()}).eq("id",taskId).eq("status","testing").select("id").maybeSingle();if(reset.error)throw new Error(reset.error.message);if(!reset.data)fail("A Task Bridge task nem állítható vissza READY állapotba reworkhöz.","TASK_BRIDGE_REWORK_TASK_RESET_FAILED",409);
  const reworkCount=Number(bridge.reworkCount||0)+1,taskDir=path.resolve(text(bridge.taskDir,1200)),historyDir=path.join(taskDir,"history",`rework-${String(reworkCount).padStart(2,"0")}`);
  await mkdir(historyDir,{recursive:true,mode:0o700});
  for(const [key,name] of [["resultPath","result.previous.json"],["reviewResultPath","review.previous.json"],["reviewPath","REVIEW.previous.md"]] as const){const source=text(bridge[key],1200);if(source){try{await rename(source,path.join(historyDir,name))}catch{/* hiányzó korábbi artefaktum megengedett */}}}
  const findings=Array.isArray(bridge.reviewFindings)?bridge.reviewFindings:[],reviewSummary=text(bridge.reviewSummary,4000);
  const reworkBootstrap=["You are the CODEX worker for a BENJADMIN Developer Grid rework cycle.","",`Task: ${taskId}`,`Rework cycle: ${reworkCount}`,`Worktree: ${text(bridge.worktreePath,1200)}`,"",`Review summary: ${reviewSummary||"See archived review result."}`,"Review findings:",JSON.stringify(findings,null,2),"","Read TASK.md and task.json again. Fix only the review findings inside the existing allowed scope. Do not modify PROD, deploy, restart, migration, secrets or credentials.","When complete: run tests, commit the corrected changes, then write a NEW result.json with status WORKER_COMPLETED and the new commit SHA."].join("\n");
  if(scanSensitiveText(reworkBootstrap).length)fail("A rework bootstrap érzékeny adatot tartalmaz.","TASK_BRIDGE_REWORK_SECRET_DETECTED",409);
  const bootstrapPath=text(bridge.bootstrapPath,1200);if(path.resolve(bootstrapPath)!==path.join(taskDir,"CODEX_BOOTSTRAP.txt"))fail("A Codex bootstrap provenance hibás.","TASK_BRIDGE_BOOTSTRAP_PATH_INVALID",409);await writeFile(bootstrapPath,`${reworkBootstrap}\n`,{encoding:"utf8",mode:0o600});
  const opened=await openDevEngineSession({openedBy:"BenAI",environmentId:"env_dev",note:`Codex Task Bridge rework · ${taskId}`,metadata:{origin:"DEVELOPER_GRID_TASK_BRIDGE_REWORK",taskId,projectId:text(row.project_id,180),workerCode:worker,providerFamily:"OPENAI_FIRST_PARTY",surfaceType:"CODEX",executionMode:"TASK_BRIDGE",productionAccess:"DENY",reworkCount}});
  const sessionId=opened.session.id;try{
    await advanceDevEngineSession(sessionId,"assign_benai",{});const bound=await advanceDevEngineSession(sessionId,"bind_worker",{workerId});if(!bound.ok)throw new Error(bound.error||"Worker binding sikertelen.");
    await claimTaskAtomic({sessionId,workerId,taskId,leaseSeconds:900});const branch=await advanceDevEngineSession(sessionId,"bind_branch",{branchName:text(bridge.branchName,600)});if(!branch.ok)throw new Error(branch.error||"Branch binding sikertelen.");const worktree=await advanceDevEngineSession(sessionId,"bind_worktree",{worktreePath:text(bridge.worktreePath,1200)});if(!worktree.ok)throw new Error(worktree.error||"Worktree binding sikertelen.");
    const allowedPaths=Array.isArray(bridge.allowedPaths)?bridge.allowedPaths.map((x)=>text(x,600)).filter(Boolean):[];await acquireScopeBundleAtomic({sessionId,scope:allowedPaths.map((key)=>({type:"path",key})),leaseSeconds:900});await assertDevEngineOperation(sessionId,"write");
    const next={...bridge,state:"WORKER_RUNNING",reviewState:"CHANGES_REQUESTED",buildState:"BLOCKED",sessionId,reworkCount,reworkStartedAt:new Date().toISOString(),bootstrapSha256:sha(reworkBootstrap),historyDir};const update=await db.from("dev_center_tasks").update({metadata:{...meta,taskBridge:next},updated_at:new Date().toISOString()}).eq("id",taskId);if(update.error)throw new Error(update.error.message);await syncTaskManifest(next,{status:"WORKER_RUNNING",sessionId,reworkCount,reviewState:"CHANGES_REQUESTED",bootstrapSha256:sha(reworkBootstrap)});await appendAudit(taskDir,{event:"REWORK_STARTED",taskId,sessionId,reworkCount,workerCode:worker,historyDir,bootstrapSha256:sha(reworkBootstrap)});await dbAudit(db,{taskId,projectId:text(row.project_id,180),action:"TASK_BRIDGE_REWORK_STARTED",summary:`${text(row.title,500)} · rework kör #${reworkCount}.`,metadata:{sessionId,reworkCount,workerCode:worker,historyDir,bootstrapSha256:sha(reworkBootstrap)}});return {ok:true as const,taskId,bridge:next};
  }catch(error){await releaseSessionAtomic(sessionId,"Task Bridge rework előkészítés megszakadt.",true).catch(()=>undefined);await db.from("dev_center_tasks").update({status:"testing",assigned_worker_id:null,claimed_by_session_id:null,claim_expires_at:null,updated_at:new Date().toISOString()}).eq("id",taskId);throw error}
}

type TaskBridgeAcceptanceResult={schemaVersion:string;taskId:string;status:"DEV_ACCEPTANCE_PASS"|"DEV_ACCEPTANCE_FAIL";buildRunId:string;buildId:string;sourceCommit:string;checks:Array<Record<string,unknown>>;summary:string;finishedAt:string};
function parseAcceptanceResult(raw:string,input:{taskId:string;buildRunId:string;buildId:string;sourceCommit:string}):TaskBridgeAcceptanceResult{
  let value:unknown;try{value=JSON.parse(raw)}catch{return fail("Az acceptance.json nem érvényes JSON.","TASK_BRIDGE_ACCEPTANCE_JSON_INVALID",400)}
  const r=record(value),status=text(r.status,60).toUpperCase();if(status!=="DEV_ACCEPTANCE_PASS"&&status!=="DEV_ACCEPTANCE_FAIL")fail("Az acceptance státusz csak DEV_ACCEPTANCE_PASS vagy DEV_ACCEPTANCE_FAIL lehet.","TASK_BRIDGE_ACCEPTANCE_STATUS_INVALID",400);
  const parsed:TaskBridgeAcceptanceResult={schemaVersion:text(r.schemaVersion,80),taskId:text(r.taskId,180),status:status as TaskBridgeAcceptanceResult["status"],buildRunId:text(r.buildRunId,180),buildId:text(r.buildId,180),sourceCommit:text(r.sourceCommit,64).toLowerCase(),checks:Array.isArray(r.checks)?r.checks.filter((x)=>x&&typeof x==="object").slice(0,200) as Array<Record<string,unknown>>:[],summary:text(r.summary,4000),finishedAt:text(r.finishedAt,100)};
  if(parsed.schemaVersion!==TASK_BRIDGE_ACCEPTANCE_SCHEMA||parsed.taskId!==input.taskId||parsed.buildRunId!==input.buildRunId||parsed.buildId!==input.buildId||parsed.sourceCommit!==input.sourceCommit||!parsed.summary||!parsed.checks.length||!Number.isFinite(Date.parse(parsed.finishedAt)))fail("Az acceptance.json provenance vagy kötelező mezői hibásak.","TASK_BRIDGE_ACCEPTANCE_INVALID",400);
  return parsed;
}
export async function importCodexTaskBridgeAcceptance(taskIdValue:string){
  const taskId=text(taskIdValue,180),db=dbClient();const row=await taskRow(db,taskId);if(!row)fail("A Task Bridge task nem található.","TASK_BRIDGE_TASK_NOT_FOUND",404);
  const meta=record(row.metadata),bridge=record(meta.taskBridge),state=text(bridge.state,80),buildState=text(bridge.buildState,80);
  if(state!=="DEV_ACCEPTANCE_PENDING"||buildState!=="PASS")fail("DEV acceptance csak PASS build után importálható.","TASK_BRIDGE_ACCEPTANCE_BUILD_PASS_REQUIRED",409);
  const taskDir=path.resolve(text(bridge.taskDir,1200)),acceptancePath=path.resolve(text(bridge.acceptancePath,1200));if(acceptancePath!==path.join(taskDir,"acceptance.json"))fail("Az acceptance.json útvonala eltér a Task Bridge könyvtártól.","TASK_BRIDGE_ACCEPTANCE_PATH_INVALID",409);
  const st=await stat(acceptancePath);if(!st.isFile()||st.size>MAX_RESULT_BYTES)fail("Az acceptance.json mérete vagy típusa érvénytelen.","TASK_BRIDGE_ACCEPTANCE_FILE_INVALID",400);
  const raw=await readFile(acceptancePath,"utf8");const sensitive=scanSensitiveText(raw);if(sensitive.length)fail(`Az acceptance.json érzékeny adatmintát tartalmaz: ${sensitive.join(", ")}.`,"TASK_BRIDGE_ACCEPTANCE_SECRET_DETECTED",400);
  const parsed=parseAcceptanceResult(raw,{taskId,buildRunId:text(bridge.buildRunId,180),buildId:text(bridge.buildId,180),sourceCommit:text(bridge.resultCommit,64).toLowerCase()});
  const pass=parsed.status==="DEV_ACCEPTANCE_PASS",next={...bridge,state:pass?"DEV_ACCEPTANCE_PASS":"ERROR",devAcceptanceState:pass?"PASS":"FAIL",acceptanceResultSha256:sha(raw),acceptanceSummary:parsed.summary,acceptanceChecks:parsed.checks,acceptanceFinishedAt:parsed.finishedAt};
  const update=await db.from("dev_center_tasks").update({metadata:{...meta,taskBridge:next},updated_at:new Date().toISOString()}).eq("id",taskId);if(update.error)throw new Error(update.error.message);
  await syncTaskManifest(next,{status:next.state,devAcceptanceState:next.devAcceptanceState,buildState:"PASS"});
  await appendAudit(taskDir,{event:parsed.status,taskId,buildRunId:parsed.buildRunId,buildId:parsed.buildId,sourceCommit:parsed.sourceCommit,acceptanceResultSha256:sha(raw)});
  await dbAudit(db,{taskId,projectId:text(row.project_id,180),action:pass?"TASK_BRIDGE_DEV_ACCEPTANCE_PASS":"TASK_BRIDGE_DEV_ACCEPTANCE_FAIL",summary:`${text(row.title,500)} · ${parsed.status}.`,metadata:{buildRunId:parsed.buildRunId,buildId:parsed.buildId,sourceCommit:parsed.sourceCommit,acceptanceResultSha256:sha(raw)}});
  if(pass)await finalizeDevEngineTask({taskId,outcome:"completed",note:"Task Bridge DEV_ACCEPTANCE_PASS"});
  return {ok:true as const,taskId,state:next.state,acceptance:parsed,bridge:next};
}

async function taskBridgeDetection(bridge: Record<string, unknown>) {
  const worktreePath=text(bridge.worktreePath,1200),branchName=text(bridge.branchName,600),baseCommit=text(bridge.baseCommit,64).toLowerCase();
  const allowedPaths=Array.isArray(bridge.allowedPaths)?bridge.allowedPaths.map((x)=>text(x,600)).filter(Boolean):[];
  if(!worktreePath||!branchName||!/^[0-9a-f]{40}$/.test(baseCommit)) return { effectiveState:text(bridge.state,60)||"ERROR", gitState:"UNKNOWN", scopeState:"UNKNOWN", resultDetected:false, changedPaths:[], head:null };
  try {
    const git=await inspectTaskBridgeGit({worktreePath,branchName,baseCommit});
    const violations=git.changedPaths.filter((p)=>!inScope(p,allowedPaths)||isSensitivePath(p)||classifyScopePath(p).riskLevel==="RED"||/^supabase\/migrations(?:\/|$)/i.test(p));
    const resultPath=text(bridge.resultPath,1200);let resultDetected=false;try{const st=await stat(resultPath);resultDetected=st.isFile()&&st.size>0&&st.size<=MAX_RESULT_BYTES}catch{}
    const reviewResultPath=text(bridge.reviewResultPath,1200);let reviewResultDetected=false;if(reviewResultPath){try{const st=await stat(reviewResultPath);reviewResultDetected=st.isFile()&&st.size>0&&st.size<=MAX_RESULT_BYTES}catch{}}
    const acceptancePath=text(bridge.acceptancePath,1200);let acceptanceResultDetected=false;if(acceptancePath){try{const st=await stat(acceptancePath);acceptanceResultDetected=st.isFile()&&st.size>0&&st.size<=MAX_RESULT_BYTES}catch{}}
    let effectiveState=text(bridge.state,60)||"READY_FOR_WORKER";
    const postWorkerStates=["REVIEW_PENDING","REVIEW_IN_PROGRESS","REVIEW_PASS","REVIEW_CHANGES_REQUESTED","BUILD_PENDING","BUILD_RUNNING","BUILD_PASS","DEV_ACCEPTANCE_PENDING","DEV_ACCEPTANCE_PASS","CLOSED"];
    if(violations.length) effectiveState="ERROR";
    else if(!postWorkerStates.includes(effectiveState)&&git.head!==baseCommit&&git.dirty) effectiveState="WORKER_RUNNING";
    else if(!postWorkerStates.includes(effectiveState)&&git.head!==baseCommit&&resultDetected&&!git.dirty) effectiveState="WORKER_COMPLETED";
    else if(!postWorkerStates.includes(effectiveState)&&git.head!==baseCommit) effectiveState="WORKER_RUNNING";
    return {effectiveState,gitState:git.dirty?"DIRTY":"CLEAN",scopeState:violations.length?"VIOLATION":"LOCKED",resultDetected,reviewResultDetected,acceptanceResultDetected,changedPaths:git.changedPaths,violations,head:git.head,baseCommit};
  } catch(error){return {effectiveState:"ERROR",gitState:"ERROR",scopeState:"UNKNOWN",resultDetected:false,changedPaths:[],head:null,error:error instanceof Error?error.message:"Git detection hiba"};}
}

export async function getCodexTaskBridgeBootstrap(taskIdValue:string){
  const taskId=text(taskIdValue,180);const state=await getCodexTaskBridge({taskId});if(!state)fail("A Task Bridge task nem található.","TASK_BRIDGE_TASK_NOT_FOUND",404);
  const bridge=record(state.bridge),bootstrapPath=text(bridge.bootstrapPath,1200),taskDir=text(bridge.taskDir,1200);
  if(!bootstrapPath||path.dirname(path.resolve(bootstrapPath))!==path.resolve(taskDir)||path.basename(bootstrapPath)!=="CODEX_BOOTSTRAP.txt")fail("A Codex bootstrap provenance hibás.","TASK_BRIDGE_BOOTSTRAP_PATH_INVALID",409);
  const prompt=await readFile(bootstrapPath,"utf8");if(scanSensitiveText(prompt).length)fail("A Codex bootstrap érzékeny adatot tartalmaz.","TASK_BRIDGE_BOOTSTRAP_SECRET_DETECTED",409);
  return {ok:true as const,taskId,prompt,sha256:sha(prompt.trim()),path:bootstrapPath};
}

export async function markCodexTaskBridgeWorkerStarted(taskIdValue:string){
  const taskId=text(taskIdValue,180),db=dbClient();const row=await taskRow(db,taskId);if(!row)fail("A Task Bridge task nem található.","TASK_BRIDGE_TASK_NOT_FOUND",404);
  const meta=record(row.metadata),bridge=record(meta.taskBridge),state=text(bridge.state,60);
  if(!["READY_FOR_WORKER","WORKER_RUNNING"].includes(state))fail(`A Codex worker nem indítható ${state||"NINCS"} állapotból.`,"TASK_BRIDGE_WORKER_START_STATE_INVALID",409);
  const next={...bridge,state:"WORKER_RUNNING",workerStartedAt:text(bridge.workerStartedAt,100)||new Date().toISOString()};
  const update=await db.from("dev_center_tasks").update({metadata:{...meta,taskBridge:next},updated_at:new Date().toISOString()}).eq("id",taskId);if(update.error)throw new Error(update.error.message);
  await syncTaskManifest(next,{status:"WORKER_RUNNING",provider:"CODEX",sessionId:text(bridge.sessionId,180)});
  await appendAudit(text(bridge.taskDir,1200),{event:"WORKER_STARTED",taskId,sessionId:text(bridge.sessionId,180),provider:"CODEX"});
  await dbAudit(db,{taskId,projectId:text(row.project_id,180),action:"TASK_BRIDGE_WORKER_STARTED",summary:`${text(row.title,500)} · Codex worker indítva.`,metadata:{sessionId:text(bridge.sessionId,180)}});
  return {ok:true as const,taskId,bridge:next};
}

export async function heartbeatCodexTaskBridge(taskIdValue: string) {
  const state = await getCodexTaskBridge({ taskId: taskIdValue }); if (!state) fail("A Task Bridge task nem található.", "TASK_BRIDGE_TASK_NOT_FOUND", 404);
  const sessionId = text(record(state.bridge).sessionId, 180); if (!sessionId) fail("A Task Bridge session hiányzik.", "TASK_BRIDGE_SESSION_MISSING", 409);
  const { heartbeatSessionAtomic } = await import("@/app/lib/dev-center/orchestration-repository");
  const heartbeat = await heartbeatSessionAtomic(sessionId, 900);
  const detection=await taskBridgeDetection(record(state.bridge));
  return { ok: true as const, taskId: state.taskId, sessionId, heartbeatAt: new Date().toISOString(), leaseSeconds: heartbeat.leaseSeconds, detection };
}
