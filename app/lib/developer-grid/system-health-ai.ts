import type { DimprominAiHealthAdapter, DimprominAiHealthMetrics, DimprominAiHealthSample, InfrastructureHealthNode, InfrastructureHealthState } from "./system-health-model";
import { evaluateInfrastructureNode } from "./system-health-severity";

const AI_METRIC_KEYS: readonly (keyof DimprominAiHealthMetrics)[] = [
  "gpuType", "gpuUtilPercent", "vramTotalBytes", "vramUsedBytes", "vramPercent", "gpuTemperatureC", "powerDrawWatts", "powerLimitWatts",
  "driverVersion", "cudaVersion", "inferenceRuntime", "loadedModel", "precision", "activeInferenceCount", "queueDepth", "tokensPerSecond",
  "lastSuccessfulInference", "modelState",
] as const;

const ALLOWED_STATES = new Set<InfrastructureHealthState>(["READY", "BUSY", "DEGRADED", "BLOCKED", "NOT_CONNECTED", "OFFLINE", "UNKNOWN"]);

export function sanitizeDimprominMetrics(value: unknown): DimprominAiHealthMetrics {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result: Record<string, string | number | null> = {};
  for (const key of AI_METRIC_KEYS) {
    const item = source[key];
    result[key] = typeof item === "number" && Number.isFinite(item) ? item : typeof item === "string" ? item.slice(0, 160) : null;
  }
  return result as DimprominAiHealthMetrics;
}

function safeSample(sample: DimprominAiHealthSample, source: string) {
  const state = ALLOWED_STATES.has(sample.state) ? sample.state : "UNKNOWN";
  return { state, reason: String(sample.reason || "AI health sample elérhető.").slice(0, 240), sampledAt: sample.sampledAt, source, metrics: sanitizeDimprominMetrics(sample.metrics) };
}

export async function applyDimprominAiAdapter(nodes: InfrastructureHealthNode[], adapter?: DimprominAiHealthAdapter | null, nowMs = Date.now()): Promise<InfrastructureHealthNode[]> {
  if (!adapter) return nodes.map((node): InfrastructureHealthNode => ({ ...node, metrics: { ...node.metrics }, capabilities: [...node.capabilities] }));
  return Promise.all(nodes.map(async (node): Promise<InfrastructureHealthNode> => {
    if (node.kind !== "AI") return { ...node, metrics: { ...node.metrics }, capabilities: [...node.capabilities] };
    try {
      const raw = await adapter.sample(node.id);
      if (!raw) return { ...node, state: "NOT_CONNECTED", severity: "INFO", reason: "DIMPROMIN health agent nem adott mintát.", source: adapter.source, quality: "UNKNOWN" };
      const sample = safeSample(raw, adapter.source);
      return evaluateInfrastructureNode({ ...node, ...sample, severity: "OK", stale: false, quality: "LIVE", readOnly: true, metrics: sample.metrics }, nowMs);
    } catch {
      return { ...node, state: "NOT_CONNECTED", severity: "INFO", reason: "DIMPROMIN health agent lekérés sikertelen.", source: adapter.source, quality: "UNKNOWN" };
    }
  }));
}
