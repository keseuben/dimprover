export const DEVELOPER_GRID_SCHEMA_VERSION = 1 as const;
export const DEVELOPER_GRID_VERSION = "0.1.25-dev" as const;

export type GridEnvironment = "DEV";
export type ChatLaunchMode = "EXISTING_CHAT" | "NEW_PROJECT_CHAT";
export type ProductionAccess = "DENY";
export type WorkerCode = "ARMINAI" | "OUTMINAI" | "BENJAMINAI" | "JAZMINAI" | "DEVMINAI";
export type CoreWorkerCode = Exclude<WorkerCode, "DEVMINAI">;
export type RoutableWorkerCode = "ARMINAI" | "OUTMINAI" | "BENJAMINAI" | "JAZMINAI";
export type GridWorkerState = "IDLE" | "READY" | "WORKING" | "BLOCKED" | "OFFLINE";
export type GridEventKind = "analysis" | "coding" | "file-change" | "diff" | "test" | "build" | "commit" | "release" | "handoff" | "error" | "review";
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
  sourcePrompt?: string | null;
  chatLaunchMode?: ChatLaunchMode | null;
  preferredWorkerCode?: RoutableWorkerCode | null;
  continuityPreviousTaskId?: string | null;
  continuityPreviousWorkerCode?: RoutableWorkerCode | null;
  continuityHandoffId?: string | null;
  continuityHandoffSummary?: string | null;
  continuityRouting?: "SAME_WORKER" | "FALLBACK_WORKER" | "NO_HISTORY" | null;
  chatPreviousConversationId?: string | null;
  chatConversationId?: string | null;
  chatConversationUrl?: string | null;
  chatConversationTitle?: string | null;
  chatConversationConfirmedAt?: string | null;
  chatConversationConfirmedBy?: "EXISTING_CHAT_SELECTION" | "USER_CURRENT_CHAT" | null;
  bootAckState?: "WAITING" | "VALIDATED" | "BLOCKED" | null;
  bootAckValidatedAt?: string | null;
  bootAckSha256?: string | null;
  bootAckCodingAllowed?: boolean | null;
  bootAckMismatches?: string[];
  source: "ACTIVE_SESSION" | "EXPLICIT_TASK" | "TASK_PROVENANCE" | "ACTIVITY" | "GIT" | "PRESENCE" | "HEURISTIC";
  resolvedAt: string;
};

