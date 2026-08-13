import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSensitivePath, scanSensitiveText } from "./secret-scanner";
import { buildMForgeProviderPromptText, type ProviderPromptContextPack } from "./provider-prompt-core";

const CONTEXT_ROOT = path.resolve(process.env.DIMPRO_AI_WORKER_CONTEXT_ROOT?.trim() || "/srv/dimpro-dev/data/benjadmin-ai-worker-context");
const PROMPT_ROOT = path.resolve(process.env.DIMPRO_AI_WORKER_PROMPT_ROOT?.trim() || "/srv/dimpro-dev/data/benjadmin-ai-worker-prompts");
const MAX_PROMPT_BYTES = 1024 * 1024;

type Row = Record<string, unknown>;
type VerifiedContextPack = ProviderPromptContextPack;

function record(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("A DEV adatbázis-kapcsolat nincs konfigurálva.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function scopePaths(value: unknown) {
  return Array.isArray(value)
    ? value.map(record).filter((item) => text(item.type) === "path" && text(item.key)).map((item) => text(item.key))
    : [];
}
function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }

export async function readVerifiedSafeContextPack(summaryValue: unknown): Promise<VerifiedContextPack> {
  const summary = record(summaryValue);
  const sourcePath = path.resolve(text(summary.path));
  if (!sourcePath || sourcePath === CONTEXT_ROOT || !sourcePath.startsWith(`${CONTEXT_ROOT}${path.sep}`)) {
    throw new Error("A Context Pack path kívül esik a BENJADMIN DEV context gyökéren.");
  }
  const [bytes, fileStat] = await Promise.all([readFile(sourcePath), stat(sourcePath)]);
  if ((fileStat.mode & 0o777) !== 0o600) throw new Error("A Context Pack fájljogosultsága nem 0600.");
  const actualSha = sha256(bytes);
  if (actualSha !== text(summary.sha256)) throw new Error("A Context Pack SHA-256 eltér az adatbázis metaértéktől.");
  const pack = JSON.parse(bytes.toString("utf8")) as Row;
  if (pack.secretContentIncluded !== false) throw new Error("A Context Pack secretContentIncluded értéke nem false.");
  if (text(pack.baselineCommit) !== text(summary.baselineCommit)) throw new Error("A Context Pack baseline meta eltér.");
  const files = Array.isArray(pack.files) ? pack.files.map(record).map((item) => ({
    path: text(item.path),
    content: typeof item.content === "string" ? item.content : "",
    sha256: text(item.sha256),
    bytes: Number(item.bytes) || 0,
  })).filter((item) => item.path && item.content) : [];
  if (!files.length) throw new Error("A Context Pack nem tartalmaz átadható forrásfájlt.");
  for (const file of files) {
    if (isSensitivePath(file.path)) throw new Error(`A Context Pack érzékeny pathot tartalmaz: ${file.path}`);
    if (sha256(file.content) !== file.sha256) throw new Error(`A Context Pack fájl SHA eltér: ${file.path}`);
    if (scanSensitiveText(file.content).length) throw new Error(`A Context Pack érzékeny tartalmat tartalmaz: ${file.path}`);
  }
  return {
    id: text(pack.id),
    taskId: text(pack.taskId),
    baselineCommit: text(pack.baselineCommit),
    files,
    totalBytes: Number(pack.totalBytes) || files.reduce((sum, file) => sum + Buffer.byteLength(file.content, "utf8"), 0),
    sha256: actualSha,
    sourcePath,
  };
}

export function buildMForgeProviderPrompt(input: Parameters<typeof buildMForgeProviderPromptText>[0]) {
  const built = buildMForgeProviderPromptText(input);
  if (built.bytes > MAX_PROMPT_BYTES) throw new Error(`A provider prompt túl nagy: ${built.bytes} byte.`);
  if (scanSensitiveText(built.prompt).length) throw new Error("A provider prompt érzékeny mintát tartalmaz; továbbítás tiltott.");
  return { ...built, sha256: sha256(built.prompt) };
}

