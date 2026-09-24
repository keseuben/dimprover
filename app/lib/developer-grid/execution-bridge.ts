"server-only";

import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { appendFile, chmod, lstat, mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { analyzeTechnicalScope } from "@/app/lib/dev-center/ai-worker/scope-analyzer";
import { classifyScopePath } from "@/app/lib/dev-center/ai-worker/scope-policy";
import { assertDevEngineOperation } from "@/app/lib/dev-center/engine-repository";
import { getDeveloperGridActiveWork, recoverDeveloperGridExecutionBridgeSession } from "./work-start";

const execFileAsync = promisify(execFile);
const EXECUTION_ROOT = process.env.BENJADMIN_DEVELOPER_GRID_EXECUTION_ROOT?.trim() || "/srv/dimpro-dev/coordination/developer-grid/execution";
const MAX_READ_BYTES = 256 * 1024;
const MAX_WRITE_BYTES = 384 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_SEARCH_RESULTS = 240;
const EXECUTION_ACTIONS = new Set(["LIST_FILES", "READ_FILE", "SEARCH_FILES", "WRITE_FILE", "GIT_STATUS", "GIT_DIFF", "GIT_DIFF_CHECK", "RUN_DEV_COMMAND"]);
const INTERNAL_WORKERS = new Set(["ARMINAI", "OUTMINAI", "BENJAMINAI", "JAZMINAI"]);
const SKIP_DIRS = new Set([".git", ".next", "node_modules"]);

type ExecutionAction = "LIST_FILES" | "READ_FILE" | "SEARCH_FILES" | "WRITE_FILE" | "GIT_STATUS" | "GIT_DIFF" | "GIT_DIFF_CHECK" | "RUN_DEV_COMMAND";
type Input = {
  schemaVersion?: unknown;
  requestId?: unknown;
  taskId?: unknown;
  sessionId?: unknown;
  workerCode?: unknown;
  sourceProofSha256?: unknown;
  action?: unknown;
  path?: unknown;
  query?: unknown;
  content?: unknown;
  startLine?: unknown;
  endLine?: unknown;
  depth?: unknown;
  command?: unknown;
};
type Result = { status: "PASS" | "FAIL" | "BLOCKED"; code: string; summary: string; data?: Record<string, unknown> };
type ScopeCandidate = { path: string; riskLevel: string; decision: string };
type ScopePlan = {
  moduleName: string;
  readablePaths: string[];
  writablePaths: string[];
  candidates: ScopeCandidate[];
};

export class DeveloperGridExecutionError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;
  constructor(message: string, code: string, status = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = "DeveloperGridExecutionError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function text(value: unknown, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function normalizePath(value: string) { return value.replaceAll("\\", "/").replace(/^\.\//, ""); }
function workerCode(value: unknown) { const raw = text(value, 40).toUpperCase(); return raw === "BENAI" ? "BENJAMINAI" : raw; }
function sha(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function safeRequestId(value: unknown) {
  const id = text(value, 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/.test(id)) throw new DeveloperGridExecutionError("Érvénytelen execution requestId.", "EXECUTION_REQUEST_ID_INVALID", 400);
  return id;
}
function actionName(value: unknown) {
  const action = text(value, 40).toUpperCase();
  if (!EXECUTION_ACTIONS.has(action)) throw new DeveloperGridExecutionError("Ismeretlen execution action.", "EXECUTION_ACTION_INVALID", 400);
  return action as ExecutionAction;
}
function cleanRel(value: unknown, allowEmpty = false) {
  const raw = text(value, 1000).replaceAll("\\", "/");
  if (!raw && allowEmpty) return "";
  if (!raw || raw.startsWith("/") || raw.includes("\0")) throw new DeveloperGridExecutionError("Csak relatív worktree path engedélyezett.", "EXECUTION_PATH_INVALID", 400);
  const normalized = path.posix.normalize(raw.replace(/^\.\//, ""));
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new DeveloperGridExecutionError("A path kilépne a task worktree-ből.", "EXECUTION_PATH_ESCAPE", 403);
  }
  if (normalized.split("/").some((part) => SKIP_DIRS.has(part))) {
    throw new DeveloperGridExecutionError("A belső Git/build/dependency path nem elérhető az Execution Bridge-en.", "EXECUTION_INTERNAL_PATH_DENIED", 403);
  }
  return normalized;
}
function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
function output(value: string, max = MAX_OUTPUT_BYTES) {
  const buffer = Buffer.from(value || "", "utf8");
  return buffer.length <= max ? String(value || "") : `${buffer.subarray(0, max).toString("utf8")}\n…[OUTPUT_TRUNCATED]`;
}
function publicRequestHash(input: Input) {
  return sha(JSON.stringify({
    schemaVersion: 1,
    requestId: text(input.requestId, 120),
    taskId: text(input.taskId, 220),
    sessionId: text(input.sessionId, 240),
    workerCode: workerCode(input.workerCode),
    sourceProofSha256: text(input.sourceProofSha256, 80).toLowerCase(),
    action: text(input.action, 40).toUpperCase(),
    path: text(input.path, 1000),
    query: text(input.query, 1000),
    contentSha256: typeof input.content === "string" ? sha(input.content) : null,
    startLine: Number(input.startLine) || null,
    endLine: Number(input.endLine) || null,
    depth: Number(input.depth) || null,
    command: text(input.command, 80).toUpperCase(),
  }));
}

async function appendAudit(taskId: string, row: Record<string, unknown>) {
  await mkdir(EXECUTION_ROOT, { recursive: true, mode: 0o700 });
  const file = path.join(EXECUTION_ROOT, `${taskId.replace(/[^A-Za-z0-9._-]/g, "_")}.jsonl`);
  await appendFile(file, `${JSON.stringify(row)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(file, 0o600).catch(() => undefined);
}
async function findAudit(taskId: string, requestId: string) {
  const file = path.join(EXECUTION_ROOT, `${taskId.replace(/[^A-Za-z0-9._-]/g, "_")}.jsonl`);
  let body = "";
  try { body = await readFile(file, "utf8"); } catch { return null; }
  const lines = body.trim().split(/\r?\n/).slice(-800).reverse();
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (row?.requestId === requestId && row?.event === "RESULT") return row;
    } catch { /* ignore malformed historical audit row */ }
  }
  return null;
}

async function canonicalRoot(root: string) {
  if (!root.startsWith("/srv/dimpro-dev/worktrees/")) throw new DeveloperGridExecutionError("A task worktree nem canonical DEV worktree.", "EXECUTION_WORKTREE_DENIED", 403);
  const resolved = await realpath(root).catch(() => "");
  if (!resolved || !resolved.startsWith("/srv/dimpro-dev/worktrees/")) throw new DeveloperGridExecutionError("A task worktree nem olvasható.", "EXECUTION_WORKTREE_UNAVAILABLE", 409);
  return resolved;
}
async function existingPath(root: string, rel: string) {
  const rootReal = await canonicalRoot(root);
  const target = await realpath(path.join(rootReal, rel)).catch(() => "");
  if (!target || !(target === rootReal || target.startsWith(`${rootReal}${path.sep}`))) throw new DeveloperGridExecutionError("A kért path nem létezik vagy kilép a worktree-ből.", "EXECUTION_PATH_NOT_FOUND", 404);
  return { root: rootReal, target };
}
function pathWithinPrefix(filePath: string, prefix: string) {
  return filePath === prefix || filePath.startsWith(`${prefix}/`);
}
function pathInScope(rel: string, allowed: string[]) {
  const normalized = normalizePath(rel);
  return allowed.some((item) => normalizePath(item) === normalized);
}
function newFileDirectoryAllowed(rel: string, writable: string[]) {
  const dir = path.posix.dirname(normalizePath(rel));
  return writable.some((item) => path.posix.dirname(normalizePath(item)) === dir);
}
function assertReadableScope(rel: string, scope: ScopePlan) {
  if (!pathInScope(rel, scope.readablePaths)) {
    throw new DeveloperGridExecutionError("A kért path nincs a Central Core által elemzett task scope-ban.", "EXECUTION_SCOPE_DENIED", 403, { path: rel, moduleName: scope.moduleName });
  }
}
async function assertWritablePath(root: string, rel: string, scope: ScopePlan) {
  const rootReal = await canonicalRoot(root);
  const policy = classifyScopePath(rel);
  if (policy.decision === "DENIED") throw new DeveloperGridExecutionError(`Tiltott RED path: ${rel}.`, "EXECUTION_RED_PATH_DENIED", 403, { reasons: policy.reasons });
  if (policy.decision !== "AUTO_APPROVED") throw new DeveloperGridExecutionError("YELLOW/shared path automatikus Execution Bridge írása tiltott.", "EXECUTION_SCOPE_REVIEW_REQUIRED", 403, { path: rel, reasons: policy.reasons });

  let exists = false;
  try { await lstat(path.join(rootReal, rel)); exists = true; } catch { exists = false; }
  if (exists) {
    if (!pathInScope(rel, scope.writablePaths)) throw new DeveloperGridExecutionError("A fájl nincs a task AUTO_APPROVED write scope-jában.", "EXECUTION_SCOPE_DENIED", 403, { path: rel, moduleName: scope.moduleName });
  } else if (!newFileDirectoryAllowed(rel, scope.writablePaths)) {
    throw new DeveloperGridExecutionError("Új fájl csak task-analyzer által igazolt AUTO_APPROVED könyvtárban hozható létre.", "EXECUTION_NEW_FILE_SCOPE_DENIED", 403, { path: rel, moduleName: scope.moduleName });
  }

  const parts = rel.split("/");
  let cursor = rootReal;
  for (const part of parts.slice(0, -1)) {
    cursor = path.join(cursor, part);
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink()) throw new DeveloperGridExecutionError("Symlinkelt célkönyvtár nem írható.", "EXECUTION_SYMLINK_DENIED", 403);
    } catch (error) {
      if (error instanceof DeveloperGridExecutionError) throw error;
      break;
    }
  }
  const absolute = path.join(rootReal, rel);
  if (!(absolute === rootReal || absolute.startsWith(`${rootReal}${path.sep}`))) throw new DeveloperGridExecutionError("A célpath kilép a worktree-ből.", "EXECUTION_PATH_ESCAPE", 403);
  try {
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new DeveloperGridExecutionError("Symlinkelt fájl nem írható.", "EXECUTION_SYMLINK_DENIED", 403);
  } catch (error) {
    if (error instanceof DeveloperGridExecutionError) throw error;
  }
  return { root: rootReal, target: absolute, policy };
}

async function git(root: string, args: string[], timeout = 15_000) {
  try {
    const result = await execFileAsync("/usr/bin/git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024, timeout });
    return { code: 0, stdout: String(result.stdout || ""), stderr: String(result.stderr || "") };
  } catch (error) {
    const candidate = error as { code?: number | string; stdout?: string; stderr?: string };
    return { code: typeof candidate.code === "number" ? candidate.code : 1, stdout: String(candidate.stdout || ""), stderr: String(candidate.stderr || "") };
  }
}
async function buildScopePlan(input: { root: string; taskTitle: string; sourcePrompt: string; moduleName: string }): Promise<ScopePlan> {
  const analysis = await analyzeTechnicalScope({ title: input.taskTitle, goal: input.sourcePrompt, moduleHint: input.moduleName || null }, input.root);
  const candidates = analysis.candidates.map((item) => ({ path: normalizePath(item.path), riskLevel: item.riskLevel, decision: item.decision }));
  const readablePaths = candidates.filter((item) => item.decision !== "DENIED").map((item) => item.path);
  const writablePaths = candidates.filter((item) => item.decision === "AUTO_APPROVED" && item.riskLevel === "GREEN").map((item) => item.path);
  if (!readablePaths.length) throw new DeveloperGridExecutionError("A Central Core scope-analyzer nem igazolt olvasható task pathot.", "EXECUTION_SCOPE_EMPTY", 409, { moduleName: input.moduleName });
  return { moduleName: input.moduleName, readablePaths, writablePaths, candidates };
}

async function validateContext(input: Input) {
  if (Number(input.schemaVersion) !== 1) throw new DeveloperGridExecutionError("Ismeretlen execution schemaVersion.", "EXECUTION_SCHEMA_INVALID", 400);
  const requestId = safeRequestId(input.requestId);
  const taskId = text(input.taskId, 220);
  const sessionId = text(input.sessionId, 240);
  const worker = workerCode(input.workerCode);
  const proofSha = text(input.sourceProofSha256, 80).toLowerCase();
  const action = actionName(input.action);
  if (!taskId || !sessionId || !INTERNAL_WORKERS.has(worker) || !/^[0-9a-f]{64}$/.test(proofSha)) throw new DeveloperGridExecutionError("Hiányos execution identity.", "EXECUTION_IDENTITY_INVALID", 400);

  const active = await getDeveloperGridActiveWork();
  const task = active.task;
  const gridSession = (active.sessions || []).find((session) => session.id === sessionId) || null;
  if (!task || task.id !== taskId || !gridSession) throw new DeveloperGridExecutionError("Az execution request nem az authoritative aktív Grid task/sessionhöz tartozik.", "EXECUTION_ACTIVE_WORK_MISMATCH", 409);
  if (workerCode(gridSession.workerCode) !== worker) throw new DeveloperGridExecutionError("A worker identity eltér az authoritative Grid sessiontől.", "EXECUTION_WORKER_MISMATCH", 409);

  const context = gridSession.developmentContext || {};
  if (String(context.bootAckState || "").toUpperCase() !== "VALIDATED" || context.bootAckCodingAllowed !== true) throw new DeveloperGridExecutionError("Execution csak validált BOOT ACK után engedélyezett.", "EXECUTION_BOOT_ACK_REQUIRED", 409);
  const proof = context.sourceExecutionProof as Record<string, unknown> | null;
  if (!proof || text(proof.sha256, 80).toLowerCase() !== proofSha || text(proof.state, 40) !== "VERIFIED" || text(proof.authority, 40) !== "CENTRAL_CORE") {
    throw new DeveloperGridExecutionError("A Central Core source proof eltér vagy hiányzik.", "EXECUTION_SOURCE_PROOF_MISMATCH", 409);
  }

  let engineSessionId = text(context.engineSessionId, 240);
  if (!engineSessionId) throw new DeveloperGridExecutionError("Hiányzó Dev Center engine session.", "EXECUTION_ENGINE_SESSION_REQUIRED", 409);
  const operation = action === "RUN_DEV_COMMAND" ? "test" : "write";
  let effectiveProof = proof;
  let recovery: null | {
    previousEngineSessionId: string;
    engineSessionId: string;
    previousSourceProofSha256: string;
    sourceProofSha256: string;
  } = null;
  let authorization;
  try {
    authorization = await assertDevEngineOperation(engineSessionId, operation);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
    const recoverable = new Set(["DEV_CENTER_SESSION_NOT_READY", "DEV_CENTER_SESSION_LEASE_EXPIRED", "DEV_CENTER_SCOPE_LOCK_REQUIRED", "DEV_CENTER_WORKTREE_LEASE_REQUIRED"]);
    if (!recoverable.has(code)) throw error;
    const recovered = await recoverDeveloperGridExecutionBridgeSession({
      taskId,
      gridSessionId:sessionId,
      workerCode:worker as "ARMINAI" | "OUTMINAI" | "BENJAMINAI" | "JAZMINAI",
      sourceProofSha256:proofSha,
    });
    engineSessionId = recovered.engineSessionId;
    effectiveProof = recovered.sourceExecutionProof as unknown as Record<string, unknown>;
    recovery = {
      previousEngineSessionId:recovered.previousEngineSessionId,
      engineSessionId:recovered.engineSessionId,
      previousSourceProofSha256:recovered.previousSourceProofSha256,
      sourceProofSha256:recovered.sourceExecutionProof.sha256,
    };
    authorization = await assertDevEngineOperation(engineSessionId, operation);
  }
  const root = text(gridSession.sourceProvenance?.worktree, 1200);
  if (!root || root !== text(authorization.session.worktreePath, 1200) || engineSessionId !== text(effectiveProof.engineSessionId, 240)) {
    throw new DeveloperGridExecutionError("A worktree/session binding eltér a proof állapotától.", "EXECUTION_WORKTREE_BINDING_MISMATCH", 409);
  }

  const head = text(gridSession.sourceProvenance?.head, 80).toLowerCase();
  const branch = text(gridSession.sourceProvenance?.branch, 600);
  const rootReal = await canonicalRoot(root);
  const [actualHead, actualBranch] = await Promise.all([git(rootReal, ["rev-parse", "HEAD"]), git(rootReal, ["branch", "--show-current"])]);
  if (actualHead.code !== 0 || actualBranch.code !== 0 || actualHead.stdout.trim().toLowerCase() !== head || actualBranch.stdout.trim() !== branch) {
    throw new DeveloperGridExecutionError("A task Git provenance execution előtt eltért.", "EXECUTION_SOURCE_STALE", 409);
  }

  const scopePlan = await buildScopePlan({
    root: rootReal,
    taskTitle: text(task.title, 500),
    sourcePrompt: text(context.sourcePrompt, 12_000) || text(task.title, 500),
    moduleName: text(context.moduleName, 180),
  });
  return {
    requestId, taskId, sessionId, worker, proofSha, action, engineSessionId, root: rootReal, scopePlan, requestHash: publicRequestHash(input),
    authoritativeSourceProofSha256:text(effectiveProof.sha256, 80).toLowerCase(),
    recovery,
  };
}

async function listFiles(scope: ScopePlan, input: Input): Promise<Result> {
  const rel = cleanRel(input.path, true);
  const depth = clampInt(input.depth, 1, 4, 2);
  const prefixDepth = rel ? rel.split("/").length : 0;
  const rows = scope.candidates
    .filter((item) => item.decision !== "DENIED")
    .filter((item) => !rel || pathWithinPrefix(item.path, rel) || pathWithinPrefix(rel, item.path))
    .filter((item) => item.path.split("/").length <= prefixDepth + depth + 1)
    .map((item) => `${item.decision === "AUTO_APPROVED" ? "W" : "R"} ${item.path} · ${item.riskLevel}`)
    .slice(0, 200);
  if (!rows.length) throw new DeveloperGridExecutionError("A megadott LIST_FILES prefix alatt nincs task-scope candidate.", "EXECUTION_SCOPE_DENIED", 403, { path: rel || ".", moduleName: scope.moduleName });
  return { status: "PASS", code: "EXECUTION_LIST_OK", summary: `${rows.length} task-scope elem listázva.`, data: { path: rel || ".", items: rows, moduleName: scope.moduleName } };
}
async function readFileAction(root: string, scope: ScopePlan, input: Input): Promise<Result> {
  const rel = cleanRel(input.path);
  assertReadableScope(rel, scope);
  if (classifyScopePath(rel).decision === "DENIED") throw new DeveloperGridExecutionError("RED/sensitive path nem olvasható.", "EXECUTION_READ_PATH_DENIED", 403);
  const { target } = await existingPath(root, rel);
  const info = await stat(target);
  if (!info.isFile()) throw new DeveloperGridExecutionError("READ_FILE csak fájlra használható.", "EXECUTION_READ_NOT_FILE", 400);
  if (info.size > MAX_READ_BYTES) throw new DeveloperGridExecutionError("A fájl túl nagy közvetlen olvasáshoz; használj célzott keresést.", "EXECUTION_READ_TOO_LARGE", 413, { sizeBytes: info.size });
  const buffer = await readFile(target);
  if (buffer.includes(0)) throw new DeveloperGridExecutionError("Bináris fájl nem adható a ChatGPT workernek.", "EXECUTION_BINARY_DENIED", 415);
  const lines = buffer.toString("utf8").split(/\r?\n/);
  const start = clampInt(input.startLine, 1, Math.max(1, lines.length), 1);
  const end = clampInt(input.endLine, start, Math.min(lines.length, start + 399), Math.min(lines.length, start + 199));
  const content = output(lines.slice(start - 1, end).map((line, index) => `${start + index}: ${line}`).join("\n"));
  return { status: "PASS", code: "EXECUTION_READ_OK", summary: `${rel} · ${start}-${end}/${lines.length} sor.`, data: { path: rel, startLine: start, endLine: end, totalLines: lines.length, content } };
}
async function searchFiles(root: string, scope: ScopePlan, input: Input): Promise<Result> {
  const query = text(input.query, 500);
  if (!query) throw new DeveloperGridExecutionError("SEARCH_FILES query kötelező.", "EXECUTION_SEARCH_QUERY_REQUIRED", 400);
  const prefix = cleanRel(input.path, true);
  const paths = scope.readablePaths.filter((item) => !prefix || pathWithinPrefix(item, prefix)).slice(0, 64);
  if (!paths.length) throw new DeveloperGridExecutionError("A keresési prefix alatt nincs olvasható task-scope fájl.", "EXECUTION_SCOPE_DENIED", 403, { path: prefix || ".", moduleName: scope.moduleName });
  const result = await git(root, ["grep", "-n", "-I", "-F", "-e", query, "--", ...paths], 20_000);
  if (result.code !== 0 && result.code !== 1) throw new DeveloperGridExecutionError("A Git keresés sikertelen.", "EXECUTION_SEARCH_FAILED", 409, { stderr: output(result.stderr, 4000) });
  const matches = result.stdout.split(/\r?\n/).filter(Boolean).slice(0, MAX_SEARCH_RESULTS);
  return { status: "PASS", code: "EXECUTION_SEARCH_OK", summary: `${matches.length} találat.`, data: { query, path: prefix || ".", matches, truncated: result.stdout.split(/\r?\n/).filter(Boolean).length > matches.length } };
}
async function writeFileAction(root: string, scope: ScopePlan, input: Input): Promise<Result> {
  const rel = cleanRel(input.path);
  const content = typeof input.content === "string" ? input.content : "";
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_WRITE_BYTES) throw new DeveloperGridExecutionError("A WRITE_FILE tartalom túl nagy.", "EXECUTION_WRITE_TOO_LARGE", 413, { bytes });
  if (content.includes("\0")) throw new DeveloperGridExecutionError("Bináris tartalom írása tiltott.", "EXECUTION_BINARY_DENIED", 415);
  const { target, policy } = await assertWritablePath(root, rel, scope);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
  let mode = 0o644;
  try { mode = (await stat(target)).mode & 0o777; } catch { /* new file */ }
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`);
  await writeFile(temp, content, { encoding: "utf8", mode });
  await rename(temp, target);
  await chmod(target, mode).catch(() => undefined);
  const status = await git(root, ["status", "--short", "--", rel]);
  return { status: "PASS", code: "EXECUTION_WRITE_OK", summary: `${rel} atomikusan frissítve.`, data: { path: rel, bytes, sha256: sha(content), riskLevel: policy.riskLevel, policyDecision: policy.decision, gitStatus: output(status.stdout, 4000) } };
}
async function gitStatus(root: string, scope: ScopePlan): Promise<Result> {
  const result = await git(root, ["status", "--short", "--untracked-files=all"]);
  const rows = result.stdout.split(/\r?\n/).filter(Boolean);
  const changedPaths = rows.map((row) => normalizePath(row.slice(3).replace(/^"|"$/g, "")));
  const outOfScope = changedPaths.filter((filePath) => !pathInScope(filePath, scope.readablePaths) && !newFileDirectoryAllowed(filePath, scope.writablePaths));
  return { status: result.code === 0 ? "PASS" : "FAIL", code: result.code === 0 ? "EXECUTION_GIT_STATUS_OK" : "EXECUTION_GIT_STATUS_FAIL", summary: result.code === 0 ? `Git status PASS · ${changedPaths.length} változás.` : `Git status exit=${result.code}.`, data: { exitCode: result.code, output: output(result.stdout), outOfScope } };
}
async function gitDiff(root: string, scope: ScopePlan, input: Input): Promise<Result> {
  const rel = cleanRel(input.path, true);
  let paths: string[];
  if (rel) { assertReadableScope(rel, scope); paths = [rel]; }
  else paths = [...new Set([...scope.writablePaths, ...scope.readablePaths])].slice(0, 64);
  const result = await git(root, ["diff", "--no-ext-diff", "--unified=3", "--", ...paths], 30_000);
  return { status: result.code === 0 ? "PASS" : "FAIL", code: result.code === 0 ? "EXECUTION_GIT_DIFF_OK" : "EXECUTION_GIT_DIFF_FAIL", summary: result.code === 0 ? "Git diff PASS." : `Git diff exit=${result.code}.`, data: { exitCode: result.code, output: output(`${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`), path: rel || null } };
}
async function gitDiffCheck(root: string): Promise<Result> {
  const result = await git(root, ["diff", "--check"], 30_000);
  return { status: result.code === 0 ? "PASS" : "FAIL", code: result.code === 0 ? "EXECUTION_GIT_CHECK_OK" : "EXECUTION_GIT_CHECK_FAIL", summary: result.code === 0 ? "Git diff --check PASS." : `Git diff --check exit=${result.code}.`, data: { exitCode: result.code, output: output(`${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`) } };
}
async function runDevCommand(root: string, scope: ScopePlan, input: Input): Promise<Result> {
  const command = text(input.command, 80).toUpperCase();
  let file = "";
  let args: string[] = [];
  let timeout = 120_000;
  if (command === "TSC") {
    file = path.join(root, "node_modules/.bin/tsc");
    try { await stat(file); } catch { return { status: "BLOCKED", code: "EXECUTION_TOOLCHAIN_UNAVAILABLE", summary: "A task worktree-ben nincs helyi TypeScript toolchain; a Central Core tesztfázis futtatja később.", data: { command } }; }
    args = ["--noEmit"];
  } else if (command === "LINT") {
    file = "/usr/bin/npm";
    try { await stat(path.join(root, "node_modules")); } catch { return { status: "BLOCKED", code: "EXECUTION_TOOLCHAIN_UNAVAILABLE", summary: "A task worktree-ben nincs helyi node_modules; lint a Central Core tesztfázisban fut.", data: { command } }; }
    args = ["run", "lint"];
    timeout = 240_000;
  } else if (command === "CONTRACT") {
    const rel = cleanRel(input.path);
    assertReadableScope(rel, scope);
    if (!/^(scripts|desktop\/benjadmin-developer-grid\/scripts)\/.+\.(mjs|cjs|js)$/.test(rel) || classifyScopePath(rel).decision === "DENIED") {
      throw new DeveloperGridExecutionError("Csak task-scope-ba tartozó, nem érzékeny repository contract script futtatható.", "EXECUTION_CONTRACT_PATH_DENIED", 403);
    }
    const { target } = await existingPath(root, rel);
    file = "/usr/bin/node";
    args = [target];
    timeout = 90_000;
  } else {
    throw new DeveloperGridExecutionError("RUN_DEV_COMMAND csak TSC, LINT vagy CONTRACT lehet.", "EXECUTION_COMMAND_DENIED", 403);
  }
  try {
    const result = await execFileAsync(file, args, { cwd: root, encoding: "utf8", maxBuffer: 2 * 1024 * 1024, timeout, env: { ...process.env, DIMPRO_PRODUCTION_ACCESS: "DENY" } });
    return { status: "PASS", code: "EXECUTION_COMMAND_OK", summary: `${command} PASS.`, data: { command, exitCode: 0, output: output(`${result.stdout || ""}${result.stderr ? `\n${result.stderr}` : ""}`) } };
  } catch (error) {
    const candidate = error as { code?: number | string; stdout?: string; stderr?: string; signal?: string };
    return { status: "FAIL", code: "EXECUTION_COMMAND_FAIL", summary: `${command} sikertelen.`, data: { command, exitCode: typeof candidate.code === "number" ? candidate.code : 1, signal: candidate.signal || null, output: output(`${candidate.stdout || ""}${candidate.stderr ? `\n${candidate.stderr}` : ""}`) } };
  }
}
async function perform(root: string, scope: ScopePlan, input: Input, action: ExecutionAction) {
  if (action === "LIST_FILES") return listFiles(scope, input);
  if (action === "READ_FILE") return readFileAction(root, scope, input);
  if (action === "SEARCH_FILES") return searchFiles(root, scope, input);
  if (action === "WRITE_FILE") return writeFileAction(root, scope, input);
  if (action === "GIT_STATUS") return gitStatus(root, scope);
  if (action === "GIT_DIFF") return gitDiff(root, scope, input);
  if (action === "GIT_DIFF_CHECK") return gitDiffCheck(root);
  return runDevCommand(root, scope, input);
}

export async function executeDeveloperGridRequest(raw: unknown) {
  const input = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Input;
  const context = await validateContext(input);
  const existing = await findAudit(context.taskId, context.requestId);
  if (existing) {
    if (existing.requestHash !== context.requestHash) throw new DeveloperGridExecutionError("Ugyanaz a requestId más tartalommal érkezett.", "EXECUTION_REQUEST_ID_CONFLICT", 409);
    return { ok: true as const, replayed: true, execution: existing.result as Result, requestId: context.requestId, taskId: context.taskId, sessionId: context.sessionId, action: context.action, productionAccess: "DENY" as const };
  }
  await appendAudit(context.taskId, {
    event: "REQUEST",
    at: new Date().toISOString(),
    requestId: context.requestId,
    requestHash: context.requestHash,
    taskId: context.taskId,
    sessionId: context.sessionId,
    workerCode: context.worker,
    sourceProofSha256: context.proofSha,
    authoritativeSourceProofSha256: context.authoritativeSourceProofSha256,
    engineSessionRecovery: context.recovery,
    action: context.action,
    path: text(input.path, 1000) || null,
    querySha256: text(input.query, 500) ? sha(text(input.query, 500)) : null,
    contentSha256: typeof input.content === "string" ? sha(input.content) : null,
    command: text(input.command, 80).toUpperCase() || null,
    scope: { moduleName: context.scopePlan.moduleName, readableCount: context.scopePlan.readablePaths.length, writableCount: context.scopePlan.writablePaths.length },
    environment: "DEV",
    productionAccess: "DENY",
  });
  let result: Result;
  try {
    result = await perform(context.root, context.scopePlan, input, context.action);
  } catch (error) {
    if (error instanceof DeveloperGridExecutionError) result = { status: "BLOCKED", code: error.code, summary: error.message, data: error.details };
    else result = { status: "FAIL", code: "EXECUTION_INTERNAL_ERROR", summary: error instanceof Error ? error.message : "Execution Bridge belső hiba." };
  }
  result = {
    ...result,
    data:{
      ...(result.data || {}),
      authoritativeSourceProofSha256:context.authoritativeSourceProofSha256,
      ...(context.recovery ? { executionSessionRecovery:context.recovery } : {}),
    },
  };
  await appendAudit(context.taskId, { event: "RESULT", at: new Date().toISOString(), requestId: context.requestId, requestHash: context.requestHash, taskId: context.taskId, sessionId: context.sessionId, workerCode: context.worker, action: context.action, result, environment: "DEV", productionAccess: "DENY" });
  return { ok: true as const, replayed: false, execution: result, requestId: context.requestId, taskId: context.taskId, sessionId: context.sessionId, action: context.action, productionAccess: "DENY" as const };
}
