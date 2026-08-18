#!/usr/bin/env node
import path from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const execFileAsync = promisify(execFile);
const VALID_WORKERS = new Set(["ARMINAI", "JAZMINAI", "OUTMINAI", "MFORGE", "VGUARD"]);
const SOURCE = "worker-presence-bridge";
const PRESENCE_RECORD = "WORKER_PRESENCE_V1";
const ACTIVE_TTL_MS = Math.max(120_000, Number(process.env.BENJADMIN_WORKER_PRESENCE_TTL_MS || 5 * 60_000));
const COMMIT_TTL_MS = Math.max(ACTIVE_TTL_MS, Number(process.env.BENJADMIN_WORKER_COMMIT_TTL_MS || 12 * 60_000));
const SESSION_TTL_MS = Math.max(ACTIVE_TTL_MS, Number(process.env.BENJADMIN_WORKER_SESSION_TTL_MS || 10 * 60_000));

function text(value) { return typeof value === "string" ? value.trim() : ""; }
function record(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function normalizeWorker(value) {
  const code = text(value).toUpperCase().replace(/[^A-Z]/g, "");
  if (code === "MFORGEAI") return "MFORGE";
  if (code === "VGUARDAI") return "VGUARD";
  return VALID_WORKERS.has(code) ? code : "";
}
function workerName(code) {
  return ({ ARMINAI: "ÁrminAI", JAZMINAI: "JázminAI", OUTMINAI: "OutminAI", MFORGE: "M.Forge-AI", VGUARD: "V.Guard-AI" })[code] || code;
}
function kindForPhase(phase) {
  if (phase === "build") return "BUILD_EVENT";
  if (phase === "test") return "TEST_RESULT";
  if (phase === "commit") return "COMMIT";
  if (phase === "release") return "RELEASE";
  return "CODE_ACTIVITY";
}
function stageForPhase(phase) {
  if (phase === "build" || phase === "release") return 5;
  if (phase === "test") return 3;
  if (phase === "review" || phase === "fix") return 4;
  if (phase === "commit") return 5;
  return 2;
}
function compilePatterns(values) {
  return (Array.isArray(values) ? values : []).map((value) => { try { return new RegExp(String(value), "i"); } catch { return null; } }).filter(Boolean);
}

export async function loadPresenceAliases(root) {
  const configured = process.env.BENJADMIN_WORKER_PRESENCE_CONFIG?.trim();
  const primary = configured || path.join(root, "scripts", "benjadmin-worker-presence-aliases.json");
  const fallback = path.join(path.dirname(fileURLToPath(import.meta.url)), "benjadmin-worker-presence-aliases.json");
  let raw = "";
  try { raw = await readFile(primary, "utf8"); } catch {
    raw = await readFile(fallback, "utf8");
  }
  const parsed = JSON.parse(raw);
  const workers = {};
  for (const [codeRaw, valueRaw] of Object.entries(parsed?.workers || {})) {
    const code = normalizeWorker(codeRaw);
    if (!code) continue;
    const value = record(valueRaw);
    workers[code] = {
      ownerPatterns: compilePatterns(value.ownerPatterns),
      branchPatterns: compilePatterns(value.branchPatterns),
      pathRules: (Array.isArray(value.pathRules) ? value.pathRules : []).map((item) => record(item)).filter((item) => text(item.prefix)),
    };
  }
  return { schemaVersion: Number(parsed?.schemaVersion || 1), workers };
}

export function inferWorkerFromText(value, aliases, kind = "owner") {
  const source = text(value);
  if (!source) return null;
  for (const [workerCode, config] of Object.entries(aliases.workers || {})) {
    const patterns = kind === "branch" ? config.branchPatterns : config.ownerPatterns;
    if (patterns.some((pattern) => pattern.test(source))) return { workerCode, inferredBy: `${kind}-alias`, confidence: "high" };
  }
  return null;
}

export function inferPathRule(relativePath, aliases) {
  const normalized = text(relativePath).replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized) return null;
  for (const [workerCode, config] of Object.entries(aliases.workers || {})) {
    for (const rule of config.pathRules || []) {
      if (normalized.startsWith(text(rule.prefix))) return {
        workerCode,
        relativePath: normalized,
        inferredBy: "path-alias",
        confidence: "configured",
        mainModule: text(rule.mainModule),
        moduleName: text(rule.moduleName),
        submoduleName: text(rule.submoduleName),
      };
    }
  }
  return null;
}

