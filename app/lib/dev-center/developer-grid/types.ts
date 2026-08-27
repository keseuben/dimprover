export type DeveloperGridAgentCode = "ARMINAI" | "OUTMINAI" | "BENJAMINAI" | "JAZMINAI" | "DEVMINAI";
export type DeveloperGridEventKind = "analysis" | "coding" | "file-change" | "diff" | "test" | "build" | "commit" | "release" | "handoff";
export type DeveloperGridProvenanceState = "VERIFIED" | "BLOCKED";
export type DeveloperGridBuildNodeState = "READY" | "BUSY" | "NOT_CONNECTED" | "DISABLED";

export type DeveloperGridContext = {
  projectId: string;
  mainModule: string;
  moduleName: string;
  submoduleName: string;
  workItem: string;
  workStageIndex: number;
  source: "TASK_EXPLICIT" | "TASK_INFERENCE" | "ACTIVITY" | "PRESENCE_FALLBACK" | "UNKNOWN";
  updatedAt: string | null;
};

export type DeveloperGridTaskLike = {
  id: string;
  projectId?: string | null;
  title?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type DeveloperGridActivityLike = {
  taskId?: string | null;
  workerCode?: string | null;
  projectId?: string | null;
  mainModule?: string | null;
  moduleName?: string | null;
  submoduleName?: string | null;
  workItem?: string | null;
  workStageIndex?: number | null;
  createdAt?: string | null;
};

export type DeveloperGridPresenceLike = DeveloperGridActivityLike & {
  state?: string | null;
  heartbeatAt?: string | null;
};

export type DeveloperGridSourceProvenanceInput = {
  expectedBranch: string;
  actualBranch: string;
  expectedWorktree: string;
  actualWorktree: string;
  expectedHead: string;
  actualHead: string;
  canonicalHead: string;
  clean: boolean;
};

export type DeveloperGridSourceProvenance = DeveloperGridSourceProvenanceInput & {
  state: DeveloperGridProvenanceState;
  blocker: "SOURCE_BASELINE_MISMATCH" | null;
  reasons: string[];
};

export type DeveloperGridEvent = {
  sequence: number;
  id: string;
  taskId: string;
  workerCode: DeveloperGridAgentCode;
  kind: DeveloperGridEventKind;
  summary: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type DeveloperGridBuildNode = {
  id: "canonical-dev" | "build01" | "build02";
  hostname: string;
  state: DeveloperGridBuildNodeState;
  executor: boolean;
  lastVerifiedAt: string | null;
  metadata: Record<string, unknown>;
};
