#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SOURCE = "DIMPRO_MCP_SSH_GATEWAY";
const ENVIRONMENT = "DEV";
const PRODUCTION_ACCESS = "DENY";
const DEFAULT_SNAPSHOT = "/srv/dimpro-dev/coordination/health-snapshots/build-nodes.json";
const SSH_BIN = process.env.DIMPRO_BUILD_GATEWAY_SSH_BIN?.trim() || "/usr/bin/ssh";
const SNAPSHOT_FILE = process.env.BENJADMIN_BUILD_NODE_SNAPSHOT_FILE?.trim() || DEFAULT_SNAPSHOT;
const NODES = [
  { id: "build01", hostname: "build01.dimpro.hu" },
  { id: "build02", hostname: "build02.dimpro.hu" },
];
const METRIC_NUMERIC_KEYS = [
  "cpuPercent", "load1", "cores",
  "memoryTotalBytes", "memoryUsedBytes", "memoryAvailableBytes", "memoryPercent",
  "swapTotalBytes", "swapUsedBytes", "swapMinimumBytes", "swapPercent",
  "diskTotalBytes", "diskUsedBytes", "diskAvailableBytes", "diskPercent",
  "uptimeSeconds",
];
const METRIC_STRING_KEYS = [
  "storageGovernor", "nodeVersion", "npmVersion", "gitVersion", "architecture", "kernel",
];

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function safeText(value, max = 160) {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}

function validIso(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function unavailable(definition, reason) {
  return {
    schemaVersion: 1,
    id: definition.id,
    hostname: definition.hostname,
    state: "NOT_CONNECTED",
    reason,
    lastVerifiedAt: new Date().toISOString(),
    source: SOURCE,
    quality: "UNKNOWN",
    metrics: null,
  };
}

function sanitizeNode(raw, definition) {
  if (!isObject(raw)) return unavailable(definition, "Gateway health válasz nem objektum.");
  const allowedStates = new Set(["READY", "BUSY", "BLOCKED", "NOT_CONNECTED", "DEGRADED"]);
  if (
    raw.schemaVersion !== 1 ||
    raw.id !== definition.id ||
    raw.hostname !== definition.hostname ||
    raw.source !== SOURCE ||
    raw.quality !== "LIVE" ||
    !allowedStates.has(raw.state) ||
    !validIso(raw.lastVerifiedAt) ||
    !isObject(raw.metrics)
  ) {
    return unavailable(definition, "Gateway health válasz szerződése érvénytelen.");
  }

  const metrics = {};
  for (const key of METRIC_NUMERIC_KEYS) {
    const value = finiteNonNegative(raw.metrics[key]);
    if (value === null) return unavailable(definition, `Gateway metric hiányzik: ${key}.`);
    metrics[key] = value;
  }
  if (raw.metrics.buildLockHeld !== true && raw.metrics.buildLockHeld !== false) {
    return unavailable(definition, "Gateway buildLockHeld metric érvénytelen.");
  }
  if (raw.metrics.toolchainReady !== true && raw.metrics.toolchainReady !== false) {
    return unavailable(definition, "Gateway toolchainReady metric érvénytelen.");
  }
  metrics.buildLockHeld = raw.metrics.buildLockHeld;
  metrics.toolchainReady = raw.metrics.toolchainReady;

  if (raw.metrics.currentRunId === null) {
    metrics.currentRunId = null;
  } else {
    const value = safeText(raw.metrics.currentRunId, 128);
    if (!value) return unavailable(definition, "Gateway currentRunId metric érvénytelen.");
    metrics.currentRunId = value;
  }

  if (raw.metrics.queueDepth === null) {
    metrics.queueDepth = null;
  } else {
    const value = finiteNonNegative(raw.metrics.queueDepth);
    if (value === null) return unavailable(definition, "Gateway queueDepth metric érvénytelen.");
    metrics.queueDepth = value;
  }

  for (const key of METRIC_STRING_KEYS) {
    const value = safeText(raw.metrics[key], key === "kernel" ? 64 : 32);
    if (!value) return unavailable(definition, `Gateway metric hiányzik: ${key}.`);
    metrics[key] = value;
  }

  return {
    schemaVersion: 1,
    id: definition.id,
    hostname: definition.hostname,
    state: raw.state === "DEGRADED" ? "BLOCKED" : raw.state,
    reason: safeText(raw.reason, 240) || "MCP SSH gateway health minta.",
    lastVerifiedAt: raw.lastVerifiedAt,
    source: SOURCE,
    quality: "LIVE",
    metrics,
  };
}

function queryNode(definition) {
  const args = [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=5",
    "-o", "ConnectionAttempts=1",
    "-o", "StrictHostKeyChecking=yes",
    definition.id,
    `/srv/dimpro-build/bin/dimpro-build-node-health-v1 ${definition.id}`,
  ];
  try {
    const stdout = execFileSync(SSH_BIN, args, {
      encoding: "utf8",
      timeout: 12_000,
      maxBuffer: 512 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, LC_ALL: "C" },
    });
    return sanitizeNode(JSON.parse(stdout), definition);
  } catch {
    return unavailable(definition, "MCP SSH gateway health lekérés sikertelen.");
  }
}

function atomicWrite(file, payload) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true, mode: 0o750 });
  const temp = path.join(directory, `.build-nodes.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o640, flag: "wx" });
  fs.chmodSync(temp, 0o640);
  fs.renameSync(temp, file);
}

const sampledAt = new Date().toISOString();
const nodes = NODES.map(queryNode);
const snapshot = {
  schemaVersion: 1,
  environment: ENVIRONMENT,
  productionAccess: PRODUCTION_ACCESS,
  source: SOURCE,
  sampledAt,
  nodes,
};
atomicWrite(SNAPSHOT_FILE, snapshot);

console.log(JSON.stringify({
  ok: true,
  environment: ENVIRONMENT,
  productionAccess: PRODUCTION_ACCESS,
  sampledAt,
  snapshotFile: SNAPSHOT_FILE,
  nodes: nodes.map((node) => ({ id: node.id, state: node.state, quality: node.quality })),
}, null, 2));