function evidence(input) {
  return {
    workerCode: input.workerCode,
    score: input.score,
    active: input.active !== false,
    presenceKey: input.presenceKey,
    phase: input.phase || "coding",
    summary: input.summary || `${workerName(input.workerCode)} aktív fejlesztés`,
    detail: input.detail || "",
    taskId: input.taskId || null,
    projectId: input.projectId || null,
    mainModule: input.mainModule || "",
    moduleName: input.moduleName || "",
    submoduleName: input.submoduleName || "",
    workItem: input.workItem || input.summary || "Aktív fejlesztés",
    operation: input.operation || null,
    owner: input.owner || null,
    worktree: input.worktree || null,
    branch: input.branch || null,
    target: input.target || null,
    workStageIndex: Number.isFinite(Number(input.workStageIndex)) ? Math.max(1, Math.min(6, Math.round(Number(input.workStageIndex)))) : null,
    startedAt: input.startedAt || null,
    heartbeatAt: input.heartbeatAt || null,
    nextStep: input.nextStep || null,
    buildLockWaiting: input.buildLockWaiting === true,
    schedulerRunId: input.schedulerRunId || null,
    schedulerSlotAt: input.schedulerSlotAt || null,
    inferredBy: input.inferredBy || "unknown",
    confidence: input.confidence || "unknown",
    detectedAt: input.detectedAt || new Date().toISOString(),
  };
}

async function readJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return null; }
}

async function collectLeaseEvidence(coordinationRoot, nowMs) {
  const dir = path.join(coordinationRoot, "worker-presence-leases");
  let files = [];
  try { files = await readdir(dir); } catch { return []; }
  const items = [];
  for (const name of files.filter((item) => item.endsWith(".json"))) {
    const lease = await readJson(path.join(dir, name));
    const code = normalizeWorker(lease?.workerCode);
    const expiresAt = Date.parse(text(lease?.expiresAt));
    if (!code || !Number.isFinite(expiresAt) || expiresAt <= nowMs) continue;
    items.push(evidence({
      workerCode: code, score: 110, presenceKey: `lease:${code}:${text(lease?.leaseId) || name}`,
      phase: text(lease?.phase) || "coding", summary: text(lease?.summary) || `${workerName(code)} aktív fejlesztési lease`,
      detail: text(lease?.detail) || "A worker explicit BENJADMIN presence lease-szel dolgozik.", taskId: text(lease?.taskId) || null,
      projectId: text(lease?.projectId) || null, mainModule: text(lease?.mainModule), moduleName: text(lease?.moduleName),
      submoduleName: text(lease?.submoduleName), workItem: text(lease?.workItem), operation: text(lease?.operation) || null,
      owner: text(lease?.owner) || null, worktree: text(lease?.worktree) || null, branch: text(lease?.branch) || null,
      inferredBy: "explicit-lease", confidence: "explicit", detectedAt: text(lease?.heartbeatAt) || text(lease?.startedAt) || new Date(nowMs).toISOString(),
    }));
  }
  return items;
}

async function collectReleasedLeaseKeys(coordinationRoot) {
  const dir = path.join(coordinationRoot, "worker-presence-leases");
  let files = [];
  try { files = await readdir(dir); } catch { return new Set(); }
  const released = new Set();
  for (const name of files.filter((item) => item.endsWith(".json"))) {
    const lease = await readJson(path.join(dir, name));
    const code = normalizeWorker(lease?.workerCode);
    const leaseId = text(lease?.leaseId) || name;
    if (!code || text(lease?.state).toUpperCase() !== "RELEASED") continue;
    released.add(`lease:${code}:${leaseId}`);
  }
  return released;
}

