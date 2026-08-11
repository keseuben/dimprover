import net from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getDriveObjectStorageConfig, getDriveObjectStorageSafeStatus } from "@/app/lib/drive-core/storageConfig";
import { listDriveS3Objects } from "@/app/lib/drive-core/s3ObjectStorage";
import { getDropStorageConfig, getDropStorageSafeStatus } from "@/app/lib/drop/storage/dropStorageConfig";
import { listDropS3Objects } from "@/app/lib/drop/storage/dropS3Storage";
import { engineUnauthorized } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROD_URL = "https://license.dimpro.hu/admin/szerver";
const DB_HOST = "213.160.68.33";
const DB_PORT = 5432;

function configuredQuotaBytes(name: "DIMPRO_DRIVE_S3_QUOTA_BYTES" | "DIMPRO_DROP_S3_QUOTA_BYTES") {
  const parsed = Number(process.env[name]?.trim() || "");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function storageCapacity(usedBytes: number | null, quotaBytes: number | null) {
  if (usedBytes == null || quotaBytes == null) return { capacityBytes: quotaBytes, freeBytes: null, usagePercent: null };
  return {
    capacityBytes: quotaBytes,
    freeBytes: Math.max(0, quotaBytes - usedBytes),
    usagePercent: Math.max(0, Math.min(100, (usedBytes / quotaBytes) * 100)),
  };
}

type RuntimeResourceSnapshot = {
  memoryTotalBytes: number;
  memoryUsedBytes: number;
  memoryAvailableBytes: number;
  memoryPercent: number;
  diskTotalBytes: number;
  diskUsedBytes: number;
  diskAvailableBytes: number;
  diskPercent: number;
  load1m: number;
  hostname: string;
};

type RuntimeInfrastructureSnapshot = {
  sampledAt: string;
  production: RuntimeResourceSnapshot;
  database: RuntimeResourceSnapshot;
};

async function loadRuntimeInfrastructureSnapshot(): Promise<RuntimeInfrastructureSnapshot | null> {
  const configured = process.env.BENJADMIN_INFRA_SNAPSHOT_FILE?.trim();
  const filePath = configured || path.join(process.cwd(), ".dimprover", "monitor", "benjadmin-infrastructure-snapshot.json");
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as RuntimeInfrastructureSnapshot;
    if (!parsed?.sampledAt || !parsed.production || !parsed.database) return null;
    return parsed;
  } catch {
    return null;
  }
}

function sampleResource(sample: RuntimeResourceSnapshot | undefined, sampledAt: string | null) {
  if (!sample) return { memory: null, disk: null, sampledAt: null, load1m: null };
  return {
    memory: {
      usagePercent: sample.memoryPercent,
      totalBytes: sample.memoryTotalBytes,
      usedBytes: sample.memoryUsedBytes,
      availableBytes: sample.memoryAvailableBytes,
    },
    disk: {
      usePercent: sample.diskPercent,
      totalBytes: sample.diskTotalBytes,
      usedBytes: sample.diskUsedBytes,
      availableBytes: sample.diskAvailableBytes,
    },
    sampledAt,
    load1m: sample.load1m,
  };
}

async function tcpProbe(host: string, port: number, timeoutMs = 3000) {
  const startedAt = Date.now();
  return new Promise<{ online: boolean; latencyMs: number | null; error: string | null }>((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (online: boolean, error: string | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ online, latencyMs: online ? Date.now() - startedAt : null, error });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true, null));
    socket.once("timeout", () => finish(false, "timeout"));
    socket.once("error", (error) => finish(false, (error as NodeJS.ErrnoException).code || error.message));
  });
}

