export type ConsoleTheme = "light" | "dark" | "sunlight";
export type ConsoleTarget = "BENAI" | "ARMINAI" | "JAZMINAI" | "OUTMINAI" | "EVERYONE";
export type ConsoleAuthor = "BENJADMIN" | "BENAI" | "ARMINAI" | "JAZMINAI" | "OUTMINAI" | "MFORGE" | "VGUARD" | "SYSTEM";
export type ConsoleMessageKind = "MESSAGE" | "INSTRUCTION" | "TASK_ASSIGNMENT" | "TASK_UPDATE" | "DECISION" | "APPROVAL_REQUEST" | "BUILD_EVENT" | "TEST_RESULT" | "ERROR" | "WARNING" | "COMMIT" | "RELEASE" | "SYSTEM";

export type ConsoleMessage = {
  id: string;
  author: ConsoleAuthor;
  target: ConsoleTarget | null;
  kind: ConsoleMessageKind;
  summary: string;
  detail: string;
  level: "info" | "success" | "warning" | "error";
  progressPercent: number | null;
  taskId: string | null;
  projectId: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type LiveProject = { id: string; name: string; slug?: string; status?: string; updated_at?: string };
export type LiveWorker = { id: string; code: string; name: string; role?: string; status?: string; updated_at?: string };
export type LiveTask = {
  id: string;
  project_id?: string | null;
  title: string;
  status: string;
  priority?: number;
  requested_worker_id?: string | null;
  assigned_worker_id?: string | null;
  branch_name?: string | null;
  worktree_path?: string | null;
  scope?: unknown;
  acceptance?: unknown;
  updated_at?: string;
  created_at?: string;
};
export type LiveSession = {
  id: string;
  worker_id?: string | null;
  task_id?: string | null;
  status: string;
  handshake_stage?: string;
  branch_name?: string | null;
  worktree_path?: string | null;
  opened_at?: string;
  updated_at?: string;
  last_heartbeat_at?: string;
};
export type LiveBuild = {
  id: string;
  session_id?: string | null;
  task_id?: string | null;
  environment_id?: string | null;
  run_type?: string;
  status: string;
  command_name?: string | null;
  git_commit?: string | null;
  build_id?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  duration_seconds?: number | null;
  summary?: string | null;
  created_at?: string;
};
export type LiveRelease = { id: string; project_id?: string | null; status: string; git_commit?: string | null; build_id?: string | null; created_at?: string; updated_at?: string };
export type LiveApproval = { id: string; command_id?: string | null; status: string; requested_by?: string | null; requested_at?: string; expires_at?: string | null; metadata?: Record<string, unknown> };
export type LiveAudit = { id: string; action: string; summary?: string; task_id?: string | null; project_id?: string | null; created_at?: string };

export type ConsoleLiveState = {
  projects: LiveProject[];
  workers: LiveWorker[];
  tasks: LiveTask[];
  sessions: LiveSession[];
  builds: LiveBuild[];
  releases: LiveRelease[];
  approvals: LiveApproval[];
  audits: LiveAudit[];
  generatedAt: string;
  refreshIntervalMs: number;
};

export type BenAiDispatch = {
  stage: "CHAT_ONLY" | "COORDINATOR_ROUTING" | "TASK_ASSIGNED" | "EXECUTOR_NOT_CONFIGURED";
  bridgeMode: "MANUAL_CHATGPT_BRIDGE" | "OPENAI_RESPONSES";
  providerConfigured: boolean;
  executorConfigured: boolean;
  selectedWorkerId: string | null;
  selectedWorkerCode: string | null;
  selectedWorkerName: string | null;
  taskId: string | null;
  projectId: string | null;
  summary: string;
  nextStep: string;
  handoffPrompt: string;
};

export type RuntimeContext = {
  environment: string;
  productionDefault: string;
  hostname: string;
  branch: string;
  commit: string;
  buildId: string;
  worktree: string;
  latestProductDoc: string;
  aiBridge?: { mode: "MANUAL_CHATGPT_BRIDGE" | "OPENAI_RESPONSES"; label: string; providerConfigured: boolean; executorConfigured: boolean };
  executorReadiness?: {
    ready: boolean;
    repositoryReady: boolean;
    repositoryId: string;
    repositoryPath: string | null;
    baselineReady: boolean;
    baselineRef: string;
    baselineCommit: string | null;
    providerConfigured: boolean;
    executorConfigured: boolean;
    worktreeRoot: string;
    blockers: string[];
  };
  generatedAt: string;
};

export type DevelopmentResource = {
  id: string;
  module: string;
  title: string;
  description: string;
  originalName: string;
  storedName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  tags: string[];
  priority: "normal" | "important" | "critical";
  source: string;
  version: string;
  requiredBeforeDevelopment: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ResourceHealth = {
  ready: boolean;
  resources: number;
  archived: number;
  requiredBeforeDevelopment: number;
  modules: number;
  totalBytes: number;
  backend: string;
  rootKind: string;
  driveTarget: string;
};
