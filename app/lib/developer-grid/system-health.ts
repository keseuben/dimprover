import os from "node:os";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getDriveObjectStorageConfig, getDriveObjectStorageSafeStatus } from "@/app/lib/drive-core/storageConfig";
import { listDriveS3Objects } from "@/app/lib/drive-core/s3ObjectStorage";
import { getDropStorageConfig, getDropStorageSafeStatus } from "@/app/lib/drop/storage/dropStorageConfig";
import { listDropS3Objects } from "@/app/lib/drop/storage/dropS3Storage";
import { probeBuildNodes } from "./build-nodes";
import type { BuildNodeSnapshot } from "./build-nodes";
import type { DeveloperGridSystemHealthV2, DimprominAiHealthAdapter, LegacyHealthMetric, LegacyHealthServer, LegacyHealthStorage, LegacyHealthTraffic } from "./system-health-model";
import { normalizeInfrastructureNodes } from "./system-health-adapters";
import { aggregateInfrastructureHealth, infrastructureHealthAlerts } from "./system-health-severity";
import { applyDimprominAiAdapter } from "./system-health-ai";
import { getInfrastructureOperationalContext } from "./system-health-operations";

const SERVER_TTL_MS = 30_000;
const PROTECTED_SERVER_TTL_MS = 60_000;
const DISK_TTL_MS = 60_000;
const STORAGE_TTL_MS = 300_000;
const TRAFFIC_TTL_MS = 300_000;
const AI_TTL_MS = 30_000;
const PROD_URL = "https://license.dimpro.hu/admin/szerver";
const DB_HOST = "213.160.68.33";
const DB_PORT = 5432;
const HETZNER_INCLUDED_STORAGE_BYTES = 1_000_000_000_000;
const HETZNER_STORAGE_BOX_ALIAS = "dimpro-backup-bx11";
const SUPABASE_MANAGEMENT_API = "https://api.supabase.com";
const execFileAsync = promisify(execFile);

export type HealthMetric = LegacyHealthMetric;
export type HealthServer = LegacyHealthServer;
export type HealthStorage = LegacyHealthStorage;
export type HealthTraffic = LegacyHealthTraffic;
export type DeveloperGridSystemHealth = DeveloperGridSystemHealthV2;

type Cache<T> = { value: T | null; expiresAt: number };
const serverCache: Cache<HealthServer[]> = { value: null, expiresAt: 0 };
const protectedServerCache: Cache<HealthServer[]> = { value: null, expiresAt: 0 };
const diskCache: Cache<ReturnType<typeof localDiskMetric>> = { value: null, expiresAt: 0 };
const storageCache: Cache<HealthStorage[]> = { value: null, expiresAt: 0 };
const trafficCache: Cache<HealthTraffic[]> = { value: null, expiresAt: 0 };

const emptyMetric = (): HealthMetric => ({
  cpuPercent: null, load1: null, cores: null,
  memoryTotalBytes: null, memoryUsedBytes: null, memoryPercent: null,
  swapTotalBytes: null, swapUsedBytes: null,
  diskTotalBytes: null, diskUsedBytes: null, diskPercent: null,
  uptimeSeconds: null,
});

function pct(used: number, total: number) {
  return total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
}

function localDiskMetric() {
  try {
    const stat = fs.statfsSync("/");
    const total = Number(stat.blocks) * Number(stat.bsize);
    const free = Number(stat.bavail) * Number(stat.bsize);
    const used = Math.max(0, total - free);
    return { total, used, percent: pct(used, total), refreshedAt: new Date().toISOString() };
  } catch {
    return { total: null, used: null, percent: null, refreshedAt: new Date().toISOString() };
  }
}

function readSwap() {
  try {
    const raw = fs.readFileSync("/proc/meminfo", "utf8");
    const totalKb = Number(raw.match(/^SwapTotal:\s+(\d+)/m)?.[1] || 0);
    const freeKb = Number(raw.match(/^SwapFree:\s+(\d+)/m)?.[1] || 0);
    return { total: totalKb * 1024, used: Math.max(0, (totalKb - freeKb) * 1024) };
  } catch { return { total: 0, used: 0 }; }
}

