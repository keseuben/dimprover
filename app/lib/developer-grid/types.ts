export const DEVELOPER_GRID_SCHEMA_VERSION = 1 as const;

export type GridEnvironment = "DEV";
export type ProductionAccess = "DENY";
export type WorkerCode = "ARMINAI" | "OUTMINAI" | "BENJAMINAI" | "JAZMINAI" | "DEVMINAI";
export type CoreWorkerCode = Exclude<WorkerCode, "DEVMINAI">;
export type GridWorkerState = "IDLE" | "READY" | "WORKING" | "BLOCKED" | "OFFLINE";
export type GridEventKind = "analysis" | "coding" | "file-change" | "diff" | "test" | "build" | "commit" | "release" | "handoff";
export type GridEventOrigin = "LIVE" | "BACKFILL";
export type SourceState = "VERIFIED" | "BLOCKED";
export type ReleaseState = "VERIFIED" | "BLOCKED" | "NOT_CONFIGURED";
export type BuildNodeState = "READY" | "BUSY" | "NOT_CONNECTED" | "DISABLED";

export type DeveloperGridTask = {
  id: string;
  projectId: string;
  title: string;
  priority: number;
  environment: GridEnvironment;
  productionAccess: ProductionAccess;
  status: "READY" | "RUNNING" | "BLOCKED" | "REVIEW" | "COMPLETED";
  acceptance: string[];
};

export type DevelopmentContext = {
  projectId: string;
  mainModule: string;
  moduleName: string;
  submoduleName?: string | null;
  workItem: string;
  workStageIndex?: number | null;
  taskId: string;
  source: "ACTIVE_SESSION" | "EXPLICIT_TASK" | "TASK_PROVENANCE" | "ACTIVITY" | "GIT" | "PRESENCE" | "HEURISTIC";
  resolvedAt: string;
};

export type SourceProvenance = {
  repository: string;
  worktree: string;
  branch: string;
  head: string;
  worker: WorkerCode;
  taskId: string;
  sessionId: string;
  verifiedAt: string;
  sourceState: SourceState;
  blockCode: "SOURCE_BASELINE_MISMATCH" | null;
  reasons: string[];
};

export type WorkerRegistryEntry = {
  code: WorkerCode;
  label: string;
  position: "TOP_LEFT" | "TOP_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_RIGHT" | "AUXILIARY";
  fixed: boolean;
  role: string;
  state: GridWorkerState;
  authoritativeContext: false;
};

export type WorkerSession = {
  id: string;
  workerCode: WorkerCode;
  taskId: string;
  developmentContext: DevelopmentContext;
  sourceProvenance: SourceProvenance;
  startedAt: string;
  endedAt: string | null;
};

export type GridActivityEvent = {
  id: string;
  sequence: number;
  kind: GridEventKind;
  origin: GridEventOrigin;
  workerCode: WorkerCode;
  taskId: string;
  projectId: string;
  developmentContext?: DevelopmentContext;
  branch?: string;
  worktree?: string;
  head?: string;
  timestamp: string;
  productionAccess: ProductionAccess;
  delta: Record<string, unknown>;
};

export type GridEventPage = {
  events: GridActivityEvent[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type ReleaseRuntimeProvenance = {
  declaredRelease: string | null;
  activeReleasePointer: string | null;
  pm2NextDistDir: string | null;
  runtimeCwd: string | null;
  buildId: string | null;
  expectedBuildId: string | null;
  state: ReleaseState;
  blockCode: "RELEASE_STATE_MISMATCH" | null;
  reasons: string[];
  verifiedAt: string;
};

export type BuildNodeDefinition = {
  id: "build01" | "build02";
  hostname: "build01.dimpro.hu" | "build02.dimpro.hu";
  state: BuildNodeState;
  capabilities: string[];
  lastVerifiedAt: string | null;
  reason: string;
};

export type GridHandoff = {
  schemaVersion: 1;
  taskId: string;
  workerCode: WorkerCode;
  branch: string;
  worktree: string;
  startHead: string;
  endHead: string;
  commits: string[];
  changedFiles: string[];
  tests: Array<{ name: string; status: "PASS" | "FAIL" | "SKIPPED"; detail?: string }>;
  build: { status: "NOT_RUN" | "PASS" | "FAIL" | "BLOCKED"; buildId?: string | null };
  release: { status: "NOT_RUN" | "PASS" | "FAIL" | "BLOCKED"; releaseId?: string | null };
  runtime: { status: "NOT_CHECKED" | "VERIFIED" | "BLOCKED"; detail?: string };
  blockers: string[];
  nextStep: string;
  productionAccess: ProductionAccess;
  createdAt: string;
};

export type DeveloperGridFoundation = {
  schemaVersion: typeof DEVELOPER_GRID_SCHEMA_VERSION;
  product: "BENJADMIN Developer Grid V1";
  environment: GridEnvironment;
  productionAccess: ProductionAccess;
  task: DeveloperGridTask;
  workers: WorkerRegistryEntry[];
  centralCore: {
    domains: string[];
    invariants: string[];
  };
  sourceProvenance: SourceProvenance;
  releaseRuntimeProvenance: ReleaseRuntimeProvenance;
  buildNodes: BuildNodeDefinition[];
  realtime: {
    mode: "DELTA_EVENT";
    fullSnapshotPollingAllowed: false;
    historyMode: "EXPLICIT_PAGINATED";
  };
  controlPlane: {
    source: "BENJADMIN_DEVELOPER_CONSOLE";
    legacyReferencePath: "/admin/dev-console";
    views: string[];
  };
  generatedAt: string;
};
