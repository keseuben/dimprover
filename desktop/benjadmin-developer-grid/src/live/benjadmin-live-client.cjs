"use strict";

const GRID_WORKER_TO_DESKTOP = Object.freeze({
  ARMINAI: "ARMINAI",
  OUTMINAI: "OUTMINAI",
  BENJAMINAI: "BENAI",
  BENAI: "BENAI",
  JAZMINAI: "JAZMINAI"
});

const GRID_TASK_STATUS_TO_DESKTOP = Object.freeze({
  READY: "ready",
  RUNNING: "in_progress",
  BLOCKED: "blocked",
  REVIEW: "testing",
  COMPLETED: "completed"
});

class BenjadminLiveClient {
  constructor({ baseUrl, reporterKey, authMode, authToken, authCandidates, pollIntervalMs = 2000, onSnapshot, onEvent, onError }) {
    this.baseUrl = String(baseUrl || "").replace(/\/+$/, "");
    const primary = { mode: authMode === "device" ? "device" : "reporter", token: String(authToken || reporterKey || "") };
    const supplied = Array.isArray(authCandidates) ? authCandidates : [primary];
    this.authCandidates = supplied
      .map((item) => ({ mode: item?.mode === "device" ? "device" : "reporter", token: String(item?.token || "") }))
      .filter((item, index, all) => item.token && all.findIndex((candidate) => candidate.mode === item.mode && candidate.token === item.token) === index);
    if (!this.authCandidates.length && primary.token) this.authCandidates.push(primary);
    this.authCandidateIndex = 0;
    this.authMode = this.authCandidates[0]?.mode || primary.mode;
    this.authToken = this.authCandidates[0]?.token || primary.token;
    this.pollIntervalMs = Math.max(1000, Math.min(15000, Number(pollIntervalMs) || 2000));
    this.onSnapshot = onSnapshot;
    this.onEvent = onEvent;
    this.onError = onError;
    this.timer = null;
    this.running = false;
    this.previous = null;
    this.abortController = null;
    this.nativeReady = false;
    this.foundation = null;
    this.gridState = { revision: 0, task: null, sessions: [] };
    this.eventCursor = null;
    this.liveEventsByWorker = new Map();
    this.legacyBootstrapUsed = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    void this.tick();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.abortController) this.abortController.abort();
    this.abortController = null;
  }

  schedule(delayMs = this.pollIntervalMs) {
    if (!this.running) return;
    this.timer = setTimeout(() => void this.tick(), Math.max(1000, Number(delayMs) || this.pollIntervalMs));
  }

  authHeaders() {
    return this.authMode === "device"
      ? { "x-benjadmin-chatgrid-device-token": this.authToken, accept: "application/json" }
      : { "x-dimpro-dev-reporter-key": this.authToken, accept: "application/json" };
  }

  advanceAuthCandidate() {
    const nextIndex = this.authCandidateIndex + 1;
    const next = this.authCandidates[nextIndex];
    if (!next) return false;
    this.authCandidateIndex = nextIndex;
    this.authMode = next.mode;
    this.authToken = next.token;
    return true;
  }

  async request(pathname) {
    let authAttempts = 0;
    while (authAttempts <= this.authCandidates.length) {
      this.abortController = new AbortController();
      const timeout = setTimeout(() => this.abortController?.abort(), 8000);
      try {
        const response = await fetch(`${this.baseUrl}${pathname}`, {
          method: "GET",
          headers: this.authHeaders(),
          cache: "no-store",
          signal: this.abortController.signal
        });
        const payload = await response.json().catch(() => null);
        if ((response.status === 401 || response.status === 403) && this.advanceAuthCandidate()) {
          authAttempts += 1;
          continue;
        }
        if (!response.ok || !payload?.ok) {
          const error = new Error(payload?.error || `BENJADMIN HTTP ${response.status} · ${pathname}`);
          error.status = response.status;
          error.code = response.status === 401 || response.status === 403 ? "AUTH_REJECTED" : `HTTP_${response.status}`;
          throw error;
        }
        return payload;
      } finally {
        clearTimeout(timeout);
        this.abortController = null;
      }
    }
    const error = new Error(`BENJADMIN hitelesítés sikertelen · ${pathname}`);
    error.code = "AUTH_REJECTED";
    throw error;
  }

  emitSnapshot(snapshot) {
    for (const event of detectTaskEvents(this.previous, snapshot)) this.onEvent?.(event);
    this.previous = snapshot;
    this.onSnapshot?.(snapshot);
  }

  async bootstrapNative() {
    const foundationPayload = await this.request("/api/dev/grid/foundation");
    const statePayload = await this.request("/api/dev/grid/state");
    const eventPayload = await this.request("/api/dev/grid/events?limit=200");
    if (foundationPayload.foundation?.realtime?.mode !== "DELTA_EVENT" || foundationPayload.foundation?.realtime?.fullSnapshotPollingAllowed !== false) {
      throw new Error("Developer Grid realtime contract mismatch: DELTA_EVENT / fullSnapshotPollingAllowed=false szükséges.");
    }
    this.foundation = foundationPayload.foundation;
    this.gridState = normalizeGridState(statePayload.state);
    const page = eventPayload.page || {};
    this.eventCursor = page.nextCursor || null;
    applyLiveEvents(this.liveEventsByWorker, page.events || []);
    this.nativeReady = true;
    this.emitSnapshot(synthesizeGridSnapshot({
      foundation: this.foundation,
      state: this.gridState,
      liveEventsByWorker: this.liveEventsByWorker,
      generatedAt: new Date().toISOString(),
      transport: "GRID_DELTA_NATIVE"
    }));
  }

  async bootstrapLegacyOnce() {
    if (this.legacyBootstrapUsed) return false;
    this.legacyBootstrapUsed = true;
    const endpoint = this.authMode === "device" ? "/api/dev/chatgrid/live" : "/api/dev/console/live";
    const payload = await this.request(endpoint);
    if (!payload.live) throw new Error("A kompatibilitási bootstrap snapshot hiányzik.");
    const snapshot = sanitizeSnapshot(payload.live);
    snapshot.transport = "LEGACY_BOOTSTRAP_ONCE";
    snapshot.realtimeMode = "COMPATIBILITY_SNAPSHOT";
    snapshot.fullSnapshotPolling = false;
    this.emitSnapshot(snapshot);
    return true;
  }

  async pollNativeDelta() {
    const after = Math.max(0, Number(this.gridState?.revision) || 0);
    const statePayload = await this.request(`/api/dev/grid/state?after=${after}&limit=100`);
    const eventPath = `/api/dev/grid/events?limit=100${this.eventCursor ? `&cursor=${encodeURIComponent(this.eventCursor)}` : ""}`;
    const eventPayload = await this.request(eventPath);
    this.gridState = mergeGridState(this.gridState, statePayload.delta);
    const page = eventPayload.page || {};
    applyLiveEvents(this.liveEventsByWorker, page.events || []);
    if (page.nextCursor) this.eventCursor = page.nextCursor;
    this.emitSnapshot(synthesizeGridSnapshot({
      foundation: this.foundation,
      state: this.gridState,
      liveEventsByWorker: this.liveEventsByWorker,
      generatedAt: new Date().toISOString(),
      transport: "GRID_DELTA_NATIVE"
    }));
  }

  async tick() {
    if (!this.running) return;
    let retryDelay = this.pollIntervalMs;
    try {
      if (this.nativeReady) {
        await this.pollNativeDelta();
      } else {
        try {
          await this.bootstrapNative();
        } catch (nativeError) {
          const legacyLoaded = await this.bootstrapLegacyOnce().catch(() => false);
          retryDelay = Math.max(10000, this.pollIntervalMs * 4);
          if (!legacyLoaded) throw nativeError;
          this.onError?.(new Error(`Developer Grid native delta még nem érhető el; egyszeri compatibility bootstrap aktív. ${nativeError instanceof Error ? nativeError.message : ""}`.trim()));
        }
      }
    } catch (error) {
      if (this.running) this.onError?.(error instanceof Error ? error : new Error("BENJADMIN Developer Grid kapcsolat sikertelen."));
      retryDelay = this.nativeReady ? this.pollIntervalMs : Math.max(10000, this.pollIntervalMs * 4);
    } finally {
      this.schedule(retryDelay);
    }
  }
}