function readMemoryPsi() {
  try {
    const raw = fs.readFileSync("/proc/pressure/memory", "utf8");
    const someAvg60 = Number(raw.match(/^some\s+.*?avg60=([0-9.]+)/m)?.[1] || 0);
    const fullAvg60 = Number(raw.match(/^full\s+.*?avg60=([0-9.]+)/m)?.[1] || 0);
    return { someAvg60, fullAvg60 };
  } catch { return { someAvg60: null, fullAvg60: null }; }
}

async function sampleCpuPercent() {
  const snapshot = () => os.cpus().map((cpu) => ({ idle: cpu.times.idle, total: Object.values(cpu.times).reduce((sum, value) => sum + value, 0) }));
  const a = snapshot();
  await new Promise((resolve) => setTimeout(resolve, 180));
  const b = snapshot();
  let idle = 0; let total = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) { idle += b[i].idle - a[i].idle; total += b[i].total - a[i].total; }
  return total > 0 ? Math.max(0, Math.min(100, Math.round((1 - idle / total) * 1000) / 10)) : 0;
}

async function localServer(disk: ReturnType<typeof localDiskMetric>): Promise<HealthServer> {
  const total = os.totalmem(); const free = os.freemem(); const used = Math.max(0, total - free); const swap = readSwap(); const psi = readMemoryPsi();
  return {
    id: "dev-vps", label: "DEV VPS", hostname: os.hostname(), state: "READY", reason: "Canonical DEV szerver online.", lastVerifiedAt: new Date().toISOString(),
    metrics: {
      cpuPercent: await sampleCpuPercent(), load1: Math.round(os.loadavg()[0] * 100) / 100, cores: os.cpus().length,
      memoryTotalBytes: total, memoryUsedBytes: used, memoryPercent: pct(used, total),
      swapTotalBytes: swap.total, swapUsedBytes: swap.used,
      diskTotalBytes: disk.total, diskUsedBytes: disk.used, diskPercent: disk.percent,
      uptimeSeconds: Math.round(os.uptime()),
      memoryPsiSomeAvg60: psi.someAvg60, memoryPsiFullAvg60: psi.fullAvg60,
    },
  };
}

type InfraSnapshot = { sampledAt?: string; production?: Record<string, unknown>; database?: Record<string, unknown> };

function snapshotMetric(sample: Record<string, unknown> | undefined): HealthMetric {
  if (!sample) return emptyMetric();
  const n = (key: string) => typeof sample[key] === "number" ? Number(sample[key]) : null;
  return {
    cpuPercent: null, load1: n("load1m"), cores: null,
    memoryTotalBytes: n("memoryTotalBytes"), memoryUsedBytes: n("memoryUsedBytes"), memoryPercent: n("memoryPercent"),
    swapTotalBytes: n("swapTotalBytes"), swapUsedBytes: n("swapUsedBytes"),
    diskTotalBytes: n("diskTotalBytes"), diskUsedBytes: n("diskUsedBytes"), diskPercent: n("diskPercent"),
    uptimeSeconds: null,
  };
}

function loadInfraSnapshot(): InfraSnapshot | null {
  const configured = process.env.BENJADMIN_INFRA_SNAPSHOT_FILE?.trim();
  const filePath = configured || path.join(process.cwd(), ".dimprover", "monitor", "benjadmin-infrastructure-snapshot.json");
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")) as InfraSnapshot; } catch { return null; }
}

async function probeHttp(url: string, timeoutMs = 4_000) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try { const response = await fetch(url, { method: "GET", redirect: "manual", cache: "no-store", signal: controller.signal }); return { online: response.status >= 200 && response.status < 500, latencyMs: Date.now() - started }; }
  catch { return { online: false, latencyMs: null }; } finally { clearTimeout(timer); }
}

async function probeTcp(host: string, port: number, timeoutMs = 3_000) {
  const started = Date.now();
  return new Promise<{ online: boolean; latencyMs: number | null }>((resolve) => {
    const socket = net.createConnection({ host, port }); let done = false;
    const finish = (online: boolean) => { if (done) return; done = true; socket.destroy(); resolve({ online, latencyMs: online ? Date.now() - started : null }); };
    socket.setTimeout(timeoutMs); socket.once("connect", () => finish(true)); socket.once("timeout", () => finish(false)); socket.once("error", () => finish(false));
  });
}

