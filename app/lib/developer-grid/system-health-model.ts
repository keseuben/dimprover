export type InfrastructureNodeKind = "DEV" | "BUILD" | "PROD" | "DATABASE" | "STORAGE" | "AI";

export type InfrastructureHealthState =
  | "READY"
  | "BUSY"
  | "DEGRADED"
  | "BLOCKED"
  | "NOT_CONNECTED"
  | "OFFLINE"
  | "UNKNOWN"
  | "PLANNED";

export type InfrastructureHealthSeverity = "OK" | "INFO" | "WARNING" | "CRITICAL";
export type InfrastructureHealthQuality = "LIVE" | "CACHED" | "PARTIAL" | "STALE" | "REGISTRY_ONLY" | "UNKNOWN";
export type InfrastructureMetricValue = number | string | boolean | null;

export type InfrastructureHealthNode = {
  id: string;
  label: string;
  kind: InfrastructureNodeKind;
  state: InfrastructureHealthState;
  severity: InfrastructureHealthSeverity;
  reason: string;
  sampledAt: string | null;
  staleAfterMs: number;
  stale: boolean;
  readOnly: boolean;
  metrics: Record<string, InfrastructureMetricValue>;
  capabilities: string[];
  source: string;
  quality: InfrastructureHealthQuality;
};

export type InfrastructureHealthOverall = {
  state: InfrastructureHealthState;
  severity: InfrastructureHealthSeverity;
  summary: string;
  counts: Record<InfrastructureHealthSeverity, number>;
  nodeCount: number;
  actionableNodeCount: number;
  staleNodeCount: number;
};

export type InfrastructureHealthAlert = {
  nodeId: string;
  label: string;
  severity: InfrastructureHealthSeverity;
  state: InfrastructureHealthState;
  reason: string;
  stale: boolean;
};

export type LegacyHealthMetric = {
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
  memoryAvailableBytes?: number | null;
  swapMinimumBytes?: number | null;
  diskAvailableBytes?: number | null;
  buildLockHeld?: boolean | null;
  currentRunId?: string | null;
  queueDepth?: number | null;
  storageGovernor?: string | null;
  toolchainReady?: boolean | null;
  nodeVersion?: string | null;
  npmVersion?: string | null;
  gitVersion?: string | null;
  architecture?: string | null;
  kernel?: string | null;
  latencyMs?: number | null;
  memoryPsiSomeAvg60?: number | null;
  memoryPsiFullAvg60?: number | null;
};

export type LegacyHealthServer = {
  id: "dev-vps" | "build01" | "build02" | "prod-vps" | "db-vps";
  label: string;
  hostname: string;
  state: "READY" | "BUSY" | "BLOCKED" | "NOT_CONNECTED" | "DEGRADED";
  reason: string;
  lastVerifiedAt: string | null;
  metrics: LegacyHealthMetric;
  source?: string;
  quality?: InfrastructureHealthQuality;
};

export type LegacyHealthStorage = {
  id: string;
  label: string;
  state: "READY" | "UNKNOWN";
  totalBytes: number | null;
  usedBytes: number | null;
  percent: number | null;
  refreshedAt: string | null;
};

export type DimprominAiHealthMetrics = {
  gpuType: string | null;
  gpuUtilPercent: number | null;
  vramTotalBytes: number | null;
  vramUsedBytes: number | null;
  vramPercent: number | null;
  gpuTemperatureC: number | null;
  powerDrawWatts: number | null;
  powerLimitWatts: number | null;
  driverVersion: string | null;
  cudaVersion: string | null;
  inferenceRuntime: string | null;
  loadedModel: string | null;
  precision: string | null;
  activeInferenceCount: number | null;
  queueDepth: number | null;
  tokensPerSecond: number | null;
  lastSuccessfulInference: string | null;
  modelState: string | null;
};

export type DimprominAiHealthSample = {
  nodeId: string;
  state: Exclude<InfrastructureHealthState, "PLANNED">;
  reason: string;
  sampledAt: string;
  source: string;
  metrics: DimprominAiHealthMetrics;
};

export type DimprominAiHealthAdapter = {
  source: string;
  sample(nodeId: string): Promise<DimprominAiHealthSample | null>;
};

export type SafeInfrastructureOperation = Partial<Record<
  "status" | "operation" | "owner" | "task" | "target" | "workerCode" | "host" | "startedAt" | "finishedAt" | "event",
  string | number | null
>> & { pid?: number | null; exitCode?: number | null };

export type InfrastructureOperationalContext = {
  sampledAt: string;
  centralLock: "FREE" | "HELD" | "UNKNOWN";
  activeOperation: SafeInfrastructureOperation | null;
  lastOperation: SafeInfrastructureOperation | null;
  devRuntimes: Array<{ id: string; label: string; state: "READY" | "OFFLINE"; latencyMs: number | null }>;
};

export type DeveloperGridSystemHealthV2 = {
  schemaVersion: 2;
  environment: "DEV";
  productionAccess: "DENY";
  generatedAt: string;
  refreshPolicy: {
    serversMs: number;
    protectedServersMs: number;
    diskMs: number;
    storageMs: number;
    aiMs: number;
    source: "SERVER_CACHE_NO_SUPABASE_POLLING";
  };
  nodes: InfrastructureHealthNode[];
  overall: InfrastructureHealthOverall;
  alerts: InfrastructureHealthAlert[];
  operations: InfrastructureOperationalContext;
  servers: LegacyHealthServer[];
  storage: LegacyHealthStorage[];
};
