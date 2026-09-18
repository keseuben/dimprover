"use strict";

const WORKER_SURFACE_TYPES = Object.freeze({
  CHATGPT: "CHATGPT",
  CODEX: "CODEX",
  WORK: "WORK",
});

const WORKER_SURFACE_OPTIONS = Object.freeze([
  { type: WORKER_SURFACE_TYPES.CHATGPT, label: "ChatGPT", selectable: true, embedded: true },
  { type: WORKER_SURFACE_TYPES.CODEX, label: "Codex", selectable: true, embedded: false },
  { type: WORKER_SURFACE_TYPES.WORK, label: "Work", selectable: false, embedded: true, plannedVersion: "0.1.50" },
]);

function normalizeWorkerSurfaceType(value, fallback = WORKER_SURFACE_TYPES.CHATGPT) {
  const raw = String(value || "").trim().toUpperCase();
  return Object.values(WORKER_SURFACE_TYPES).includes(raw) ? raw : fallback;
}

function workerSurfaceDefinition(value) {
  const type = normalizeWorkerSurfaceType(value);
  return WORKER_SURFACE_OPTIONS.find((item) => item.type === type) || WORKER_SURFACE_OPTIONS[0];
}

function workerSurfaceLabel(value) {
  return workerSurfaceDefinition(value).label;
}

function isEmbeddedWorkerSurface(value) {
  return workerSurfaceDefinition(value).embedded === true;
}

function isSelectableWorkerSurface(value) {
  return workerSurfaceDefinition(value).selectable === true;
}

function defaultWorkerSurfaceUrl(value) {
  const type = normalizeWorkerSurfaceType(value);
  if (type === WORKER_SURFACE_TYPES.CHATGPT || type === WORKER_SURFACE_TYPES.WORK) return "https://chatgpt.com/";
  return "";
}

function safeWorkerSurfaceUrl(value, surfaceType, fallback = "") {
  const type = normalizeWorkerSurfaceType(surfaceType);
  const raw = String(value || fallback || "").trim();
  if (!raw) return defaultWorkerSurfaceUrl(type);
  try {
    const parsed = new URL(raw);
    if ((type === WORKER_SURFACE_TYPES.CHATGPT || type === WORKER_SURFACE_TYPES.WORK)
      && parsed.protocol === "https:"
      && ["chatgpt.com", "www.chatgpt.com"].includes(parsed.hostname)) return parsed.href;
    if (type === WORKER_SURFACE_TYPES.CODEX && parsed.protocol === "codex:") return parsed.href;
  } catch { /* safe fallback below */ }
  if (type === WORKER_SURFACE_TYPES.CODEX) return "";
  return defaultWorkerSurfaceUrl(type) || fallback || "";
}

function workerSurfaceConversationIdFromUrl(surfaceType, value) {
  const type = normalizeWorkerSurfaceType(surfaceType);
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (type === WORKER_SURFACE_TYPES.CHATGPT || type === WORKER_SURFACE_TYPES.WORK) {
      if (url.protocol !== "https:" || !["chatgpt.com", "www.chatgpt.com"].includes(url.hostname)) return "";
      return url.pathname.match(/(?:^|\/)c\/([A-Za-z0-9_-]+)/)?.[1] || "";
    }
    if (type === WORKER_SURFACE_TYPES.CODEX && url.protocol === "codex:") {
      if (url.hostname === "threads") return url.pathname.split("/").filter(Boolean)[0] || "";
      const match = url.pathname.match(/(?:^|\/)threads\/([A-Za-z0-9._:-]+)/);
      return match?.[1] || "";
    }
  } catch { /* no id */ }
  return "";
}

module.exports = {
  WORKER_SURFACE_TYPES,
  WORKER_SURFACE_OPTIONS,
  normalizeWorkerSurfaceType,
  workerSurfaceDefinition,
  workerSurfaceLabel,
  isEmbeddedWorkerSurface,
  isSelectableWorkerSurface,
  defaultWorkerSurfaceUrl,
  safeWorkerSurfaceUrl,
  workerSurfaceConversationIdFromUrl,
};