export type SourceProvenance = {
  repository: string;
  worktree: string;
  branch: string;
  baseHead?: string;
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

export type GridStateChangeKind = "task-upsert" | "session-upsert" | "session-close";

export type GridStateChange = {
  revision: number;
  kind: GridStateChangeKind;
  entityId: string;
  taskId: string;
  timestamp: string;
};

export type DeveloperGridRuntimeState = {
  schemaVersion: 1;
  revision: number;
  task: DeveloperGridTask | null;
  sessions: WorkerSession[];
  changes: GridStateChange[];
  lastSequence: number;
  updatedAt: string;
};

export type GridStateDelta = {
  mode: "DELTA_STATE";
  cursor: number;
  hasMore: boolean;
  changes: GridStateChange[];
  task: DeveloperGridTask | null;
  sessions: WorkerSession[];
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

export type GridEvidenceKind = "FILE" | "TEST" | "ERROR" | "HANDOFF" | "BUILD" | "BOOT_ACK" | "REVIEW";
export type GridEvidenceStatus = "RECORDED" | "PASS" | "FAIL" | "BLOCKED" | "COMPLETED" | "PARTIAL" | "PENDING" | "PASS_WITH_NOTES";
export type GridEvidenceSeverity = "INFO" | "WARNING" | "HIGH" | "CRITICAL";

export type GridEvidence = {
  schemaVersion: 1;
  id: string;
  environment: "DEV";
  productionAccess: "DENY";
  sanitized: true;
  taskId: string;
  projectId: string;
  workerCode: WorkerCode;
  sessionId: string | null;
  eventId: string | null;
  kind: GridEvidenceKind;
  status: GridEvidenceStatus;
  severity: GridEvidenceSeverity;
  source: "GRID_EVENT" | "BUILD_RUNNER" | "HANDOFF_STORE" | "WORKER_STAGE_REPORT" | "REVIEW_GATE" | "SYSTEM";
  summary: string;
  branch: string | null;
  worktree: string | null;
  head: string | null;
  attributes: {
    path: string | null;
    changeType: string | null;
    testName: string | null;
    durationMs: number | null;
    errorCode: string | null;
    exitCode: number | null;
    buildRunId: string | null;
    buildId: string | null;
    handoffId: string | null;
    reviewId: string | null;
    contentSha256: string | null;
    artifactSha256: string | null;
    outputSha256: string | null;
    resolvesFingerprint: string | null;
    reviewResult: string | null;
    handoffStatus: string | null;
  };
  fingerprintSha256: string;
  occurredAt: string;
  createdAt: string;
};

export type ReleaseRuntimeProvenance = {
  declaredRelease: string | null;
  activeReleasePointer: string | null;
  pm2NextDistDir: string | null;
  runtimeCwd: string | null;
  runtimeRelease: string | null;
  buildId: string | null;
  expectedBuildId: string | null;
  metadataReady: boolean;
  sourceCommit: string | null;
  expectedSourceCommit: string | null;
  sourceBranch: string | null;
  expectedSourceBranch: string | null;
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
  version: typeof DEVELOPER_GRID_VERSION;
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
  buildExecutor: { kind: "REMOTE_BUILD_NODE" | "BUILD_QUEUE"; node: BuildNodeDefinition | null; reason: string };
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

export type GridWorkflowState = "DRAFT" | "READY" | "RUNNING" | "WAITING" | "BLOCKED" | "REVIEW" | "COMPLETED" | "CANCELLED";

export type GridWorkflow = {
  id: string;
  taskId: string;
  state: GridWorkflowState;
  currentStep: string;
  assignedWorkers: WorkerCode[];
  startedAt: string | null;
  finishedAt: string | null;
  blockCode?: string | null;
};

export type DevelopmentDocumentRef = {
  id: string;
  source: "DEVELOPMENT_LIBRARY" | "HANDOFF_STORE" | "TASK_ARTIFACT" | "REPOSITORY";
  title: string;
  canonicalPath: string;
  contentHash?: string | null;
  readOnly: boolean;
  provenanceVerifiedAt?: string | null;
};

export type GridBuildRun = {
  id: string;
  taskId: string;
  sessionId: string;
  workerCode: WorkerCode;
  nodeId: BuildNodeDefinition["id"] | null;
  sourceCommit: string;
  sourceBranch: string;
  status: "QUEUED" | "ASSIGNED" | "RUNNING" | "PASS" | "FAIL" | "BLOCKED";
  retryOfRunId: string | null;
  runnerLocalLockRequired: true;
  productionAccess: "DENY";
  buildId: string | null;
  artifactSha256: string | null;
  queuedAt: string;
  assignedAt: string | null;
  dispatchStartedAt?: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  evidenceRef?: string | null;
  resultSha256?: string | null;
  failureCode?: string | null;
  exitCode?: number | null;
};

export type GridReview = {
  id: string;
  taskId: string;
  reviewer: WorkerCode | "VGUARD" | "HUMAN";
  status: "PENDING" | "PASS" | "PASS_WITH_NOTES" | "FAIL";
  findings: Array<{ severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; code: string; summary: string }>;
  sourceHead: string;
  createdAt: string;
};

export type GridTelemetry = {
  taskId: string;
  workerCode?: WorkerCode | null;
  wallClockMs: number;
  activeRuntimeMs: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
  apiCostMinor?: number | null;
  queryCount?: number | null;
  payloadBytes?: number | null;
  egressBytes?: number | null;
  cacheHitCount?: number | null;
  reconnectCount?: number | null;
  recordedAt: string;
};
