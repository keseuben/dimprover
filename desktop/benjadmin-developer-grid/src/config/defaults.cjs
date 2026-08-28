"use strict";

const { DEFAULT_USAGE_GUIDE } = require("../guide/default-guide.cjs");

const WORKER_OPTIONS = ["ARMINAI", "OUTMINAI", "BENAI", "JAZMINAI"];
const CONFIG_VERSION = 11;
const ZOOM_MIN = 50;
const ZOOM_MAX = 150;
const ZOOM_STEP = 10;
const CHAT_CELL_IDS = ["cell-1", "cell-2", "cell-3", "cell-4"];

const DEFAULT_CONFIG = Object.freeze({
  version: CONFIG_VERSION,
  appearance: "dark",
  microphoneEnabled: true,
  showAvatars: true,
  showAvatarWatermarks: true,
  workspaceZoomPercent: 100,
  layoutMode: "grid4",
  splitView: { left: "cell-1", right: "cell-2" },
  benjadminBaseUrl: "https://admin.dev.dimpro.hu",
  pollIntervalMs: 2000,
  launchAtLogin: true,
  rememberLastConversation: true,
  usageGuide: { showOnUnlock: true, content: DEFAULT_USAGE_GUIDE },
  centralWindow: { x: null, y: null, width: 980, height: 860, maximized: false },
  contextWorkspace: { visible: true, width: 560, zoomPercent: 100, detached: false, x: null, y: null, windowWidth: 920, windowHeight: 860, maximized: false },
  notifications: {
    quietMode: false,
    completionSound: true,
    stageSound: true,
    windowsToast: true,
    spokenCompletion: true,
    spokenStage: true,
    flashTaskbar: true
  },
  cells: [
    { id: "cell-1", workerCode: "ARMINAI", label: "ÁrminAI", url: "https://chatgpt.com/", enabled: true },
    { id: "cell-2", workerCode: "OUTMINAI", label: "OutminAI", url: "https://chatgpt.com/", enabled: true },
    { id: "cell-3", workerCode: "BENAI", label: "BenjáminAI", url: "https://chatgpt.com/", enabled: true },
    { id: "cell-4", workerCode: "JAZMINAI", label: "JázminAI", url: "https://chatgpt.com/", enabled: true }
  ],
  centralChat: { id: "central", label: "DevminAI", url: "https://chatgpt.com/", enabled: true }
});

function cloneDefaultConfig() { return JSON.parse(JSON.stringify(DEFAULT_CONFIG)); }

function clampZoom(value, fallback = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(numeric / ZOOM_STEP) * ZOOM_STEP));
}

function safeChatUrl(value, fallback) {
  try {
    const parsed = new URL(String(value || fallback));
    if (parsed.protocol === "https:" && ["chatgpt.com", "www.chatgpt.com"].includes(parsed.hostname)) return parsed.href;
  } catch { /* keep safe fallback */ }
  return fallback;
}

function normalizeCell(source, fallback) {
  if (!source || typeof source !== "object") return { ...fallback };
  const workerCode = String(source.workerCode || fallback.workerCode).toUpperCase();
  return {
    id: fallback.id,
    workerCode: WORKER_OPTIONS.includes(workerCode) ? workerCode : fallback.workerCode,
    label: String(source.label || fallback.label).slice(0, 40),
    url: safeChatUrl(source.url, fallback.url),
    enabled: source.enabled !== false
  };
}

function migrateLegacyCells(inputCells, nextCells) {
  if (!Array.isArray(inputCells)) return nextCells;
  const byWorker = new Map();
  for (const item of inputCells) {
    const code = String(item?.workerCode || "").toUpperCase();
    if (code) byWorker.set(code, item);
  }
  return nextCells.map((fallback) => normalizeCell(byWorker.get(fallback.workerCode), fallback));
}

function legacyZoom(input) {
  if (Number.isFinite(Number(input?.workspaceZoomPercent))) return Number(input.workspaceZoomPercent);
  const values = Array.isArray(input?.cells) ? input.cells.map((item) => Number(item?.zoomPercent)).filter(Number.isFinite) : [];
  const changed = values.find((value) => value !== 100);
  if (Number.isFinite(changed)) return changed;
  if (Number.isFinite(values[0])) return values[0];
  if (Number.isFinite(Number(input?.centralChat?.zoomPercent))) return Number(input.centralChat.zoomPercent);
  return 100;
}