async function protectedServers(): Promise<HealthServer[]> {
  const snapshot = loadInfraSnapshot();
  const [prod, db] = await Promise.all([probeHttp(PROD_URL), probeTcp(DB_HOST, DB_PORT)]);
  const prodMetric = { ...snapshotMetric(snapshot?.production), latencyMs: prod.latencyMs };
  const dbMetric = { ...snapshotMetric(snapshot?.database), latencyMs: db.latencyMs };
  return [
    { id: "prod-vps", label: "PROD / ÉLŐ", hostname: "license.dimpro.hu", state: prod.online ? "READY" : "DEGRADED", reason: prod.online ? `Read-only HTTPS probe · ${prod.latencyMs ?? "—"} ms` : "Read-only HTTPS probe sikertelen.", lastVerifiedAt: new Date().toISOString(), metrics: prodMetric },
    { id: "db-vps", label: "DB VPS", hostname: "db.dimpro.hu", state: db.online ? "READY" : "DEGRADED", reason: db.online ? `Read-only TCP probe · ${db.latencyMs ?? "—"} ms` : "Read-only DB TCP probe sikertelen.", lastVerifiedAt: new Date().toISOString(), metrics: dbMetric },
  ];
}

function buildServer(node: BuildNodeSnapshot): HealthServer {
  return {
    id: node.id,
    label: node.id.toUpperCase(),
    hostname: node.hostname,
    state: node.healthState,
    reason: node.reason,
    lastVerifiedAt: node.lastVerifiedAt,
    metrics: node.metrics ? { ...node.metrics } : emptyMetric(),
    source: node.source,
    quality: node.quality,
  };
}

async function refreshServers(disk: ReturnType<typeof localDiskMetric>) {
  const nodes = await probeBuildNodes();
  return [await localServer(disk), ...nodes.map(buildServer)];
}


type BucketUsageSample = { configured: boolean; ok: boolean; usedBytes: number; objectCount: number; truncated: boolean; error: string | null; endpoint: string | null; bucket: string | null };

async function measureDriveBucket(): Promise<BucketUsageSample> {
  const config = getDriveObjectStorageConfig();
  const safe = getDriveObjectStorageSafeStatus(config);
  if (!safe.storageConfigured || !config.s3 || !config.bucket) return { configured: false, ok: false, usedBytes: 0, objectCount: 0, truncated: false, error: safe.warning, endpoint: config.s3?.endpoint || null, bucket: config.bucket || null };
  try {
    let continuationToken: string | null = null;
    let usedBytes = 0;
    let objectCount = 0;
    let truncated = false;
    for (let page = 0; page < 100; page += 1) {
      const result = await listDriveS3Objects({ maxKeys: 1000, continuationToken });
      usedBytes += result.objects.reduce((sum, item) => sum + Number(item.sizeBytes || 0), 0);
      objectCount += result.objects.length;
      continuationToken = result.nextContinuationToken;
      truncated = result.truncated;
      if (!result.truncated || !continuationToken) break;
    }
    return { configured: true, ok: true, usedBytes, objectCount, truncated, error: null, endpoint: config.s3.endpoint, bucket: config.bucket };
  } catch (error) {
    return { configured: true, ok: false, usedBytes: 0, objectCount: 0, truncated: false, error: error instanceof Error ? error.message.slice(0, 180) : "Drive S3 mérési hiba.", endpoint: config.s3.endpoint, bucket: config.bucket };
  }
}

async function measureDropBucket(): Promise<BucketUsageSample> {
  const config = getDropStorageConfig();
  const safe = getDropStorageSafeStatus(config);
  if (!safe.storageConfigured || config.provider !== "s3-compatible" || !config.s3 || !config.bucket) return { configured: false, ok: false, usedBytes: 0, objectCount: 0, truncated: false, error: "A Drop S3 tárhely nincs mérhető állapotban.", endpoint: config.s3?.endpoint || null, bucket: config.bucket || null };
  try {
    let continuationToken: string | null = null;
    let usedBytes = 0;
    let objectCount = 0;
    let truncated = false;
    for (let page = 0; page < 100; page += 1) {
      const result = await listDropS3Objects({ maxKeys: 1000, bucket: config.bucket, continuationToken });
      usedBytes += result.objects.reduce((sum, item) => sum + Number(item.sizeBytes || 0), 0);
      objectCount += result.objects.length;
      continuationToken = result.nextContinuationToken;
      truncated = result.truncated;
      if (!result.truncated || !continuationToken) break;
    }
    return { configured: true, ok: true, usedBytes, objectCount, truncated, error: null, endpoint: config.s3.endpoint, bucket: config.bucket };
  } catch (error) {
    return { configured: true, ok: false, usedBytes: 0, objectCount: 0, truncated: false, error: error instanceof Error ? error.message.slice(0, 180) : "Drop S3 mérési hiba.", endpoint: config.s3.endpoint, bucket: config.bucket };
  }
}

