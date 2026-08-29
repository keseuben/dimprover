"use strict";

const { File } = require("node:buffer");

function text(value, max = 1800) { return String(value ?? "").trim().slice(0, max); }
function list(value, max = 200) { return Array.isArray(value) ? value.slice(0, max) : []; }
function ensureDevBase(baseUrl) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const url = new URL(base);
  if (url.protocol !== "https:" || url.hostname !== "admin.dev.dimpro.hu") throw new Error("Context Workspace kizárólag BENJADMIN DEV kapcsolaton használható. PROD DENY.");
  return base;
}
function headers(deviceToken, json = false) {
  const token = String(deviceToken || "").trim();
  if (!token) throw new Error("A BENJADMIN Fejlesztői Vezérlőpult használatához párosított Developer Grid eszköz szükséges.");
  return { "x-benjadmin-chatgrid-device-token": token, ...(json ? { "content-type": "application/json" } : {}), accept: "application/json" };
}
function sanitizeResource(value) {
  return {
    id: text(value?.id, 180), module: text(value?.module, 100), title: text(value?.title, 500), description: text(value?.description, 3000),
    originalName: text(value?.originalName, 260), extension: text(value?.extension, 24), mimeType: text(value?.mimeType, 120), sizeBytes: Number(value?.sizeBytes) || 0,
    sha256: text(value?.sha256, 64), tags: list(value?.tags, 30).map((item) => text(item, 60)).filter(Boolean), priority: text(value?.priority, 30) || "normal",
    source: text(value?.source, 160), version: text(value?.version, 120), documentType: text(value?.documentType, 60) || "reference",
    requiredBeforeDevelopment: value?.requiredBeforeDevelopment === true, createdAt: text(value?.createdAt, 100), updatedAt: text(value?.updatedAt, 100),
  };
}
function sanitizeHandoff(value) {
  return {
    id: text(value?.id, 180), schemaVersion: Number(value?.schemaVersion) || 1, fileName: text(value?.fileName, 300),
    chatSessionId: text(value?.chatSessionId, 120), chatTitle: text(value?.chatTitle, 300), workerCode: text(value?.workerCode, 40).toUpperCase(),
    mainProject: text(value?.mainProject, 160), project: text(value?.project, 160), module: text(value?.module, 160), contextModule: text(value?.contextModule, 160), developmentArea: text(value?.developmentArea, 220), fileAreaKey: text(value?.fileAreaKey, 80),
    taskId: text(value?.taskId, 180), taskTitle: text(value?.taskTitle, 500), liveNextTaskId: text(value?.liveNextTaskId, 180), liveNextTaskTitle: text(value?.liveNextTaskTitle, 500),
    startedAt: text(value?.startedAt, 100), finishedAt: text(value?.finishedAt, 100),
    durationMinutes: Math.max(0, Number(value?.durationMinutes) || 0), status: text(value?.status, 30).toUpperCase(), branch: text(value?.branch, 500), worktree: text(value?.worktree, 900),
    startCommit: text(value?.startCommit, 64), endCommit: text(value?.endCommit, 64), testsSummary: text(value?.testsSummary, 1200), buildRelease: text(value?.buildRelease, 1200),
    productionAccess: "DENY", tags: list(value?.tags, 30).map((item) => text(item, 60)).filter(Boolean), summary: text(value?.summary, 3000), sha256: text(value?.sha256, 64), createdAt: text(value?.createdAt, 100),
  };
}
function sanitizeSnapshot(payload) {
  return {
    generatedAt: text(payload?.generatedAt, 100) || new Date().toISOString(), productionAccess: "DENY",
    resources: list(payload?.resources, 1000).map(sanitizeResource).filter((item) => item.id),
    handoffs: list(payload?.handoffs, 2000).map(sanitizeHandoff).filter((item) => item.id),
    resourceHealth: {
      ready: payload?.resourceHealth?.ready === true, resources: Number(payload?.resourceHealth?.resources) || 0, archived: Number(payload?.resourceHealth?.archived) || 0,
      requiredBeforeDevelopment: Number(payload?.resourceHealth?.requiredBeforeDevelopment) || 0, modules: Number(payload?.resourceHealth?.modules) || 0,
      totalBytes: Number(payload?.resourceHealth?.totalBytes) || 0, backend: text(payload?.resourceHealth?.backend, 80), driveTarget: text(payload?.resourceHealth?.driveTarget, 80),
    },
  };
}
async function jsonRequest(url, options, timeoutMs = 10000) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Math.max(1200, timeoutMs));
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store", redirect: "error" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || `BENJADMIN HTTP ${response.status}`);
    return payload;
  } finally { clearTimeout(timer); }
}
async function fetchContextWorkspace({ baseUrl, deviceToken, filters = {} }) {
  const base = ensureDevBase(baseUrl); const url = new URL(`${base}/api/dev/chatgrid/context-workspace`);
  for (const [key, value] of Object.entries(filters || {})) if (String(value || "").trim()) url.searchParams.set(key, String(value));
  const payload = await jsonRequest(url.href, { method: "GET", headers: headers(deviceToken) });
  return sanitizeSnapshot(payload);
}
async function saveHandoff({ baseUrl, deviceToken, handoff }) {
  const base = ensureDevBase(baseUrl);
  const payload = await jsonRequest(`${base}/api/dev/chatgrid/context-workspace/handoffs`, { method: "POST", headers: headers(deviceToken, true), body: JSON.stringify(handoff || {}) }, 15000);
  return sanitizeHandoff(payload.handoff);
}
function fileNameFromDisposition(value) {
  const header = String(value || "");
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) { try { return decodeURIComponent(encoded); } catch { /* fallback below */ } }
  return header.match(/filename="([^"]+)"/i)?.[1] || "benjadmin_handoff.md";
}
async function downloadHandoff({ baseUrl, deviceToken, handoffId }) {
  const base = ensureDevBase(baseUrl);
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${base}/api/dev/chatgrid/context-workspace/handoffs/${encodeURIComponent(String(handoffId || ""))}`, {
      method: "GET", headers: headers(deviceToken), signal: controller.signal, cache: "no-store", redirect: "error"
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `BENJADMIN HTTP ${response.status}`);
    }
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      fileName: fileNameFromDisposition(response.headers.get("content-disposition")),
      sha256: text(response.headers.get("x-benjadmin-handoff-sha256"), 64),
    };
  } finally { clearTimeout(timer); }
}
async function uploadResources({ baseUrl, deviceToken, metadata, files }) {
  const base = ensureDevBase(baseUrl); const form = new FormData();
  for (const [key, value] of Object.entries(metadata || {})) form.set(key, String(value ?? ""));
  for (const file of list(files, 20)) {
    const bytes = Buffer.isBuffer(file?.bytes) ? file.bytes : Buffer.from(file?.bytes || []);
    form.append("files", new File([bytes], text(file?.name, 260) || "file.bin", { type: text(file?.type, 120) || "application/octet-stream" }));
  }
  const payload = await jsonRequest(`${base}/api/dev/chatgrid/context-workspace/resources`, { method: "POST", headers: headers(deviceToken), body: form }, 30000);
  return list(payload.resources, 20).map(sanitizeResource);
}

async function fetchDeveloperGridActiveWork({ baseUrl, deviceToken }) {
  const base = ensureDevBase(baseUrl);
  const payload = await jsonRequest(`${base}/api/dev/grid/work-start`, { method: "GET", headers: headers(deviceToken) });
  return payload.activeWork || { task: null, sessions: [], revision: 0, updatedAt: "" };
}
async function startDeveloperGridWork({ baseUrl, deviceToken, input }) {
  const base = ensureDevBase(baseUrl);
  const payload = await jsonRequest(`${base}/api/dev/grid/work-start`, { method: "POST", headers: headers(deviceToken, true), body: JSON.stringify(input || {}) }, 20000);
  return payload.work || null;
}

module.exports = { fetchContextWorkspace, saveHandoff, downloadHandoff, uploadResources, fetchDeveloperGridActiveWork, startDeveloperGridWork, sanitizeSnapshot };