async function collectSessionEvidence(client, nowMs) {
  const [sessions, workers, tasks] = await Promise.all([
    client.from("dev_center_worker_sessions").select("id,worker_id,task_id,status,handshake_stage,branch_name,worktree_path,opened_at,last_heartbeat_at,updated_at").neq("status", "closed").order("updated_at", { ascending: false }).limit(80),
    client.from("dev_center_workers").select("id,code,name").limit(30),
    client.from("dev_center_tasks").select("id,project_id,title,status,metadata").limit(160),
  ]);
  if (sessions.error || workers.error || tasks.error) return [];
  const workerMap = new Map((workers.data || []).map((row) => [row.id, normalizeWorker(row.code)]));
  const taskMap = new Map((tasks.data || []).map((row) => [row.id, row]));
  const items = [];
  for (const session of sessions.data || []) {
    const code = workerMap.get(session.worker_id) || "";
    if (!code) continue;
    const heartbeatAt = text(session.last_heartbeat_at || session.updated_at || session.opened_at);
    const heartbeatMs = Date.parse(heartbeatAt);
    if (!Number.isFinite(heartbeatMs) || nowMs - heartbeatMs > SESSION_TTL_MS) continue;
    const task = taskMap.get(session.task_id) || null;
    const meta = record(task?.metadata);
    const context = record(meta.developmentContext);
    items.push(evidence({
      workerCode: code, score: 120, presenceKey: `session:${session.id}`,
      phase: task?.status === "testing" ? "test" : "coding",
      summary: task?.title ? `${workerName(code)} · ${task.title}` : `${workerName(code)} aktív worker session`,
      detail: `BENJADMIN worker session aktív · ${text(session.handshake_stage) || "SESSION"}.`, taskId: text(session.task_id) || null,
      projectId: text(task?.project_id) || null, mainModule: text(context.mainModule), moduleName: text(context.moduleName),
      submoduleName: text(context.submoduleName), workItem: text(context.workItem) || text(task?.title), worktree: text(session.worktree_path) || null,
      branch: text(session.branch_name) || null, inferredBy: "task-session", confidence: "explicit", detectedAt: heartbeatAt,
    }));
  }
  return items;
}

async function collectSchedulerEvidence(client, coordinationRoot, nowMs) {
  const runsResult = await client.from("dev_center_decision_memory")
    .select("id,decision_key,metadata,created_at,updated_at")
    .eq("category", "development_scheduler_run")
    .order("updated_at", { ascending: false })
    .limit(80);
  if (runsResult.error) return [];
  const candidates = (runsResult.data || []).map((row) => {
    const meta = record(row.metadata);
    return { row, meta, workerCode: normalizeWorker(meta.workerCode), status: text(meta.runStatus), taskId: text(meta.taskId) };
  }).filter((item) => item.workerCode && ["running", "ready_for_pull", "worker_active"].includes(item.status));
  if (!candidates.length) return [];
  const taskIds = [...new Set(candidates.map((item) => item.taskId).filter(Boolean))];
  let taskMap = new Map();
  if (taskIds.length) {
    const taskResult = await client.from("dev_center_tasks").select("id,project_id,title,status,metadata,updated_at").in("id", taskIds);
    if (!taskResult.error) taskMap = new Map((taskResult.data || []).map((task) => [text(task.id), task]));
  }
  const operationState = await readJson(path.join(coordinationRoot, "active-development.json"));
  const exclusiveBusy = Boolean(operationState && text(operationState.status).toLowerCase() === "running" && ["build", "restart", "migration", "release"].includes(text(operationState.operation).toLowerCase()));
  const items = [];
  for (const item of candidates) {
    const updatedAt = text(item.row.updated_at || item.meta.startedAt || item.row.created_at);
    const updatedMs = Date.parse(updatedAt);
    if (!Number.isFinite(updatedMs) || nowMs - updatedMs > 90 * 60_000) continue;
    const task = taskMap.get(item.taskId) || null;
    const taskMeta = record(task?.metadata);
    const context = record(taskMeta.developmentContext);
    const stage = Number(context.workStageIndex || taskMeta.workStageIndex || (item.status === "worker_active" ? 2 : 1));
    const buildLockWaiting = exclusiveBusy && normalizeWorker(operationState?.workerCode) !== item.workerCode;
    const nextStep = buildLockWaiting
      ? "Közös build lock felszabadulására vár."
      : item.status === "ready_for_pull"
        ? "ChatGPT pull / worker ébresztés felvétele."
        : item.status === "worker_active"
          ? "Az aktív fejlesztési task folytatása."
          : "Scheduler routing és worker-kijelölés befejezése.";
    const title = text(task?.title) || text(item.meta.summary) || "Éjszakai scheduler futás";
    items.push(evidence({
      workerCode: item.workerCode, score: 115,
      presenceKey: `scheduler:${text(item.meta.scheduleId)}:${text(item.meta.slotAt)}:${item.workerCode}`,
      phase: item.status === "worker_active" ? (text(task?.status) === "testing" ? "test" : "coding") : "planning",
      summary: `${workerName(item.workerCode)} · SCHEDULER · ${title}`,
      detail: `Éjszakai scheduler run: ${item.status}. Indulás: ${text(item.meta.startedAt) || text(item.row.created_at)}. Utolsó heartbeat: ${updatedAt}. Következő: ${nextStep}`,
      taskId: item.taskId || null, projectId: text(task?.project_id) || null,
      mainModule: text(context.mainModule) || "BENJADMIN",
      moduleName: text(context.moduleName) || "Fejlesztési ütemező",
      submoduleName: text(context.submoduleName) || "Éjszakai / órás futási lánc",
      workItem: text(context.workItem) || title,
      workStageIndex: stage, startedAt: text(item.meta.startedAt) || text(item.row.created_at), heartbeatAt: updatedAt, nextStep, buildLockWaiting,
      schedulerRunId: text(item.row.id), schedulerSlotAt: text(item.meta.slotAt),
      inferredBy: "scheduler-run", confidence: "explicit", detectedAt: updatedAt,
    }));
  }
  return items;
}