export async function buildAndPersistMForgeProviderPrompt(taskId: string) {
  const db = client();
  const result = await db.from("dev_center_tasks").select("id,project_id,title,description,scope,metadata").eq("id", taskId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) return { ok: false as const, error: "Az AI worker task nem található." };
  const meta = record(result.data.metadata);
  if (meta.workflowTarget !== "EXTERNAL_AI_WORKER_V1" || meta.recordType !== "WORKER_TASK") return { ok: false as const, error: "A task nem Külső AI Worker V1 task." };
  if (meta.workflowState !== "PREFLIGHT") return { ok: false as const, error: "Provider prompt csak PREFLIGHT állapotban készíthető." };
  const contextSummary = record(meta.contextPackContent);
  if (!text(contextSummary.id)) return { ok: false as const, error: "Safe Context Pack hiányzik.", code: "AI_WORKER_CONTEXT_REQUIRED" };
  const contextPack = await readVerifiedSafeContextPack(contextSummary);
  const allowedPaths = scopePaths(result.data.scope);
  const built = buildMForgeProviderPrompt({
    taskId,
    title: result.data.title || "",
    goal: result.data.description || "",
    projectId: result.data.project_id || "",
    baselineCommit: text(contextSummary.baselineCommit),
    allowedPaths,
    contextPack,
  });
  const promptId = `prompt-${randomUUID().slice(0, 12)}`;
  const taskDir = path.join(PROMPT_ROOT, taskId);
  await mkdir(taskDir, { recursive: true, mode: 0o700 });
  const promptPath = path.join(taskDir, `${promptId}.txt`);
  await writeFile(promptPath, built.prompt, { mode: 0o600, flag: "wx" });
  const promptSummary = {
    id: promptId,
    path: promptPath,
    sha256: built.sha256,
    version: "1.2-prompt",
    generatedAt: new Date().toISOString(),
    baselineCommit: contextPack.baselineCommit,
    contextPackId: contextPack.id,
    contextPackSha256: contextPack.sha256,
    bytes: built.bytes,
    fileCount: built.fileCount,
    allowedPathCount: built.allowedPathCount,
    role: "MFORGE",
    productionAccess: "DENY",
  };
  const update = await db.from("dev_center_tasks").update({ metadata: { ...meta, providerPrompt: promptSummary }, updated_at: new Date().toISOString() }).eq("id", taskId);
  if (update.error) throw new Error(update.error.message);
  const audit = await db.from("dev_center_audit_events").insert({
    id: `dev-audit-${randomUUID().slice(0, 12)}`,
    actor_type: "system",
    actor_id: "BenAI",
    action: "AI_WORKER_PROVIDER_PROMPT_READY",
    entity_type: "task",
    entity_id: taskId,
    task_id: taskId,
    project_id: result.data.project_id,
    summary: `M.Forge provider prompt kész · ${built.fileCount} forrásfájl · ${built.bytes} byte.`,
    metadata: promptSummary,
  });
  if (audit.error) throw new Error(audit.error.message);
  return { ok: true as const, taskId, providerPrompt: promptSummary };
}

export async function verifyMForgeProviderPrompt(summaryValue: unknown) {
  const summary = record(summaryValue);
  const promptPath = path.resolve(text(summary.path));
  if (!promptPath || promptPath === PROMPT_ROOT || !promptPath.startsWith(`${PROMPT_ROOT}${path.sep}`)) return { valid: false, reason: "A provider prompt path kívül esik a BENJADMIN DEV prompt gyökéren." };
  try {
    const [bytes, fileStat] = await Promise.all([readFile(promptPath), stat(promptPath)]);
    if ((fileStat.mode & 0o777) !== 0o600) return { valid: false, reason: "A provider prompt fájljogosultsága nem 0600." };
    const actualSha = sha256(bytes);
    if (actualSha !== text(summary.sha256)) return { valid: false, reason: "A provider prompt SHA-256 eltér a task metaértéktől." };
    const body = bytes.toString("utf8");
    if (scanSensitiveText(body).length) return { valid: false, reason: "A provider prompt érzékeny mintát tartalmaz." };
    if (text(summary.role) !== "MFORGE" || text(summary.productionAccess) !== "DENY") return { valid: false, reason: "A provider prompt worker/PROD policy meta hibás." };
    return { valid: true, reason: "Provider prompt SHA, 0600 jogosultság és M.Forge/PROD-DENY policy rendben.", bytes: bytes.length, sha256: actualSha, path: promptPath };
  } catch (error) {
    return { valid: false, reason: error instanceof Error ? `A provider prompt nem olvasható: ${error.message}` : "A provider prompt nem olvasható." };
  }
}
