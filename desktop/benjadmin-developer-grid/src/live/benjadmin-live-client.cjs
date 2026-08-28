"use strict";

class BenjadminLiveClient {
  constructor({ baseUrl, reporterKey, authMode, authToken, pollIntervalMs = 2000, onSnapshot, onEvent, onError }) {
    this.baseUrl = String(baseUrl || "").replace(/\/+$/, "");
    this.authMode = authMode === "device" ? "device" : "reporter";
    this.authToken = String(authToken || reporterKey || "");
    this.pollIntervalMs = Math.max(1000, Math.min(15000, Number(pollIntervalMs) || 2000));
    this.onSnapshot = onSnapshot;
    this.onEvent = onEvent;
    this.onError = onError;
    this.timer = null;
    this.running = false;
    this.previous = null;
    this.abortController = null;
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

  schedule() {
    if (!this.running) return;
    this.timer = setTimeout(() => void this.tick(), this.pollIntervalMs);
  }

  async tick() {
    if (!this.running) return;
    this.abortController = new AbortController();
    const timeout = setTimeout(() => this.abortController?.abort(), 8000);
    try {
      const endpoint = this.authMode === "device" ? "/api/dev/chatgrid/live" : "/api/dev/console/live";
      const headers = this.authMode === "device"
        ? { "x-benjadmin-chatgrid-device-token": this.authToken, "accept": "application/json" }
        : { "x-dimpro-dev-reporter-key": this.authToken, "accept": "application/json" };
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "GET",
        headers,
        cache: "no-store",
        signal: this.abortController.signal
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.live) {
        throw new Error(payload?.error || `BENJADMIN HTTP ${response.status}`);
      }
      const snapshot = sanitizeSnapshot(payload.live);
      for (const event of detectTaskEvents(this.previous, snapshot)) this.onEvent?.(event);
      this.previous = snapshot;
      this.onSnapshot?.(snapshot);
    } catch (error) {
      if (this.running) this.onError?.(error instanceof Error ? error : new Error("BENJADMIN kapcsolat sikertelen."));
    } finally {
      clearTimeout(timeout);
      this.abortController = null;
      this.schedule();
    }
  }
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
    projectId: item?.project_id ? String(item.project_id) : null,
    assignedWorkerId: item?.assigned_worker_id ? String(item.assigned_worker_id) : null,
    requestedWorkerId: item?.requested_worker_id ? String(item.requested_worker_id) : null,
    branchName: item?.branch_name ? String(item.branch_name).slice(0, 500) : null,
    worktreePath: item?.worktree_path ? String(item.worktree_path).slice(0, 800) : null,
    scopeText: compactField(item?.scope), acceptanceText: compactField(item?.acceptance),
    startedAt: item?.started_at ? String(item.started_at) : null, completedAt: item?.completed_at ? String(item.completed_at) : null,
    createdAt: item?.created_at ? String(item.created_at) : null, updatedAt: item?.updated_at ? String(item.updated_at) : null
  })) : [];
  const normalizePresence = (item) => ({
    workerCode: String(item?.workerCode || "").toUpperCase(),
    active: item?.active === true,
    lifecycleState: String(item?.lifecycleState || "UNKNOWN"),
    phase: String(item?.phase || ""),
    summary: String(item?.summary || ""),
    taskId: item?.taskId ? String(item.taskId) : null,
    projectId: item?.projectId ? String(item.projectId) : null,
    mainModule: String(item?.mainModule || ""),
    moduleName: String(item?.moduleName || ""),
    submoduleName: String(item?.submoduleName || ""),
    workItem: String(item?.workItem || ""),
    operation: item?.operation ? String(item.operation) : null,
    branch: item?.branch ? String(item.branch).slice(0, 500) : null,
    worktree: item?.worktree ? String(item.worktree).slice(0, 800) : null,
    target: item?.target ? String(item.target).slice(0, 500) : null,
    workStageIndex: Number.isFinite(Number(item?.workStageIndex)) ? Number(item.workStageIndex) : null,
    nextStep: item?.nextStep ? String(item.nextStep) : null,
    buildLockWaiting: item?.buildLockWaiting === true,
    lastSeenAt: String(item?.lastSeenAt || ""),
    endedAt: item?.endedAt ? String(item.endedAt) : null,
    endReason: item?.endReason ? String(item.endReason) : null
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
    if (task.status === "completed") {
      events.push({ type: "completed", workerCode, taskId: task.id, taskTitle: task.title, projectId: task.projectId, at: task.completedAt || task.updatedAt || new Date().toISOString() });
    } else if (task.status === "blocked" || task.status === "failed") {
      events.push({ type: task.status, workerCode, taskId: task.id, taskTitle: task.title, projectId: task.projectId, at: task.updatedAt || new Date().toISOString() });
    }
  }
  const previousPresence = new Map((previous.workerPresence || []).map((item) => [item.workerCode, item]));
  const terminalTaskIds = new Set((current.tasks || [])
    .filter((task) => ["completed", "failed"].includes(String(task.status || "").toLowerCase()))
    .map((task) => task.id));
  for (const presence of current.workerPresence || []) {
    const before = previousPresence.get(presence.workerCode);
    if (!before) continue;
    const beforeStage = Number(before.workStageIndex);
    const currentStage = Number(presence.workStageIndex);
    if (!Number.isFinite(beforeStage) || !Number.isFinite(currentStage) || currentStage <= beforeStage) continue;
    const sameTask = presence.taskId && before.taskId ? presence.taskId === before.taskId : true;
    if (!sameTask || (presence.taskId && terminalTaskIds.has(presence.taskId))) continue;
    events.push({
      type: "stage_completed",
      workerCode: presence.workerCode,
      taskId: presence.taskId || null,
      taskTitle: presence.workItem || presence.summary || "Fejlesztési rész",
      projectId: presence.projectId || null,
      stageIndex: beforeStage,
      nextStageIndex: currentStage,
      at: presence.lastSeenAt || new Date().toISOString()
    });
  }
  return events;
}

module.exports = { BenjadminLiveClient, sanitizeSnapshot, detectTaskEvents };
