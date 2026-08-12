import fs from "node:fs";
import { readFile, statfs } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

const LOOP = process.argv.includes("--loop");
const INTERVAL_MS = Math.max(30_000, Number(process.env.BENJADMIN_MONITOR_INTERVAL_MS || 60_000));
const RETENTION_DAYS = Math.max(1, Number(process.env.BENJADMIN_MONITOR_RETENTION_DAYS || 14));
const PROD_URL = "https://license.dimpro.hu/admin/szerver";
const DB_HOST = "213.160.68.33";
const DB_PORT = 5432;
const SOURCE = "benjadmin-dev-collector-v1";

function round2(value) {
  return Math.round(value * 100) / 100;
}

function safeHost(value) {
  try { return new URL(String(value || "").trim()).hostname; } catch { return ""; }
}

function assertDevSourceDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("MONITOR_DB_CONFIG_MISSING");

  const envHost = safeHost(url);
  const expectedFile = "/root/.dimpro-secrets/supabase-dev/project-url";
  if (fs.existsSync(expectedFile)) {
    const expectedHost = safeHost(fs.readFileSync(expectedFile, "utf8"));
    if (!envHost || envHost !== expectedHost) throw new Error("MONITOR_SOURCE_DB_NOT_DEV");
    return { url, key };
  }
  if (process.env.BENJADMIN_MONITOR_ALLOW_UNVERIFIED_DEV_SOURCE !== "1") {
    throw new Error("MONITOR_DEV_SOURCE_GUARD_UNAVAILABLE");
  }
  return { url, key };
}

async function readCpuCounters() {
  const raw = await readFile("/proc/stat", "utf8");
  const line = raw.split("\n").find((item) => item.startsWith("cpu "));
  if (!line) return null;
  const values = line.trim().split(/\s+/).slice(1).map(Number);
  const total = values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  const idle = (values[3] || 0) + (values[4] || 0);
  return { total, idle };
}

async function sampleCpuPercent() {
  const first = await readCpuCounters();
  await new Promise((resolve) => setTimeout(resolve, 220));
  const second = await readCpuCounters();
  if (!first || !second) return null;
  const totalDelta = second.total - first.total;
  const idleDelta = second.idle - first.idle;
  if (totalDelta <= 0) return null;
  return round2(Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100)));
}

async function sampleMemory() {
  const raw = await readFile("/proc/meminfo", "utf8");
  const values = new Map();
  for (const line of raw.split("\n")) {
    const match = line.match(/^([^:]+):\s+(\d+)\s+kB$/);
    if (match) values.set(match[1], Number(match[2]) * 1024);
  }
  const total = values.get("MemTotal") || os.totalmem();
  const available = values.get("MemAvailable") || os.freemem();
  const used = Math.max(0, total - available);
  const swapTotal = values.get("SwapTotal") || 0;
  const swapFree = values.get("SwapFree") || 0;
  const swapUsed = Math.max(0, swapTotal - swapFree);
  return {
    totalBytes: total,
    usedBytes: used,
    availableBytes: available,
    usagePercent: total ? round2((used / total) * 100) : 0,
    swapTotalBytes: swapTotal,
    swapUsedBytes: swapUsed,
    swapFreeBytes: swapFree,
    swapUsagePercent: swapTotal ? round2((swapUsed / swapTotal) * 100) : 0,
  };
}

async function sampleDisk() {
  const result = await statfs("/");
  const blockSize = Number(result.bsize || 0);
  const totalBytes = Number(result.blocks || 0) * blockSize;
  const freeBytes = Number(result.bfree || 0) * blockSize;
  const availableBytes = Number(result.bavail || 0) * blockSize;
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const visibleTotal = usedBytes + availableBytes;
  return {
    totalBytes,
    usedBytes,
    availableBytes,
    usagePercent: visibleTotal ? round2((usedBytes / visibleTotal) * 100) : 0,
  };
}

async function probeHttp(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, { method: "GET", redirect: "manual", cache: "no-store", signal: controller.signal });
    return { online: response.status >= 200 && response.status < 500, responseMs: Date.now() - started, statusCode: response.status };
  } catch {
    return { online: false, responseMs: null, statusCode: null };
  } finally {
    clearTimeout(timer);
  }
}

