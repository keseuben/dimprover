export type ConsoleTheme = "light" | "dark" | "sunlight";
export type ConsoleTarget = "BENAI" | "ARMINAI" | "JAZMINAI" | "OUTMINAI" | "EVERYONE";
export type ConsoleAuthor = "BENJADMIN" | "BENAI" | "ARMINAI" | "JAZMINAI" | "OUTMINAI" | "MFORGE" | "VGUARD" | "SYSTEM";
export type ConsoleMessageKind = "MESSAGE" | "INSTRUCTION" | "TASK_ASSIGNMENT" | "TASK_UPDATE" | "DECISION" | "APPROVAL_REQUEST" | "CODE_ACTIVITY" | "FILE_CHANGE" | "DIFF" | "TERMINAL_ACTIVITY" | "BUILD_EVENT" | "TEST_RESULT" | "ERROR" | "WARNING" | "COMMIT" | "RELEASE" | "ARCHIVE_SUMMARY" | "SYSTEM";

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
  description?: string;
  status: string;
  priority?: number;
  requested_worker_id?: string | null;
  assigned_worker_id?: string | null;
  claimed_by_session_id?: string | null;
  branch_name?: string | null;
  worktree_path?: string | null;
  scope?: unknown;
  acceptance?: unknown;
  blocked_reason?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  metadata?: Record<string, unknown>;
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

export type LiveWorkerPresence = {
  id: string;
  workerCode: string;
  active: boolean;
  state: "active" | "inactive";
  lifecycleState: "ACTIVE" | "ENDED" | "STALE" | "UNKNOWN";
  phase: string;
  summary: string;
  detail: string;
  taskId: string | null;
  projectId: string | null;
  mainModule: string;
  moduleName: string;
  submoduleName: string;
  workItem: string;
  operation: string | null;
  owner: string | null;
  worktree: string | null;
  branch: string | null;
  target: string | null;
  workStageIndex: number | null;
  startedAt: string | null;
  heartbeatAt: string | null;
  nextStep: string | null;
  buildLockWaiting: boolean;
  schedulerRunId: string | null;
  schedulerSlotAt: string | null;
  inferredBy: string;
  confidence: string;
  presenceKey: string | null;
  detectedAt: string;
  lastSeenAt: string;
  endedAt: string | null;
  endReason: string | null;
  source: string;
  createdAt: string;
  productionAccess: "DENY";
};

export type LiveWorkerTransition = {
  id: string;
  contextKey: string;
  fromWorkerCode: string;
  toWorkerCode: string;
  changedAt: string;
  reason: "TASK_HANDOFF" | "CONTEXT_HANDOFF";
  taskId: string | null;
  projectId: string | null;
  mainModule: string;
  moduleName: string;
  submoduleName: string;
  workItem: string;
};

export type ConsoleLiveState = {
  projects: LiveProject[];
  workers: LiveWorker[];
  tasks: LiveTask[];
  sessions: LiveSession[];
  builds: LiveBuild[];
  releases: LiveRelease[];
  approvals: LiveApproval[];
  audits: LiveAudit[];
  workerPresence: LiveWorkerPresence[];
  workerPresenceHistory: LiveWorkerPresence[];
  workerTransitions: LiveWorkerTransition[];
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
  estimate: { minutes: number; minMinutes: number; maxMinutes: number; source: "BENAI_RULE_V1" };
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

export type WeeklyDevelopmentSummary = {
  ready: true;
  period: {
    startAt: string;
    endAt: string;
    label: string;
    timezone: "Europe/Budapest";
    weekKey: string;
    currentWeekKey: string;
    previousWeekKey: string;
    nextWeekKey: string;
    isCurrentWeek: boolean;
  };
  projectId: string | null;
  stats: { activities: number; workers: number; contexts: number; openTasks: number; completedTasks: number; blockedTasks: number; builds: number; tests: number; errors: number };
  workers: Array<{ code: string; name: string; activityCount: number; contextCount: number; latestAt: string; latestStage: number }>;
  contexts: Array<{ key: string; projectId: string; projectName: string; mainModule: string; moduleName: string; submoduleName: string; workItem: string; activityCount: number; workers: string[]; latestAt: string; latestStage: number; latestAction: string; stageCounts: Record<string, number> }>;
  truncated: boolean;
  generatedAt: string;
  productionAccess: "DENY";
};
