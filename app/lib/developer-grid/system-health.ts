import os from "node:os";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { probeBuildNodes } from "./build-nodes";
import type { BuildNodeDefinition } from "./types";

const SERVER_TTL_MS = 30_000;
const PROTECTED_SERVER_TTL_MS = 60_000;
const DISK_TTL_MS = 60_000;
const STORAGE_TTL_MS = 300_000;
const PROD_URL = "https://license.dimpro.hu/admin/szerver";
const DB_HOST = "213.160.68.33";
const DB_PORT = 5432;

export type HealthMetric = {
  cpuPercent: number | null;
  load1: number | null;
  cores: number | null;
  memoryTotalBytes: number | null;
  memoryUsedBytes: number | null;
  memoryPercent: number | null;
  swapTotalBytes: number | null;
  swapUsedBytes: number | null;
  diskTotalBytes: number | null;
  diskUsedBytes: number | null;
  diskPercent: number | null;
  uptimeSeconds: number | null;
};

export type HealthServer = {
  id: "dev-vps" | "build01" | "build02" | "prod-vps" | "db-vps";
  label: string;
  hostname: string;
  state: "READY" | "NOT_CONNECTED" | "DEGRADED";
  reason: string;
  lastVerifiedAt: string | null;
  metrics: HealthMetric;
};

export type DeveloperGridSystemHealth = {
  schemaVersion: 1;
  environment: "DEV";
  productionAccess: "DENY";
  generatedAt: string;
  refreshPolicy: { serversMs: number; protectedServersMs: number; diskMs: number; storageMs: number; source: "SERVER_CACHE_NO_SUPABASE_POLLING" };
  servers: HealthServer[];
  storage: Array<{ id: string; label: string; state: "READY" | "UNKNOWN"; totalBytes: number | null; usedBytes: number | null; percent: number | null; refreshedAt: string | null }>;
};

type Cache<T> = { value: T | null; expiresAt: number };
const serverCache: Cache<HealthServer[]> = { value: null, expiresAt: 0 };
const protectedServerCache: Cache<HealthServer[]> = { value: null, expiresAt: 0 };
const diskCache: Cache<ReturnType<typeof localDiskMetric>> = { value: null, expiresAt: 0 };
const storageCache: Cache<DeveloperGridSystemHealth["storage"]> = { value: null, expiresAt: 0 };

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
  const total = os.totalmem(); const free = os.freemem(); const used = Math.max(0, total - free); const swap = readSwap();
  return {
    id: "dev-vps", label: "DEV VPS", hostname: os.hostname(), state: "READY", reason: "Canonical DEV szerver online.", lastVerifiedAt: new Date().toISOString(),
    metrics: {
      cpuPercent: await sampleCpuPercent(), load1: Math.round(os.loadavg()[0] * 100) / 100, cores: os.cpus().length,
      memoryTotalBytes: total, memoryUsedBytes: used, memoryPercent: pct(used, total),
      swapTotalBytes: swap.total, swapUsedBytes: swap.used,
      diskTotalBytes: disk.total, diskUsedBytes: disk.used, diskPercent: disk.percent,
      uptimeSeconds: Math.round(os.uptime()),
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
  return [
    { id: "prod-vps", label: "PROD / ÉLŐ", hostname: "license.dimpro.hu", state: prod.online ? "READY" : "DEGRADED", reason: prod.online ? `Read-only HTTPS probe · ${prod.latencyMs ?? "—"} ms` : "Read-only HTTPS probe sikertelen.", lastVerifiedAt: new Date().toISOString(), metrics: snapshotMetric(snapshot?.production) },
    { id: "db-vps", label: "DB VPS", hostname: "db.dimpro.hu", state: db.online ? "READY" : "DEGRADED", reason: db.online ? `Read-only TCP probe · ${db.latencyMs ?? "—"} ms` : "Read-only DB TCP probe sikertelen.", lastVerifiedAt: new Date().toISOString(), metrics: snapshotMetric(snapshot?.database) },
  ];
}

function buildServer(node: BuildNodeDefinition): HealthServer {
  return {
    id: node.id, label: node.id.toUpperCase(), hostname: node.hostname,
    state: node.state === "READY" ? "READY" : "NOT_CONNECTED", reason: node.reason, lastVerifiedAt: node.lastVerifiedAt,
    metrics: emptyMetric(),
  };
}

async function refreshServers(disk: ReturnType<typeof localDiskMetric>) {
  const nodes = await probeBuildNodes();
  return [await localServer(disk), ...nodes.map(buildServer)];
}

export async function getDeveloperGridSystemHealth(): Promise<DeveloperGridSystemHealth> {
  const now = Date.now();
  if (!diskCache.value || diskCache.expiresAt <= now) { diskCache.value = localDiskMetric(); diskCache.expiresAt = now + DISK_TTL_MS; }
  if (!serverCache.value || serverCache.expiresAt <= now) { serverCache.value = await refreshServers(diskCache.value); serverCache.expiresAt = now + SERVER_TTL_MS; }
  if (!protectedServerCache.value || protectedServerCache.expiresAt <= now) { protectedServerCache.value = await protectedServers(); protectedServerCache.expiresAt = now + PROTECTED_SERVER_TTL_MS; }
  if (!storageCache.value || storageCache.expiresAt <= now) {
    storageCache.value = [{ id: "dev-root", label: "DEV TÁRHELY", state: diskCache.value.total !== null ? "READY" : "UNKNOWN", totalBytes: diskCache.value.total, usedBytes: diskCache.value.used, percent: diskCache.value.percent, refreshedAt: diskCache.value.refreshedAt }];
    storageCache.expiresAt = now + STORAGE_TTL_MS;
  }
  return {
    schemaVersion: 1, environment: "DEV", productionAccess: "DENY", generatedAt: new Date().toISOString(),
    refreshPolicy: { serversMs: SERVER_TTL_MS, protectedServersMs: PROTECTED_SERVER_TTL_MS, diskMs: DISK_TTL_MS, storageMs: STORAGE_TTL_MS, source: "SERVER_CACHE_NO_SUPABASE_POLLING" },
    servers: [...serverCache.value, ...protectedServerCache.value].map((server) => ({ ...server, metrics: { ...server.metrics } })), storage: storageCache.value.map((item) => ({ ...item })),
  };
}