async function collectOperationEvidence(coordinationRoot, aliases, nowMs) {
  const state = await readJson(path.join(coordinationRoot, "active-development.json"));
  if (!state || text(state.status).toLowerCase() !== "running") return [];
  let match = normalizeWorker(state.workerCode) ? { workerCode: normalizeWorker(state.workerCode), inferredBy: "operation-worker-code", confidence: "explicit" } : null;
  if (!match) match = inferWorkerFromText(`${text(state.owner)} ${text(state.task)}`, aliases, "owner");
  if (!match) match = inferWorkerFromText(text(state.command), aliases, "branch");
  if (!match) return [];
  const phase = text(state.operation).toLowerCase() === "build" ? "build" : text(state.operation).toLowerCase() === "release" ? "release" : "coding";
  const startedAt = text(state.startedAt) || new Date(nowMs).toISOString();
  return [evidence({
    workerCode: match.workerCode, score: 105, presenceKey: `operation:${text(state.bootId)}:${text(state.pid)}:${text(state.startedAt)}`,
    phase, summary: `${workerName(match.workerCode)} · ${phase.toUpperCase()} · ${text(state.task) || text(state.operation) || "koordinált művelet"}`,
    detail: `A BENJADMIN monitor a központi fejlesztési koordinációs lockból észlelte az aktív ${text(state.operation) || "művelet"} folyamatot.`,
    operation: text(state.operation), owner: text(state.owner), target: text(state.target) || null, inferredBy: match.inferredBy,
    confidence: match.confidence, detectedAt: startedAt,
  })];
}

async function git(root, args, maxBuffer = 1024 * 1024) {
  try { const result = await execFileAsync("git", ["-C", root, ...args], { timeout: 5000, maxBuffer }); return result.stdout; } catch { return ""; }
}

async function collectDirtyEvidence(root, aliases, nowMs) {
  const raw = await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], 2 * 1024 * 1024);
  if (!raw) return [];
  const grouped = new Map();
  for (const item of raw.split("\0").filter(Boolean)) {
    const relativePath = item.length > 3 ? item.slice(3) : "";
    const rule = inferPathRule(relativePath, aliases);
    if (!rule) continue;
    let modifiedMs = 0;
    try { modifiedMs = (await stat(path.join(root, relativePath))).mtimeMs; } catch { continue; }
    if (!modifiedMs || nowMs - modifiedMs > ACTIVE_TTL_MS) continue;
    const current = grouped.get(rule.workerCode) || { rule, paths: [], latestMs: 0 };
    current.paths.push(relativePath);
    current.latestMs = Math.max(current.latestMs, modifiedMs);
    if (!current.rule.mainModule && rule.mainModule) current.rule = rule;
    grouped.set(rule.workerCode, current);
  }
  const branch = text(await git(root, ["branch", "--show-current"]));
  return [...grouped.entries()].map(([code, value]) => evidence({
    workerCode: code, score: 90, presenceKey: `dirty:${code}:${branch || path.basename(root)}`, phase: "coding",
    summary: `${workerName(code)} · KÓDOLÁS · ${value.rule.moduleName || value.rule.mainModule || "fejlesztés"}`,
    detail: `Frissen módosított fájlok: ${value.paths.slice(0, 4).join(", ")}${value.paths.length > 4 ? ` (+${value.paths.length - 4})` : ""}.`,
    mainModule: value.rule.mainModule, moduleName: value.rule.moduleName, submoduleName: value.rule.submoduleName,
    workItem: value.paths[0] || "Aktív fájlmódosítás", worktree: root, branch, inferredBy: "recent-file-path", confidence: "configured",
    detectedAt: new Date(value.latestMs).toISOString(),
  }));
}