function isHetznerObjectEndpoint(endpoint: string | null) {
  try { return new URL(endpoint || "").hostname.toLowerCase().endsWith(".your-objectstorage.com"); }
  catch { return false; }
}

async function inspectHetznerObjectStorage(): Promise<HealthStorage> {
  const [drive, drop] = await Promise.all([measureDriveBucket(), measureDropBucket()]);
  const configured = [drive, drop].filter((item) => item.configured);
  const successful = configured.filter((item) => item.ok);
  const now = new Date().toISOString();
  if (!configured.length) return { id: "hetzner-object-storage", label: "HETZNER OBJECT STORAGE", state: "UNKNOWN", totalBytes: HETZNER_INCLUDED_STORAGE_BYTES, usedBytes: null, availableBytes: null, percent: null, objectCount: null, refreshedAt: now, reason: "A DIMPRO Hetzner Object Storage bucketek nincsenek konfigurálva ebben a runtime-ban.", source: "HETZNER_S3_READONLY", quality: "UNKNOWN" };
  if (!successful.length) return { id: "hetzner-object-storage", label: "HETZNER OBJECT STORAGE", state: "DEGRADED", totalBytes: HETZNER_INCLUDED_STORAGE_BYTES, usedBytes: null, availableBytes: null, percent: null, objectCount: null, refreshedAt: now, reason: configured.map((item) => item.error).filter(Boolean).join(" · ").slice(0, 360), source: "HETZNER_S3_READONLY", quality: "UNKNOWN" };
  const usedBytes = successful.reduce((sum, item) => sum + item.usedBytes, 0);
  const objectCount = successful.reduce((sum, item) => sum + item.objectCount, 0);
  const truncated = successful.some((item) => item.truncated);
  const hetzner = successful.some((item) => isHetznerObjectEndpoint(item.endpoint));
  const state = successful.length === configured.length && !truncated ? "READY" : "DEGRADED";
  const baseNote = hetzner ? "Az 1 TB Hetzner báziskeret account-szintű közös keret, nem bucket hard limit." : "A konfigurált S3 bucketek összesített read-only foglaltsága.";
  return {
    id: "hetzner-object-storage", label: "HETZNER OBJECT STORAGE", state,
    totalBytes: HETZNER_INCLUDED_STORAGE_BYTES, usedBytes, availableBytes: Math.max(0, HETZNER_INCLUDED_STORAGE_BYTES - usedBytes), percent: Math.round((usedBytes / HETZNER_INCLUDED_STORAGE_BYTES) * 100_000) / 1_000, objectCount,
    refreshedAt: now, reason: `${successful.length}/${configured.length} DIMPRO bucket mérve · ${objectCount} objektum${truncated ? "+" : ""}. ${baseNote}`, source: "HETZNER_S3_READONLY", quality: state === "READY" ? "LIVE" : "PARTIAL",
  };
}