function normalizeWorkerCode(value) {
  const code = String(value || "").toUpperCase();
  return GRID_WORKER_TO_DESKTOP[code] || "";
}

function normalizeGridState(input) {
  return {
    revision: Math.max(0, Number(input?.revision) || 0),
    task: input?.task || null,
    sessions: Array.isArray(input?.sessions) ? input.sessions.map((session) => ({ ...session })) : []
  };
}

function mergeGridState(current, delta) {
  const next = normalizeGridState(current);
  if (!delta || delta.mode !== "DELTA_STATE") return next;
  if (delta.task) next.task = { ...delta.task };
  const changes = Array.isArray(delta.changes) ? delta.changes : [];
  const changedSessions = Array.isArray(delta.sessions) ? delta.sessions : [];
  const byId = new Map(next.sessions.map((session) => [String(session.id || ""), session]));
  for (const change of changes) {
    if (change?.kind === "session-close" && !changedSessions.some((session) => String(session.id || "") === String(change.entityId || ""))) {
      byId.delete(String(change.entityId || ""));
    }
  }
  for (const session of changedSessions) byId.set(String(session.id || ""), { ...session });
  next.sessions = [...byId.values()];
  next.revision = Math.max(next.revision, Number(delta.cursor) || 0);
  return next;
}

