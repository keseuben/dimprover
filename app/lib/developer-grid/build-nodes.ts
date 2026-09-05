import fs from "node:fs";
import type { BuildNodeDefinition } from "./types";

const SNAPSHOT_SCHEMA_VERSION = 1;
const SNAPSHOT_SOURCE = "DIMPRO_MCP_SSH_GATEWAY";
const DEFAULT_SNAPSHOT_FILE = "/srv/dimpro-dev/coordination/health-snapshots/build-nodes.json";
const DEFAULT_MAX_AGE_MS = 60_000;

const DEFAULT_BUILD_NODES: readonly BuildNodeDefinition[] = [
  {
    id: "build01",
    hostname: "build01.dimpro.hu",
    state: "NOT_CONNECTED",
    capabilities: ["NEXT_BUILD", "TYPECHECK", "LINT", "SMOKE"],
    lastVerifiedAt: null,
    reason: "MCP SSH gateway snapshot még nincs hitelesítve.",
  },
  {
    id: "build02",
    hostname: "build02.dimpro.hu",
    state: "NOT_CONNECTED",
    capabilities: ["NEXT_BUILD", "TYPECHECK", "LINT", "SMOKE"],
    lastVerifiedAt: null,
    reason: "MCP SSH gateway snapshot még nincs hitelesítve.",
  },
] as const;

export type BuildNodeSnapshotState = "READY" | "BUSY" | "BLOCKED" | "NOT_CONNECTED";
export type BuildNodeSnapshotQuality = "LIVE" | "STALE" | "UNKNOWN";

export type BuildNodeMetrics = {
  cpuPercent: number;
  load1: number;
  cores: number;
  memoryTotalBytes: number;
  memoryUsedBytes: number;
  memoryAvailableBytes: number;
  memoryPercent: number;
  swapTotalBytes: number;
  swapUsedBytes: number;
  swapMinimumBytes: number;
  swapPercent: number;
  diskTotalBytes: number;
  diskUsedBytes: number;
  diskAvailableBytes: number;
  diskPercent: number;
  uptimeSeconds: number;
  buildLockHeld: boolean;
  currentRunId: string | null;
  queueDepth: number | null;
  storageGovernor: string;
  toolchainReady: boolean;
  nodeVersion: string;
  npmVersion: string;
  gitVersion: string;
  architecture: string;
  kernel: string;
};

export type BuildNodeSnapshot = BuildNodeDefinition & {
  healthState: BuildNodeSnapshotState;
  source: typeof SNAPSHOT_SOURCE;
  quality: BuildNodeSnapshotQuality;
  snapshotSampledAt: string | null;
  metrics: BuildNodeMetrics | null;
};

export type BuildNodeProbeOptions = {
  snapshotFile?: string;
  nowMs?: number;
  maxAgeMs?: number;
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!isObject(value)) return false;
  return Object.entries(value).some(([key, nested]) =>
    /password|secret|token|privatekey|authorization|commandline|envvars/i.test(key) || containsForbiddenKey(nested)
  );
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function nullableNumber(value: unknown): number | null | undefined {
  return value === null ? null : finiteNumber(value) ?? undefined;
}

function safeString(value: unknown, maxLength = 160): string | null {
  return typeof value === "string" && value.length <= maxLength ? value : null;
}

function cloneNode(node: BuildNodeDefinition): BuildNodeDefinition {
  return { ...node, capabilities: [...node.capabilities] };
}

function unavailableNode(
  definition: BuildNodeDefinition,
  reason: string,
  quality: BuildNodeSnapshotQuality,
  lastVerifiedAt: string | null = null,
  metrics: BuildNodeMetrics | null = null,
  snapshotSampledAt: string | null = null,
): BuildNodeSnapshot {
  return {
    ...cloneNode(definition),
    state: "NOT_CONNECTED",
    healthState: "NOT_CONNECTED",
    reason,
    lastVerifiedAt,
    source: SNAPSHOT_SOURCE,
    quality,
    snapshotSampledAt,
    metrics,
  };
}

function snapshotState(value: unknown): BuildNodeSnapshotState | null {
  return value === "READY" || value === "BUSY" || value === "BLOCKED" || value === "NOT_CONNECTED" ? value : null;
}

function buildState(value: BuildNodeSnapshotState): BuildNodeDefinition["state"] {
  if (value === "READY") return "READY";
  if (value === "BUSY") return "BUSY";
  if (value === "BLOCKED") return "DISABLED";
  return "NOT_CONNECTED";
}

function sanitizeMetrics(value: unknown): BuildNodeMetrics | null {
  if (!isObject(value)) return null;
  const numericKeys = [
    "cpuPercent", "load1", "cores", "memoryTotalBytes", "memoryUsedBytes", "memoryAvailableBytes",
    "memoryPercent", "swapTotalBytes", "swapUsedBytes", "swapMinimumBytes", "swapPercent",
    "diskTotalBytes", "diskUsedBytes", "diskAvailableBytes", "diskPercent", "uptimeSeconds",
  ] as const;
  const numeric: Partial<Record<(typeof numericKeys)[number], number>> = {};
  for (const key of numericKeys) {
    const parsed = finiteNumber(value[key]);
    if (parsed === null) return null;
    numeric[key] = parsed;
  }
  if (value.buildLockHeld !== true && value.buildLockHeld !== false) return null;
  if (value.toolchainReady !== true && value.toolchainReady !== false) return null;
  const queueDepth = nullableNumber(value.queueDepth);
  if (queueDepth === undefined) return null;
  const currentRunId = value.currentRunId === null ? null : safeString(value.currentRunId, 128);
  if (value.currentRunId !== null && currentRunId === null) return null;
  const storageGovernor = safeString(value.storageGovernor, 32);
  const nodeVersion = safeString(value.nodeVersion, 32);
  const npmVersion = safeString(value.npmVersion, 32);
  const gitVersion = safeString(value.gitVersion, 32);
  const architecture = safeString(value.architecture, 32);
  const kernel = safeString(value.kernel, 64);
  if (!storageGovernor || !nodeVersion || !npmVersion || !gitVersion || !architecture || !kernel) return null;
  return {
    ...(numeric as Pick<BuildNodeMetrics, (typeof numericKeys)[number]>),
    buildLockHeld: value.buildLockHeld,
    currentRunId,
    queueDepth,
    storageGovernor,
    toolchainReady: value.toolchainReady,
    nodeVersion,
    npmVersion,
    gitVersion,
    architecture,
    kernel,
  };
}