async function inspectHetznerStorageBox(): Promise<HealthStorage> {
  const now = new Date().toISOString();
  try {
    const { stdout } = await execFileAsync("/usr/bin/ssh", [
      "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "ConnectionAttempts=1", "-o", "StrictHostKeyChecking=yes",
      HETZNER_STORAGE_BOX_ALIAS,
      "df -B1 --output=size,used,avail,pcent /home",
    ], { timeout: 12_000, maxBuffer: 64 * 1024, encoding: "utf8" });
    const lastLine = String(stdout || "").trim().split(/\r?\n/).filter(Boolean).at(-1) || "";
    const match = lastLine.match(/(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%/);
    const totalBytes = Number(match?.[1]);
    const usedBytes = Number(match?.[2]);
    const availableBytes = Number(match?.[3]);
    const percent = Number(match?.[4]);
    if (![totalBytes, usedBytes, availableBytes, percent].every(Number.isFinite) || totalBytes <= 0) throw new Error("BX11 df válasz érvénytelen.");
    return { id: "hetzner-bx11", label: "HETZNER BX11 STORAGE BOX", state: "READY", totalBytes, usedBytes, availableBytes, percent, refreshedAt: now, reason: "Read-only SSH df mérés a BX11 backup tárhelyen.", source: "HETZNER_STORAGE_BOX_READONLY", quality: "LIVE" };
  } catch (error) {
    return { id: "hetzner-bx11", label: "HETZNER BX11 STORAGE BOX", state: "DEGRADED", totalBytes: null, usedBytes: null, availableBytes: null, percent: null, refreshedAt: now, reason: error instanceof Error ? error.message.slice(0, 180) : "BX11 mérési hiba.", source: "HETZNER_STORAGE_BOX_READONLY", quality: "UNKNOWN" };
  }
}

function supabaseProjectRef() {
  const explicit = process.env.SUPABASE_PROJECT_REF?.trim() || process.env.BENJADMIN_SUPABASE_PROJECT_REF?.trim() || "";
  if (/^[a-z0-9]{8,40}$/i.test(explicit)) return explicit;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  try { const host = new URL(url).hostname; const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i); return match?.[1] || null; }
  catch { return null; }
}

function configuredBytes(name: string) {
  const value = Number(process.env[name]?.trim() || "");
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

async function supabaseManagementJson(pathname: string, token: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${SUPABASE_MANAGEMENT_API}${pathname}`, { method: "GET", headers: { authorization: `Bearer ${token}`, accept: "application/json" }, cache: "no-store", signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Supabase Management API HTTP ${response.status}${payload?.message ? ` · ${String(payload.message).slice(0, 120)}` : ""}`);
    return payload;
  } finally { clearTimeout(timer); }
}

function sumUsageRows(rows: unknown, key: string) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((sum, row) => sum + (row && typeof row === "object" && Number.isFinite(Number((row as Record<string, unknown>)[key])) ? Number((row as Record<string, unknown>)[key]) : 0), 0);
}

async function inspectSupabaseTraffic(): Promise<HealthTraffic> {
  const now = new Date().toISOString();
  const projectRef = supabaseProjectRef();
  const token = process.env.BENJADMIN_SUPABASE_ANALYTICS_TOKEN?.trim() || "";
  const egressBytes = configuredBytes("BENJADMIN_SUPABASE_EGRESS_BYTES");
  const cachedEgressBytes = configuredBytes("BENJADMIN_SUPABASE_CACHED_EGRESS_BYTES");
  const egressQuotaBytes = configuredBytes("BENJADMIN_SUPABASE_EGRESS_QUOTA_BYTES");
  const cachedEgressQuotaBytes = configuredBytes("BENJADMIN_SUPABASE_CACHED_EGRESS_QUOTA_BYTES");
  const egressPercent = egressBytes !== null && egressQuotaBytes !== null ? pct(egressBytes, egressQuotaBytes) : null;
  const cachedEgressPercent = cachedEgressBytes !== null && cachedEgressQuotaBytes !== null ? pct(cachedEgressBytes, cachedEgressQuotaBytes) : null;
  const base = { id: "supabase-traffic" as const, label: "SUPABASE FORGALOM", projectRef, interval: "MANAGEMENT_API", egressBytes, cachedEgressBytes, egressQuotaBytes, cachedEgressQuotaBytes, egressPercent, cachedEgressPercent };
  if (!projectRef) return { ...base, state: "NOT_CONNECTED", reason: "Supabase project ref nem azonosítható.", refreshedAt: now, source: "SUPABASE_MANAGEMENT_API", quality: "UNKNOWN", apiRequests: null, restRequests: null, authRequests: null, storageRequests: null, realtimeRequests: null };
  if (!token) return { ...base, state: "NOT_CONNECTED", reason: "A Supabase forgalom read-only lekéréséhez BENJADMIN_SUPABASE_ANALYTICS_TOKEN szükséges (analytics_usage_read). A service-role kulcsot erre nem használjuk.", refreshedAt: now, source: "SUPABASE_MANAGEMENT_API", quality: "UNKNOWN", apiRequests: null, restRequests: null, authRequests: null, storageRequests: null, realtimeRequests: null };
  try {
    const [countsPayload, requestPayload] = await Promise.all([
      supabaseManagementJson(`/v1/projects/${encodeURIComponent(projectRef)}/analytics/endpoints/usage.api-counts`, token),
      supabaseManagementJson(`/v1/projects/${encodeURIComponent(projectRef)}/analytics/endpoints/usage.api-requests-count`, token),
    ]);
    const rows = countsPayload?.result;
    const restRequests = sumUsageRows(rows, "total_rest_requests");
    const authRequests = sumUsageRows(rows, "total_auth_requests");
    const storageRequests = sumUsageRows(rows, "total_storage_requests");
    const realtimeRequests = sumUsageRows(rows, "total_realtime_requests");
    const explicitCount = Array.isArray(requestPayload?.result) ? Number(requestPayload.result[0]?.count) : null;
    const apiRequests = Number.isFinite(explicitCount) ? explicitCount : restRequests + authRequests + storageRequests + realtimeRequests;
    const egressKnown = egressBytes !== null || cachedEgressBytes !== null;
    return { ...base, state: "READY", reason: egressKnown ? "Supabase Management API request-forgalom + konfigurált egress snapshot." : "Supabase Management API request-forgalom élő. A pontos billing-egresshez külön usage snapshot/adatforrás szükséges.", refreshedAt: now, source: "SUPABASE_MANAGEMENT_API", quality: "LIVE", apiRequests, restRequests, authRequests, storageRequests, realtimeRequests };
  } catch (error) {
    return { ...base, state: "DEGRADED", reason: error instanceof Error ? error.message.slice(0, 220) : "Supabase analytics lekérési hiba.", refreshedAt: now, source: "SUPABASE_MANAGEMENT_API", quality: "UNKNOWN", apiRequests: null, restRequests: null, authRequests: null, storageRequests: null, realtimeRequests: null };
  }
}