function sanitizeSplitView(value, fallback) {
  const left = CHAT_CELL_IDS.includes(String(value?.left)) ? String(value.left) : fallback.left;
  let right = CHAT_CELL_IDS.includes(String(value?.right)) ? String(value.right) : fallback.right;
  if (right === left) right = CHAT_CELL_IDS.find((id) => id !== left) || fallback.right;
  return { left, right };
}

function migrateUsageGuideV9(content) {
  let next = String(content || "").trim() || DEFAULT_USAGE_GUIDE;
  const additions = [];
  if (!next.includes("Ctrl+Alt+N")) {
    additions.push("GYORSBILLENTYŰ KIEGÉSZÍTÉS\nCtrl+Alt+N — Munkahelyi / néma mód ki- és bekapcsolása. A hangjelzést és a TTS-felolvasást némítja; a vizuális/Windows értesítések külön beállítás szerint tovább működhetnek.");
  }
  if (!next.includes("1/6 · ELEMZÉS") || !next.includes("6/6 · LEZÁRÁS")) {
    additions.push(`A 6 LÉPCSŐS FEJLESZTÉSI FÁZIS RÉSZLETESEN
1/6 · ELEMZÉS — feladat, scope, worktree, függőségek, kockázatok és acceptance tisztázása.
2/6 · FEJLESZTÉS — tényleges DEV forráskód-/konfigurációmódosítás a kijelölt scope-ban; PROD DENY.
3/6 · TESZTELÉS — syntax/lint/typecheck, unit/contract/acceptance, regresszió és szükség szerint API/browser/Windows E2E.
4/6 · ELLENŐRZÉS — diff, kódminőség, security, scope és független V.Guard/M.Forge review; szükség szerint javítás-visszakör.
5/6 · BUILD / KIADÁS — shared build/release/migráció/restart csak központi exclusive lock alatt; artifact, hash és smoke ellenőrzés.
6/6 · LEZÁRÁS — commitok, tesztek, hash-ek, handoff, MUNKA VISSZAADVA, nyitott blokkolók és következő lépés rögzítése.`);
  }
  if (!additions.length) return next.slice(0, 100_000);
  return `${next}\n\n--- v0.3.2 SZABÁLYZAT-KIEGÉSZÍTÉS ---\n${additions.join("\n\n")}`.slice(0, 100_000);
}

