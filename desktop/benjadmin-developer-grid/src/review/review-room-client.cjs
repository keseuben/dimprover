"use strict";

function text(value, max = 1800) {
  return String(value ?? "").trim().slice(0, max);
}
function list(value, limit = 120) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}
function sanitizeFinding(value) {
  return {
    severity: text(value?.severity, 40) || "INFO",
    category: text(value?.category, 80) || "OTHER",
    message: text(value?.message, 1200),
    path: value?.path ? text(value.path, 500) : null,
  };
}
function sanitizeTask(value) {
  const forge = value?.mforge || {};
  const guard = value?.vguard || {};
  return {
    id: text(value?.id, 160),
    projectId: value?.projectId ? text(value.projectId, 160) : null,
    title: text(value?.title, 500),
    goal: text(value?.goal, 1200),
    engineStatus: text(value?.engineStatus, 80),
    workflowState: text(value?.workflowState, 80),
    modelPreference: text(value?.modelPreference, 80),
    moduleHint: value?.moduleHint ? text(value.moduleHint, 240) : null,
    updatedAt: text(value?.updatedAt, 100),
    mforge: {
      state: forge?.state ? text(forge.state, 80) : null,
      provider: forge?.provider ? text(forge.provider, 80) : null,
      modelId: forge?.modelId ? text(forge.modelId, 200) : null,
      baselineCommit: forge?.baselineCommit ? text(forge.baselineCommit, 64) : null,
      commit: forge?.commit ? text(forge.commit, 64) : null,
      changedFileCount: Number.isFinite(Number(forge?.changedFileCount)) ? Number(forge.changedFileCount) : 0,
      changedPaths: list(forge?.changedPaths, 24).map((item) => text(item, 500)).filter(Boolean),
      integrated: forge?.integrated === true,
    },
    vguard: {
      state: guard?.state ? text(guard.state, 80) : null,
      provider: guard?.provider ? text(guard.provider, 80) : null,
      modelId: guard?.modelId ? text(guard.modelId, 200) : null,
      result: guard?.result ? text(guard.result, 80) : null,
      summary: text(guard?.summary, 1800),
      findings: list(guard?.findings, 16).map(sanitizeFinding),
      reviewedAt: guard?.reviewedAt ? text(guard.reviewedAt, 100) : null,
      reviewOnly: guard?.reviewOnly !== false,
    },
  };
}
function sanitizeThreadMessage(value) {
  return {
    id: text(value?.id, 200),
    author: text(value?.author, 40).toUpperCase(),
    target: value?.target ? text(value.target, 40).toUpperCase() : null,
    kind: text(value?.kind, 80),
    level: text(value?.level, 40) || "info",
    summary: text(value?.summary, 1800),
    detail: text(value?.detail, 2400),
    taskId: value?.taskId ? text(value.taskId, 160) : null,
    projectId: value?.projectId ? text(value.projectId, 160) : null,
    createdAt: text(value?.createdAt, 100),
    metadata: {
      action: text(value?.metadata?.action, 120),
      mainModule: text(value?.metadata?.mainModule, 160),
      moduleName: text(value?.metadata?.moduleName, 160),
      submoduleName: text(value?.metadata?.submoduleName, 160),
      workItem: text(value?.metadata?.workItem, 300),
      taskTitle: text(value?.metadata?.taskTitle, 500),
      taskStatus: text(value?.metadata?.taskStatus, 80),
      workStageIndex: Number.isFinite(Number(value?.metadata?.workStageIndex)) ? Number(value.metadata.workStageIndex) : null,
      workStageLabel: text(value?.metadata?.workStageLabel, 120),
    },
  };
}
function sanitizeReviewRoomSnapshot(value) {
  return {
    generatedAt: text(value?.generatedAt, 100) || new Date().toISOString(),
    mode: value?.mode === "READ_ONLY_REVIEW" ? "READ_ONLY_REVIEW" : "READ_ONLY_REVIEW",
    productionAccess: "DENY",
    workers: list(value?.workers, 8).map((worker) => ({
      code: text(worker?.code, 40).toUpperCase(),
      displayName: text(worker?.displayName, 100),
      personName: text(worker?.personName, 100),
      role: text(worker?.role, 160),
      avatar: text(worker?.avatar, 300),
      capabilities: list(worker?.capabilities, 30).map((item) => text(item, 100)).filter(Boolean),
    })),
    adapters: list(value?.adapters, 8).map((adapter) => ({
      provider: text(adapter?.provider, 60),
      label: text(adapter?.label, 160),
      ready: adapter?.ready === true,
      modelId: adapter?.modelId ? text(adapter.modelId, 200) : null,
      roles: list(adapter?.roles, 8).map((item) => text(item, 40).toUpperCase()),
      executionGateEnabled: adapter?.executionGateEnabled === true,
      detail: text(adapter?.detail, 600),
    })),
    tasks: list(value?.tasks, 50).map(sanitizeTask).filter((task) => task.id),
    thread: list(value?.thread, 120).map(sanitizeThreadMessage).filter((message) => message.id && message.summary),
  };
}

async function fetchReviewRoomSnapshot({ baseUrl, deviceToken, timeoutMs = 8000 }) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const token = String(deviceToken || "").trim();
  const host = new URL(base).hostname;
  if (host !== "admin.dev.dimpro.hu") throw new Error("External Review Room kizárólag BENJADMIN DEV kapcsolaton használható. PROD DENY.");
  if (!token) throw new Error("A Review Room használatához párosított ChatGrid eszköz szükséges.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 8000));
  try {
    const response = await fetch(`${base}/api/dev/chatgrid/review-room`, {
      method: "GET",
      headers: { "x-benjadmin-chatgrid-device-token": token, accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok || !payload.reviewRoom) throw new Error(payload?.error || `BENJADMIN Review Room HTTP ${response.status}`);
    return sanitizeReviewRoomSnapshot(payload.reviewRoom);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchReviewRoomSnapshot, sanitizeReviewRoomSnapshot };
