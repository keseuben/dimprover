import type { InfrastructureHealthNode, LegacyHealthServer, LegacyHealthStorage, LegacyHealthTraffic } from "./system-health-model";
import { infrastructureNodeDefinition, listInfrastructureNodeRegistry, plannedRegistryNode } from "./system-health-registry";
import { evaluateInfrastructureNode } from "./system-health-severity";

function pct(used: number | null | undefined, total: number | null | undefined) {
  return typeof used === "number" && typeof total === "number" && total > 0 ? Math.round((used / total) * 1000) / 10 : null;
}

function serverState(server: LegacyHealthServer): InfrastructureHealthNode["state"] {
  if (server.state === "READY" || server.state === "BUSY" || server.state === "BLOCKED" || server.state === "DEGRADED") return server.state;
  return "NOT_CONNECTED";
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
      memoryAvailableBytes: metrics.memoryAvailableBytes ?? null,
      memoryPercent: metrics.memoryPercent,
      swapTotalBytes: metrics.swapTotalBytes,
      swapUsedBytes: metrics.swapUsedBytes,
      swapMinimumBytes: metrics.swapMinimumBytes ?? null,
      swapPercent: pct(metrics.swapUsedBytes, metrics.swapTotalBytes),
      diskTotalBytes: metrics.diskTotalBytes,
      diskUsedBytes: metrics.diskUsedBytes,
      diskAvailableBytes: metrics.diskAvailableBytes ?? null,
      diskPercent: metrics.diskPercent,
      uptimeSeconds: metrics.uptimeSeconds,
      buildLockHeld: metrics.buildLockHeld ?? null,
      currentRunId: metrics.currentRunId ?? null,
      queueDepth: metrics.queueDepth ?? null,
      storageGovernor: metrics.storageGovernor ?? null,
      toolchainReady: metrics.toolchainReady ?? null,
      nodeVersion: metrics.nodeVersion ?? null,
      npmVersion: metrics.npmVersion ?? null,
      gitVersion: metrics.gitVersion ?? null,
      architecture: metrics.architecture ?? null,
      kernel: metrics.kernel ?? null,
      latencyMs: metrics.latencyMs ?? null,
      memoryPsiSomeAvg60: metrics.memoryPsiSomeAvg60 ?? null,
      memoryPsiFullAvg60: metrics.memoryPsiFullAvg60 ?? null,
    },
    capabilities: [...definition.capabilities],
    source: server.source || definition.source,
    quality: server.quality || (server.state === "READY" ? "LIVE" : metrics.memoryPercent !== null || metrics.diskPercent !== null ? "PARTIAL" : "UNKNOWN"),
  }, nowMs);
}

export function normalizeHealthStorage(storage: LegacyHealthStorage, nowMs = Date.now()): InfrastructureHealthNode {
  const definition = infrastructureNodeDefinition(storage.id);
  if (!definition) throw new Error(`HEALTH_NODE_REGISTRY_MISSING: ${storage.id}`);
  const state = storage.state === "READY" ? "READY" : storage.state === "DEGRADED" ? "DEGRADED" : "UNKNOWN";
  return evaluateInfrastructureNode({
    id: storage.id,
    label: definition.label || storage.label,
    kind: definition.kind,
    state,
    severity: "OK",
    reason: storage.reason || (storage.state === "READY" ? "Storage capacity sample elérhető." : "Storage capacity sample nem elérhető."),
    sampledAt: storage.refreshedAt,
    staleAfterMs: definition.staleAfterMs,
    stale: false,
    readOnly: definition.readOnly,
    metrics: {
      totalBytes: storage.totalBytes,
      usedBytes: storage.usedBytes,
      availableBytes: storage.availableBytes ?? (typeof storage.totalBytes === "number" && typeof storage.usedBytes === "number" ? Math.max(0, storage.totalBytes - storage.usedBytes) : null),
      percent: storage.percent,
      diskPercent: storage.percent,
      objectCount: storage.objectCount ?? null,
    },
    capabilities: [...definition.capabilities],
    source: storage.source || definition.source,
    quality: storage.quality || (storage.state === "READY" ? "CACHED" : storage.state === "DEGRADED" ? "PARTIAL" : "UNKNOWN"),
  }, nowMs);
}

export function normalizeHealthTraffic(traffic: LegacyHealthTraffic, nowMs = Date.now()): InfrastructureHealthNode {
  const definition = infrastructureNodeDefinition(traffic.id);
  if (!definition) throw new Error(`HEALTH_NODE_REGISTRY_MISSING: ${traffic.id}`);
  const state = traffic.state === "READY" ? "READY" : traffic.state === "DEGRADED" ? "DEGRADED" : traffic.state === "NOT_CONNECTED" ? "NOT_CONNECTED" : "UNKNOWN";
  return evaluateInfrastructureNode({
    id: traffic.id,
    label: definition.label || traffic.label,
    kind: definition.kind,
    state,
    severity: "OK",
    reason: traffic.reason,
    sampledAt: traffic.refreshedAt,
    staleAfterMs: definition.staleAfterMs,
    stale: false,
    readOnly: definition.readOnly,
    metrics: {
      projectRef: traffic.projectRef,
      interval: traffic.interval,
      apiRequests: traffic.apiRequests,
      restRequests: traffic.restRequests,
      authRequests: traffic.authRequests,
      storageRequests: traffic.storageRequests,
      realtimeRequests: traffic.realtimeRequests,
      egressBytes: traffic.egressBytes,
      cachedEgressBytes: traffic.cachedEgressBytes,
      egressQuotaBytes: traffic.egressQuotaBytes,
      cachedEgressQuotaBytes: traffic.cachedEgressQuotaBytes,
      egressPercent: traffic.egressPercent,
      cachedEgressPercent: traffic.cachedEgressPercent,
      usagePercent: Math.max(traffic.egressPercent ?? 0, traffic.cachedEgressPercent ?? 0) || null,
    },
    capabilities: [...definition.capabilities],
    source: traffic.source || definition.source,
    quality: traffic.quality,
  }, nowMs);
}

export function plannedInfrastructureNodes(existingIds: Set<string>) {
  return listInfrastructureNodeRegistry()
    .filter((entry) => entry.planned && !existingIds.has(entry.id))
    .map(plannedRegistryNode);
}

export function normalizeInfrastructureNodes(servers: LegacyHealthServer[], storage: LegacyHealthStorage[], traffic: LegacyHealthTraffic[] = [], nowMs = Date.now()) {
  const nodes = [
    ...servers.map((server) => normalizeHealthServer(server, nowMs)),
    ...storage.map((item) => normalizeHealthStorage(item, nowMs)),
    ...traffic.map((item) => normalizeHealthTraffic(item, nowMs)),
  ];
  const ids = new Set(nodes.map((node) => node.id));
  return [...nodes, ...plannedInfrastructureNodes(ids)];
}
