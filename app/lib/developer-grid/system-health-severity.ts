import type { InfrastructureHealthAlert, InfrastructureHealthNode, InfrastructureHealthOverall, InfrastructureHealthSeverity, InfrastructureHealthState } from "./system-health-model";

const SEVERITY_ORDER: Record<InfrastructureHealthSeverity, number> = { OK: 0, INFO: 1, WARNING: 2, CRITICAL: 3 };

function numericMetric(node: InfrastructureHealthNode, key: string) {
  const value = node.metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function maxSeverity(a: InfrastructureHealthSeverity, b: InfrastructureHealthSeverity): InfrastructureHealthSeverity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

function ramSeverity(percent: number | null): InfrastructureHealthSeverity {
  if (percent === null) return "OK";
  if (percent > 92) return "CRITICAL";
  if (percent >= 85) return "WARNING";
  if (percent >= 75) return "INFO";
  return "OK";
}

function swapSeverity(percent: number | null): InfrastructureHealthSeverity {
  if (percent === null) return "OK";
  if (percent >= 80) return "CRITICAL";
  if (percent >= 50) return "WARNING";
  return "OK";
}

function diskSeverity(percent: number | null): InfrastructureHealthSeverity {
  if (percent === null) return "OK";
  if (percent >= 95) return "CRITICAL";
  if (percent >= 90) return "WARNING";
  if (percent >= 80) return "INFO";
  return "OK";
}

function psiSeverity(someAvg60: number | null, fullAvg60: number | null): InfrastructureHealthSeverity {
  if ((fullAvg60 ?? 0) >= 25 || (someAvg60 ?? 0) >= 35) return "CRITICAL";
  if ((fullAvg60 ?? 0) >= 5 || (someAvg60 ?? 0) >= 10) return "WARNING";
  return "OK";
}

function stateSeverity(node: InfrastructureHealthNode): InfrastructureHealthSeverity {
  if (node.state === "BLOCKED" || node.state === "OFFLINE") return "CRITICAL";
  if (node.state === "DEGRADED") return node.kind === "PROD" || node.kind === "DATABASE" ? "CRITICAL" : "WARNING";
  if (node.state === "NOT_CONNECTED") return node.kind === "PROD" || node.kind === "DATABASE" ? "CRITICAL" : "INFO";
  if (node.state === "UNKNOWN") return "WARNING";
  if (node.state === "PLANNED" || node.state === "BUSY") return "INFO";
  return "OK";
}

export function isNodeStale(node: InfrastructureHealthNode, nowMs = Date.now()) {
  if (!node.sampledAt || node.quality === "REGISTRY_ONLY") return false;
  const sampledAt = Date.parse(node.sampledAt);
  return !Number.isFinite(sampledAt) || nowMs - sampledAt > node.staleAfterMs;
}

export function evaluateInfrastructureNode(input: InfrastructureHealthNode, nowMs = Date.now()): InfrastructureHealthNode {
  const node: InfrastructureHealthNode = { ...input, metrics: { ...input.metrics }, capabilities: [...input.capabilities] };
  const stale = isNodeStale(node, nowMs);
  const swapTotal = numericMetric(node, "swapTotalBytes");
  const swapUsed = numericMetric(node, "swapUsedBytes");
  const swapPercent = numericMetric(node, "swapPercent") ?? (swapTotal && swapUsed !== null ? Math.round((swapUsed / swapTotal) * 1000) / 10 : null);
  let severity = stateSeverity(node);
  severity = maxSeverity(severity, ramSeverity(numericMetric(node, "memoryPercent")));
  severity = maxSeverity(severity, swapSeverity(swapPercent));
  severity = maxSeverity(severity, diskSeverity(numericMetric(node, "diskPercent")));
  severity = maxSeverity(severity, psiSeverity(numericMetric(node, "memoryPsiSomeAvg60"), numericMetric(node, "memoryPsiFullAvg60")));
  if (stale) severity = maxSeverity(severity, "WARNING");
  const state: InfrastructureHealthState = stale && node.state === "READY" ? "DEGRADED" : node.state;
  return { ...node, state, severity, stale, quality: stale ? "STALE" : node.quality };
}

export function aggregateInfrastructureHealth(nodes: InfrastructureHealthNode[]): InfrastructureHealthOverall {
  const counts: Record<InfrastructureHealthSeverity, number> = { OK: 0, INFO: 0, WARNING: 0, CRITICAL: 0 };
  for (const node of nodes) counts[node.severity] += 1;
  const severity: InfrastructureHealthSeverity = counts.CRITICAL ? "CRITICAL" : counts.WARNING ? "WARNING" : counts.INFO ? "INFO" : "OK";
  const state: InfrastructureHealthState = severity === "CRITICAL" ? "BLOCKED" : severity === "WARNING" ? "DEGRADED" : "READY";
  const actionableNodeCount = nodes.filter((node) => node.state !== "PLANNED").length;
  const staleNodeCount = nodes.filter((node) => node.stale).length;
  const summary = severity === "OK"
    ? "Minden csatlakoztatott infrastruktúra-node rendben."
    : `${counts.CRITICAL} kritikus · ${counts.WARNING} figyelmeztetés · ${counts.INFO} információs állapot.`;
  return { state, severity, summary, counts, nodeCount: nodes.length, actionableNodeCount, staleNodeCount };
}

export function infrastructureHealthAlerts(nodes: InfrastructureHealthNode[]): InfrastructureHealthAlert[] {
  return nodes
    .filter((node) => node.severity === "WARNING" || node.severity === "CRITICAL")
    .map((node) => ({ nodeId: node.id, label: node.label, severity: node.severity, state: node.state, reason: node.reason, stale: node.stale }));
}