async function probeTcp(host, port, timeoutMs = 3000) {
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let done = false;
    const finish = (online) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ online, responseMs: online ? Date.now() - started : null });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function localStatus({ memoryPercent, diskPercent, swapPercent }) {
  if (memoryPercent >= 95 || diskPercent >= 95 || swapPercent >= 90) return "error";
  if (memoryPercent >= 85 || diskPercent >= 85 || swapPercent >= 75) return "warning";
  return "ok";
}

async function collectRows() {
  const sampledAt = new Date().toISOString();
  const [cpuPercent, memory, disk, production, database] = await Promise.all([
    sampleCpuPercent(),
    sampleMemory(),
    sampleDisk(),
    probeHttp(PROD_URL),
    probeTcp(DB_HOST, DB_PORT),
  ]);

  return [
    {
      target_code: "BENJADMIN_DEV_VPS",
      target_kind: "DEV",
      sampled_at: sampledAt,
      status: localStatus({ memoryPercent: memory.usagePercent, diskPercent: disk.usagePercent, swapPercent: memory.swapUsagePercent }),
      cpu_percent: cpuPercent,
      memory_percent: memory.usagePercent,
      disk_percent: disk.usagePercent,
      load_1m: round2(os.loadavg()[0] || 0),
      response_ms: null,
      metadata: {
        source: SOURCE,
        hostname: os.hostname(),
        memory_total_bytes: memory.totalBytes,
        memory_used_bytes: memory.usedBytes,
        memory_available_bytes: memory.availableBytes,
        swap_total_bytes: memory.swapTotalBytes,
        swap_used_bytes: memory.swapUsedBytes,
        swap_free_bytes: memory.swapFreeBytes,
        swap_percent: memory.swapUsagePercent,
        disk_total_bytes: disk.totalBytes,
        disk_used_bytes: disk.usedBytes,
        disk_available_bytes: disk.availableBytes,
      },
    },
    {
      target_code: "DIMPRO_PRODUCTION_VPS",
      target_kind: "PRODUCTION",
      sampled_at: sampledAt,
      status: production.online ? "ok" : "error",
      cpu_percent: null,
      memory_percent: null,
      disk_percent: null,
      load_1m: null,
      response_ms: production.responseMs,
      metadata: { source: SOURCE, probe: "public_https_read_only", http_status: production.statusCode },
    },
    {
      target_code: "DIMPRO_DATABASE_VPS",
      target_kind: "DATABASE",
      sampled_at: sampledAt,
      status: database.online ? "ok" : "error",
      cpu_percent: null,
      memory_percent: null,
      disk_percent: null,
      load_1m: null,
      response_ms: database.responseMs,
      metadata: { source: SOURCE, probe: "tcp_read_only", port: DB_PORT },
    },
  ];
}

async function collectOnce(client) {
  const rows = await collectRows();
  const { error } = await client.from("dev_center_monitor_samples").insert(rows);
  if (error) throw new Error(`MONITOR_INSERT_FAILED:${error.code || "UNKNOWN"}`);

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();
  const { error: cleanupError } = await client
    .from("dev_center_monitor_samples")
    .delete()
    .in("target_code", ["BENJADMIN_DEV_VPS", "DIMPRO_PRODUCTION_VPS", "DIMPRO_DATABASE_VPS"])
    .lt("sampled_at", cutoff);
  if (cleanupError) throw new Error(`MONITOR_RETENTION_FAILED:${cleanupError.code || "UNKNOWN"}`);

  const dev = rows[0];
  console.log(JSON.stringify({
    ok: true,
    sampledAt: dev.sampled_at,
    targets: rows.map((row) => ({ target: row.target_code, status: row.status, responseMs: row.response_ms })),
    dev: { cpuPercent: dev.cpu_percent, memoryPercent: dev.memory_percent, diskPercent: dev.disk_percent, swapPercent: dev.metadata.swap_percent },
  }));
}

const { url, key } = assertDevSourceDatabase();
const client = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { "x-client-info": "dimpro-benjadmin-monitor-collector/1.0.0" } },
});

if (!LOOP) {
  await collectOnce(client);
  process.exit(0);
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    await collectOnce(client);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "MONITOR_UNKNOWN_ERROR" }));
  } finally {
    running = false;
  }
}

await tick();
const timer = setInterval(() => void tick(), INTERVAL_MS);
process.on("SIGINT", () => { clearInterval(timer); process.exit(0); });
process.on("SIGTERM", () => { clearInterval(timer); process.exit(0); });
