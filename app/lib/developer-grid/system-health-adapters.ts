import type { InfrastructureHealthNode, LegacyHealthServer, LegacyHealthStorage } from "./system-health-model";
import { infrastructureNodeDefinition, listInfrastructureNodeRegistry, plannedRegistryNode } from "./system-health-registry";
import { evaluateInfrastructureNode } from "./system-health-severity";

function pct(used: number | null | undefined, total: number | null | undefined) {
  return typeof used === "number" && typeof total === "number" && total > 0 ? Math.round((used / total) * 1000) / 10 : null;
}

function serverState(server: LegacyHealthServer): InfrastructureHealthNode["state"] {
  return server.state === "READY" ? "READY" : server.state === "DEGRADED" ? "DEGRADED" : "NOT_CONNECTED";
}

export function normalizeHealthServer(server: LegacyHealthServer, nowMs = Date.now()): InfrastructureHealthNode {
  const definition = infrastructureNodeDefinition(server.id);
  if (!definition) throw new Error(`HEALTH_NODE_REGISTRY_MISSING: ${server.id}`);
  const metrics = server.metrics;
  return evaluateInfrastructureNode({
    id: server.id,
    label: definition.label || server.label,
    kind: definition.kind,
    state: serverState(server),
    severity: "OK",
    reason: server.reason,
    sampledAt: server.lastVerifiedAt,
    staleAfterMs: definition.staleAfterMs,
    stale: false,
    readOnly: definition.readOnly,
    metrics: {
      hostname: server.hostname,
      cpuPercent: metrics.cpuPercent,
      load1: metrics.load1,
      cores: metrics.cores,
      memoryTotalBytes: metrics.memoryTotalBytes,
      memoryUsedBytes: metrics.memoryUsedBytes,
      memoryPercent: metrics.memoryPercent,
      swapTotalBytes: metrics.swapTotalBytes,
      swapUsedBytes: metrics.swapUsedBytes,
      swapPercent: pct(metrics.swapUsedBytes, metrics.swapTotalBytes),
      diskTotalBytes: metrics.diskTotalBytes,
      diskUsedBytes: metrics.diskUsedBytes,
      diskPercent: metrics.diskPercent,
      uptimeSeconds: metrics.uptimeSeconds,
      latencyMs: metrics.latencyMs ?? null,
      memoryPsiSomeAvg60: metrics.memoryPsiSomeAvg60 ?? null,
      memoryPsiFullAvg60: metrics.memoryPsiFullAvg60 ?? null,
    },
    capabilities: [...definition.capabilities],
    source: definition.source,
    quality: server.state === "READY" ? "LIVE" : metrics.memoryPercent !== null || metrics.diskPercent !== null ? "PARTIAL" : "UNKNOWN",
  }, nowMs);
}

export function normalizeHealthStorage(storage: LegacyHealthStorage, nowMs = Date.now()): InfrastructureHealthNode {
  const definition = infrastructureNodeDefinition(storage.id);
  if (!definition) throw new Error(`HEALTH_NODE_REGISTRY_MISSING: ${storage.id}`);
  return evaluateInfrastructureNode({
    id: storage.id,
    label: definition.label || storage.label,
    kind: definition.kind,
    state: storage.state === "READY" ? "READY" : "UNKNOWN",
    severity: "OK",
    reason: storage.state === "READY" ? "Storage capacity sample elérhető." : "Storage capacity sample nem elérhető.",
    sampledAt: storage.refreshedAt,
    staleAfterMs: definition.staleAfterMs,
    stale: false,
    readOnly: definition.readOnly,
    metrics: { totalBytes: storage.totalBytes, usedBytes: storage.usedBytes, percent: storage.percent, diskPercent: storage.percent },
    capabilities: [...definition.capabilities],
    source: definition.source,
    quality: storage.state === "READY" ? "CACHED" : "UNKNOWN",
  }, nowMs);
}

export function plannedInfrastructureNodes(existingIds: Set<string>) {
  return listInfrastructureNodeRegistry()
    .filter((entry) => entry.planned && !existingIds.has(entry.id))
    .map(plannedRegistryNode);
}

export function normalizeInfrastructureNodes(servers: LegacyHealthServer[], storage: LegacyHealthStorage[], nowMs = Date.now()) {
  const nodes = [...servers.map((server) => normalizeHealthServer(server, nowMs)), ...storage.map((item) => normalizeHealthStorage(item, nowMs))];
  const ids = new Set(nodes.map((node) => node.id));
  return [...nodes, ...plannedInfrastructureNodes(ids)];
}