function applyLiveEvents(target, events) {
  for (const event of Array.isArray(events) ? events : []) {
    if (String(event?.origin || "").toUpperCase() !== "LIVE") continue;
    const code = normalizeWorkerCode(event?.workerCode);
    if (!code) continue;
    const previous = target.get(code);
    if (!previous || Number(event?.sequence || 0) >= Number(previous?.sequence || 0)) target.set(code, event);
  }
  return target;
}

function gridTaskStatus(value) {
  return GRID_TASK_STATUS_TO_DESKTOP[String(value || "").toUpperCase()] || String(value || "").toLowerCase() || "ready";
}

function synthesizeGridSnapshot({ foundation, state, liveEventsByWorker, generatedAt, transport = "GRID_DELTA_NATIVE" }) {
  const workerRows = Array.isArray(foundation?.workers) ? foundation.workers : [];
  const workers = workerRows.flatMap((worker) => {
    const code = normalizeWorkerCode(worker?.code);
    if (!code || String(worker?.code || "").toUpperCase() === "DEVMINAI") return [];
    return [{ id: code, code, name: String(worker?.label || code), status: String(worker?.state || "") }];
  });
  const sessions = Array.isArray(state?.sessions) ? state.sessions : [];
  const activeSessions = sessions.filter((session) => !session?.endedAt && normalizeWorkerCode(session?.workerCode));
  const task = state?.task || null;
  const taskSession = task ? activeSessions.find((session) => String(session?.taskId || "") === String(task.id || "")) || null : null;
  const assignedCode = normalizeWorkerCode(taskSession?.workerCode);
  const tasks = task ? [{
    id: String(task.id || ""),
    title: String(task.title || "").slice(0, 500),
    description: "",
    status: gridTaskStatus(task.status),
    priority: Number.isFinite(Number(task.priority)) ? Number(task.priority) : null,
    projectId: task.projectId ? String(task.projectId) : null,
    assignedWorkerId: assignedCode || null,
    requestedWorkerId: assignedCode || null,
    branchName: taskSession?.sourceProvenance?.branch || null,
    worktreePath: taskSession?.sourceProvenance?.worktree || null,
    sourceHead: taskSession?.sourceProvenance?.head || null,
    sessionId: taskSession?.id || null,
    scopeText: taskSession?.developmentContext?.moduleName ? `module:${taskSession.developmentContext.moduleName}` : "",
    acceptanceText: Array.isArray(task.acceptance) ? task.acceptance.join("\n") : "",
    startedAt: taskSession?.startedAt || null,
    completedAt: String(task.status || "").toUpperCase() === "COMPLETED" ? (state?.updatedAt || generatedAt || null) : null,
    createdAt: taskSession?.startedAt || null,
    updatedAt: state?.updatedAt || generatedAt || null,
    chatLaunchMode: taskSession?.developmentContext?.chatLaunchMode || null,
    chatPreviousConversationId: taskSession?.developmentContext?.chatPreviousConversationId || null,
    chatConversationId: taskSession?.developmentContext?.chatConversationId || null,
    chatConversationUrl: taskSession?.developmentContext?.chatConversationUrl || null,
    chatConversationTitle: taskSession?.developmentContext?.chatConversationTitle || null,
    chatConversationConfirmedAt: taskSession?.developmentContext?.chatConversationConfirmedAt || null,
    bootAckState: taskSession?.developmentContext?.bootAckState || null,
    bootAckValidatedAt: taskSession?.developmentContext?.bootAckValidatedAt || null,
    bootAckSha256: taskSession?.developmentContext?.bootAckSha256 || null,
    bootAckCodingAllowed: taskSession?.developmentContext?.bootAckCodingAllowed ?? null,
    bootAckMismatches: Array.isArray(taskSession?.developmentContext?.bootAckMismatches) ? taskSession.developmentContext.bootAckMismatches : [],
    continuityPreviousTaskId: taskSession?.developmentContext?.continuityPreviousTaskId || null,
    continuityPreviousWorkerCode: taskSession?.developmentContext?.continuityPreviousWorkerCode || null,
    continuityHandoffId: taskSession?.developmentContext?.continuityHandoffId || null,
    continuityHandoffSummary: taskSession?.developmentContext?.continuityHandoffSummary || null,
    continuityRouting: taskSession?.developmentContext?.continuityRouting || null
  }] : [];
  const workerPresence = activeSessions.map((session) => {
    const code = normalizeWorkerCode(session?.workerCode);
    const context = session?.developmentContext || {};
    const liveEvent = liveEventsByWorker instanceof Map ? liveEventsByWorker.get(code) : null;
    const eventDelta = liveEvent?.taskId === session?.taskId && liveEvent?.delta && typeof liveEvent.delta === "object" ? liveEvent.delta : {};
    const taskDone = task && String(task.id || "") === String(session?.taskId || "") && String(task.status || "").toUpperCase() === "COMPLETED";
    return {
      workerCode: code,
      active: !taskDone,
      lifecycleState: taskDone ? "COMPLETED" : "ACTIVE",
      phase: String(liveEvent?.kind || ""),
      summary: String(eventDelta.summary || context.workItem || ""),
      taskId: session?.taskId ? String(session.taskId) : null,
      projectId: context?.projectId ? String(context.projectId) : null,
      mainModule: String(eventDelta.mainModule || context.mainModule || ""),
      moduleName: String(eventDelta.moduleName || context.moduleName || ""),
      submoduleName: String(eventDelta.submoduleName || context.submoduleName || ""),
      workItem: String(eventDelta.workItem || context.workItem || ""),
      operation: null,
      branch: session?.sourceProvenance?.branch || null,
      worktree: session?.sourceProvenance?.worktree || null,
      target: null,
      workStageIndex: Number(eventDelta.workStageIndex || context.workStageIndex) || null,
      nextStep: null,
      buildLockWaiting: false,
      lastSeenAt: String(liveEvent?.timestamp || session?.sourceProvenance?.verifiedAt || generatedAt || ""),
      endedAt: null,
      endReason: null
    };
  });
  return {
    workers,
    tasks,
    workerPresence,
    workerPresenceHistory: [],
    generatedAt: String(generatedAt || new Date().toISOString()),
    transport,
    realtimeMode: "DELTA_EVENT",
    fullSnapshotPolling: false,
    stateRevision: Math.max(0, Number(state?.revision) || 0)
  };
}