export async function getDeveloperGridSystemHealth(aiAdapter: DimprominAiHealthAdapter | null = null): Promise<DeveloperGridSystemHealth> {
  const now = Date.now();
  if (!diskCache.value || diskCache.expiresAt <= now) { diskCache.value = localDiskMetric(); diskCache.expiresAt = now + DISK_TTL_MS; }
  if (!serverCache.value || serverCache.expiresAt <= now) { serverCache.value = await refreshServers(diskCache.value); serverCache.expiresAt = now + SERVER_TTL_MS; }
  if (!protectedServerCache.value || protectedServerCache.expiresAt <= now) { protectedServerCache.value = await protectedServers(); protectedServerCache.expiresAt = now + PROTECTED_SERVER_TTL_MS; }
  if (!storageCache.value || storageCache.expiresAt <= now) {
    storageCache.value = await Promise.all([inspectHetznerObjectStorage(), inspectHetznerStorageBox()]);
    storageCache.expiresAt = now + STORAGE_TTL_MS;
  }
  if (!trafficCache.value || trafficCache.expiresAt <= now) {
    trafficCache.value = [await inspectSupabaseTraffic()];
    trafficCache.expiresAt = now + TRAFFIC_TTL_MS;
  }
  const servers = [...serverCache.value, ...protectedServerCache.value].map((server) => ({ ...server, metrics: { ...server.metrics } }));
  const storage = storageCache.value.map((item) => ({ ...item }));
  const traffic = trafficCache.value.map((item) => ({ ...item }));
  const normalizedNodes = normalizeInfrastructureNodes(servers, storage, traffic, now);
  const nodes = await applyDimprominAiAdapter(normalizedNodes, aiAdapter, now);
  const operations = await getInfrastructureOperationalContext();
  return {
    schemaVersion: 2, environment: "DEV", productionAccess: "DENY", generatedAt: new Date().toISOString(),
    refreshPolicy: { serversMs: SERVER_TTL_MS, protectedServersMs: PROTECTED_SERVER_TTL_MS, diskMs: DISK_TTL_MS, storageMs: STORAGE_TTL_MS, trafficMs: TRAFFIC_TTL_MS, aiMs: AI_TTL_MS, source: "SERVER_CACHE_NO_SUPABASE_POLLING" },
    nodes, overall: aggregateInfrastructureHealth(nodes), alerts: infrastructureHealthAlerts(nodes), operations, servers, storage, traffic,
  };
}