async function collectRecentCommitEvidence(root, aliases, nowMs) {
  const raw = await git(root, ["log", "-5", "--format=%H%x1f%ct%x1f%s"]);
  if (!raw) return [];
  const items = [];
  for (const line of raw.split("\n").filter(Boolean)) {
    const [hash, epoch, subject] = line.split("\x1f");
    const commitMs = Number(epoch) * 1000;
    if (!hash || !Number.isFinite(commitMs) || nowMs - commitMs > COMMIT_TTL_MS) continue;
    const paths = (await git(root, ["show", "--pretty=format:", "--name-only", hash])).split("\n").map((item) => item.trim()).filter(Boolean);
    const grouped = new Map();
    for (const relativePath of paths) {
      const rule = inferPathRule(relativePath, aliases);
      if (!rule) continue;
      const current = grouped.get(rule.workerCode) || { rule, paths: [] };
      current.paths.push(relativePath);
      grouped.set(rule.workerCode, current);
    }
    for (const [code, value] of grouped.entries()) items.push(evidence({
      workerCode: code, score: 75, presenceKey: `commit:${code}:${hash}`, phase: "commit",
      summary: `${workerName(code)} · COMMIT · ${subject || hash.slice(0, 10)}`,
      detail: `A friss commit ${value.paths.length} konfigurált ${value.rule.mainModule || "fejlesztési"} fájlt érint.`,
      mainModule: value.rule.mainModule, moduleName: value.rule.moduleName, submoduleName: value.rule.submoduleName,
      workItem: subject || value.paths[0], worktree: root, branch: text(await git(root, ["branch", "--show-current"])),
      inferredBy: "recent-commit-path", confidence: "configured", detectedAt: new Date(commitMs).toISOString(),
    }));
  }
  return items;
}

export async function collectWorkerPresenceEvidence({ client, root, coordinationRoot, now = Date.now() }) {
  const aliases = await loadPresenceAliases(root);
  const chunks = await Promise.all([
    collectLeaseEvidence(coordinationRoot, now),
    collectSessionEvidence(client, now),
    collectSchedulerEvidence(client, coordinationRoot, now),
    collectOperationEvidence(coordinationRoot, aliases, now),
    collectDirtyEvidence(root, aliases, now),
    collectRecentCommitEvidence(root, aliases, now),
  ]);
  const best = new Map();
  for (const item of chunks.flat()) {
    const current = best.get(item.workerCode);
    if (!current || item.score > current.score || (item.score === current.score && Date.parse(item.detectedAt) > Date.parse(current.detectedAt))) best.set(item.workerCode, item);
  }
  return [...best.values()];
}

function mergeMetadata(existing, patch) { return { ...record(existing), ...patch }; }