function parseTimestamp(value: unknown): { iso: string; ms: number } | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? { iso: value, ms } : null;
}

function parseNode(
  value: unknown,
  definition: BuildNodeDefinition,
  snapshotSampledAt: string,
  nowMs: number,
  maxAgeMs: number,
): BuildNodeSnapshot | null {
  if (!isObject(value)) return null;
  const state = snapshotState(value.state);
  const timestamp = parseTimestamp(value.lastVerifiedAt);
  const metrics = sanitizeMetrics(value.metrics);
  if (
    value.schemaVersion !== SNAPSHOT_SCHEMA_VERSION ||
    value.id !== definition.id ||
    value.hostname !== definition.hostname ||
    value.source !== SNAPSHOT_SOURCE ||
    value.quality !== "LIVE" ||
    !state ||
    !timestamp ||
    !metrics
  ) return null;

  const stale = nowMs - timestamp.ms > maxAgeMs || timestamp.ms - nowMs > maxAgeMs;
  if (stale) {
    return unavailableNode(
      definition,
      "A build node MCP gateway állapotmintája elavult.",
      "STALE",
      timestamp.iso,
      metrics,
      snapshotSampledAt,
    );
  }

  return {
    ...cloneNode(definition),
    state: buildState(state),
    healthState: state,
    reason: safeString(value.reason) || "A build node állapota hitelesítve.",
    lastVerifiedAt: timestamp.iso,
    source: SNAPSHOT_SOURCE,
    quality: "LIVE",
    snapshotSampledAt,
    metrics,
  };
}

function invalidSnapshot(reason: string): BuildNodeSnapshot[] {
  return DEFAULT_BUILD_NODES.map((definition) => unavailableNode(definition, reason, "UNKNOWN"));
}

export function listBuildNodes(): BuildNodeDefinition[] {
  return DEFAULT_BUILD_NODES.map(cloneNode);
}

export async function probeBuildNodes(options: BuildNodeProbeOptions = {}): Promise<BuildNodeSnapshot[]> {
  const snapshotFile = options.snapshotFile || process.env.BENJADMIN_BUILD_NODE_SNAPSHOT_FILE?.trim() || DEFAULT_SNAPSHOT_FILE;
  const nowMs = options.nowMs ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
  } catch {
    return invalidSnapshot("A build node MCP gateway snapshot nem olvasható.");
  }
  if (!isObject(parsed) || containsForbiddenKey(parsed)) {
    return invalidSnapshot("A build node MCP gateway snapshot formátuma érvénytelen.");
  }
  const sampledAt = parseTimestamp(parsed.sampledAt);
  const rawNodes = parsed.nodes;
  if (
    parsed.schemaVersion !== SNAPSHOT_SCHEMA_VERSION ||
    parsed.environment !== "DEV" ||
    parsed.productionAccess !== "DENY" ||
    parsed.source !== SNAPSHOT_SOURCE ||
    !sampledAt ||
    !Array.isArray(rawNodes) ||
    rawNodes.length !== DEFAULT_BUILD_NODES.length
  ) return invalidSnapshot("A build node MCP gateway snapshot szerződése érvénytelen.");

  const ids = rawNodes.map((node) => isObject(node) ? node.id : null);
  if (new Set(ids).size !== DEFAULT_BUILD_NODES.length) {
    return invalidSnapshot("A build node MCP gateway snapshot node-azonosítói érvénytelenek.");
  }

  const snapshotStale = nowMs - sampledAt.ms > maxAgeMs || sampledAt.ms - nowMs > maxAgeMs;
  return DEFAULT_BUILD_NODES.map((definition) => {
    const rawNode = rawNodes.find((node) => isObject(node) && node.id === definition.id);
    const node = parseNode(rawNode, definition, sampledAt.iso, nowMs, maxAgeMs);
    if (!node) return unavailableNode(definition, "A build node MCP gateway node-mintája érvénytelen.", "UNKNOWN");
    if (snapshotStale && node.quality !== "STALE") {
      return unavailableNode(
        definition,
        "A build node MCP gateway snapshot elavult.",
        "STALE",
        node.lastVerifiedAt,
        node.metrics,
        sampledAt.iso,
      );
    }
    return node;
  });
}

export function selectBuildNode(nodes: BuildNodeDefinition[]) {
  return nodes.find((node) => node.state === "READY") || null;
}

export function assertBuildNodeReady(node: BuildNodeDefinition | null) {
  if (!node || node.state !== "READY") {
    const error = new Error("Nincs READY állapotú hitelesített build node. Veszélyes kerülő build tilos.");
    Object.assign(error, { code: "BUILD_NODE_NOT_READY" });
    throw error;
  }
  return node;
}