function sanitizeConfig(input) {
  const next = cloneDefaultConfig();
  if (!input || typeof input !== "object") return next;

  const sourceVersion = Number.isFinite(Number(input.version)) ? Number(input.version) : 1;
  next.version = CONFIG_VERSION;
  if (["dark", "light"].includes(String(input.appearance))) next.appearance = String(input.appearance);
  if (typeof input.microphoneEnabled === "boolean") next.microphoneEnabled = input.microphoneEnabled;
  if (typeof input.showAvatars === "boolean") next.showAvatars = input.showAvatars;
  if (typeof input.showAvatarWatermarks === "boolean") next.showAvatarWatermarks = input.showAvatarWatermarks;
  next.workspaceZoomPercent = clampZoom(legacyZoom(input), 100);
  if (["grid4", "split2"].includes(String(input.layoutMode))) next.layoutMode = String(input.layoutMode);
  next.splitView = sanitizeSplitView(input.splitView, next.splitView);

  if (typeof input.benjadminBaseUrl === "string") {
    try {
      const parsed = new URL(input.benjadminBaseUrl);
      if (parsed.protocol === "https:" && ["admin.dev.dimpro.hu", "admin.dimpro.hu"].includes(parsed.hostname)) next.benjadminBaseUrl = parsed.origin;
    } catch { /* keep safe default */ }
  }

  if (Number.isFinite(Number(input.pollIntervalMs))) next.pollIntervalMs = Math.max(1000, Math.min(15000, Math.round(Number(input.pollIntervalMs))));
  if (typeof input.launchAtLogin === "boolean") next.launchAtLogin = input.launchAtLogin;
  if (typeof input.rememberLastConversation === "boolean") next.rememberLastConversation = input.rememberLastConversation;
  if (input.usageGuide && typeof input.usageGuide === "object") {
    next.usageGuide = {
      showOnUnlock: input.usageGuide.showOnUnlock !== false,
      content: typeof input.usageGuide.content === "string" && input.usageGuide.content.trim()
        ? (sourceVersion < 9 ? migrateUsageGuideV9(input.usageGuide.content) : input.usageGuide.content.slice(0, 100_000))
        : DEFAULT_USAGE_GUIDE
    };
  }
  if (input.centralWindow && typeof input.centralWindow === "object") {
    const cw = input.centralWindow;
    next.centralWindow = {
      x: cw.x !== null && cw.x !== "" && Number.isFinite(Number(cw.x)) ? Math.round(Number(cw.x)) : null,
      y: cw.y !== null && cw.y !== "" && Number.isFinite(Number(cw.y)) ? Math.round(Number(cw.y)) : null,
      width: Math.max(640, Math.min(2400, Math.round(Number(cw.width) || next.centralWindow.width))),
      height: Math.max(480, Math.min(1600, Math.round(Number(cw.height) || next.centralWindow.height))),
      maximized: cw.maximized === true
    };
  }

  if (input.contextWorkspace && typeof input.contextWorkspace === "object") {
    const cw = input.contextWorkspace;
    next.contextWorkspace = {
      visible: cw.visible === true,
      width: Math.max(380, Math.min(760, Math.round(Number(cw.width) || next.contextWorkspace.width))),
      zoomPercent: clampZoom(cw.zoomPercent, next.contextWorkspace.zoomPercent),
      detached: cw.detached === true,
      x: cw.x !== null && cw.x !== "" && Number.isFinite(Number(cw.x)) ? Math.round(Number(cw.x)) : null,
      y: cw.y !== null && cw.y !== "" && Number.isFinite(Number(cw.y)) ? Math.round(Number(cw.y)) : null,
      windowWidth: Math.max(720, Math.min(2200, Math.round(Number(cw.windowWidth) || next.contextWorkspace.windowWidth))),
      windowHeight: Math.max(560, Math.min(1600, Math.round(Number(cw.windowHeight) || next.contextWorkspace.windowHeight))),
      maximized: cw.maximized === true
    };
  }

  if (input.notifications && typeof input.notifications === "object") {
    for (const key of Object.keys(next.notifications)) if (typeof input.notifications[key] === "boolean") next.notifications[key] = input.notifications[key];
  }
  // v0.2.6-ban a beszélt kész-jelzés alapból ki volt kapcsolva. A v6 migráció
  // egyszer bekapcsolja az új hang/TTS réteget, amit utána a Beállításokban ki lehet kapcsolni.
  if (sourceVersion < 6) {
    next.notifications.completionSound = true;
    next.notifications.stageSound = true;
    next.notifications.spokenCompletion = true;
    next.notifications.spokenStage = true;
  }

  if (Array.isArray(input.cells)) {
    next.cells = sourceVersion < 2
      ? migrateLegacyCells(input.cells, next.cells)
      : next.cells.map((fallback, index) => normalizeCell(input.cells[index], fallback));
  }
  if (input.centralChat && typeof input.centralChat === "object") {
    next.centralChat = {
      id: "central",
      label: String(input.centralChat.label || next.centralChat.label).slice(0, 60),
      url: safeChatUrl(input.centralChat.url, next.centralChat.url),
      enabled: input.centralChat.enabled !== false
    };
  }
  if (sourceVersion < 6 && ["DIMPRO / DIMPROVER Központ", "DIMPRO / DIMPROVER Központi csevegő"].includes(next.centralChat.label)) {
    next.centralChat.label = "DevminAI";
  }
  return next;
}

module.exports = {
  DEFAULT_CONFIG,
  WORKER_OPTIONS,
  CONFIG_VERSION,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  CHAT_CELL_IDS,
  cloneDefaultConfig,
  sanitizeConfig,
  clampZoom,
  DEFAULT_USAGE_GUIDE
};