function sanitizeSnapshot(live) {
  const workers = Array.isArray(live?.workers) ? live.workers.map((item) => ({
    id: String(item?.id || ""), code: String(item?.code || "").toUpperCase(), name: String(item?.name || ""), status: String(item?.status || "")
  })) : [];
  const compactField = (value, maxLength = 2500) => {
    if (value === null || value === undefined) return "";
    let text = "";
    try { text = typeof value === "string" ? value : JSON.stringify(value); } catch { text = String(value); }
    return String(text).trim().slice(0, maxLength);
  };
  const tasks = Array.isArray(live?.tasks) ? live.tasks.map((item) => ({
    id: String(item?.id || ""), title: String(item?.title || "").slice(0, 500), description: String(item?.description || "").slice(0, 7000),
    status: String(item?.status || ""), priority: Number.isFinite(Number(item?.priority)) ? Number(item.priority) : null,
    projectId: item?.project_id ? String(item.project_id) : (item?.projectId ? String(item.projectId) : null),
    assignedWorkerId: item?.assigned_worker_id ? String(item.assigned_worker_id) : (item?.assignedWorkerId ? String(item.assignedWorkerId) : null),
    requestedWorkerId: item?.requested_worker_id ? String(item.requested_worker_id) : (item?.requestedWorkerId ? String(item.requestedWorkerId) : null),
    branchName: item?.branch_name ? String(item.branch_name).slice(0, 500) : (item?.branchName ? String(item.branchName).slice(0, 500) : null),
    worktreePath: item?.worktree_path ? String(item.worktree_path).slice(0, 800) : (item?.worktreePath ? String(item.worktreePath).slice(0, 800) : null),
    sourceHead: item?.sourceHead ? String(item.sourceHead).slice(0, 80) : (item?.metadata?.sourceHead ? String(item.metadata.sourceHead).slice(0,80) : null),
    sessionId: item?.sessionId ? String(item.sessionId).slice(0,220) : (item?.metadata?.activeSessionId ? String(item.metadata.activeSessionId).slice(0,220) : null),
    scopeText: compactField(item?.scope ?? item?.scopeText), acceptanceText: compactField(item?.acceptance ?? item?.acceptanceText),
    startedAt: item?.started_at ? String(item.started_at) : (item?.startedAt ? String(item.startedAt) : null),
    completedAt: item?.completed_at ? String(item.completed_at) : (item?.completedAt ? String(item.completedAt) : null),
    createdAt: item?.created_at ? String(item.created_at) : (item?.createdAt ? String(item.createdAt) : null),
    updatedAt: item?.updated_at ? String(item.updated_at) : (item?.updatedAt ? String(item.updatedAt) : null),
    continuityPreviousTaskId: item?.metadata?.continuityPreviousTaskId ? String(item.metadata.continuityPreviousTaskId) : null,
    continuityPreviousWorkerCode: item?.metadata?.continuityPreviousWorkerCode ? String(item.metadata.continuityPreviousWorkerCode) : null,
    continuityHandoffId: item?.metadata?.continuityHandoffId ? String(item.metadata.continuityHandoffId) : null,
    continuityHandoffSummary: item?.metadata?.continuityHandoffSummary ? String(item.metadata.continuityHandoffSummary).slice(0,1200) : null,
    continuityRouting: item?.metadata?.continuityRouting ? String(item.metadata.continuityRouting) : null,
    bootAckState: item?.bootAckState ? String(item.bootAckState).slice(0,30) : (item?.metadata?.bootAckState ? String(item.metadata.bootAckState).slice(0,30) : null),
    bootAckValidatedAt: item?.bootAckValidatedAt ? String(item.bootAckValidatedAt) : (item?.metadata?.bootAckValidatedAt ? String(item.metadata.bootAckValidatedAt) : null),
    bootAckSha256: item?.bootAckSha256 ? String(item.bootAckSha256).slice(0,64) : (item?.metadata?.bootAckSha256 ? String(item.metadata.bootAckSha256).slice(0,64) : null),
    bootAckCodingAllowed: item?.bootAckCodingAllowed === true ? true : item?.bootAckCodingAllowed === false ? false : null,
    bootAckMismatches: Array.isArray(item?.bootAckMismatches) ? item.bootAckMismatches.map(String).slice(0,20) : []
  })) : [];
  const normalizePresence = (item) => ({
    workerCode: String(item?.workerCode || "").toUpperCase(), active: item?.active === true,
    lifecycleState: String(item?.lifecycleState || "UNKNOWN"), phase: String(item?.phase || ""), summary: String(item?.summary || ""),
    taskId: item?.taskId ? String(item.taskId) : null, projectId: item?.projectId ? String(item.projectId) : null,
    mainModule: String(item?.mainModule || ""), moduleName: String(item?.moduleName || ""), submoduleName: String(item?.submoduleName || ""),
    workItem: String(item?.workItem || ""), operation: item?.operation ? String(item.operation) : null,
    branch: item?.branch ? String(item.branch).slice(0, 500) : null, worktree: item?.worktree ? String(item.worktree).slice(0, 800) : null,
    target: item?.target ? String(item.target).slice(0, 500) : null,
    workStageIndex: Number.isFinite(Number(item?.workStageIndex)) ? Number(item.workStageIndex) : null,
    nextStep: item?.nextStep ? String(item.nextStep) : null, buildLockWaiting: item?.buildLockWaiting === true,
    lastSeenAt: String(item?.lastSeenAt || ""), endedAt: item?.endedAt ? String(item.endedAt) : null, endReason: item?.endReason ? String(item.endReason) : null
  });
  const workerPresence = Array.isArray(live?.workerPresence) ? live.workerPresence.map(normalizePresence) : [];
  const workerPresenceHistory = Array.isArray(live?.workerPresenceHistory) ? live.workerPresenceHistory.map(normalizePresence) : [];
  return { workers, tasks, workerPresence, workerPresenceHistory, generatedAt: String(live?.generatedAt || new Date().toISOString()) };
}