async function httpProbe(url: string, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { method: "GET", redirect: "manual", cache: "no-store", signal: controller.signal });
    return {
      online: response.status >= 200 && response.status < 500,
      latencyMs: Date.now() - startedAt,
      statusCode: response.status,
      error: null as string | null,
    };
  } catch (error) {
    return {
      online: false,
      latencyMs: null,
      statusCode: null,
      error: error instanceof Error ? error.message.slice(0, 160) : "Ismeretlen hálózati hiba",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function inspectDriveStorage() {
  const config = getDriveObjectStorageConfig();
  const safe = getDriveObjectStorageSafeStatus(config);
  if (!safe.storageConfigured) {
    return { code: "DRIVE", label: "DIMPRO Drive tárhely", endpoint: config.s3?.endpoint || null, bucket: config.bucket || null, online: false, usedBytes: null, objectCount: null, truncated: false, capacityBytes: configuredQuotaBytes("DIMPRO_DRIVE_S3_QUOTA_BYTES"), freeBytes: null, usagePercent: null, note: safe.warning };
  }
  try {
    let continuationToken: string | null = null;
    let usedBytes = 0;
    let objectCount = 0;
    let truncated = false;
    for (let page = 0; page < 10; page += 1) {
      const result = await listDriveS3Objects({ maxKeys: 1000, continuationToken });
      usedBytes += result.objects.reduce((sum, item) => sum + item.sizeBytes, 0);
      objectCount += result.objects.length;
      continuationToken = result.nextContinuationToken;
      truncated = result.truncated;
      if (!result.truncated || !continuationToken) break;
    }
    const quota = configuredQuotaBytes("DIMPRO_DRIVE_S3_QUOTA_BYTES");
    return { code: "DRIVE", label: "DIMPRO Drive tárhely", endpoint: config.s3?.endpoint || null, bucket: config.bucket, online: true, usedBytes, objectCount, truncated, ...storageCapacity(usedBytes, quota), note: truncated ? "A kijelzett foglaltság legfeljebb 10 000 objektum összegzése." : quota ? "S3 kapcsolat rendben; a teljes méret a DIMPRO-ban konfigurált tárhelykeret." : "S3 kapcsolat rendben; a szolgáltatói S3 API nem ad fix bucket-kapacitást, DIMPRO tárhelykeret még nincs konfigurálva." };
  } catch (error) {
    return { code: "DRIVE", label: "DIMPRO Drive tárhely", endpoint: config.s3?.endpoint || null, bucket: config.bucket, online: false, usedBytes: null, objectCount: null, truncated: false, capacityBytes: configuredQuotaBytes("DIMPRO_DRIVE_S3_QUOTA_BYTES"), freeBytes: null, usagePercent: null, note: error instanceof Error ? error.message.slice(0, 180) : "S3 ellenőrzési hiba" };
  }
}

async function inspectDropStorage() {
  const config = getDropStorageConfig();
  const safe = getDropStorageSafeStatus(config);
  if (!safe.storageConfigured || config.provider !== "s3-compatible") {
    return { code: "DROP", label: "DIMPRO Drop tárhely", endpoint: config.s3?.endpoint || null, bucket: config.bucket || null, online: false, usedBytes: null, objectCount: null, truncated: false, capacityBytes: configuredQuotaBytes("DIMPRO_DROP_S3_QUOTA_BYTES"), freeBytes: null, usagePercent: null, note: "A Drop S3 tárhely nincs teljesen konfigurálva." };
  }
  try {
    let continuationToken: string | null = null;
    let usedBytes = 0;
    let objectCount = 0;
    let truncated = false;
    for (let page = 0; page < 10; page += 1) {
      const result = await listDropS3Objects({ maxKeys: 1000, bucket: config.bucket, continuationToken });
      usedBytes += result.objects.reduce((sum, item) => sum + item.sizeBytes, 0);
      objectCount += result.objects.length;
      continuationToken = result.nextContinuationToken;
      truncated = result.truncated;
      if (!result.truncated || !continuationToken) break;
    }
    const quota = configuredQuotaBytes("DIMPRO_DROP_S3_QUOTA_BYTES");
    return { code: "DROP", label: "DIMPRO Drop tárhely", endpoint: config.s3?.endpoint || null, bucket: config.bucket, online: true, usedBytes, objectCount, truncated, ...storageCapacity(usedBytes, quota), note: truncated ? "A kijelzett foglaltság legfeljebb 10 000 objektum összegzése." : quota ? "S3 kapcsolat rendben; a teljes méret a DIMPRO-ban konfigurált tárhelykeret." : "S3 kapcsolat rendben; a szolgáltatói S3 API nem ad fix bucket-kapacitást, DIMPRO tárhelykeret még nincs konfigurálva." };
  } catch (error) {
    return { code: "DROP", label: "DIMPRO Drop tárhely", endpoint: config.s3?.endpoint || null, bucket: config.bucket, online: false, usedBytes: null, objectCount: null, truncated: false, capacityBytes: configuredQuotaBytes("DIMPRO_DROP_S3_QUOTA_BYTES"), freeBytes: null, usagePercent: null, note: error instanceof Error ? error.message.slice(0, 180) : "S3 ellenőrzési hiba" };
  }
}

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return engineUnauthorized();

  const [production, database, driveStorage, dropStorage, snapshot] = await Promise.all([
    httpProbe(PROD_URL),
    tcpProbe(DB_HOST, DB_PORT),
    inspectDriveStorage(),
    inspectDropStorage(),
    loadRuntimeInfrastructureSnapshot(),
  ]);
  const productionSample = sampleResource(snapshot?.production, snapshot?.sampledAt || null);
  const databaseSample = sampleResource(snapshot?.database, snapshot?.sampledAt || null);

  return NextResponse.json({
    ok: true,
    collectedAt: new Date().toISOString(),
    servers: [
      {
        code: "PRODUCTION",
        label: "PRODUCTION / ÉLES VPS",
        host: "213.160.68.24",
        online: production.online,
        latencyMs: production.latencyMs,
        statusCode: production.statusCode,
        memory: productionSample.memory,
        disk: productionSample.disk,
        load1m: productionSample.load1m,
        sampledAt: productionSample.sampledAt,
        telemetry: productionSample.sampledAt ? "CONTROL_SNAPSHOT" : "PUBLIC_HTTP_ONLY",
        note: productionSample.sampledAt
          ? "A PROD erőforrásértékek read-only vezérlőoldali mérési mintából származnak; az HTTPS elérhetőség külön élőben ellenőrzött."
          : "A PROD módosítás nélkül, kizárólag nyilvános HTTPS elérhetőséggel ellenőrzött. RAM/lemez élő telemetriához külön read-only collector szükséges.",
      },
      {
        code: "DATABASE",
        label: "DB VPS",
        host: DB_HOST,
        online: database.online,
        latencyMs: database.latencyMs,
        port: DB_PORT,
        memory: databaseSample.memory,
        disk: databaseSample.disk,
        load1m: databaseSample.load1m,
        sampledAt: databaseSample.sampledAt,
        telemetry: databaseSample.sampledAt ? "CONTROL_SNAPSHOT" : "TCP_ONLY",
        note: databaseSample.sampledAt
          ? "A DB VPS erőforrásértékek read-only vezérlőoldali mérési mintából származnak; a PostgreSQL port külön élőben ellenőrzött."
          : "A PostgreSQL port elérhetősége élőben ellenőrzött. RAM/lemez élő telemetriához külön read-only collector szükséges.",
      },
    ],
    storages: [driveStorage, dropStorage],
  }, { headers: { "cache-control": "no-store" } });
}
