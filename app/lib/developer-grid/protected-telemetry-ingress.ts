import "server-only";

import { timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_KEY_FILE = "/root/.dimpro-secrets/protected-telemetry/ingest.key";
export const DEFAULT_PROTECTED_SNAPSHOT_FILE = "/srv/dimpro-dev/coordination/health-snapshots/protected-nodes.json";
const MAX_SAMPLE_AGE_MS = 5 * 60_000;
const MAX_FUTURE_SKEW_MS = 60_000;

export type ProtectedTelemetryNodeId = "prod-vps" | "db-vps";
export type ProtectedTelemetryPayload = {
  schemaVersion?: unknown;
  nodeId?: unknown;
  sampledAt?: unknown;
  hostname?: unknown;
  metrics?: unknown;
};

type SanitizedProtectedSample = {
  nodeId: ProtectedTelemetryNodeId;
  sampledAt: string;
  hostname: string;
  metrics: Record<string, number | null>;
  source: "PROTECTED_READONLY_AGENT";
  readOnly: true;
};

type ProtectedSnapshot = {
  schemaVersion: 2;
  environment: "DEV";
  productionAccess: "DENY";
  generatedAt: string;
  production?: SanitizedProtectedSample;
  database?: SanitizedProtectedSample;
};

const metricRanges: Record<string, [number, number]> = {
  cpuPercent: [0, 100], load1m: [0, 1_000_000], cores: [1, 4096],
  memoryTotalBytes: [1, Number.MAX_SAFE_INTEGER], memoryUsedBytes: [0, Number.MAX_SAFE_INTEGER], memoryAvailableBytes: [0, Number.MAX_SAFE_INTEGER], memoryPercent: [0, 100],
  swapTotalBytes: [0, Number.MAX_SAFE_INTEGER], swapUsedBytes: [0, Number.MAX_SAFE_INTEGER],
  diskTotalBytes: [1, Number.MAX_SAFE_INTEGER], diskUsedBytes: [0, Number.MAX_SAFE_INTEGER], diskAvailableBytes: [0, Number.MAX_SAFE_INTEGER], diskPercent: [0, 100],
  uptimeSeconds: [0, 100 * 365 * 24 * 60 * 60],
};

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function keyFile() { return process.env.BENJADMIN_PROTECTED_TELEMETRY_INGEST_KEY_FILE?.trim() || DEFAULT_KEY_FILE; }
export function protectedSnapshotFile() { return process.env.BENJADMIN_INFRA_SNAPSHOT_FILE?.trim() || DEFAULT_PROTECTED_SNAPSHOT_FILE; }
async function configuredKey() {
  const direct = process.env.BENJADMIN_PROTECTED_TELEMETRY_INGEST_KEY?.trim();
  if (direct) return direct;
  try { return (await readFile(keyFile(), "utf8")).trim(); } catch { return ""; }
}
export async function isProtectedTelemetryAuthorized(headers: Headers) {
  const configured = await configuredKey();
  if (configured.length < 32) return false;
  const direct = headers.get("x-benjadmin-protected-telemetry-key")?.trim() || "";
  return direct.length >= 32 && safeEqual(direct, configured);
}
function numericMetric(metrics: Record<string, unknown>, key: string) {
  const [min, max] = metricRanges[key]; const raw = metrics[key];
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < min || raw > max) throw Object.assign(new Error(`Érvénytelen protected telemetry metrika: ${key}.`), { code: "PROTECTED_TELEMETRY_METRIC_INVALID" });
  return raw;
}
export function sanitizeProtectedTelemetryPayload(payload: ProtectedTelemetryPayload, nowMs = Date.now()): SanitizedProtectedSample {
  if (payload?.schemaVersion !== 1) throw Object.assign(new Error("Nem támogatott protected telemetry séma."), { code: "PROTECTED_TELEMETRY_SCHEMA_INVALID" });
  if (payload.nodeId !== "prod-vps" && payload.nodeId !== "db-vps") throw Object.assign(new Error("Csak prod-vps vagy db-vps read-only telemetria fogadható."), { code: "PROTECTED_TELEMETRY_NODE_INVALID" });
  if (typeof payload.sampledAt !== "string") throw Object.assign(new Error("A protected telemetry sampledAt mező kötelező."), { code: "PROTECTED_TELEMETRY_TIMESTAMP_INVALID" });
  const sampledMs = Date.parse(payload.sampledAt);
  if (!Number.isFinite(sampledMs) || nowMs - sampledMs > MAX_SAMPLE_AGE_MS || sampledMs - nowMs > MAX_FUTURE_SKEW_MS) throw Object.assign(new Error("A protected telemetry minta lejárt vagy jövőbeli."), { code: "PROTECTED_TELEMETRY_TIMESTAMP_INVALID" });
  if (typeof payload.hostname !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(payload.hostname)) throw Object.assign(new Error("Érvénytelen protected telemetry hostname."), { code: "PROTECTED_TELEMETRY_HOST_INVALID" });
  if (!payload.metrics || typeof payload.metrics !== "object" || Array.isArray(payload.metrics)) throw Object.assign(new Error("A protected telemetry metrics objektum kötelező."), { code: "PROTECTED_TELEMETRY_METRICS_INVALID" });
  const raw = payload.metrics as Record<string, unknown>; const metrics: Record<string, number | null> = {};
  for (const key of Object.keys(metricRanges)) metrics[key] = numericMetric(raw, key);
  if (metrics.memoryTotalBytes !== null && metrics.memoryUsedBytes !== null && metrics.memoryUsedBytes > metrics.memoryTotalBytes) throw Object.assign(new Error("A memoryUsedBytes nagyobb a teljes memóriánál."), { code: "PROTECTED_TELEMETRY_METRIC_INVALID" });
  if (metrics.swapTotalBytes !== null && metrics.swapUsedBytes !== null && metrics.swapUsedBytes > metrics.swapTotalBytes) throw Object.assign(new Error("A swapUsedBytes nagyobb a teljes swapnál."), { code: "PROTECTED_TELEMETRY_METRIC_INVALID" });
  if (metrics.diskTotalBytes !== null && metrics.diskUsedBytes !== null && metrics.diskUsedBytes > metrics.diskTotalBytes) throw Object.assign(new Error("A diskUsedBytes nagyobb a teljes tárhelynél."), { code: "PROTECTED_TELEMETRY_METRIC_INVALID" });
  return { nodeId: payload.nodeId, sampledAt: new Date(sampledMs).toISOString(), hostname: payload.hostname, metrics, source: "PROTECTED_READONLY_AGENT", readOnly: true };
}
async function readSnapshot(file: string): Promise<ProtectedSnapshot> {
  try { const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<ProtectedSnapshot>; if (parsed?.schemaVersion === 2 && parsed.environment === "DEV" && parsed.productionAccess === "DENY") return parsed as ProtectedSnapshot; } catch {}
  return { schemaVersion: 2, environment: "DEV", productionAccess: "DENY", generatedAt: new Date(0).toISOString() };
}
export async function storeProtectedTelemetry(sample: SanitizedProtectedSample) {
  const file = protectedSnapshotFile(); const dir = path.dirname(file);
  await mkdir(dir, { recursive: true, mode: 0o750 });
  const current = await readSnapshot(file); const next: ProtectedSnapshot = { ...current, schemaVersion: 2, environment: "DEV", productionAccess: "DENY", generatedAt: new Date().toISOString() };
  if (sample.nodeId === "prod-vps") next.production = sample; else next.database = sample;
  const tmp = path.join(dir, `.protected-nodes.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o640, flag: "wx" }); await chmod(tmp, 0o640); await rename(tmp, file); await chmod(file, 0o640);
  return { nodeId: sample.nodeId, sampledAt: sample.sampledAt, snapshotFile: file };
}
