import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSensitivePath, scanSensitiveText } from "./secret-scanner";
import { parseMForgeProviderOutputCore, type MForgePatchArtifact } from "./provider-output-core";

const OUTPUT_ROOT = path.resolve(process.env.DIMPRO_AI_WORKER_OUTPUT_ROOT?.trim() || "/srv/dimpro-dev/data/benjadmin-ai-worker-output");
const MAX_PROVIDER_OUTPUT_BYTES = 1024 * 1024;
const MAX_DIFF_BYTES = 512 * 1024;

type Row = Record<string, unknown>;
function record(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("A DEV adatbázis-kapcsolat nincs konfigurálva.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
export function parseAndValidateMForgeProviderOutput(raw: string, allowedPaths: string[]): MForgePatchArtifact {
  return parseMForgeProviderOutputCore(raw, allowedPaths, { isSensitivePath, scanSensitiveText }, { maxOutputBytes: MAX_PROVIDER_OUTPUT_BYTES, maxDiffBytes: MAX_DIFF_BYTES });
}


export async function readVerifiedMForgeOutputArtifact(summaryValue: unknown) {
  const summary = record(summaryValue);
  const artifactPath = path.resolve(typeof summary.path === "string" ? summary.path.trim() : "");
  if (!artifactPath || artifactPath === OUTPUT_ROOT || !artifactPath.startsWith(`${OUTPUT_ROOT}${path.sep}`)) throw new Error("A provider output artifact path kívül esik a BENJADMIN DEV output gyökéren.");
  const [bytes, fileStat] = await Promise.all([readFile(artifactPath), stat(artifactPath)]);
  if ((fileStat.mode & 0o777) !== 0o600) throw new Error("A provider output artifact fájljogosultsága nem 0600.");
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== (typeof summary.sha256 === "string" ? summary.sha256 : "")) throw new Error("A provider output artifact SHA-256 eltér a task metaértéktől.");
  const payload = record(JSON.parse(bytes.toString("utf8")));
  if (payload.version !== "1.2-output" || payload.role !== "MFORGE" || payload.productionAccess !== "DENY") throw new Error("A provider output artifact worker/PROD policy meta hibás.");
  if (payload.id !== summary.id || payload.providerRunId !== summary.providerRunId) throw new Error("A provider output artifact identity eltér a task metaértéktől.");
  const changedPaths = Array.isArray(payload.changedPaths) ? payload.changedPaths.filter((value): value is string => typeof value === "string") : [];
  if (!changedPaths.length) throw new Error("A provider output artifact changedPaths mezője üres.");
  const unifiedDiff = typeof payload.unifiedDiff === "string" ? payload.unifiedDiff : "";
  if (!unifiedDiff) throw new Error("A provider output artifact unifiedDiff mezője üres.");
  return { valid: true as const, artifactPath, sha256: digest, payload, changedPaths, unifiedDiff };
}

export async function persistValidatedMForgeOutputArtifact(input: {
  taskId: string;
  rawOutput: string;
  allowedPaths: string[];
  provider: string;
  modelId: string;
  providerRunId: string;
}) {
  const artifact = parseAndValidateMForgeProviderOutput(input.rawOutput, input.allowedPaths);
  const db = client();
  const task = await db.from("dev_center_tasks").select("id,project_id,metadata").eq("id", input.taskId).maybeSingle();
  if (task.error) throw new Error(task.error.message);
  if (!task.data) throw new Error("Az AI worker task nem található.");
  const meta = record(task.data.metadata);
  if (meta.workflowTarget !== "EXTERNAL_AI_WORKER_V1" || meta.recordType !== "WORKER_TASK") throw new Error("A task nem Külső AI Worker V1 task.");
  const artifactId = `output-${randomUUID().slice(0, 12)}`;
  const payload = {
    version: "1.2-output",
    id: artifactId,
    taskId: input.taskId,
    role: "MFORGE",
    provider: input.provider,
    modelId: input.modelId,
    providerRunId: input.providerRunId,
    createdAt: new Date().toISOString(),
    productionAccess: "DENY",
    ...artifact,
  };
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  const digest = createHash("sha256").update(json).digest("hex");
  const taskDir = path.join(OUTPUT_ROOT, input.taskId);
  await mkdir(taskDir, { recursive: true, mode: 0o700 });
  const artifactPath = path.join(taskDir, `${artifactId}.json`);
  await writeFile(artifactPath, json, { mode: 0o600, flag: "wx" });
  const summary = {
    id: artifactId,
    path: artifactPath,
    sha256: digest,
    version: payload.version,
    createdAt: payload.createdAt,
    provider: input.provider,
    modelId: input.modelId,
    providerRunId: input.providerRunId,
    changedPaths: artifact.changedPaths,
    changedFileCount: artifact.changedPaths.length,
    productionAccess: "DENY",
  };
  const update = await db.from("dev_center_tasks").update({ metadata: { ...meta, providerOutputArtifact: summary }, updated_at: new Date().toISOString() }).eq("id", input.taskId);
  if (update.error) throw new Error(update.error.message);
  const audit = await db.from("dev_center_audit_events").insert({
    id: `dev-audit-${randomUUID().slice(0, 12)}`,
    actor_type: "system",
    actor_id: "MFORGE",
    action: "AI_WORKER_PROVIDER_OUTPUT_VALIDATED",
    entity_type: "task",
    entity_id: input.taskId,
    task_id: input.taskId,
    project_id: task.data.project_id,
    summary: `M.Forge provider output validált · ${artifact.changedPaths.length} fájl.`,
    metadata: summary,
  });
  if (audit.error) throw new Error(audit.error.message);
  return { ok: true as const, taskId: input.taskId, artifact: summary };
}
