import type { InfrastructureHealthNode, InfrastructureMetricValue, InfrastructureNodeKind } from "./system-health-model";

export type InfrastructureNodeRegistryEntry = {
  id: string;
  label: string;
  kind: InfrastructureNodeKind;
  readOnly: boolean;
  capabilities: string[];
  source: string;
  staleAfterMs: number;
  planned?: boolean;
};

const MINUTE = 60_000;

const REGISTRY: readonly InfrastructureNodeRegistryEntry[] = [
  { id: "dev-vps", label: "DEV VPS", kind: "DEV", readOnly: false, capabilities: ["OS_METRICS", "MEMORY_PSI", "RUNTIME_HEALTH"], source: "LOCAL_OS", staleAfterMs: MINUTE },
  { id: "build01", label: "BUILD01", kind: "BUILD", readOnly: true, capabilities: ["READONLY_METRICS", "MCP_SSH_GATEWAY", "NEXT_BUILD", "TYPECHECK", "LINT", "SMOKE"], source: "DIMPRO_MCP_SSH_GATEWAY", staleAfterMs: MINUTE },
  { id: "build02", label: "BUILD02", kind: "BUILD", readOnly: true, capabilities: ["READONLY_METRICS", "MCP_SSH_GATEWAY", "NEXT_BUILD", "TYPECHECK", "LINT", "SMOKE"], source: "DIMPRO_MCP_SSH_GATEWAY", staleAfterMs: MINUTE },
  { id: "prod-vps", label: "PROD / ÉLŐ", kind: "PROD", readOnly: true, capabilities: ["HTTPS_AVAILABILITY", "READONLY_SNAPSHOT"], source: "READONLY_HTTPS_PROBE", staleAfterMs: 2 * MINUTE },
  { id: "db-vps", label: "DB VPS", kind: "DATABASE", readOnly: true, capabilities: ["TCP_AVAILABILITY", "READONLY_SNAPSHOT"], source: "READONLY_TCP_PROBE", staleAfterMs: 2 * MINUTE },
  { id: "dev-root", label: "DEV TÁRHELY", kind: "STORAGE", readOnly: true, capabilities: ["CAPACITY"], source: "LOCAL_STATFS", staleAfterMs: 10 * MINUTE },
  { id: "drive-storage", label: "DIMPRO DRIVE STORAGE", kind: "STORAGE", readOnly: true, capabilities: ["CAPACITY"], source: "REGISTRY", staleAfterMs: 10 * MINUTE, planned: true },
  { id: "drop-storage", label: "DIMPRO DROP STORAGE", kind: "STORAGE", readOnly: true, capabilities: ["CAPACITY"], source: "REGISTRY", staleAfterMs: 10 * MINUTE, planned: true },
  { id: "backup-storage", label: "BACKUP STORAGE", kind: "STORAGE", readOnly: true, capabilities: ["CAPACITY"], source: "REGISTRY", staleAfterMs: 10 * MINUTE, planned: true },
  { id: "artifact-storage", label: "ARTIFACT / RELEASE STORAGE", kind: "STORAGE", readOnly: true, capabilities: ["CAPACITY"], source: "REGISTRY", staleAfterMs: 10 * MINUTE, planned: true },
  { id: "dimpromin-ai-01", label: "DIMPROMIN AI 01", kind: "AI", readOnly: true, capabilities: ["GPU_HEALTH", "MODEL_RUNTIME", "INFERENCE_QUEUE"], source: "REGISTRY", staleAfterMs: MINUTE, planned: true },
  { id: "dimpromin-ai-02", label: "DIMPROMIN AI 02", kind: "AI", readOnly: true, capabilities: ["GPU_HEALTH", "MODEL_RUNTIME", "INFERENCE_QUEUE"], source: "REGISTRY", staleAfterMs: MINUTE, planned: true },
] as const;

export function listInfrastructureNodeRegistry(): InfrastructureNodeRegistryEntry[] {
  return REGISTRY.map((entry) => ({ ...entry, capabilities: [...entry.capabilities] }));
}

export function infrastructureNodeDefinition(id: string) {
  return listInfrastructureNodeRegistry().find((entry) => entry.id === id) || null;
}

export function plannedRegistryNode(entry: InfrastructureNodeRegistryEntry): InfrastructureHealthNode {
  const metrics: Record<string, InfrastructureMetricValue> = entry.kind === "AI" ? {
    gpuType: null, gpuUtilPercent: null, vramTotalBytes: null, vramUsedBytes: null, vramPercent: null, gpuTemperatureC: null,
    powerDrawWatts: null, powerLimitWatts: null, driverVersion: null, cudaVersion: null, inferenceRuntime: null, loadedModel: null,
    precision: null, activeInferenceCount: null, queueDepth: null, tokensPerSecond: null, lastSuccessfulInference: null, modelState: null,
  } : entry.kind === "STORAGE" ? { totalBytes: null, usedBytes: null, freeBytes: null, percent: null, trend: null } : {};
  return {
    id: entry.id,
    label: entry.label,
    kind: entry.kind,
    state: entry.planned ? "PLANNED" : "NOT_CONNECTED",
    severity: "INFO",
    reason: entry.planned ? "Node tervezve; health agent még nincs csatlakoztatva." : "Health adatforrás nincs csatlakoztatva.",
    sampledAt: null,
    staleAfterMs: entry.staleAfterMs,
    stale: false,
    readOnly: entry.readOnly,
    metrics,
    capabilities: [...entry.capabilities],
    source: entry.source,
    quality: "REGISTRY_ONLY",
  };
}