function detectTaskEvents(previous, current) {
  if (!previous) return [];
  const previousTasks = new Map(previous.tasks.map((task) => [task.id, task]));
  const workers = new Map(current.workers.map((worker) => [worker.id, worker.code]));
  const events = [];
  for (const task of current.tasks) {
    const before = previousTasks.get(task.id);
    const workerId = task.assignedWorkerId || task.requestedWorkerId;
    const workerCode = workerId ? workers.get(workerId) || null : null;
    const launchableNow = ["ready", "claimed"].includes(String(task.status || "").toLowerCase()) && !task.startedAt;
    const launchableBefore = before && ["ready", "claimed"].includes(String(before.status || "").toLowerCase()) && !before.startedAt;
    const workerBefore = before ? (before.assignedWorkerId || before.requestedWorkerId) : null;
    if ((!before && launchableNow) || (before && launchableNow && (!launchableBefore || workerBefore !== workerId))) {
      events.push({ type: "assigned", workerCode, taskId: task.id, taskTitle: task.title, projectId: task.projectId, at: task.updatedAt || task.createdAt || new Date().toISOString() });
    }
    if (!before || before.status === task.status) continue;
    if (task.status === "completed") events.push({ type: "completed", workerCode, taskId: task.id, taskTitle: task.title, projectId: task.projectId, at: task.completedAt || task.updatedAt || new Date().toISOString() });
    else if (task.status === "blocked" || task.status === "failed") events.push({ type: task.status, workerCode, taskId: task.id, taskTitle: task.title, projectId: task.projectId, at: task.updatedAt || new Date().toISOString() });
  }
  const previousPresence = new Map((previous.workerPresence || []).map((item) => [item.workerCode, item]));
  const terminalTaskIds = new Set((current.tasks || []).filter((task) => ["completed", "failed"].includes(String(task.status || "").toLowerCase())).map((task) => task.id));
  for (const presence of current.workerPresence || []) {
    const before = previousPresence.get(presence.workerCode);
    if (!before) continue;
    const beforeStage = Number(before.workStageIndex);
    const currentStage = Number(presence.workStageIndex);
    if (!Number.isFinite(beforeStage) || !Number.isFinite(currentStage) || currentStage <= beforeStage) continue;
    const sameTask = presence.taskId && before.taskId ? presence.taskId === before.taskId : true;
    if (!sameTask || (presence.taskId && terminalTaskIds.has(presence.taskId))) continue;
    events.push({ type: "stage_completed", workerCode: presence.workerCode, taskId: presence.taskId || null, taskTitle: presence.workItem || presence.summary || "Fejlesztési rész", projectId: presence.projectId || null, stageIndex: beforeStage, nextStageIndex: currentStage, at: presence.lastSeenAt || new Date().toISOString() });
  }
  return events;
}

module.exports = {
  BenjadminLiveClient,
  sanitizeSnapshot,
  detectTaskEvents,
  normalizeGridState,
  mergeGridState,
  applyLiveEvents,
  synthesizeGridSnapshot,
  normalizeWorkerCode
};