export async function syncWorkerPresence({ client, root, coordinationRoot, now = Date.now() }) {
  const [detected, releasedPresenceKeys] = await Promise.all([
    collectWorkerPresenceEvidence({ client, root, coordinationRoot, now }),
    collectReleasedLeaseKeys(coordinationRoot),
  ]);
  const existing = await client.from("dev_center_live_worklog")
    .select("id,worker_code,phase,summary,detail,source,metadata,created_at")
    .eq("source", SOURCE).order("created_at", { ascending: false }).limit(40);
  if (existing.error) throw new Error(`WORKER_PRESENCE_READ_FAILED:${existing.error.code || existing.error.message}`);
  const latestByWorker = new Map();
  for (const row of existing.data || []) {
    const code = normalizeWorker(row.worker_code);
    if (code && !latestByWorker.has(code)) latestByWorker.set(code, row);
  }
  const detectedCodes = new Set(detected.map((item) => item.workerCode));
  let inserted = 0, updated = 0, ended = 0;
  for (const item of detected) {
    const latest = latestByWorker.get(item.workerCode);
    const latestMeta = record(latest?.metadata);
    const nextMeta = {
      recordType: PRESENCE_RECORD, kind: kindForPhase(item.phase), presenceState: "ACTIVE", presenceKey: item.presenceKey,
      lastSeenAt: new Date(now).toISOString(), detectedAt: item.detectedAt, inferredBy: item.inferredBy, confidence: item.confidence,
      operation: item.operation, owner: item.owner, worktree: item.worktree, branch: item.branch, target: item.target,
      workStageIndex: item.workStageIndex, startedAt: item.startedAt, heartbeatAt: item.heartbeatAt, nextStep: item.nextStep,
      buildLockWaiting: item.buildLockWaiting, schedulerRunId: item.schedulerRunId, schedulerSlotAt: item.schedulerSlotAt,
      projectId: item.projectId, mainModule: item.mainModule, moduleName: item.moduleName, submoduleName: item.submoduleName,
      workItem: item.workItem, workStageIndex: stageForPhase(item.phase), activityAction: item.summary,
      activityNarrative: item.detail || `A BENJADMIN automatikusan észlelte ${workerName(item.workerCode)} aktív fejlesztési munkáját.`,
      productionAccess: "DENY",
    };
    if (latest && text(latestMeta.presenceKey) === item.presenceKey && text(latestMeta.presenceState) === "ACTIVE") {
      const result = await client.from("dev_center_live_worklog").update({
        phase: item.phase, summary: item.summary, detail: item.detail, metadata: mergeMetadata(latestMeta, nextMeta),
      }).eq("id", latest.id);
      if (result.error) throw new Error(`WORKER_PRESENCE_UPDATE_FAILED:${result.error.code || result.error.message}`);
      updated++;
    } else {
      if (latest && text(latestMeta.presenceState) === "ACTIVE") {
        const close = await client.from("dev_center_live_worklog").update({ metadata: mergeMetadata(latestMeta, { presenceState: "ENDED", endedAt: new Date(now).toISOString() }) }).eq("id", latest.id);
        if (!close.error) ended++;
      }
      const result = await client.from("dev_center_live_worklog").insert({
        worker_code: item.workerCode, task_id: item.taskId, phase: item.phase, level: "info", summary: item.summary, detail: item.detail,
        progress_percent: null, source: SOURCE, metadata: nextMeta,
      });
      if (result.error) throw new Error(`WORKER_PRESENCE_INSERT_FAILED:${result.error.code || result.error.message}`);
      inserted++;
    }
  }
  for (const [code, latest] of latestByWorker.entries()) {
    const meta = record(latest.metadata);
    if (text(meta.presenceState) !== "ACTIVE") continue;
    const presenceKey = text(meta.presenceKey);
    if (releasedPresenceKeys.has(presenceKey)) {
      const result = await client.from("dev_center_live_worklog").update({ metadata: mergeMetadata(meta, { presenceState: "ENDED", endedAt: new Date(now).toISOString(), endReason: "LEASE_RELEASED" }) }).eq("id", latest.id);
      if (!result.error) ended++;
      continue;
    }
    if (detectedCodes.has(code)) continue;
    const lastSeenMs = Date.parse(text(meta.lastSeenAt || latest.created_at));
    if (Number.isFinite(lastSeenMs) && now - lastSeenMs < ACTIVE_TTL_MS) continue;
    const result = await client.from("dev_center_live_worklog").update({ metadata: mergeMetadata(meta, { presenceState: "ENDED", endedAt: new Date(now).toISOString() }) }).eq("id", latest.id);
    if (!result.error) ended++;
  }
  return { ok: true, detected: detected.map((item) => ({ workerCode: item.workerCode, phase: item.phase, inferredBy: item.inferredBy, presenceKey: item.presenceKey })), inserted, updated, ended, productionAccess: "DENY" };
}

async function main() {
  try { process.loadEnvFile?.(".env.local"); } catch {}
  const root = path.resolve(process.env.DIMPRO_PROJECT_ROOT?.trim() || process.cwd());
  const coordinationRoot = process.env.DIMPRO_COORDINATION_ROOT?.trim() || (root.startsWith("/srv/dimpro-dev/") ? "/srv/dimpro-dev/coordination" : path.join(root, ".dimprover"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("WORKER_PRESENCE_DB_CONFIG_MISSING");
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  console.log(JSON.stringify(await syncWorkerPresence({ client, root, coordinationRoot }), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => { console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })); process.exit(1); });
}
