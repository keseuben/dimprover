export type DevEngineTaskStatus = "queued" | "ready" | "claimed" | "in_progress" | "testing" | "blocked" | "completed" | "cancelled";
export type DevEngineWorkerStatus = "offline" | "ready" | "busy" | "paused";
export type DevEngineSessionStatus = "open" | "active" | "paused" | "blocked" | "closed";
export type DevEngineHandshakeStage = "SESSION_OPEN" | "BENAI_ASSIGNED" | "WORKER_BOUND" | "TASK_BOUND" | "BRANCH_BOUND" | "WORKTREE_BOUND" | "READY";
export type DevEngineScopeType = "path" | "module" | "migration" | "release" | "environment";
export type DevEngineOperation = "write" | "build" | "test" | "migration" | "restart" | "deploy";
export type DevEngineConflictType = "scope" | "branch" | "worktree" | "task" | "worker" | "dependency" | "lease";

export type DevEngineScope = { type: DevEngineScopeType; key: string };

export type DevEngineWorker = {
  id: string; code: string; name: string; role: string; status: DevEngineWorkerStatus;
  capabilities: string[]; metadata: Record<string, unknown>; createdAt: string; updatedAt: string;
};

export type DevEngineTask = {
  id: string; projectId: string; versionId: string | null; repositoryId: string | null;
  title: string; description: string; status: DevEngineTaskStatus; priority: number;
  requestedWorkerId: string | null; assignedWorkerId: string | null; claimedBySessionId: string | null;
  branchName: string | null; worktreePath: string | null; scope: DevEngineScope[]; acceptance: string[]; blockedReason: string | null;
  claimExpiresAt: string | null; lastClaimedAt: string | null; attemptCount: number;
  createdBy: string; createdAt: string; updatedAt: string; startedAt: string | null; completedAt: string | null;
  metadata: Record<string, unknown>;
};

export type DevEngineWorkerSession = {
  id: string; coordinator: string; openedBy: string; workerId: string | null; taskId: string | null;
  projectId: string | null; versionId: string | null; repositoryId: string | null; environmentId: string | null;
  status: DevEngineSessionStatus; handshakeStage: DevEngineHandshakeStage; branchName: string | null;
  worktreePath: string | null; scope: DevEngineScope[]; note: string | null; openedAt: string;
  lastHeartbeatAt: string; leaseExpiresAt: string | null; recoveryCount: number; lastRecoveredAt: string | null;
  closedAt: string | null; closeReason: string | null; metadata: Record<string, unknown>; updatedAt: string;
};

export type DevEngineScopeLock = {
  id: string; repositoryId: string; sessionId: string; taskId: string | null; scopeType: DevEngineScopeType;
  scopeKey: string; status: "active" | "released" | "expired"; acquiredAt: string; heartbeatAt: string | null;
  expiresAt: string | null; releasedAt: string | null;
};

export type DevEngineWorktreeLease = {
  id: string; repositoryId: string; sessionId: string; taskId: string | null; branchName: string; worktreePath: string;
  status: "active" | "released" | "expired"; acquiredAt: string; heartbeatAt: string; leaseExpiresAt: string;
  releasedAt: string | null; metadata: Record<string, unknown>;
};

export type DevEngineConflict = {
  id: string; conflictType: DevEngineConflictType; repositoryId: string | null; requesterSessionId: string | null;
  holderSessionId: string | null; taskId: string | null; scopeType: string | null; scopeKey: string | null;
  status: "open" | "resolved" | "ignored"; summary: string; details: Record<string, unknown>;
  createdAt: string; resolvedAt: string | null;
};

export type DevEngineGateStatus = {
  ready: boolean;
  schemaReady: boolean;
  workers: { total: number; required: number; readyCodes: string[] };
  sessions: { ready: number; required: number; readyWorkerCodes: string[] };
  queue: { total: number; actionable: number; required: number };
  locks: { active: number };
  orchestration?: { activeWorktreeLeases: number; openConflicts: number; expiringSessions: number };
  blockers: string[];
};
