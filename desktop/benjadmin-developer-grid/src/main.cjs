"use strict";

const { app, BrowserWindow, WebContentsView, ipcMain, Notification, safeStorage, session, powerMonitor, nativeTheme, globalShortcut, shell, screen, clipboard, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { randomBytes, randomUUID, createHash } = require("node:crypto");
const { createPasswordRecord, verifyPassword, loadPasswordRecord, savePasswordRecord } = require("./security/password-store.cjs");
const { cloneDefaultConfig, sanitizeConfig, clampZoom, DEFAULT_USAGE_GUIDE } = require("./config/defaults.cjs");
const { BenjadminLiveClient } = require("./live/benjadmin-live-client.cjs");
const { isTaskAwaitingChatLaunch, taskLaunchGate, TASK_LAUNCH_PROMPT_MARKER, buildWorkerTaskPrompt } = require("./task-launch/prompt-builder.cjs");
const { fetchReviewRoomSnapshot } = require("./review/review-room-client.cjs");
const { fetchContextWorkspace, saveHandoff, downloadHandoff, uploadResources, fetchDeveloperGridActiveWork, startDeveloperGridWork, bindDeveloperGridConversation, recordDeveloperGridBootAck, fetchDeveloperGridBuildRuns, requestDeveloperGridFullBuild, submitDeveloperGridEvidence, fetchDeveloperGridEvidence, fetchDeveloperGridReviewGate, requestDeveloperGridVGuardReview, fetchDeveloperGridWindowsE2E } = require("./context-workspace/context-workspace-client.cjs");
const { HANDOFF_PROMPT_MARKER, buildHandoffPrompt } = require("./context-workspace/handoff-prompt-builder.cjs");
const { getConversationInfo, captureLatestAssistantText, captureLatestAssistantMarkdown, parseHandoffV2, renderHandoffMarkdown, handoffStatusForTask, extractHandoffTimestamp, extractCommit } = require("./context-workspace/chatgpt-handoff.cjs");
const { validateBootAcknowledgement } = require("./task-launch/boot-ack.cjs");
const { buildStageActionPrompt } = require("./stage-actions-prompt-builder.cjs");
const { STAGE_REPORT_START, parseDeveloperGridStageReport } = require("./task-launch/stage-report.cjs");
const { SHORTCUT_DEFINITIONS, shortcutActionFromInput } = require("./shortcuts.cjs");

const APP_TITLE = "BENJADMIN Developer Grid";
const CHAT_PARTITION = "persist:benjadmin-developer-grid-chatgpt";
const APP_BAR_HEIGHT = 44;
const CELL_HEADER_HEIGHT = 108;
const DEVELOPER_FOOTER_HEIGHT = 42;
const SYSTEM_HEALTH_PEEK_HEIGHT = 86;
const CENTRAL_HEADER_HEIGHT = 52;
const GRID_GAP = 2;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;
const CHAT_REFRESH_MAINTENANCE_MS = 60_000;
const CHAT_REFRESH_PROBE_MS = 5 * 60_000;
const DEVICE_HEARTBEAT_INTERVAL_MS = 5 * 60_000;
const AVATAR_ASSETS = Object.freeze({
  BENAI: path.join(__dirname, "assets", "team", "benai.webp"),
  OUTMINAI: path.join(__dirname, "assets", "team", "outminai.webp"),
  ARMINAI: path.join(__dirname, "assets", "team", "arminai.webp"),
  JAZMINAI: path.join(__dirname, "assets", "team", "jazminai.webp"),
  BENJADMIN: path.join(__dirname, "assets", "team", "benjadmin.webp"),
  DEVMINAI: path.join(__dirname, "assets", "team", "devminai.png")
});

let shellWindow = null;
let config = null;
let unlocked = false;
let chatViews = new Map();
let liveClient = null;
let reporterKeyMemory = "";
let deviceTokenMemory = "";
let pairingState = null;
let pairingTimer = null;
let failedAttempts = 0;
let lockedUntil = 0;
let maximizedCellId = null;
let uiOverlayVisible = false;
let centralVisible = false;
let systemHealthMode = "closed";
let centralWindow = null;
const registeredGlobalShortcutActions = new Set();
let shortcutRegistrationState = [];
const shortcutDispatchTimestamps = new Map();
const SHORTCUT_DEDUPE_MS = 220;
let centralProfileVisible = false;
let guideWindow = null;
let contextWorkspaceWindow = null;
let contextWorkspaceWindowSaveTimer = null;
let handoffRecords = null;
let contextBindings = null;
let latestLiveSnapshot = null;
let taskLaunchRecords = null;
let appQuitting = false;
let centralWindowSaveTimer = null;
const latestWorkerConversationScanned = new Set();
const watermarkCssKeys = new Map();
const chatRefreshCells = new Map();
const pendingChatRefreshReasons = new Map();
const stageReportMonitorKeys = new Set();
let chatRefreshTimer = null;
let chatRefreshMaintenanceBusy = false;
let deviceHeartbeatTimer = null;
let deviceHeartbeatBusy = false;
let desktopArtifactIdentityCache = null;
const avatarDataUriCache = new Map();

function userDataPath() { return app.getPath("userData"); }
function configPath() { return path.join(userDataPath(), "developer-grid-config.json"); }
function reporterKeyPath() { return path.join(userDataPath(), "benjadmin-developer-grid-reporter-key.bin"); }
function deviceTokenPath() { return path.join(userDataPath(), "benjadmin-developer-grid-device-token.bin"); }
function deviceMetaPath() { return path.join(userDataPath(), "benjadmin-developer-grid-device.json"); }
function agentIdPath() { return path.join(userDataPath(), "benjadmin-chatgrid-agent-id.txt"); }
function taskLaunchStatePath() { return path.join(userDataPath(), "benjadmin-developer-grid-task-launch.json"); }
function handoffStatePath() { return path.join(userDataPath(), "benjadmin-developer-grid-handoff-state.json"); }
function contextBindingsPath() { return path.join(userDataPath(), "benjadmin-developer-grid-context-bindings.json"); }

function loadConfig() {
  try { return sanitizeConfig(JSON.parse(fs.readFileSync(configPath(), "utf8"))); }
  catch { return cloneDefaultConfig(); }
}

function installedExecutablePath() {
  if (process.platform !== "win32") return process.execPath;
  const localBase = String(process.env.LOCALAPPDATA || "").trim() || app.getPath("userData");
  return path.join(localBase, "BENJADMIN Developer Grid", "BENJADMIN-Developer-Grid.exe");
}

function portableSourceExecutablePath() {
  const portable = String(process.env.PORTABLE_EXECUTABLE_FILE || "").trim();
  return portable && fs.existsSync(portable) ? portable : process.execPath;
}

function ensureStableStartupExecutable() {
  if (process.platform !== "win32" || !app.isPackaged) return process.execPath;
  const source = portableSourceExecutablePath();
  const target = installedExecutablePath();
  const versionFile = `${target}.version`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const installedVersion = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, "utf8").trim() : "";
    const samePath = path.resolve(source).toLowerCase() === path.resolve(target).toLowerCase();
    if (!samePath && (!fs.existsSync(target) || installedVersion !== app.getVersion())) {
      fs.copyFileSync(source, target);
      fs.writeFileSync(versionFile, `${app.getVersion()}\n`, "utf8");
    } else if (samePath && installedVersion !== app.getVersion()) {
      fs.writeFileSync(versionFile, `${app.getVersion()}\n`, "utf8");
    }
    return fs.existsSync(target) ? target : source;
  } catch {
    return source;
  }
}

function applyLoginItemSetting() {
  if (process.platform !== "win32") return;
  try {
    const startupPath = ensureStableStartupExecutable();
    app.setLoginItemSettings({
      openAtLogin: config?.launchAtLogin === true,
      path: startupPath,
      args: config?.launchAtLogin === true ? ["--autostart"] : []
    });
  } catch { /* a ChatGrid működését nem blokkolja az autostart beállítás */ }
}

function saveConfig(next) {
  config = sanitizeConfig(next);
  fs.mkdirSync(userDataPath(), { recursive: true });
  const file = configPath();
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
  applyLoginItemSetting();
  nativeTheme.themeSource = config.appearance === "light" ? "light" : "dark";
  return config;
}

function loadTaskLaunchRecords() {
  if (taskLaunchRecords) return taskLaunchRecords;
  try {
    const parsed = JSON.parse(fs.readFileSync(taskLaunchStatePath(), "utf8"));
    taskLaunchRecords = parsed && typeof parsed === "object" && parsed.records && typeof parsed.records === "object" ? parsed.records : {};
  } catch { taskLaunchRecords = {}; }
  return taskLaunchRecords;
}

function saveTaskLaunchPatch(task, workerCode, patch = {}) {
  const records = loadTaskLaunchRecords();
  const taskId = String(task?.id || patch?.taskId || "");
  if (!taskId) throw new Error("TASK_LAUNCH_RECORD_TASK_ID_MISSING");
  const previous = records[taskId] || {};
  records[taskId] = {
    ...previous, ...patch, taskId,
    workerCode: String(workerCode || patch?.workerCode || previous?.workerCode || "").toUpperCase(),
    taskTitle: String(task?.title || patch?.taskTitle || previous?.taskTitle || "").slice(0, 500),
    updatedAt: new Date().toISOString(),
  };
  const entries = Object.values(records).sort((a, b) => String(b.updatedAt || b.preparedAt || "").localeCompare(String(a.updatedAt || a.preparedAt || ""))).slice(0, 120);
  taskLaunchRecords = Object.fromEntries(entries.map((item) => [item.taskId, item]));
  persistJsonAtomic(taskLaunchStatePath(), { version: 3, records: taskLaunchRecords });
  return taskLaunchRecords[taskId];
}

function saveTaskLaunchRecord(task, workerCode, mode) {
  return saveTaskLaunchPatch(task, workerCode, { preparedAt: new Date().toISOString(), mode: mode === "inserted" ? "inserted" : "clipboard" });
}

function handoffRecordKey(workerCode, chatSessionId) {
  const code = String(workerCode || "").toUpperCase();
  const session = String(chatSessionId || "legacy").trim() || "legacy";
  return `${code}::${session}`;
}
function loadHandoffRecords() {
  if (handoffRecords) return handoffRecords;
  let source = {};
  let migrated = false;
  try {
    const parsed = JSON.parse(fs.readFileSync(handoffStatePath(), "utf8"));
    source = parsed && typeof parsed === "object" && parsed.records && typeof parsed.records === "object" ? parsed.records : (parsed && typeof parsed === "object" ? parsed : {});
    if (parsed?.records) migrated = true;
  } catch { source = {}; }
  const scoped = {};
  for (const [legacyKey, rawRecord] of Object.entries(source)) {
    if (!rawRecord || typeof rawRecord !== "object") continue;
    const record = { ...rawRecord };
    const code = String(record.workerCode || String(legacyKey).split("::")[0] || "").toUpperCase();
    if (!["BENAI", "OUTMINAI", "ARMINAI", "JAZMINAI"].includes(code)) continue;
    const chatSessionId = String(record.chatSessionId || (String(legacyKey).includes("::") ? String(legacyKey).slice(String(legacyKey).indexOf("::") + 2) : "legacy") || "legacy");
    if (!String(legacyKey).includes("::")) migrated = true;
    if (record.state === "HANDOFF_REQUESTED") {
      record.state = "RECOVERY_REQUIRED";
      record.lastError = "Korábbi nem igazolt handoff prompt állapot; helyreállítás szükséges.";
      record.recoveredAt = new Date().toISOString();
      migrated = true;
    }
    record.workerCode = code;
    record.chatSessionId = chatSessionId;
    const key = handoffRecordKey(code, chatSessionId);
    const previous = scoped[key];
    if (!previous || String(record.updatedAt || "") >= String(previous.updatedAt || "")) scoped[key] = record;
  }
  handoffRecords = scoped;
  if (migrated) persistJsonAtomic(handoffStatePath(), handoffRecords);
  return handoffRecords;
}
function persistJsonAtomic(file, value) {
  fs.mkdirSync(userDataPath(), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}
function handoffRecordForConversation(workerCode, chatSessionId) {
  return loadHandoffRecords()[handoffRecordKey(workerCode, chatSessionId)] || null;
}
function saveHandoffRecord(workerCode, chatSessionId, patch) {
  const records = loadHandoffRecords();
  const code = String(workerCode || "").toUpperCase();
  const session = String(chatSessionId || patch?.chatSessionId || "legacy").trim() || "legacy";
  const key = handoffRecordKey(code, session);
  records[key] = { ...(records[key] || {}), ...patch, workerCode: code, chatSessionId: session, updatedAt: new Date().toISOString() };
  persistJsonAtomic(handoffStatePath(), records);
  return records[key];
}
function clearTaskLaunchRecordsForWorker(workerCode) {
  const code = String(workerCode || "").toUpperCase();
  const records = loadTaskLaunchRecords();
  let changed = false;
  for (const [taskId, record] of Object.entries(records)) {
    if (String(record?.workerCode || "").toUpperCase() !== code) continue;
    delete records[taskId];
    changed = true;
  }
  if (changed) {
    taskLaunchRecords = records;
    persistJsonAtomic(taskLaunchStatePath(), { version: 2, records: taskLaunchRecords });
  }
  return changed;
}
function handoffBlocksTaskLaunch(workerCode, chatSessionId) {
  const state = handoffRecordForConversation(workerCode, chatSessionId)?.state || "";
  return ["HANDOFF_PROMPT_INSERTED", "HANDOFF_RESPONSE_READY", "RECOVERY_REQUIRED", "RECOVERY_PREPARE_REQUIRED", "HANDOFF_REQUESTED"].includes(state);
}
function loadContextBindings() {
  if (contextBindings) return contextBindings;
  try { const parsed = JSON.parse(fs.readFileSync(contextBindingsPath(), "utf8")); contextBindings = parsed && typeof parsed === "object" ? parsed : {}; }
  catch { contextBindings = {}; }
  return contextBindings;
}
function bindContextItem(workerCode, item) {
  const code = String(workerCode || "").toUpperCase();
  if (!["BENAI","OUTMINAI","ARMINAI","JAZMINAI"].includes(code)) throw new Error("Ismeretlen worker.");
  const bindings = loadContextBindings();
  const list = Array.isArray(bindings[code]) ? bindings[code] : [];
  const normalized = { type: String(item?.type || ""), id: String(item?.id || "").slice(0,180), title: String(item?.title || "").slice(0,500), boundAt: new Date().toISOString() };
  if (!normalized.id || !["resource","handoff"].includes(normalized.type)) throw new Error("Érvénytelen kontextus-hivatkozás.");
  bindings[code] = [normalized, ...list.filter((entry) => !(entry.type === normalized.type && entry.id === normalized.id))].slice(0, 50);
  persistJsonAtomic(contextBindingsPath(), bindings);
  return bindings[code];
}

function clearContextBindings(workerCode) {
  const code = String(workerCode || "").toUpperCase();
  if (!["BENAI","OUTMINAI","ARMINAI","JAZMINAI"].includes(code)) throw new Error("Ismeretlen worker.");
  const bindings = loadContextBindings();
  bindings[code] = [];
  persistJsonAtomic(contextBindingsPath(), bindings);
  return bindings;
}

function contextPackPromptForWorker(workerCode) {
  const code = String(workerCode || "").toUpperCase();
  const bindings = Array.isArray(loadContextBindings()[code]) ? loadContextBindings()[code] : [];
  if (!bindings.length) return "";
  return [
    "BENJADMIN CONTEXT PACK:",
    ...bindings.slice(0, 20).map((item, index) => `${index + 1}. [${String(item.type || "").toUpperCase()}] ${item.title || item.id} · ID: ${item.id}`),
    "Forrássorrend: BenjAdmin aktuális utasítás → legfrissebb jóváhagyott modul-átadó → kötelező Fejlesztési Tár segédanyagok. Eltérésnél SOURCE_CONFLICT / BENJADMIN DECISION REQUIRED.",
  ].join("\n");
}

function enrichSnapshotWithTaskLaunch(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.tasks)) return snapshot;
  const records = loadTaskLaunchRecords();
  return { ...snapshot, tasks: snapshot.tasks.map((task) => {
    const authoritative = task?.chatLaunchMode ? {
      chatLaunchMode: task.chatLaunchMode, previousConversationId: task.chatPreviousConversationId || null,
      conversationBound: Boolean(task.chatConversationId), chatSessionId: task.chatConversationId || null,
      chatConversationUrl: task.chatConversationUrl || null, chatTitle: task.chatConversationTitle || null,
      chatConversationConfirmedAt: task.chatConversationConfirmedAt || null,
      bootAckState: task.bootAckState || null, bootAckValidatedAt: task.bootAckValidatedAt || null,
      bootAckSha256: task.bootAckSha256 || null, bootAckCodingAllowed: task.bootAckCodingAllowed ?? null,
      bootAckMismatches: Array.isArray(task.bootAckMismatches) ? task.bootAckMismatches : [],
    } : null;
    const local = records[String(task.id)] || null;
    return { ...task, chatLaunch: authoritative || local ? { ...(authoritative || {}), ...(local || {}) } : null };
  }) };
}

function readReporterKey() {
  if (reporterKeyMemory) return reporterKeyMemory;
  try {
    if (!safeStorage.isEncryptionAvailable()) return "";
    const encrypted = fs.readFileSync(reporterKeyPath());
    reporterKeyMemory = safeStorage.decryptString(encrypted);
    return reporterKeyMemory;
  } catch { return ""; }
}

function writeReporterKey(value) {
  const key = String(value || "").trim();
  if (!key) throw new Error("A BENJADMIN reporter kulcs nem lehet üres.");
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Az operációs rendszer biztonságos titoktárolása nem érhető el.");
  const encrypted = safeStorage.encryptString(key);
  fs.mkdirSync(userDataPath(), { recursive: true });
  fs.writeFileSync(reporterKeyPath(), encrypted, { mode: 0o600 });
  reporterKeyMemory = key;
}

function readDeviceToken() {
  if (deviceTokenMemory) return deviceTokenMemory;
  try {
    if (!safeStorage.isEncryptionAvailable()) return "";
    const encrypted = fs.readFileSync(deviceTokenPath());
    deviceTokenMemory = safeStorage.decryptString(encrypted);
    return deviceTokenMemory;
  } catch { return ""; }
}

function readDeviceMeta() {
  try {
    const value = JSON.parse(fs.readFileSync(deviceMetaPath(), "utf8"));
    return value && typeof value === "object" ? value : null;
  } catch { return null; }
}

function writeDeviceToken(token, metadata) {
  const value = String(token || "").trim();
  if (!value) throw new Error("A ChatGrid device token hiányzik.");
  if (!safeStorage.isEncryptionAvailable()) throw new Error("A Windows biztonságos titoktárolása nem érhető el.");
  fs.mkdirSync(userDataPath(), { recursive: true });
  fs.writeFileSync(deviceTokenPath(), safeStorage.encryptString(value), { mode: 0o600 });
  fs.writeFileSync(deviceMetaPath(), JSON.stringify(metadata || {}, null, 2), { mode: 0o600 });
  deviceTokenMemory = value;
}

function forgetDeviceToken() {
  deviceTokenMemory = "";
  for (const file of [deviceTokenPath(), deviceMetaPath()]) {
    try { fs.rmSync(file, { force: true }); } catch { /* ignore */ }
  }
}

function getOrCreateAgentId() {
  try {
    const existing = fs.readFileSync(agentIdPath(), "utf8").trim();
    if (/^chatgrid-[a-f0-9-]{16,80}$/i.test(existing)) return existing;
  } catch { /* first pairing */ }
  const agentId = `chatgrid-${randomUUID()}`;
  fs.mkdirSync(userDataPath(), { recursive: true });
  fs.writeFileSync(agentIdPath(), `${agentId}\n`, { mode: 0o600 });
  return agentId;
}

function liveCredentials() {
  const credentials = [];
  const deviceToken = readDeviceToken();
  if (deviceToken) credentials.push({ mode: "device", token: deviceToken });
  const reporterKey = readReporterKey();
  if (reporterKey && reporterKey !== deviceToken) credentials.push({ mode: "reporter", token: reporterKey });
  return credentials;
}

function liveCredential() {
  return liveCredentials()[0] || { mode: "none", token: "" };
}

function credentialHeaders(credential) {
  return credential?.mode === "device"
    ? { "x-benjadmin-chatgrid-device-token": credential.token, accept: "application/json" }
    : { "x-dimpro-dev-reporter-key": credential?.token || "", accept: "application/json" };
}

function publicPairingState() {
  if (!pairingState) return { status: "idle" };
  return {
    status: pairingState.status,
    pairingId: pairingState.pairingId,
    deviceId: pairingState.deviceId || null,
    expiresAt: pairingState.expiresAt || null,
    error: pairingState.error || ""
  };
}

function emitPairingState() {
  send("connection:pairing", publicPairingState());
}

function clearPairingTimer() {
  if (pairingTimer) clearTimeout(pairingTimer);
  pairingTimer = null;
}

function cancelChatGridPairing(status = "idle") {
  clearPairingTimer();
  pairingState = status === "idle" ? null : { ...(pairingState || {}), status };
  emitPairingState();
}

function parsePairingActivation(value) {
  const text = String(value || "").trim();
  const separator = text.indexOf("#");
  if (separator <= 0) throw new Error("Érvénytelen ChatGrid párosítási kód.");
  const pairingId = text.slice(0, separator).trim();
  const code = text.slice(separator + 1).trim();
  if (!/^[0-9a-f-]{30,64}$/i.test(pairingId) || !/^[0-9A-Z-]{8,24}$/i.test(code)) throw new Error("Érvénytelen ChatGrid párosítási kód.");
  return { pairingId, code };
}

async function pollChatGridPairing() {
  clearPairingTimer();
  if (!pairingState?.pairingId || !pairingState?.claimToken) return;
  try {
    const response = await fetch(`${config.benjadminBaseUrl}/api/dev/terminal-hub/windows-bridge/claim/status?pairingId=${encodeURIComponent(pairingState.pairingId)}`, {
      method: "GET",
      headers: { authorization: `Bearer ${pairingState.claimToken}`, accept: "application/json" },
      cache: "no-store"
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok || !payload.claim) throw new Error(payload?.error || `BENJADMIN pairing HTTP ${response.status}`);
    if (payload.claim.status === "pending_approval") {
      pairingState.status = "pending_approval";
      emitPairingState();
      pairingTimer = setTimeout(() => void pollChatGridPairing(), 2000);
      return;
    }
    if (payload.claim.status !== "active" || !payload.claim.deviceToken) throw new Error("A ChatGrid device aktiválása nem fejeződött be.");
    const agentId = getOrCreateAgentId();
    writeDeviceToken(payload.claim.deviceToken, {
      deviceId: String(payload.claim.deviceId || pairingState.deviceId || ""),
      sessionId: String(payload.claim.sessionId || ""),
      agentId,
      deviceLabel: `BENJADMIN Developer Grid · ${os.hostname()}`,
      pairedAt: new Date().toISOString()
    });
    pairingState = { ...pairingState, status: "active" };
    emitPairingState();
    pairingState = null;
    startLiveClient();
  } catch (error) {
    pairingState = { ...(pairingState || {}), status: "error", error: error instanceof Error ? error.message : "A ChatGrid párosítás sikertelen." };
    emitPairingState();
  }
}

async function beginChatGridPairing(activationCode) {
  if (!unlocked) throw new Error("A ChatGrid zárolva van.");
  const { pairingId, code } = parsePairingActivation(activationCode);
  clearPairingTimer();
  const agentId = getOrCreateAgentId();
  const hello = {
    protocolVersion: 1,
    agentId,
    deviceLabel: `BENJADMIN Developer Grid · ${os.hostname()}`.slice(0, 160),
    osVersion: `${os.type()} ${os.release()}`.slice(0, 120),
    powershellVersion: "",
    capabilities: [],
    nonce: randomBytes(16).toString("base64url"),
    sentAt: new Date().toISOString()
  };
  pairingState = { status: "claiming", pairingId, deviceId: null, expiresAt: null, error: "" };
  emitPairingState();
  const response = await fetch(`${config.benjadminBaseUrl}/api/dev/terminal-hub/windows-bridge/claim`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ pairingId, code, hello }),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok || !payload.claim?.claimToken) {
    pairingState = { ...pairingState, status: "error", error: payload?.error || `BENJADMIN pairing HTTP ${response.status}` };
    emitPairingState();
    throw new Error(pairingState.error);
  }
  pairingState = {
    status: "pending_approval",
    pairingId,
    claimToken: String(payload.claim.claimToken),
    deviceId: String(payload.claim.deviceId || ""),
    expiresAt: String(payload.claim.expiresAt || ""),
    error: ""
  };
  emitPairingState();
  pairingTimer = setTimeout(() => void pollChatGridPairing(), 1200);
  return publicPairingState();
}

function send(channel, payload) {
  if (shellWindow && !shellWindow.isDestroyed()) shellWindow.webContents.send(channel, payload);
  if (contextWorkspaceWindow && !contextWorkspaceWindow.isDestroyed()) contextWorkspaceWindow.webContents.send(channel, payload);
}

function securityState() {
  const hasPassword = Boolean(loadPasswordRecord(userDataPath()));
  return {
    hasPassword,
    unlocked,
    failedAttempts,
    lockedUntil: lockedUntil > Date.now() ? lockedUntil : 0
  };
}

function destroyChatViews() {
  for (const [chatId, view] of chatViews.entries()) {
    const hostWindow = chatId === "central" ? centralWindow : shellWindow;
    try { hostWindow?.contentView.removeChildView(view); } catch { /* already detached */ }
    try { if (!view.webContents.isDestroyed()) view.webContents.close(); } catch { /* ignore */ }
  }
  chatViews.clear();
  watermarkCssKeys.clear();
}

function lockWorkspace(reason = "manual") {
  unlocked = false;
  maximizedCellId = null;
  centralVisible = false;
  systemHealthMode = "closed";
  uiOverlayVisible = false;
  stopLiveClient();
  cancelChatGridPairing();
  destroyChatViews();
  if (centralWindow && !centralWindow.isDestroyed()) centralWindow.hide();
  if (guideWindow && !guideWindow.isDestroyed()) guideWindow.hide();
  send("layout:state", { maximizedCellId: null, openCellIds: [] });
  send("security:state", { ...securityState(), reason });
}

function allowedChatUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:";
  } catch { return false; }
}

function isChatGptUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && ["chatgpt.com", "www.chatgpt.com"].includes(url.hostname);
  } catch { return false; }
}

function isChatConversationUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return isChatGptUrl(url.href) && /(?:^|\/)c\/[A-Za-z0-9_-]+/.test(url.pathname);
  } catch { return false; }
}

function chatConversationIdFromUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!isChatGptUrl(url.href)) return "";
    return url.pathname.match(/(?:^|\/)c\/([A-Za-z0-9_-]+)/)?.[1] || "";
  } catch { return ""; }
}

function rememberChatNavigation(chatId, url) {
  if (!config?.rememberLastConversation || !isChatConversationUrl(url)) return false;
  const target = chatConfigById(chatId);
  if (!target || target.url === url) return false;
  target.url = url;
  saveConfig(config);
  send("config:state", config);
  return true;
}


function captureWorkerConversationGuards() {
  return (config?.cells || []).flatMap((cell) => {
    const view = chatViews.get(cell.id);
    if (!view || view.webContents.isDestroyed()) return [];
    const url = view.webContents.getURL();
    return isChatConversationUrl(url) ? [{ cellId: cell.id, url }] : [];
  });
}

function restoreWorkerConversationGuard(guard) {
  const view = chatViews.get(guard?.cellId);
  if (!view || view.webContents.isDestroyed() || !isChatConversationUrl(guard?.url || "")) return false;
  const current = view.webContents.getURL();
  if (current === guard.url || isChatConversationUrl(current) || !isChatGptUrl(current)) return false;
  void view.webContents.loadURL(guard.url).catch(() => null);
  return true;
}

function preserveWorkerConversationsAfterWorkStart(guards) {
  const safeGuards = Array.isArray(guards) ? guards : [];
  for (const delay of [0, 350, 1200]) {
    setTimeout(() => {
      for (const guard of safeGuards) restoreWorkerConversationGuard(guard);
    }, delay);
  }
}

async function selectLatestNamedConversation(cell, view) {
  if (!config?.rememberLastConversation || !cell || latestWorkerConversationScanned.has(cell.id)) return false;
  latestWorkerConversationScanned.add(cell.id);
  const slot = cell.id === "central" ? 5 : (config.cells || []).findIndex((item) => item.id === cell.id) + 1;
  if (slot < 1) return false;
  const workerName = cell.id === "central" ? "DevminAI" : String(cell.label || "").trim();
  if (!workerName) return false;
  const candidate = await view.webContents.executeJavaScript(`(() => {
    const slot = ${JSON.stringify(slot)};
    const worker = ${JSON.stringify(workerName)};
    const escapeRe = (value) => value.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&");
    const re = new RegExp("^(\\d{6})[_\\s-]+" + slot + "[_\\s-]+" + escapeRe(worker) + "(?:\\s*[–—-].*)?$", "i");
    const rows = [];
    for (const a of document.querySelectorAll('a[href*="/c/"]')) {
      const labels = [a.textContent, a.getAttribute("aria-label"), a.getAttribute("title")].filter(Boolean).map((v) => String(v).trim().replace(/\s+/g, " "));
      const title = labels.find((v) => re.test(v));
      if (!title) continue;
      const match = title.match(re);
      if (!match) continue;
      try { rows.push({ date: match[1], title, href: new URL(a.href, location.origin).href }); } catch {}
    }
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return rows[0] || null;
  })()`, true).catch(() => null);
  if (!candidate?.href || !isChatConversationUrl(candidate.href)) return false;
  const current = view.webContents.getURL();
  if (current === candidate.href) { rememberChatNavigation(cell.id, candidate.href); return false; }
  await view.webContents.loadURL(candidate.href).catch(() => null);
  return true;
}

function avatarAssetForChat(cell) {
  if (!cell) return null;
  if (cell.id === "central") return AVATAR_ASSETS.DEVMINAI;
  return AVATAR_ASSETS[String(cell.workerCode || "").toUpperCase()] || null;
}

function avatarDataUri(assetPath) {
  if (!assetPath || !fs.existsSync(assetPath)) return "";
  if (avatarDataUriCache.has(assetPath)) return avatarDataUriCache.get(assetPath);
  const extension = path.extname(assetPath).toLowerCase();
  const mime = extension === ".png" ? "image/png" : extension === ".svg" ? "image/svg+xml" : extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/webp";
  const data = `data:${mime};base64,${fs.readFileSync(assetPath).toString("base64")}`;
  avatarDataUriCache.set(assetPath, data);
  return data;
}

function workerVisualAccent(cell) {
  const code = cell?.id === "central" ? "BENJADMIN" : String(cell?.workerCode || "").toUpperCase();
  return ({
    BENAI: { rgb: "35,155,255", edge: "67,217,255" },
    OUTMINAI: { rgb: "238,145,48", edge: "255,183,77" },
    ARMINAI: { rgb: "34,184,221", edge: "79,214,238" },
    JAZMINAI: { rgb: "151,94,226", edge: "188,139,255" },
    BENJADMIN: { rgb: "42,171,222", edge: "86,211,255" }
  })[code] || { rgb: "67,217,255", edge: "103,232,255" };
}

async function applyChatWatermark(cell, view) {
  if (!cell || !view || view.webContents.isDestroyed()) return;
  const oldKey = watermarkCssKeys.get(cell.id);
  if (oldKey) {
    try { await view.webContents.removeInsertedCSS(oldKey); } catch { /* view reloaded/destroyed */ }
    watermarkCssKeys.delete(cell.id);
  }
  if (config?.showAvatarWatermarks === false) return;
  const dataUri = avatarDataUri(avatarAssetForChat(cell));
  if (!dataUri) return;
  const accent = workerVisualAccent(cell);
  const isLight = config?.appearance === "light";
  const avatarOpacity = isLight ? 0.095 : 0.085;
  const auraOpacity = isLight ? 0.055 : 0.065;
  const edgeOpacity = isLight ? 0.035 : 0.045;
  const css = `
  html::before {
    content: "" !important;
    position: fixed !important;
    inset: 0 !important;
    background:
      radial-gradient(circle at 86% 78%, rgba(${accent.rgb}, ${auraOpacity}) 0%, rgba(${accent.rgb}, ${auraOpacity * 0.55}) 18%, transparent 43%),
      radial-gradient(circle at 96% 94%, rgba(${accent.edge}, ${edgeOpacity}) 0%, transparent 34%) !important;
    pointer-events: none !important;
    user-select: none !important;
    z-index: 2147483645 !important;
  }
  html::after {
    content: "" !important;
    position: fixed !important;
    right: 4.5vw !important;
    bottom: 4vh !important;
    width: min(36vw, 440px) !important;
    height: min(51vh, 540px) !important;
    background: url("${dataUri}") center bottom / contain no-repeat !important;
    opacity: ${avatarOpacity} !important;
    filter: saturate(112%) contrast(104%) !important;
    pointer-events: none !important;
    user-select: none !important;
    z-index: 2147483646 !important;
  }`;
  try {
    const key = await view.webContents.insertCSS(css, { cssOrigin: "user" });
    watermarkCssKeys.set(cell.id, key);
  } catch { /* vizuális extra nem blokkolhatja a ChatGPT-t */ }
}

function applyAllChatWatermarks() {
  for (const [chatId, view] of chatViews.entries()) {
    const cell = chatConfigById(chatId);
    if (cell) void applyChatWatermark(cell, view);
  }
}

function normalizeDesktopWorkerCode(value) {
  const code = String(value || "").toUpperCase();
  return code === "BENJAMINAI" ? "BENAI" : code;
}

function workerHasAssignedDevelopment(snapshot, workerCode) {
  const code = normalizeDesktopWorkerCode(workerCode);
  const activePresence = (snapshot?.workerPresence || []).some((item) => normalizeDesktopWorkerCode(item?.workerCode) === code && item?.active !== false && String(item?.lifecycleState || "").toUpperCase() !== "COMPLETED");
  if (activePresence) return true;
  return (snapshot?.tasks || []).some((task) => {
    const assigned = normalizeDesktopWorkerCode(task?.assignedWorkerId || task?.requestedWorkerId);
    const status = String(task?.status || "").toLowerCase();
    return assigned === code && !["completed", "closed", "cancelled", "canceled", "failed"].includes(status);
  });
}

async function applyWorkspaceStandbyLock(cell, view, shouldLock) {
  if (!cell || cell.id === "central" || !view || view.webContents.isDestroyed()) return;
  const dataUri = avatarDataUri(avatarAssetForChat(cell));
  if (!dataUri) return;
  const accent = workerVisualAccent(cell);
  const key = `benjadmin-workspace-unlocked:${cell.id}`;
  const label = String(cell.label || cell.workerCode || "Kódmérnök");
  const script = `(() => {
    const id = "__benjadmin_workspace_standby__";
    const existing = document.getElementById(id);
    const key = ${JSON.stringify(key)};
    const shouldLock = ${shouldLock ? "true" : "false"};
    if (!shouldLock) {
      // Active work always resets any previous manual standby bypass.
      // When the task later becomes terminal, the next live snapshot can restore
      // the standby cover automatically instead of inheriting a stale unlock.
      try { sessionStorage.removeItem(key); } catch {}
      existing?.remove();
      return { locked:false, reason:"active-task" };
    }
    try { if (sessionStorage.getItem(key) === "1") { existing?.remove(); return { locked:false, reason:"manual-unlock" }; } } catch {}
    if (existing) return { locked:true, reason:"already-present" };
    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.setAttribute("data-benjadmin-workspace-standby", "true");
    Object.assign(overlay.style, {
      position:"fixed", inset:"0", zIndex:"2147483647", display:"grid", placeItems:"center",
      background:"linear-gradient(145deg, rgba(${accent.rgb},0.20), rgba(8,18,26,0.24))",
      backdropFilter:"blur(.6px) saturate(72%) brightness(94%)", WebkitBackdropFilter:"blur(.6px) saturate(72%) brightness(94%)",
      pointerEvents:"auto", userSelect:"none"
    });
    const wrap = document.createElement("div");
    Object.assign(wrap.style,{display:"grid",placeItems:"center",gap:"14px",textAlign:"center",fontFamily:"Inter,Segoe UI,Arial,sans-serif"});
    const button = document.createElement("button");
    button.type="button"; button.title="Munkatér feloldása"; button.setAttribute("aria-label","${label.replace('"','')} munkatér feloldása");
    Object.assign(button.style,{width:"min(26vw,190px)",height:"min(26vw,190px)",minWidth:"118px",minHeight:"118px",border:"1px solid rgba(${accent.edge},0.78)",borderRadius:"32px",background:"rgba(3,11,17,0.24)",boxShadow:"0 18px 54px rgba(0,0,0,.18),0 0 30px rgba(${accent.rgb},.14)",cursor:"pointer",display:"grid",placeItems:"center",padding:"12px"});
    const img=document.createElement("img"); img.src=${JSON.stringify(dataUri)}; img.alt="${label.replace('"','')}"; Object.assign(img.style,{width:"100%",height:"100%",objectFit:"contain",opacity:".72",filter:"saturate(104%) contrast(102%)"}); button.appendChild(img);
    const title=document.createElement("strong"); title.textContent="MUNKATÉR KÉSZENLÉTBEN"; Object.assign(title.style,{fontSize:"clamp(14px,1.25vw,23px)",letterSpacing:".09em",color:"rgba(255,255,255,.86)",textShadow:"0 2px 12px rgba(0,0,0,.35)"});
    const hint=document.createElement("span"); hint.textContent="${label.replace('"','')} · kattints az avatárra a munkatér használatához"; Object.assign(hint.style,{fontSize:"clamp(10px,.8vw,15px)",fontWeight:"650",color:"rgba(255,255,255,.66)"});
    button.addEventListener("click",()=>{ try { sessionStorage.setItem(key,"1"); } catch {} overlay.animate([{opacity:1},{opacity:0}],{duration:180,easing:"ease-out"}).finished.finally(()=>overlay.remove()); });
    wrap.append(button,title,hint); overlay.appendChild(wrap); document.documentElement.appendChild(overlay);
    return {locked:true,reason:"created"};
  })()`;
  try { await view.webContents.executeJavaScript(script, true); } catch { /* készenléti vizuál nem blokkolhatja a runtime-ot */ }
}

function syncWorkspaceStandbyLocks(snapshot = latestLiveSnapshot) {
  for (const cell of config?.cells || []) {
    const view = chatViews.get(cell.id);
    if (!view || view.webContents.isDestroyed()) continue;
    void applyWorkspaceStandbyLock(cell, view, !workerHasAssignedDevelopment(snapshot, cell.workerCode));
  }
}

function chatConfigById(chatId) {
  if (chatId === "central") return config?.centralChat || null;
  return config?.cells?.find((item) => item.id === chatId) || null;
}

function allChatConfigs() {
  return [...(config?.cells || []), ...(config?.centralChat?.enabled === false ? [] : [config.centralChat])];
}


function applyWorkspaceZoom() {
  const zoom = clampZoom(config?.workspaceZoomPercent, 100) / 100;
  for (const view of chatViews.values()) {
    if (!view.webContents.isDestroyed()) view.webContents.setZoomFactor(zoom);
  }
}

function setWorkspaceZoom(zoomPercent) {
  if (!config) return 100;
  config.workspaceZoomPercent = clampZoom(zoomPercent, config.workspaceZoomPercent || 100);
  saveConfig(config);
  applyWorkspaceZoom();
  send("config:state", config);
  send("layout:state", { workspaceZoomPercent: config.workspaceZoomPercent });
  return config.workspaceZoomPercent;
}

function toggleQuietMode() {
  if (!config) return false;
  config.notifications = { ...(config.notifications || {}), quietMode: config.notifications?.quietMode !== true };
  saveConfig(config);
  send("config:state", config);
  sendCentralUiState();
  return config.notifications.quietMode === true;
}

function dispatchShortcutAction(action, source = "local") {
  if (!action) return false;
  const now = Date.now();
  const previous = Number(shortcutDispatchTimestamps.get(action) || 0);
  if (now - previous < SHORTCUT_DEDUPE_MS) return false;
  shortcutDispatchTimestamps.set(action, now);
  handleChatGridShortcut(action);
  send("shortcuts:runtime", { action, source, handledAt: new Date(now).toISOString() });
  return true;
}

function handleLocalShortcutInput(event, input) {
  const action = shortcutActionFromInput(input);
  if (!action) return false;
  event.preventDefault();
  dispatchShortcutAction(action, "local");
  return true;
}

function usageGuideWindowBounds() {
  if (!shellWindow || shellWindow.isDestroyed()) return { x: 100, y: 100, width: 470, height: 760 };
  const bounds = shellWindow.getBounds();
  const width = Math.min(560, Math.max(420, Math.round(bounds.width * 0.31)));
  const height = Math.min(Math.max(520, bounds.height - APP_BAR_HEIGHT - 46), 920);
  return {
    x: Math.round(bounds.x + (bounds.width - width) / 2),
    y: Math.round(bounds.y + APP_BAR_HEIGHT + 18),
    width,
    height
  };
}

function positionUsageGuideWindow() {
  if (!guideWindow || guideWindow.isDestroyed() || !shellWindow || shellWindow.isDestroyed()) return;
  guideWindow.setBounds(usageGuideWindowBounds(), false);
}

function createUsageGuideWindow() {
  if (guideWindow && !guideWindow.isDestroyed()) return guideWindow;
  guideWindow = new BrowserWindow({
    parent: shellWindow || undefined,
    ...usageGuideWindowBounds(),
    minWidth: 390,
    maxWidth: 640,
    minHeight: 480,
    show: false,
    frame: false,
    resizable: true,
    maximizable: false,
    skipTaskbar: true,
    backgroundColor: "#06111b",
    webPreferences: {
      preload: path.join(__dirname, "guide-preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });
  guideWindow.loadFile(path.join(__dirname, "renderer", "guide.html"));
  guideWindow.webContents.on("before-input-event", (event, input) => { handleLocalShortcutInput(event, input); });
  guideWindow.on("close", (event) => {
    if (!appQuitting) { event.preventDefault(); guideWindow.hide(); }
  });
  guideWindow.on("closed", () => { guideWindow = null; });
  return guideWindow;
}

function toggleUsageGuide(force) {
  if (!unlocked) return;
  if (shellWindow?.isMinimized()) shellWindow.restore();
  shellWindow?.show();
  const win = createUsageGuideWindow();
  const shouldShow = typeof force === "boolean" ? force : !win.isVisible();
  if (shouldShow) { positionUsageGuideWindow(); win.show(); win.focus(); }
  else win.hide();
}

function showUsageGuideAfterUnlock() {
  if (config?.usageGuide?.showOnUnlock === false) return;
  setTimeout(() => { if (unlocked) toggleUsageGuide(true); }, 220);
}

function centralUiState() {
  return {
    label: config?.centralChat?.label || "DevminAI",
    appearance: config?.appearance === "light" ? "light" : "dark",
    showAvatars: config?.showAvatars !== false,
    profileVisible: centralProfileVisible,
    quietMode: config?.notifications?.quietMode === true
  };
}

function sendCentralUiState() {
  if (centralWindow && !centralWindow.isDestroyed()) centralWindow.webContents.send("central:state", centralUiState());
}

function centralWindowBounds() {
  const work = screen.getPrimaryDisplay().workArea;
  const saved = config?.centralWindow || {};
  const width = Math.min(work.width, Math.max(640, Number(saved.width) || Math.round(work.width * 0.62)));
  const height = Math.min(work.height, Math.max(480, Number(saved.height) || Math.round(work.height * 0.9)));
  const hasXY = saved.x !== null && saved.y !== null && saved.x !== "" && saved.y !== ""
    && Number.isFinite(Number(saved.x)) && Number.isFinite(Number(saved.y));
  const rawX = hasXY ? Math.round(Number(saved.x)) : Math.round(work.x + (work.width - width) / 2);
  const rawY = hasXY ? Math.round(Number(saved.y)) : Math.round(work.y + (work.height - height) / 2);
  const minVisible = 120;
  const x = Math.min(work.x + work.width - minVisible, Math.max(work.x - width + minVisible, rawX));
  const y = Math.min(work.y + work.height - minVisible, Math.max(work.y, rawY));
  return {
    x,
    y,
    width: Math.round(width),
    height: Math.round(height)
  };
}

function persistCentralWindowState() {
  if (!centralWindow || centralWindow.isDestroyed() || !config) return;
  clearTimeout(centralWindowSaveTimer);
  centralWindowSaveTimer = setTimeout(() => {
    if (!centralWindow || centralWindow.isDestroyed() || !config) return;
    const bounds = centralWindow.getNormalBounds();
    config.centralWindow = { ...bounds, maximized: centralWindow.isMaximized() };
    saveConfig(config);
  }, 250);
}

function updateCentralViewBounds() {
  if (!centralWindow || centralWindow.isDestroyed()) return;
  const view = chatViews.get("central");
  if (!view) return;
  const [width, height] = centralWindow.getContentSize();
  view.setBounds({ x: 0, y: CENTRAL_HEADER_HEIGHT, width: Math.max(0, width), height: Math.max(0, height - CENTRAL_HEADER_HEIGHT) });
  view.setVisible(centralWindow.isVisible() && !centralProfileVisible);
}

function createCentralWindow() {
  if (centralWindow && !centralWindow.isDestroyed()) return centralWindow;
  const bounds = centralWindowBounds();
  centralWindow = new BrowserWindow({
    title: "BENJADMIN Developer Grid — 05 DevminAI",
    icon: AVATAR_ASSETS.DEVMINAI,
    ...bounds,
    minWidth: 640,
    minHeight: 480,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: config?.appearance === "light" ? "#ffffff" : "#071018",
    webPreferences: {
      preload: path.join(__dirname, "central-preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });
  centralWindow.loadFile(path.join(__dirname, "renderer", "central.html"));
  centralWindow.setMenuBarVisibility(false);
  centralWindow.webContents.once("did-finish-load", sendCentralUiState);
  centralWindow.on("resize", () => { updateCentralViewBounds(); persistCentralWindowState(); });
  centralWindow.on("move", persistCentralWindowState);
  centralWindow.on("maximize", persistCentralWindowState);
  centralWindow.on("unmaximize", persistCentralWindowState);
  centralWindow.on("show", () => { centralVisible = true; updateCentralViewBounds(); send("layout:state", { centralVisible: true }); });
  centralWindow.on("hide", () => { centralVisible = false; centralProfileVisible = false; sendCentralUiState(); send("layout:state", { centralVisible: false }); });
  centralWindow.on("close", (event) => {
    if (!appQuitting) { event.preventDefault(); centralWindow.hide(); }
  });
  centralWindow.on("closed", () => { centralWindow = null; centralVisible = false; centralProfileVisible = false; });
  if (config?.centralWindow?.maximized) centralWindow.maximize();
  return centralWindow;
}

function localDayKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function chatRefreshCell(cellId) {
  if (!chatRefreshCells.has(cellId)) {
    chatRefreshCells.set(cellId, {
      cellId,
      lastRefreshedAt: "",
      lastReason: "",
      lastDailyDay: "",
      lastProbedAt: 0,
      updateAvailable: false,
      deferred: false,
      loading: false,
      error: ""
    });
  }
  return chatRefreshCells.get(cellId);
}

function publicChatRefreshState() {
  const cells = Object.fromEntries([...chatRefreshCells.entries()].map(([cellId, value]) => [cellId, { ...value, lastProbedAt: value.lastProbedAt ? new Date(value.lastProbedAt).toISOString() : "" }]));
  const values = Object.values(cells);
  const latest = values.filter((item) => item.lastRefreshedAt).sort((a, b) => a.lastRefreshedAt.localeCompare(b.lastRefreshedAt)).at(-1) || null;
  return {
    cells,
    latestRefreshedAt: latest?.lastRefreshedAt || "",
    latestReason: latest?.lastReason || "",
    dailyEnabled: config?.chatRefresh?.dailyEnabled !== false,
    deferredCount: values.filter((item) => item.deferred).length,
    updateAvailableCount: values.filter((item) => item.updateAvailable).length
  };
}

function emitChatRefreshState() {
  const state = publicChatRefreshState();
  send("chat-refresh:state", state);
  return state;
}

async function inspectChatRefreshSafety(view) {
  if (!view || view.webContents.isDestroyed()) return { busy: true, generating: false, hasDraft: false, updateAvailable: false };
  return view.webContents.executeJavaScript(`(() => {
    const visible = (node) => Boolean(node && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
    const stopSelectors = [
      'button[data-testid="stop-button"]',
      'button[aria-label*="stop" i]',
      'button[aria-label*="leáll" i]'
    ];
    const generating = stopSelectors.some((selector) => visible(document.querySelector(selector)));
    const editors = [...document.querySelectorAll('textarea, [contenteditable="true"]')].filter(visible);
    const hasDraft = editors.some((editor) => String(editor.value ?? editor.innerText ?? editor.textContent ?? "").trim().length > 0);
    const updatePattern = /(refresh|reload|update available|frissít|újratölt|actualizar|mettre à jour|aktualisieren)/i;
    const updateAvailable = [...document.querySelectorAll('button')].filter(visible).some((button) => {
      const label = [button.textContent, button.title, button.getAttribute('aria-label')].filter(Boolean).join(' ');
      return updatePattern.test(label);
    });
    return { busy: generating || hasDraft, generating, hasDraft, updateAvailable };
  })()`, true).catch(() => ({ busy: true, generating: false, hasDraft: false, updateAvailable: false }));
}

async function probeChatRefresh(cellId, view) {
  const cellState = chatRefreshCell(cellId);
  const inspection = await inspectChatRefreshSafety(view);
  cellState.lastProbedAt = Date.now();
  cellState.updateAvailable = inspection.updateAvailable === true;
  return inspection;
}

async function requestChatRefresh(cellId, reason = "manual") {
  const view = chatViews.get(cellId);
  if (!view || view.webContents.isDestroyed()) return { refreshed: false, deferred: false, error: "A ChatGPT nézet nincs megnyitva." };
  const inspection = await probeChatRefresh(cellId, view);
  const cellState = chatRefreshCell(cellId);
  if (inspection.busy) {
    cellState.deferred = true;
    cellState.error = inspection.generating ? "Aktív válaszgenerálás" : "Beírt, el nem küldött szöveg";
    emitChatRefreshState();
    return { refreshed: false, deferred: true, error: cellState.error };
  }
  cellState.deferred = false;
  cellState.loading = true;
  cellState.error = "";
  pendingChatRefreshReasons.set(cellId, reason);
  view.webContents.reloadIgnoringCache();
  emitChatRefreshState();
  return { refreshed: true, deferred: false };
}

async function refreshOpenChatViews(reason = "manual-all") {
  let refreshed = 0;
  let deferred = 0;
  for (const cellId of chatViews.keys()) {
    const result = await requestChatRefresh(cellId, reason);
    if (result.refreshed) refreshed += 1;
    if (result.deferred) deferred += 1;
  }
  return { ok: true, refreshed, deferred, state: emitChatRefreshState() };
}

async function maintainChatRefresh() {
  if (!unlocked || chatRefreshMaintenanceBusy) return;
  chatRefreshMaintenanceBusy = true;
  try {
    const today = localDayKey();
    const now = Date.now();
    for (const [cellId, view] of chatViews.entries()) {
      const cellState = chatRefreshCell(cellId);
      let inspection = null;
      if (!cellState.lastProbedAt || now - cellState.lastProbedAt >= CHAT_REFRESH_PROBE_MS) inspection = await probeChatRefresh(cellId, view);
      if (config?.chatRefresh?.dailyEnabled === false || cellState.lastDailyDay === today) continue;
      if (!inspection) inspection = await probeChatRefresh(cellId, view);
      if (inspection.busy) {
        cellState.deferred = true;
        cellState.error = inspection.generating ? "Aktív válaszgenerálás" : "Beírt, el nem küldött szöveg";
        continue;
      }
      await requestChatRefresh(cellId, "daily-safe");
    }
    emitChatRefreshState();
  } finally {
    chatRefreshMaintenanceBusy = false;
  }
}

function startChatRefreshMaintenance() {
  if (chatRefreshTimer) clearInterval(chatRefreshTimer);
  chatRefreshTimer = setInterval(() => void maintainChatRefresh(), CHAT_REFRESH_MAINTENANCE_MS);
}

function stopChatRefreshMaintenance() {
  if (chatRefreshTimer) clearInterval(chatRefreshTimer);
  chatRefreshTimer = null;
}

function createChatView(cell) {
  const hostWindow = cell?.id === "central" ? createCentralWindow() : shellWindow;
  if (!hostWindow || !unlocked || !cell?.enabled || chatViews.has(cell.id)) return;
  const view = new WebContentsView({
    webPreferences: {
      partition: CHAT_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true
    }
  });
  view.setBackgroundColor("#0b1017");
  const browserUa = view.webContents.getUserAgent().replace(/\sElectron\/\S+/i, "");
  view.webContents.setUserAgent(browserUa);
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (!allowedChatUrl(url)) return { action: "deny" };
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        title: APP_TITLE,
        autoHideMenuBar: true,
        webPreferences: { partition: CHAT_PARTITION, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
      }
    };
  });
  view.webContents.on("will-navigate", (event, url) => {
    if (!allowedChatUrl(url)) event.preventDefault();
  });
  view.webContents.on("did-navigate", (_event, url) => rememberChatNavigation(cell.id, url));
  view.webContents.on("did-navigate-in-page", (_event, url, isMainFrame) => { if (isMainFrame) rememberChatNavigation(cell.id, url); });
  view.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) {
      const refreshState = chatRefreshCell(cell.id);
      refreshState.loading = false;
      refreshState.error = `${description} (${code})`;
      send("live:connection", { kind: "chat", cellId: cell.id, ok: false, error: refreshState.error, url });
      emitChatRefreshState();
    }
  });
  view.webContents.on("did-finish-load", () => {
    const refreshState = chatRefreshCell(cell.id);
    refreshState.lastRefreshedAt = new Date().toISOString();
    refreshState.lastReason = pendingChatRefreshReasons.get(cell.id) || (refreshState.lastReason ? "navigation" : "startup");
    refreshState.lastDailyDay = localDayKey();
    refreshState.deferred = false;
    refreshState.loading = false;
    refreshState.error = "";
    pendingChatRefreshReasons.delete(cell.id);
    applyWorkspaceZoom();
    void applyChatWatermark(cell, view);
    if (cell.id !== "central") void applyWorkspaceStandbyLock(cell, view, !workerHasAssignedDevelopment(latestLiveSnapshot, cell.workerCode));
    send("live:connection", { kind: "chat", cellId: cell.id, ok: true });
    emitChatRefreshState();
    setTimeout(() => void probeChatRefresh(cell.id, view).then(() => emitChatRefreshState()), 2200);
    setTimeout(() => void selectLatestNamedConversation(cell, view), 1400);
  });
  view.webContents.on("before-input-event", (event, input) => {
    if (cell.id === "central" && input.type === "keyDown" && input.key === "F11" && centralWindow && !centralWindow.isDestroyed()) {
      event.preventDefault();
      centralWindow.setFullScreen(!centralWindow.isFullScreen());
      return;
    }
    if (cell.id === "central" && input.type === "keyDown" && input.key === "Escape" && centralWindow?.isFullScreen()) {
      event.preventDefault();
      centralWindow.setFullScreen(false);
      return;
    }
    if (handleLocalShortcutInput(event, input)) return;
    if (handleLargePasteShortcut(event, input, view, cell)) return;
    if (!input.control || input.alt) return;
    if (["+", "=", "Add"].includes(input.key)) { event.preventDefault(); setWorkspaceZoom((config.workspaceZoomPercent || 100) + 10); }
    else if (["-", "Subtract"].includes(input.key)) { event.preventDefault(); setWorkspaceZoom((config.workspaceZoomPercent || 100) - 10); }
    else if (input.key === "0") { event.preventDefault(); setWorkspaceZoom(100); }
  });
  hostWindow.contentView.addChildView(view);
  chatViews.set(cell.id, view);
  void view.webContents.loadURL(cell.url).catch((error) => send("live:connection", { kind: "chat", cellId: cell.id, ok: false, error: error.message }));
}

function createEnabledChatViews() {
  if (!unlocked) return;
  for (const cell of config.cells) createChatView(cell);
  updateViewBounds();
}

const largePasteNativeFallbackIds = new Set();
const LARGE_PASTE_THRESHOLD = 6000;
const LARGE_PASTE_MAX_CHARS = 250000;
const LARGE_PASTE_CHUNK = 12000;

async function insertLargeClipboardText(view, sourceText) {
  if (!view || view.webContents.isDestroyed()) return { ok: false, error: "A ChatGPT felület nem érhető el." };
  const value = String(sourceText || "");
  if (!value) return { ok: false, error: "A vágólap nem tartalmaz szöveget." };
  if (value.length > LARGE_PASTE_MAX_CHARS) {
    return { ok: false, error: `A bemásolt szöveg ${value.length.toLocaleString("hu-HU")} karakter. Egy művelettel legfeljebb ${LARGE_PASTE_MAX_CHARS.toLocaleString("hu-HU")} karakter illeszthető be; bontsd két részre.`, chars: value.length };
  }
  await waitForChatComposer(view);
  const literal = JSON.stringify(value);
  const chunkSize = LARGE_PASTE_CHUNK;
  return view.webContents.executeJavaScript(`(() => {
    const startedAt = performance.now();
    const text = ${literal};
    const chunkSize = ${chunkSize};
    const selectors = [
      '#prompt-textarea',
      'textarea[data-testid="prompt-textarea"]',
      '[data-testid="prompt-textarea"][contenteditable="true"]',
      'main form [contenteditable="true"]'
    ];
    let composer = null;
    for (const selector of selectors) {
      const candidate = document.querySelector(selector);
      if (candidate && candidate.getClientRects().length) { composer = candidate; break; }
    }
    if (!composer) return { ok: false, reason: 'composer-not-found', error: 'A ChatGPT beviteli mező nem található.' };
    const active = document.activeElement;
    const composerFocused = active === composer || (active && composer.contains(active));
    if (!composerFocused) return { ok: false, reason: 'composer-not-focused', error: 'A ChatGPT composer nincs fókuszban.' };
    composer.focus();
    if (composer instanceof HTMLTextAreaElement) {
      const before = String(composer.value || '');
      const start = Number.isFinite(composer.selectionStart) ? composer.selectionStart : before.length;
      const end = Number.isFinite(composer.selectionEnd) ? composer.selectionEnd : start;
      const next = before.slice(0, start) + text + before.slice(end);
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(composer, next); else composer.value = next;
      const caret = start + text.length;
      try { composer.setSelectionRange(caret, caret); } catch {}
      composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null }));
      return { ok: String(composer.value || '').length === next.length, chars: text.length, totalChars: next.length, mode: 'textarea', elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)) };
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !composer.contains(selection.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(composer);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    let insertedChars = 0;
    for (let offset = 0; offset < text.length; offset += chunkSize) {
      const chunk = text.slice(offset, offset + chunkSize);
      let inserted = false;
      try { inserted = document.execCommand('insertText', false, chunk); } catch { inserted = false; }
      if (!inserted) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return { ok: false, error: 'A nagy beillesztés kurzorpozíciója elveszett.', chars: insertedChars };
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(chunk);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null }));
      }
      insertedChars += chunk.length;
    }
    const currentLength = String(composer.innerText || composer.textContent || '').length;
    return { ok: insertedChars === text.length, chars: insertedChars, totalChars: currentLength, mode: 'contenteditable', elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)) };
  })()`, true).catch((error) => ({ ok: false, error: error?.message || "A nagy beillesztés végrehajtása sikertelen." }));
}

function handleLargePasteShortcut(event, input, view, cell) {
  if (input?.type !== "keyDown" || !input.control || input.alt || String(input.key || "").toLowerCase() !== "v") return false;
  const contentsId = view?.webContents?.id;
  if (contentsId && largePasteNativeFallbackIds.has(contentsId)) { largePasteNativeFallbackIds.delete(contentsId); return false; }
  const value = clipboard.readText();
  if (value.length < LARGE_PASTE_THRESHOLD) return false;
  event.preventDefault();
  void insertLargeClipboardText(view, value).then((result) => {
    if (result?.reason === "composer-not-focused") {
      if (contentsId) largePasteNativeFallbackIds.add(contentsId);
      view.webContents.paste();
      return;
    }
    send("live:connection", {
      kind: "large-paste",
      cellId: cell?.id || "",
      workerCode: cell?.workerCode || "",
      ok: result?.ok === true,
      chars: Number(result?.chars || value.length),
      totalChars: Number(result?.totalChars || 0),
      elapsedMs: Number(result?.elapsedMs || 0),
      error: result?.error || ""
    });
  });
  return true;
}

async function waitForChatComposer(view, timeoutMs = 9000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!view || view.webContents.isDestroyed()) return false;
    if (!view.webContents.isLoadingMainFrame()) return true;
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  return false;
}

async function insertWorkerTaskPrompt(view, prompt, expectedMarker = "") {
  if (!view || view.webContents.isDestroyed()) return { inserted: false, reason: "chat-unavailable", existingKind: "NONE" };
  await waitForChatComposer(view);
  const literal = JSON.stringify(String(prompt || ""));
  const markerLiteral = JSON.stringify(String(expectedMarker || ""));
  return view.webContents.executeJavaScript(`(() => {
    const text = ${literal};
    const marker = ${markerLiteral};
    const selectors = [
      '#prompt-textarea',
      'textarea[data-testid="prompt-textarea"]',
      '[data-testid="prompt-textarea"][contenteditable="true"]',
      'main form [contenteditable="true"]'
    ];
    let composer = null;
    for (const selector of selectors) {
      const candidate = document.querySelector(selector);
      if (candidate && candidate.getClientRects().length) { composer = candidate; break; }
    }
    if (!composer) return { inserted: false, reason: 'composer-not-found', existingKind: 'NONE' };
    const read = () => String(composer instanceof HTMLTextAreaElement ? composer.value : (composer.innerText || composer.textContent || ''));
    const classify = (value) => value.includes('BENJADMIN_PROMPT_KIND: HANDOFF_V2') ? 'HANDOFF_V2'
      : value.includes('BENJADMIN_PROMPT_KIND: TASK_LAUNCH_V3') ? 'TASK_LAUNCH_V3'
      : value.includes('BENJADMIN_PROMPT_KIND: TASK_LAUNCH_V2') ? 'TASK_LAUNCH_V2'
      : value.includes('ÁTADÁSI FELADAT – BENJADMIN CHATGRID · HANDOFF V2') && value.includes('BENJADMIN_HANDOFF_META_V2') ? 'HANDOFF_V2_LEGACY'
      : value.includes('új BENJADMIN fejlesztési feladat érkezett') && value.includes('MUNKAFELVÉTEL:') ? 'TASK_LAUNCH_LEGACY'
      : value.trim() ? 'OTHER' : 'EMPTY';
    const existing = read();
    const existingKind = classify(existing);
    if (existing.trim()) {
      if (marker && existing.includes(marker)) return { inserted: true, reason: 'already-present', existingKind, verifiedMarker: true };
      return { inserted: false, reason: 'composer-not-empty', existingKind, existingPreview: existing.trim().slice(0, 180) };
    }
    composer.focus();
    if (composer instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(composer, text); else composer.value = text;
      composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      const current = read();
      const verifiedMarker = !marker || current.includes(marker);
      return { inserted: current === text && verifiedMarker, reason: current === text && verifiedMarker ? '' : 'textarea-update-failed', existingKind: classify(current), verifiedMarker };
    }
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(composer);
    selection?.removeAllRanges();
    selection?.addRange(range);
    let inserted = false;
    try { inserted = document.execCommand('insertText', false, text); } catch { inserted = false; }
    if (!inserted) {
      composer.replaceChildren();
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      composer.append(paragraph);
      composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
    const current = read();
    const verifiedMarker = !marker || current.includes(marker);
    const verifiedText = current.includes(text.slice(0, Math.min(80, text.length)));
    return { inserted: verifiedMarker && verifiedText, reason: verifiedMarker && verifiedText ? '' : 'contenteditable-update-failed', existingKind: classify(current), verifiedMarker };
  })()`, true).catch(() => ({ inserted: false, reason: "execute-failed", existingKind: "NONE" }));
}

async function sendPreparedChatPrompt(view, expectedMarker = "") {
  if (!view || view.webContents.isDestroyed()) return { sent: false, reason: "chat-unavailable" };
  await waitForChatComposer(view);
  const markerLiteral = JSON.stringify(String(expectedMarker || ""));
  return view.webContents.executeJavaScript(`(async () => {
    const marker = ${markerLiteral};
    const selectors = ['#prompt-textarea','textarea[data-testid="prompt-textarea"]','[data-testid="prompt-textarea"][contenteditable="true"]','main form [contenteditable="true"]'];
    let composer = null;
    for (const selector of selectors) { const candidate = document.querySelector(selector); if (candidate && candidate.getClientRects().length) { composer = candidate; break; } }
    if (!composer) return { sent:false, reason:'composer-not-found' };
    const read = () => String(composer instanceof HTMLTextAreaElement ? composer.value : (composer.innerText || composer.textContent || ''));
    if (marker && !read().includes(marker)) return { sent:false, reason:'marker-mismatch' };
    const buttons = [
      document.querySelector('button[data-testid="send-button"]'),
      document.querySelector('form button[type="submit"]'),
      ...Array.from(document.querySelectorAll('button')).filter((button) => /^(send|küldés|küld)$/i.test(String(button.getAttribute('aria-label') || button.textContent || '').trim()))
    ].filter(Boolean);
    const send = buttons.find((button) => !button.disabled && button.getClientRects().length);
    if (!send) return { sent:false, reason:'send-button-not-found' };
    send.click();
    const started = Date.now();
    while (Date.now() - started < 3000) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      const generating = Boolean(document.querySelector('button[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="Leáll"]'));
      if (!read().trim() || generating) return { sent:true, verified:true, generating };
    }
    return { sent:true, verified:false, reason:'send-not-observed' };
  })()`, true).catch(() => ({ sent:false, reason:"execute-failed" }));
}

function launchTaskFromWork(work, chatPlan = null) {
  const session = work?.session || null;
  const task = work?.task || null;
  const code = assignedWorkerCodeFromWork(work);
  if (!session || !task || !code) return null;
  return {
    ...task,
    status: String(task.status || "READY").toLowerCase(),
    assignedWorkerId: code,
    requestedWorkerId: code,
    branchName: session.sourceProvenance?.branch || null,
    worktreePath: session.sourceProvenance?.worktree || null,
    sourceHead: session.sourceProvenance?.head || null,
    sessionId: session.id || null,
    scopeText: session.developmentContext?.moduleName ? `module:${session.developmentContext.moduleName}` : "",
    acceptanceText: Array.isArray(task.acceptance) ? task.acceptance.join("\n") : "",
    chatLaunchMode: session.developmentContext?.chatLaunchMode || chatPlan?.chatLaunchMode || null,
  };
}

function bootAckExpected(task, workerCode) {
  return {
    workerCode,
    taskId: String(task?.id || ""),
    sessionId: String(task?.sessionId || ""),
    branch: String(task?.branchName || ""),
    worktree: String(task?.worktreePath || ""),
    baseHead: String(task?.sourceHead || ""),
  };
}

async function sendBootAckAcceptedContinuation(view, task, workerCode) {
  const marker = "BENJADMIN_PROMPT_KIND: BOOT_ACK_ACCEPTED_V1";
  const prompt = [
    marker,
    "BENJADMIN CONTROL EVENT · BOOT_ACK_VALIDATED",
    `Worker: ${workerCode}`,
    `Task: ${task.id}`,
    `Session: ${task.sessionId}`,
    `Branch: ${task.branchName}`,
    `Worktree: ${task.worktreePath}`,
    `Base HEAD: ${task.sourceHead}`,
    "DEV ONLY · PROD DENY.",
    "Az authoritative BOOT ACK egyezik a Launch Packettel. Folytasd a feladatot a rögzített scope és acceptance szerint. Scope-, source-, lock- vagy környezeteltérés esetén azonnal állj meg és jelents BLOCKER_REPORTED / SOURCE_BASELINE_MISMATCH állapotot."
  ].join("\n");
  const insertion = await insertWorkerTaskPrompt(view, prompt, marker);
  if (insertion?.inserted !== true || insertion?.verifiedMarker !== true) return { sent:false, reason: insertion?.reason || "continuation-not-inserted" };
  return sendPreparedChatPrompt(view, marker);
}

async function monitorWorkerBootAck({ view, task, workerCode, baselineResponseSha256 = "" }) {
  const taskId = String(task?.id || "");
  if (!taskId || !task?.sessionId) return;
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline && view && !view.webContents.isDestroyed()) {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const capture = await captureLatestAssistantText(view);
    if (!capture?.ok || capture.generating || !String(capture.text || "").trim()) continue;
    const body = String(capture.text || "");
    const responseSha256 = createHash("sha256").update(body).digest("hex");
    if (baselineResponseSha256 && responseSha256 === baselineResponseSha256) continue;
    if (!/BOOT\s+ACKNOWLEDGEMENT/i.test(body)) continue;
    const validation = validateBootAcknowledgement(body, bootAckExpected(task, workerCode));
    const parsed = validation.parsed || {};
    const persisted = await recordDeveloperGridBootAck({
      baseUrl: config.benjadminBaseUrl,
      deviceToken: readDeviceToken(),
      input: {
        taskId, workerCode, sessionId: task.sessionId, responseSha256,
        codingAllowed: validation.validated === true && parsed.codingAllowed === true,
        branch: parsed.branch || "", worktree: parsed.worktree || "", baseHead: parsed.baseHead || "",
        mismatches: validation.mismatches || [validation.code || "BOOT_ACK_INVALID"],
      },
    }).catch((error) => ({ state:"BLOCKED", validated:false, mismatches:[error.message || "BOOT_ACK_PERSIST_FAILED"] }));
    const local = saveTaskLaunchPatch(task, workerCode, {
      ackState: persisted?.validated === true ? "VALIDATED" : "BLOCKED",
      ackAt: new Date().toISOString(), ackSha256: responseSha256,
      ackMismatches: Array.isArray(persisted?.mismatches) ? persisted.mismatches : (validation.mismatches || []),
    });
    if (latestLiveSnapshot) send("live:snapshot", enrichSnapshotWithTaskLaunch(latestLiveSnapshot));
    send("context:refresh", { reason: persisted?.validated === true ? "boot-ack-validated" : "boot-ack-blocked", taskId, sessionId: task.sessionId });
    if (persisted?.validated !== true) return;
    const continuation = await sendBootAckAcceptedContinuation(view, task, workerCode);
    const patch = continuation?.sent && continuation?.verified
      ? { ackContinuationSentAt: new Date().toISOString(), ackContinuationState: "SENT" }
      : { ackContinuationState: "MANUAL_REQUIRED", ackContinuationError: continuation?.reason || "not-verified" };
    saveTaskLaunchPatch(task, workerCode, patch);
    if (latestLiveSnapshot) send("live:snapshot", enrichSnapshotWithTaskLaunch(latestLiveSnapshot));
    return;
  }
  saveTaskLaunchPatch(task, workerCode, { ackState:"BLOCKED", ackMismatches:["BOOT_ACK_TIMEOUT"], ackAt:new Date().toISOString() });
  if (latestLiveSnapshot) send("live:snapshot", enrichSnapshotWithTaskLaunch(latestLiveSnapshot));
}

async function bindCurrentTaskConversation(workerCode, taskId, { automatic = false, taskOverride = null, launchAfterBind = false } = {}) {
  if (!unlocked) return { ok: false, error: "A Developer Grid zárolva van." };
  const code = String(workerCode || "").toUpperCase();
  const id = String(taskId || "");
  const cell = config?.cells?.find((item) => item.workerCode === code && item.enabled !== false);
  if (!cell) return { ok: false, error: "A worker nincs aktív Developer Grid cellához rendelve." };
  const task = taskOverride || latestLiveSnapshot?.tasks?.find((item) => String(item.id) === id);
  if (!task) return { ok: false, error: "A BENJADMIN task nem érhető el az élő állapotban." };
  let view = chatViews.get(cell.id);
  if (!view) { createChatView(cell); updateViewBounds(); view = chatViews.get(cell.id); }
  if (!view || view.webContents.isDestroyed()) return { ok: false, error: "A worker ChatGPT felülete nem nyitható meg." };
  const url = view.webContents.getURL();
  const conversationId = chatConversationIdFromUrl(url);
  if (!conversationId) return { ok: false, code: "TASK_CHAT_CONVERSATION_REQUIRED", error: "Nyisd meg a használni kívánt ChatGPT csevegést (/c/...), majd rögzítsd újra." };
  const record = loadTaskLaunchRecords()[id] || {};
  const chatLaunchMode = String(record.chatLaunchMode || task.chatLaunchMode || "EXISTING_CHAT").toUpperCase() === "NEW_PROJECT_CHAT" ? "NEW_PROJECT_CHAT" : "EXISTING_CHAT";
  const previousConversationId = String(record.previousConversationId || "");
  if (chatLaunchMode === "NEW_PROJECT_CHAT" && previousConversationId && conversationId === previousConversationId) {
    return { ok: false, code: "TASK_NEW_PROJECT_CHAT_REQUIRED", error: "Még a korábbi csevegés van nyitva. Hozz létre egy új csevegést a megfelelő ChatGPT Projektben, majd kattints ismét a CSEVEGÉS RÖGZÍTÉSE gombra." };
  }
  const info = await getConversationInfo(view, cell, config.cells || []);
  const binding = await bindDeveloperGridConversation({ baseUrl: config.benjadminBaseUrl, deviceToken: readDeviceToken(), input: {
    taskId: id, workerCode: code, chatLaunchMode, chatPreviousConversationId: previousConversationId || null,
    chatConversationId: conversationId, chatConversationUrl: url, chatConversationTitle: info.chatTitle || "",
  }});
  const chatLaunch = saveTaskLaunchPatch(task, code, {
    chatLaunchMode, previousConversationId: previousConversationId || null, conversationBound: true,
    chatSessionId: conversationId, chatConversationUrl: url, chatTitle: info.chatTitle || "",
    chatConversationConfirmedAt: binding?.chatConversationConfirmedAt || new Date().toISOString(), automatic: automatic === true,
  });
  if (latestLiveSnapshot) send("live:snapshot", enrichSnapshotWithTaskLaunch(latestLiveSnapshot));
  let taskLaunch = null;
  if (launchAfterBind) taskLaunch = await prepareWorkerTaskLaunch(code, id, { autoSend:true, taskOverride:taskOverride || task });
  return {
    ok: true, binding, chatLaunch: taskLaunch?.chatLaunch || chatLaunch, taskLaunch,
    message: taskLaunch?.ok && taskLaunch?.mode === "sent"
      ? "A csevegés rögzítve és a Launch Packet elküldve. BOOT ACK validáció folyamatban."
      : chatLaunchMode === "NEW_PROJECT_CHAT" ? "Az új projektcsevegés rögzítve. A feladat indításra kész." : "A meglévő csevegés rögzítve. A feladat indításra kész."
  };
}

function assignedWorkerCodeFromWork(work) {
  const raw = String(work?.session?.workerCode || "").toUpperCase();
  return raw === "BENJAMINAI" ? "BENAI" : raw;
}

async function initializeTaskChatPlan(work, requestedMode, conversationGuards = []) {
  const task = work?.task;
  const code = assignedWorkerCodeFromWork(work);
  if (!task?.id || !code) return null;
  const cell = config?.cells?.find((item) => item.workerCode === code && item.enabled !== false);
  const guard = cell ? conversationGuards.find((item) => item.cellId === cell.id) : null;
  const previousConversationId = chatConversationIdFromUrl(guard?.url || "");
  const chatLaunchMode = String(requestedMode || "EXISTING_CHAT").toUpperCase() === "NEW_PROJECT_CHAT" ? "NEW_PROJECT_CHAT" : "EXISTING_CHAT";
  let record = saveTaskLaunchPatch(task, code, { chatLaunchMode, previousConversationId: previousConversationId || null, conversationBound: false, preparedAt: null, mode: null });
  if (chatLaunchMode === "EXISTING_CHAT" && previousConversationId) {
    const bound = await bindCurrentTaskConversation(code, task.id, { automatic: true, taskOverride: task }).catch((error) => ({ ok: false, error: error.message }));
    if (bound?.ok) record = bound.chatLaunch;
  }
  return record;
}

async function prepareWorkerTaskLaunch(workerCode, taskId, { autoSend = false, taskOverride = null } = {}) {
  if (!unlocked) return { ok: false, error: "A ChatGrid zárolva van." };
  try {
    if (new URL(config?.benjadminBaseUrl || "").hostname !== "admin.dev.dimpro.hu") return { ok: false, error: "Worker Task Launch kizárólag BENJADMIN DEV kapcsolaton engedélyezett. PROD DENY." };
  } catch { return { ok: false, error: "Érvénytelen BENJADMIN DEV kapcsolat. Worker Task Launch tiltva." }; }
  const code = String(workerCode || "").toUpperCase();
  const id = String(taskId || "");
  const cell = config?.cells?.find((item) => item.workerCode === code && item.enabled !== false);
  if (!cell) return { ok: false, error: "A worker nincs aktív ChatGrid cellához rendelve." };
  const snapshot = latestLiveSnapshot;
  const task = taskOverride || snapshot?.tasks?.find((item) => String(item.id) === id);
  const worker = snapshot?.workers?.find((item) => item.code === code) || (taskOverride ? { id: code, code, name: cell.label } : null);
  if (!worker || !task) return { ok: false, error: "A BENJADMIN task már nem érhető el az élő állapotban." };
  const assignedWorkerId = task.assignedWorkerId || task.requestedWorkerId;
  if (!taskOverride && assignedWorkerId !== worker.id) return { ok: false, error: "A task nem ehhez a workerhez van kiosztva." };
  const launchRecord = loadTaskLaunchRecords()[id] || {};
  const launchProbe = { ...task, chatLaunchMode: task.chatLaunchMode || launchRecord.chatLaunchMode || null };
  if (!isTaskAwaitingChatLaunch(launchProbe)) return { ok: false, error: "A task már nem vár ChatGPT indításra." };
  const launchGate = taskLaunchGate(task);
  if (!launchGate.ok) return { ok: false, code: launchGate.code, error: launchGate.error };
  if (launchRecord.chatLaunchMode && launchRecord.conversationBound !== true) {
    return { ok: false, code: "TASK_CHAT_NOT_BOUND", error: launchRecord.chatLaunchMode === "NEW_PROJECT_CHAT" ? "Előbb hozd létre a megfelelő ChatGPT Projektben az új csevegést, majd használd a CSEVEGÉS RÖGZÍTÉSE gombot." : "Előbb rögzítsd a használni kívánt meglévő csevegést." };
  }

  let view = chatViews.get(cell.id);
  if (!view) { createChatView(cell); updateViewBounds(); view = chatViews.get(cell.id); }
  if (!view) return { ok: false, error: "A worker ChatGPT felülete nem nyitható meg." };
  const launchConversation = await getConversationInfo(view, cell, config.cells || []);
  const currentConversationId = chatConversationIdFromUrl(view.webContents.getURL());
  if (launchRecord.chatSessionId && currentConversationId !== launchRecord.chatSessionId) return { ok: false, code: "TASK_CHAT_CONVERSATION_MISMATCH", error: "Nem a taskhoz rögzített ChatGPT csevegés van nyitva. Nyisd vissza a rögzített beszélgetést, vagy rögzíts új csevegést a taskhoz." };
  if (handoffBlocksTaskLaunch(code, launchConversation.chatSessionId)) return { ok: false, error: "Ebben a csevegésben az ÁTADÁS folyamat aktív vagy helyreállítást igényel. Task indítás tiltva." };
  if (shellWindow) {
    if (shellWindow.isMinimized()) shellWindow.restore();
    shellWindow.show();
    shellWindow.focus();
  }
  if (maximizedCellId && maximizedCellId !== cell.id) maximizedCellId = null;
  if (config.layoutMode === "split2" && ![config.splitView?.left, config.splitView?.right].includes(cell.id)) config.layoutMode = "grid4";
  updateViewBounds();
  view.webContents.focus();

  const presence = snapshot?.workerPresence?.find((item) => item.workerCode === code) || null;
  const baselineCapture = await captureLatestAssistantText(view);
  const baselineResponseSha256 = baselineCapture?.ok ? createHash("sha256").update(String(baselineCapture.text || "")).digest("hex") : "";
  const contextPack = contextPackPromptForWorker(code);
  const prompt = `${buildWorkerTaskPrompt({ task, workerCode: code, workerLabel: cell.label, presence })}${contextPack ? `\n\n${contextPack}` : ""}`;
  const insertion = await insertWorkerTaskPrompt(view, prompt, TASK_LAUNCH_PROMPT_MARKER);
  if (insertion?.inserted !== true || insertion?.verifiedMarker !== true) {
    const detail = ["HANDOFF_V2", "HANDOFF_V2_LEGACY"].includes(insertion?.existingKind)
      ? "A ChatGPT mezőben HANDOFF V2 prompt van; task indítás nem írhatja felül."
      : ["TASK_LAUNCH_V3", "TASK_LAUNCH_V2"].includes(insertion?.existingKind)
        ? "A ChatGPT mezőben már van TASK_LAUNCH prompt. Előbb kezeld vagy töröld a draftot."
        : insertion?.reason === "composer-not-empty"
          ? "A ChatGPT mező nem üres. A ChatGrid fail-closed módban nem írja felül."
          : "A TASK_LAUNCH prompt nem volt igazolható a ChatGPT mezőben.";
    return { ok: false, code: "TASK_PROMPT_NOT_INSERTED", error: detail, insertion };
  }
  const mode = "inserted";
  let chatLaunch = saveTaskLaunchPatch(task, code, { preparedAt: new Date().toISOString(), mode, baselineResponseSha256 });
  if (autoSend) {
    const sent = await sendPreparedChatPrompt(view, TASK_LAUNCH_PROMPT_MARKER);
    if (sent?.sent !== true || sent?.verified !== true) {
      chatLaunch = saveTaskLaunchPatch(task, code, { autoSendState:"MANUAL_REQUIRED", autoSendError:sent?.reason || "not-verified" });
      if (latestLiveSnapshot) send("live:snapshot", enrichSnapshotWithTaskLaunch(latestLiveSnapshot));
      return { ok:false, code:"TASK_PROMPT_SEND_NOT_VERIFIED", chatLaunch, error:"A Launch Packet a ChatGPT mezőben van, de az automatikus elküldés nem volt igazolható. A rendszer fail-closed; ellenőrizd és küldd el kézzel." };
    }
    chatLaunch = saveTaskLaunchPatch(task, code, { sentAt:new Date().toISOString(), autoSendState:"SENT", ackState:"WAITING", ackMismatches:[] });
    void monitorWorkerBootAck({ view, task, workerCode:code, baselineResponseSha256 }).catch(() => undefined);
  }
  if (latestLiveSnapshot) send("live:snapshot", enrichSnapshotWithTaskLaunch(latestLiveSnapshot));
  return {
    ok: true, mode: autoSend ? "sent" : mode, chatLaunch,
    message: autoSend
      ? "A Launch Packet elküldve a kijelölt workernek. BOOT ACK validáció folyamatban; kódolás addig fail-closed."
      : "A TASK_LAUNCH prompt igazoltan a worker ChatGPT mezőjében van. Ellenőrizd, majd kézzel küldd el."
  };
}

async function monitorWorkerStageReport({ view, workerCode, task, baselineResponseSha256 = "" }) {
  const backendWorkerCode = workerCode === "BENAI" ? "BENJAMINAI" : workerCode;
  const monitorKey = `${backendWorkerCode}:${task?.id || ""}:${task?.sessionId || ""}`;
  if (!task?.id || !task?.sessionId || !view || view.webContents.isDestroyed() || stageReportMonitorKeys.has(monitorKey)) return;
  stageReportMonitorKeys.add(monitorKey);
  const deadline = Date.now() + 15 * 60_000;
  try {
    while (Date.now() < deadline && view && !view.webContents.isDestroyed()) {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      const capture = await captureLatestAssistantText(view);
      if (!capture?.ok || capture.generating) continue;
      const body = String(capture.text || "");
      if (!body.includes(STAGE_REPORT_START)) continue;
      const responseSha256 = createHash("sha256").update(body).digest("hex");
      if (baselineResponseSha256 && responseSha256 === baselineResponseSha256) continue;
      const parsed = parseDeveloperGridStageReport(body);
      if (!parsed?.ok || !parsed.report) continue;
      const report = parsed.report;
      if (report.workerCode !== backendWorkerCode || report.taskId !== String(task.id) || report.sessionId !== String(task.sessionId)) {
        send("context:refresh", { reason:"stage-report-identity-blocked", taskId:task.id, workerCode:backendWorkerCode });
        return;
      }
      const result = await submitDeveloperGridEvidence({
        baseUrl:config.benjadminBaseUrl, deviceToken:readDeviceToken(),
        input:{ taskId:report.taskId, sessionId:report.sessionId, workerCode:report.workerCode, head:report.head, stage:report.stage, entries:report.evidence },
      }).catch((error) => ({ error:error instanceof Error ? error.message : "STAGE_REPORT_EVIDENCE_FAILED" }));
      send("context:refresh", { reason: result?.error ? "stage-report-evidence-blocked" : "stage-report-evidence-recorded", taskId:task.id, workerCode:backendWorkerCode, count:result?.count || 0 });
      return;
    }
  } finally { stageReportMonitorKeys.delete(monitorKey); }
}

async function prepareWorkerStageAction(workerCode, action) {
  if (!unlocked) return { ok: false, error: "A Developer Grid zárolva van." };
  try {
    if (new URL(config?.benjadminBaseUrl || "").hostname !== "admin.dev.dimpro.hu") return { ok: false, error: "Stage action kizárólag BENJADMIN DEV kapcsolaton engedélyezett. PROD DENY." };
  } catch { return { ok: false, error: "Érvénytelen BENJADMIN DEV kapcsolat." }; }
  const code = String(workerCode || "").toUpperCase();
  const cell = config?.cells?.find((item) => item.workerCode === code && item.enabled !== false);
  if (!cell) return { ok: false, error: "A worker nincs aktív Developer Grid cellához rendelve." };
  const { presence, task } = liveContextForWorker(code);
  if (!task) return { ok: false, error: "Nincs authoritative aktuális task ehhez a workerhez." };
  if (!task.sessionId || !/^[0-9a-f]{40}$/i.test(String(task.sourceHead || ""))) return { ok:false, error:"A stage actionhoz authoritative sessionId és 40 karakteres source HEAD szükséges." };
  const prompt = buildStageActionPrompt({ action, workerCode: code, workerLabel: cell.label, task, presence });
  let view = chatViews.get(cell.id);
  if (!view) { createChatView(cell); updateViewBounds(); view = chatViews.get(cell.id); }
  if (!view) return { ok: false, error: "A worker ChatGPT felülete nem nyitható meg." };
  if (shellWindow) {
    if (shellWindow.isMinimized()) shellWindow.restore();
    shellWindow.show();
    shellWindow.focus();
  }
  const baselineCapture = await captureLatestAssistantText(view);
  const baselineResponseSha256 = baselineCapture?.ok ? createHash("sha256").update(String(baselineCapture.text || "")).digest("hex") : "";
  view.webContents.focus();
  const marker = "BENJADMIN_PROMPT_KIND: DEVELOPER_GRID_STAGE_ACTION_V1";
  const insertion = await insertWorkerTaskPrompt(view, prompt, marker);
  if (insertion?.inserted === true && insertion?.verifiedMarker === true) {
    void monitorWorkerStageReport({ view, workerCode:code, task, baselineResponseSha256 }).catch(() => undefined);
    return { ok: true, mode: "inserted", message: "A stage action prompt a worker ChatGPT mezőjében van. Küldés után a BENJADMIN_STAGE_REPORT_V1 választ a desktop automatikusan evidence-ként rögzíti." };
  }
  clipboard.writeText(prompt);
  return { ok: true, mode: "clipboard", message: "A ChatGPT mező nem volt biztonságosan felülírható; a stage action prompt a vágólapra került." };
}

function liveContextForWorker(workerCode) {
  const code = String(workerCode || "").toUpperCase();
  const worker = latestLiveSnapshot?.workers?.find((item) => item.code === code) || null;
  const presence = latestLiveSnapshot?.workerPresence?.find((item) => item.workerCode === code)
    || latestLiveSnapshot?.workerPresenceHistory?.find((item) => item.workerCode === code) || null;
  let task = presence?.taskId ? latestLiveSnapshot?.tasks?.find((item) => item.id === presence.taskId) || null : null;
  if (!task && worker) task = latestLiveSnapshot?.tasks?.find((item) => {
    const owner = item.assignedWorkerId || item.requestedWorkerId;
    return owner === worker.id && !["completed", "cancelled"].includes(String(item.status || "").toLowerCase());
  }) || null;
  return { worker, presence, task };
}

async function getContextWorkspacePayload(filters = {}) {
  if (!unlocked) throw new Error("A ChatGrid zárolva van.");
  const snapshot = await fetchContextWorkspace({ baseUrl: config.benjadminBaseUrl, deviceToken: readDeviceToken(), filters });
  return { ...snapshot, bindings: loadContextBindings(), handoffRecords: loadHandoffRecords() };
}

async function uploadContextWorkspaceFiles(metadata, files) {
  if (!unlocked) throw new Error("A ChatGrid zárolva van.");
  return uploadResources({ baseUrl: config.benjadminBaseUrl, deviceToken: readDeviceToken(), metadata, files });
}

function contextWorkspaceDocked() {
  return Boolean(config?.contextWorkspace?.visible && config?.contextWorkspace?.detached !== true && !maximizedCellId);
}

async function prepareWorkerHandoff(workerCode) {
  if (!unlocked) return { ok: false, error: "A ChatGrid zárolva van." };
  const code = String(workerCode || "").toUpperCase();
  const cell = config?.cells?.find((item) => item.workerCode === code && item.enabled !== false);
  if (!cell) return { ok: false, error: "A worker nincs aktív ChatGrid cellához rendelve." };
  let view = chatViews.get(cell.id);
  if (!view) { createChatView(cell); updateViewBounds(); view = chatViews.get(cell.id); }
  if (!view) return { ok: false, error: "A worker ChatGPT felülete nem érhető el." };
  const conversation = await getConversationInfo(view, cell, config.cells || []);
  const previousRecord = handoffRecordForConversation(code, conversation.chatSessionId);
  const baselineCapture = await captureLatestAssistantMarkdown(view);
  const baselineIsV2 = baselineCapture?.ok && String(baselineCapture.format || "").startsWith("v2");
  const baselineResponseSha256 = baselineIsV2 ? createHash("sha256").update(String(baselineCapture.text || "")).digest("hex") : "";
  const { presence, task } = liveContextForWorker(code);
  const contextPack = contextPackPromptForWorker(code);
  const prompt = `${buildHandoffPrompt({ workerCode: code, workerLabel: cell.label, ...conversation, task, presence })}${contextPack ? `\n\n${contextPack}` : ""}`;
  view.webContents.focus();
  const insertion = await insertWorkerTaskPrompt(view, prompt, HANDOFF_PROMPT_MARKER);
  if (insertion?.inserted !== true || insertion?.verifiedMarker !== true) {
    const detail = ["TASK_LAUNCH_V3", "TASK_LAUNCH_V2", "TASK_LAUNCH_LEGACY"].includes(insertion?.existingKind)
      ? "A ChatGPT mezőben egy TASK_LAUNCH prompt van. Az ÁTADÁS nem írhatja felül. Töröld vagy kezeld a draftot, majd nyomd meg az ÁTADÁS gombot újra."
      : insertion?.existingKind === "HANDOFF_V2"
        ? "A HANDOFF V2 prompt jelen van, de a marker-ellenőrzés nem sikerült. Ne küldd el; próbáld újra."
        : insertion?.reason === "composer-not-empty"
          ? "A ChatGPT mező nem üres. Az ÁTADÁS fail-closed módban nem írja felül a meglévő szöveget. Ürítsd a mezőt, majd próbáld újra."
          : "A HANDOFF V2 prompt nem volt igazolható a ChatGPT mezőben. Az átadási állapot nem változott.";
    return { ok: false, code: "HANDOFF_PROMPT_NOT_INSERTED", error: detail, insertion };
  }

  const record = saveHandoffRecord(code, conversation.chatSessionId, {
    state: "HANDOFF_PROMPT_INSERTED",
    promptKind: "HANDOFF_V2",
    promptInsertedAt: new Date().toISOString(),
    insertionVerified: true,
    requestedAt: new Date().toISOString(),
    savedAt: null,
    handoffId: null,
    lastError: null,
    chatSessionId: conversation.chatSessionId,
    chatTitle: conversation.chatTitle,
    taskId: task?.id || null,
    taskTitle: task?.title || null,
    handoffRound: Math.max(1, Number(previousRecord?.handoffRound || 0) + 1),
    baselineResponseSha256
  });
  send("handoff:state", { workerCode: code, record });
  return {
    ok: true,
    mode: "inserted",
    record,
    message: "ÁTADÁS ELŐKÉSZÍTVE: a HANDOFF V2 prompt igazoltan a worker ChatGPT mezőjében van. Ellenőrizd, majd kézzel küldd el."
  };
}

async function promptHandoffDownload(handoffId, preferredFileName = "") {
  if (!unlocked) return { ok: false, error: "A ChatGrid zárolva van." };
  const artifact = await downloadHandoff({ baseUrl: config.benjadminBaseUrl, deviceToken: readDeviceToken(), handoffId });
  const fileName = String(artifact.fileName || preferredFileName || "benjadmin_handoff.md").replace(/[\\/:*?"<>|]/g, "_");
  const actualSha = createHash("sha256").update(artifact.bytes).digest("hex");
  if (artifact.sha256 && actualSha !== artifact.sha256) throw new Error("A letöltött átadó SHA-256 ellenőrzése sikertelen.");
  const owner = shellWindow && !shellWindow.isDestroyed() ? shellWindow : undefined;
  const result = await dialog.showSaveDialog(owner, {
    title: "BENJADMIN átadó .md mentése",
    defaultPath: path.join(app.getPath("downloads"), fileName),
    filters: [{ name: "Markdown átadó", extensions: ["md"] }],
  });
  if (result.canceled || !result.filePath) return { ok: true, canceled: true, fileName, sha256: actualSha };
  await fs.promises.writeFile(result.filePath, artifact.bytes);
  return { ok: true, canceled: false, fileName, filePath: result.filePath, sha256: actualSha };
}

async function captureAndSaveWorkerHandoff(workerCode) {
  if (!unlocked) return { ok: false, error: "A ChatGrid zárolva van." };
  const code = String(workerCode || "").toUpperCase();
  const cell = config?.cells?.find((item) => item.workerCode === code && item.enabled !== false);
  const view = cell ? chatViews.get(cell.id) : null;
  if (!cell || !view) return { ok: false, error: "A worker ChatGPT felülete nem érhető el." };
  const conversation = await getConversationInfo(view, cell, config.cells || []);
  const existing = handoffRecordForConversation(code, conversation.chatSessionId);
  const verifiedPrompt = ["HANDOFF_PROMPT_INSERTED", "HANDOFF_RESPONSE_READY"].includes(existing?.state) && existing?.promptKind === "HANDOFF_V2" && existing?.insertionVerified === true;
  const recoveryCapture = ["RECOVERY_REQUIRED", "RECOVERY_PREPARE_REQUIRED"].includes(existing?.state);
  const manuallyDetected = existing?.state === "HANDOFF_RESPONSE_READY" && existing?.manualDetected === true;
  if (!verifiedPrompt && !recoveryCapture && !manuallyDetected) {
    return { ok: false, error: "Nincs menthető HANDOFF V2 állapot ehhez a csevegéshez. Használd az ÁTADÁS műveletet." };
  }

  const capture = await captureLatestAssistantMarkdown(view);
  if (!capture.ok) {
    if (recoveryCapture) return prepareWorkerHandoff(code);
    return { ...capture, code: "HANDOFF_RESPONSE_NOT_READY", record: existing };
  }
  const capturedBody = String(capture.text || "");
  const capturedIsV2 = String(capture.format || "").startsWith("v2") || capturedBody.includes("BENJADMIN_HANDOFF_META_V2");
  if (recoveryCapture && !capturedIsV2) return prepareWorkerHandoff(code);
  if (!capturedIsV2) return { ok: false, code: "HANDOFF_RESPONSE_NOT_READY", error: "A worker még nem adott vissza érvényes HANDOFF V2 választ.", record: existing };

  const responseSha256 = createHash("sha256").update(capturedBody).digest("hex");
  if (existing?.baselineResponseSha256 && responseSha256 === existing.baselineResponseSha256) {
    return { ok: false, code: "HANDOFF_RESPONSE_NOT_READY", error: "A legutóbbi V2 válasz a jelen átadási kör előtti régi válasz; várj az új worker-válaszra.", record: existing };
  }

  const { presence, task } = liveContextForWorker(code);
  const meta = parseHandoffV2(capturedBody);
  if (!meta) return { ok: false, error: "A HANDOFF V2 metaadat nem olvasható.", record: existing };
  if (!meta.finishedAt) meta.finishedAt = new Date().toISOString();
  if (meta.workerCode !== code) return { ok: false, error: `A HANDOFF V2 worker eltér: várt ${code}, kapott ${meta.workerCode}.`, record: existing };
  if (conversation.chatSessionId && meta.chatSessionId !== conversation.chatSessionId) {
    return { ok: false, error: `A HANDOFF V2 csevegésazonosító eltér: várt ${conversation.chatSessionId}, kapott ${meta.chatSessionId}.`, record: existing };
  }
  const canonicalBody = renderHandoffMarkdown(meta);
  const payload = {
    schemaVersion: 2,
    chatSessionId: meta.chatSessionId,
    chatTitle: meta.chatTitle || existing?.chatTitle || conversation.chatTitle,
    workerCode: code,
    mainProject: meta.workedMainProject,
    project: meta.workedProject,
    module: meta.workedModule,
    contextModule: meta.workedContextModule,
    developmentArea: meta.primaryDevelopmentArea,
    fileAreaKey: meta.fileAreaKey,
    taskId: meta.workedTaskId || `chat-${code.toLowerCase()}-${meta.chatSessionId}`,
    taskTitle: meta.workedTaskTitle,
    liveNextTaskId: meta.liveNextTaskId || task?.id || "",
    liveNextTaskTitle: meta.liveNextTaskTitle || task?.title || "",
    startedAt: meta.startedAt,
    finishedAt: meta.finishedAt,
    status: meta.status,
    branch: meta.branch,
    worktree: meta.worktree,
    startCommit: meta.startCommit,
    endCommit: meta.endCommit,
    testsSummary: meta.tests.join(" · ").slice(0, 1000),
    buildRelease: meta.buildRelease,
    tags: ["chatgrid", "handoff", "v2", code.toLowerCase(), meta.workedMainProject, meta.workedModule, meta.workedContextModule, meta.primaryDevelopmentArea].filter(Boolean),
    summary: meta.summary,
    body: canonicalBody,
  };

  const handoff = await saveHandoff({ baseUrl: config.benjadminBaseUrl, deviceToken: readDeviceToken(), handoff: payload });
  const record = saveHandoffRecord(code, conversation.chatSessionId, {
    state: "SAVED", savedAt: handoff.finishedAt, handoffId: handoff.id,
    chatSessionId: handoff.chatSessionId, chatTitle: handoff.chatTitle, fileName: handoff.fileName,
    promptKind: null, insertionVerified: false, lastError: null, responseSha256,
    handoffRound: Math.max(1, Number(existing?.handoffRound || 1)), manualDetected: false,
  });
  send("handoff:state", { workerCode: code, chatSessionId: conversation.chatSessionId, record });
  send("context:refresh", { reason: "handoff-saved", workerCode: code });
  if (latestLiveSnapshot) send("live:snapshot", enrichSnapshotWithTaskLaunch(latestLiveSnapshot));

  let download = null;
  try { download = await promptHandoffDownload(handoff.id, handoff.fileName); }
  catch (error) { download = { ok: false, error: error instanceof Error ? error.message : "A helyi .md mentés sikertelen." }; }
  return {
    ok: true,
    handoff,
    record,
    download,
    message: download?.canceled === false ? "ÁTADÓ MENTVE ÉS .MD LETÖLTVE." : "ÁTADÓ MENTVE. A .md később is letölthető az ÁTADÁSOK nézetből.",
  };
}

async function inspectWorkerHandoffState(workerCode) {
  const code = String(workerCode || "").toUpperCase();
  const cell = config?.cells?.find((item) => item.workerCode === code && item.enabled !== false);
  const view = cell ? chatViews.get(cell.id) : null;
  if (!cell || !view || view.webContents.isDestroyed()) return null;
  const conversation = await getConversationInfo(view, cell, config.cells || []);
  if (!conversation.chatSessionId) return null;
  let record = handoffRecordForConversation(code, conversation.chatSessionId);
  if (record?.state === "SAVED") return record;
  const inspectable = !record || ["HANDOFF_PROMPT_INSERTED", "RECOVERY_REQUIRED", "RECOVERY_PREPARE_REQUIRED", "HANDOFF_RESPONSE_READY"].includes(record.state);
  if (!inspectable) return record;
  const capture = await captureLatestAssistantMarkdown(view);
  if (!capture?.ok || !String(capture.format || "").startsWith("v2")) return record || { state: "", workerCode: code, chatSessionId: conversation.chatSessionId, chatTitle: conversation.chatTitle };
  const body = String(capture.text || "");
  const responseSha256 = createHash("sha256").update(body).digest("hex");
  if (record?.baselineResponseSha256 && responseSha256 === record.baselineResponseSha256) return record;
  try {
    const meta = parseHandoffV2(body);
    if (meta.workerCode !== code || meta.chatSessionId !== conversation.chatSessionId) return record;
  } catch { return record; }
  record = saveHandoffRecord(code, conversation.chatSessionId, {
    ...(record || {}), state: "HANDOFF_RESPONSE_READY", workerCode: code,
    chatSessionId: conversation.chatSessionId, chatTitle: conversation.chatTitle,
    responseSha256, manualDetected: !record, lastError: null,
  });
  send("handoff:state", { workerCode: code, chatSessionId: conversation.chatSessionId, record });
  return record;
}

async function currentHandoffStates() {
  const records = {};
  for (const cell of config?.cells || []) {
    if (cell.enabled === false || !cell.workerCode) continue;
    const code = String(cell.workerCode).toUpperCase();
    records[code] = await inspectWorkerHandoffState(code) || { state: "", workerCode: code, chatSessionId: "" };
  }
  return records;
}

function createContextWorkspaceWindow() {
  if (contextWorkspaceWindow && !contextWorkspaceWindow.isDestroyed()) return contextWorkspaceWindow;
  const cw = config?.contextWorkspace || {};
  contextWorkspaceWindow = new BrowserWindow({
    title: "BENJADMIN Context Workspace",
    width: cw.windowWidth || 920, height: cw.windowHeight || 860,
    x: Number.isFinite(cw.x) ? cw.x : undefined, y: Number.isFinite(cw.y) ? cw.y : undefined,
    minWidth: 720, minHeight: 560, show: false, autoHideMenuBar: true, backgroundColor: "#0b151e",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
  });
  contextWorkspaceWindow.setMenuBarVisibility(false);
  contextWorkspaceWindow.loadFile(path.join(__dirname, "context-workspace", "context-workspace-window.html"));
  if (cw.maximized) contextWorkspaceWindow.once("ready-to-show", () => contextWorkspaceWindow?.maximize());
  const persistBounds = () => {
    if (!contextWorkspaceWindow || contextWorkspaceWindow.isDestroyed()) return;
    clearTimeout(contextWorkspaceWindowSaveTimer);
    contextWorkspaceWindowSaveTimer = setTimeout(() => {
      if (!contextWorkspaceWindow || contextWorkspaceWindow.isDestroyed()) return;
      const b = contextWorkspaceWindow.getBounds();
      config.contextWorkspace = { ...config.contextWorkspace, x: b.x, y: b.y, windowWidth: b.width, windowHeight: b.height, maximized: contextWorkspaceWindow.isMaximized(), detached: true, visible: true };
      saveConfig(config);
    }, 250);
  };
  contextWorkspaceWindow.on("move", persistBounds); contextWorkspaceWindow.on("resize", persistBounds);
  contextWorkspaceWindow.on("maximize", persistBounds); contextWorkspaceWindow.on("unmaximize", persistBounds);
  contextWorkspaceWindow.on("closed", () => {
    contextWorkspaceWindow = null;
    config.contextWorkspace = { ...config.contextWorkspace, detached: false, visible: false };
    saveConfig(config); updateViewBounds(); send("context:layout", { ...config.contextWorkspace, docked: false });
  });
  return contextWorkspaceWindow;
}

function setContextWorkspaceMode(action, payload = {}) {
  if (!config?.contextWorkspace) return { ok: false, error: "Context Workspace konfiguráció hiányzik." };
  if (action === "toggle") config.contextWorkspace.visible = !config.contextWorkspace.visible;
  else if (action === "open") config.contextWorkspace.visible = true;
  else if (action === "close") { config.contextWorkspace.visible = false; config.contextWorkspace.detached = false; contextWorkspaceWindow?.hide(); }
  else if (action === "detach") { config.contextWorkspace.visible = true; config.contextWorkspace.detached = true; const win = createContextWorkspaceWindow(); win.show(); win.focus(); }
  else if (action === "dock") { config.contextWorkspace.visible = true; config.contextWorkspace.detached = false; contextWorkspaceWindow?.hide(); }
  else if (action === "resize") config.contextWorkspace.width = Math.max(380, Math.min(760, Math.round(Number(payload.width) || config.contextWorkspace.width || 500)));
  else if (action === "zoom-in") config.contextWorkspace.zoomPercent = clampZoom((Number(config.contextWorkspace.zoomPercent) || 100) + 10, 100);
  else if (action === "zoom-out") config.contextWorkspace.zoomPercent = clampZoom((Number(config.contextWorkspace.zoomPercent) || 100) - 10, 100);
  else if (action === "zoom-reset") config.contextWorkspace.zoomPercent = 100;
  else return { ok: false, error: "Ismeretlen Context Workspace művelet." };
  saveConfig(config);
  updateViewBounds();
  if (["close", "dock", "open"].includes(action)) setImmediate(() => updateViewBounds());
  const layout = { ...config.contextWorkspace, docked: contextWorkspaceDocked() };
  send("context:layout", layout);
  return { ok: true, contextWorkspace: layout };
}

function closeChatView(cellId) {
  const view = chatViews.get(cellId);
  if (!view) return;
  const hostWindow = cellId === "central" ? centralWindow : shellWindow;
  try { hostWindow?.contentView.removeChildView(view); } catch { /* ignore */ }
  try { if (!view.webContents.isDestroyed()) view.webContents.close(); } catch { /* ignore */ }
  chatViews.delete(cellId);
  watermarkCssKeys.delete(cellId);
  latestWorkerConversationScanned.delete(cellId);
  if (maximizedCellId === cellId) maximizedCellId = null;
  if (cellId === "central") centralVisible = false;
  updateViewBounds();
}

function systemHealthDrawerHeight(height) {
  // Compact fixed card above the persistent footer: large enough for readable metrics,
  // but never takes over the engineering workspace.
  return Math.max(220, Math.min(300, Math.round(Number(height || 0) * 0.245)));
}

function systemHealthReserveHeight(height) {
  if (systemHealthMode === "expanded") return DEVELOPER_FOOTER_HEIGHT + systemHealthDrawerHeight(height);
  if (systemHealthMode === "peek") return DEVELOPER_FOOTER_HEIGHT + SYSTEM_HEALTH_PEEK_HEIGHT;
  return DEVELOPER_FOOTER_HEIGHT;
}

function setSystemHealthMode(mode) {
  const next = ["closed", "peek", "expanded"].includes(String(mode || "")) ? String(mode) : "closed";
  if (systemHealthMode === next) return;
  systemHealthMode = next;
  updateViewBounds();
}

function getCellRect(index, width, height) {
  const gridHeight = Math.max(0, height - APP_BAR_HEIGHT);
  const halfW = Math.floor((width - GRID_GAP) / 2);
  const halfH = Math.floor((gridHeight - GRID_GAP) / 2);
  const col = index % 2;
  const row = Math.floor(index / 2);
  const x = col === 0 ? 0 : halfW + GRID_GAP;
  const y = APP_BAR_HEIGHT + (row === 0 ? 0 : halfH + GRID_GAP);
  const w = col === 0 ? halfW : width - x;
  const h = row === 0 ? halfH : height - y;
  return { x, y, width: Math.max(0, w), height: Math.max(0, h) };
}

function getDockedContextCellRect(index, width, height, requestedPanelWidth) {
  const gridHeight = Math.max(0, height - APP_BAR_HEIGHT);
  const panelWidth = Math.max(320, Math.min(Number(requestedPanelWidth) || 500, Math.max(320, width - 640 - (GRID_GAP * 2))));
  const sideWidth = Math.floor((width - panelWidth - (GRID_GAP * 2)) / 2);
  const halfH = Math.floor((gridHeight - GRID_GAP) / 2);
  const col = index % 2; const row = Math.floor(index / 2);
  const x = col === 0 ? 0 : sideWidth + GRID_GAP + panelWidth + GRID_GAP;
  const y = APP_BAR_HEIGHT + (row === 0 ? 0 : halfH + GRID_GAP);
  const w = col === 0 ? sideWidth : width - x; const h = row === 0 ? halfH : height - y;
  return { x, y, width: Math.max(0, w), height: Math.max(0, h), panelWidth };
}

function getSplitRect(side, width, height) {
  const gridHeight = Math.max(0, height - APP_BAR_HEIGHT);
  const halfW = Math.floor((width - GRID_GAP) / 2);
  if (side === "left") return { x: 0, y: APP_BAR_HEIGHT, width: halfW, height: gridHeight };
  const x = halfW + GRID_GAP;
  return { x, y: APP_BAR_HEIGHT, width: Math.max(0, width - x), height: gridHeight };
}


function getSplitDockedContextRect(side, width, height, requestedPanelWidth) {
  const gridHeight = Math.max(0, height - APP_BAR_HEIGHT);
  const panelWidth = Math.max(320, Math.min(Number(requestedPanelWidth) || 500, Math.max(320, width - 640 - (GRID_GAP * 2))));
  const sideWidth = Math.floor((width - panelWidth - (GRID_GAP * 2)) / 2);
  if (side === "left") return { x: 0, y: APP_BAR_HEIGHT, width: Math.max(0, sideWidth), height: gridHeight, panelWidth };
  const x = sideWidth + GRID_GAP + panelWidth + GRID_GAP;
  return { x, y: APP_BAR_HEIGHT, width: Math.max(0, width - x), height: gridHeight, panelWidth };
}

function updateViewBounds() {
  if (!shellWindow || shellWindow.isDestroyed()) return;
  if (uiOverlayVisible) {
    for (const [chatId, view] of chatViews.entries()) if (chatId !== "central") view.setVisible(false);
    return;
  }
  const [width, height] = shellWindow.getContentSize();
  const reservedBottom = systemHealthReserveHeight(height);
  const workspaceHeight = Math.max(APP_BAR_HEIGHT + CELL_HEADER_HEIGHT + 20, height - reservedBottom);
  const splitMode = config.layoutMode === "split2";
  const dockedContext = contextWorkspaceDocked();
  const requestedContextWidth = Number(config?.contextWorkspace?.width) || 500;
  let effectiveContextWidth = 0;
  const splitLeft = config.splitView?.left || "cell-1";
  const splitRight = config.splitView?.right || "cell-2";
  config.cells.forEach((cell, index) => {
    const view = chatViews.get(cell.id);
    if (!view) return;
    if (maximizedCellId && maximizedCellId !== cell.id) {
      view.setVisible(false);
      return;
    }
    if (!maximizedCellId && splitMode && ![splitLeft, splitRight].includes(cell.id)) {
      view.setVisible(false);
      return;
    }
    view.setVisible(true);
    let rect;
    if (maximizedCellId === cell.id) rect = { x: 0, y: APP_BAR_HEIGHT, width, height: Math.max(0, workspaceHeight - APP_BAR_HEIGHT) };
    else if (splitMode && dockedContext) { rect = getSplitDockedContextRect(cell.id === splitLeft ? "left" : "right", width, workspaceHeight, requestedContextWidth); effectiveContextWidth = rect.panelWidth; }
    else if (splitMode) rect = getSplitRect(cell.id === splitLeft ? "left" : "right", width, workspaceHeight);
    else if (dockedContext) { rect = getDockedContextCellRect(index, width, workspaceHeight, requestedContextWidth); effectiveContextWidth = rect.panelWidth; }
    else rect = getCellRect(index, width, workspaceHeight);
    view.setBounds({
      x: rect.x,
      y: rect.y + CELL_HEADER_HEIGHT,
      width: rect.width,
      height: Math.max(0, rect.height - CELL_HEADER_HEIGHT)
    });
  });

  send("layout:state", {
    maximizedCellId,
    centralVisible,
    layoutMode: config.layoutMode,
    splitView: config.splitView,
    workspaceZoomPercent: config.workspaceZoomPercent,
    openCellIds: [...chatViews.keys()].filter((id) => id !== "central"),
    contextWorkspace: { ...config.contextWorkspace, docked: dockedContext, effectiveWidth: effectiveContextWidth },
    systemHealthMode,
    systemHealthDrawerHeight: systemHealthDrawerHeight(height),
    developerFooterHeight: DEVELOPER_FOOTER_HEIGHT
  });
}

function toggleCentralChat(force) {
  if (!unlocked || config.centralChat?.enabled === false) return;
  const win = createCentralWindow();
  if (!chatViews.has("central")) createChatView(config.centralChat);
  const shouldShow = typeof force === "boolean" ? force : !win.isVisible();
  if (shouldShow) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    updateCentralViewBounds();
    chatViews.get("central")?.webContents.focus();
  } else {
    win.hide();
  }
  centralVisible = shouldShow;
  send("layout:state", { centralVisible, maximizedCellId, layoutMode: config.layoutMode, splitView: config.splitView });
}

function toggleCellMaximize(cellId) {
  const cell = config?.cells?.find((item) => item.id === cellId);
  if (!unlocked || !cell) return;
  maximizedCellId = maximizedCellId === cellId ? null : cellId;
  updateViewBounds();
  chatViews.get(cellId)?.webContents.focus();
}

function setLayoutMode(mode) {
  if (!config || !["grid4", "split2"].includes(mode)) return;
  config.layoutMode = mode;
  maximizedCellId = null;
  saveConfig(config);
  updateViewBounds();
  send("config:state", config);
}

function toggleLayoutMode() {
  setLayoutMode(config?.layoutMode === "split2" ? "grid4" : "split2");
}

function setSplitSlot(side, chatId) {
  if (!config || !["left", "right"].includes(side)) return false;
  if (!config.cells.some((cell) => cell.id === chatId)) return false;
  const other = side === "left" ? "right" : "left";
  if (config.splitView?.[other] === chatId) return false;
  config.splitView = { ...(config.splitView || {}), [side]: chatId };
  saveConfig(config);
  if (config.layoutMode === "split2") updateViewBounds();
  send("config:state", config);
  return true;
}

function restoreShellToGrid() {
  if (!shellWindow || shellWindow.isDestroyed()) return;
  maximizedCellId = null;
  config.layoutMode = "grid4";
  saveConfig(config);
  if (shellWindow.isMinimized()) shellWindow.restore();
  shellWindow.show();
  shellWindow.focus();
  updateViewBounds();
}

function toggleShellTaskbar() {
  if (!shellWindow || shellWindow.isDestroyed()) return;
  if (shellWindow.isMinimized() || !shellWindow.isVisible()) {
    restoreShellToGrid();
    return;
  }
  centralVisible = false;
  if (centralWindow && !centralWindow.isDestroyed()) centralWindow.hide();
  maximizedCellId = null;
  updateViewBounds();
  shellWindow.minimize();
}

function handleChatGridShortcut(accelerator) {
  if (accelerator === "shell-toggle") { toggleShellTaskbar(); return; }
  if (accelerator === "lock") { if (unlocked) lockWorkspace("shortcut"); return; }
  if (!unlocked) return;
  if (shellWindow?.isMinimized()) {
    shellWindow.restore();
    shellWindow.show();
    shellWindow.focus();
  }
  if (accelerator === "central") {
    toggleCentralChat();
  } else if (accelerator === "quiet-toggle") {
    toggleQuietMode();
  } else if (accelerator === "guide") {
    toggleUsageGuide();
  } else if (accelerator === "layout-toggle") {
    toggleLayoutMode();
  } else if (/^cell-[1-4]$/.test(accelerator)) {
    toggleCellMaximize(accelerator);
  }
}

function registerGlobalShortcuts() {
  registeredGlobalShortcutActions.clear();
  shortcutRegistrationState = [];
  for (const definition of SHORTCUT_DEFINITIONS) {
    let registered = false;
    try {
      registered = globalShortcut.register(definition.accelerator, () => dispatchShortcutAction(definition.action, "global")) === true;
      registered = registered && globalShortcut.isRegistered(definition.accelerator);
    } catch { registered = false; }
    if (registered) registeredGlobalShortcutActions.add(definition.action);
    shortcutRegistrationState.push({ accelerator: definition.accelerator, action: definition.action, registered, localFallback: !registered });
  }
}

function stopDeviceHeartbeat() {
  if (deviceHeartbeatTimer) clearTimeout(deviceHeartbeatTimer);
  deviceHeartbeatTimer = null;
}

async function sendDeviceHeartbeatOnce() {
  if (!unlocked || deviceHeartbeatBusy) return;
  const token = readDeviceToken();
  const metadata = readDeviceMeta();
  const agentId = String(metadata?.agentId || "").trim();
  const sessionId = String(metadata?.sessionId || "").trim();
  if (!token || !agentId || !sessionId || !config?.benjadminBaseUrl) return;
  deviceHeartbeatBusy = true;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const client = await resolveDesktopArtifactIdentity();
      const response = await fetch(`${config.benjadminBaseUrl}/api/dev/terminal-hub/windows-bridge/heartbeat`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ protocolVersion: 1, agentId, sessionId, sentAt: new Date().toISOString(), ...(client ? { client } : {}) }),
        cache: "no-store",
        signal: controller.signal
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Windows Bridge heartbeat HTTP ${response.status}`);
      send("connection:device-heartbeat", { ok: true, at: new Date().toISOString(), artifactIdentity: client ? "REPORTED" : "UNAVAILABLE" });
      send("context:refresh", { reason:"device-heartbeat" });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    send("connection:device-heartbeat", { ok: false, error: error instanceof Error ? error.message.slice(0, 240) : "A device heartbeat sikertelen." });
  } finally {
    deviceHeartbeatBusy = false;
    if (unlocked && readDeviceToken()) {
      deviceHeartbeatTimer = setTimeout(() => void sendDeviceHeartbeatOnce(), DEVICE_HEARTBEAT_INTERVAL_MS);
    }
  }
}

function desktopArtifactCandidates() {
  const portable = String(process.env.PORTABLE_EXECUTABLE_FILE || "").trim();
  const installed = installedExecutablePath();
  const candidates = [portable, installed].filter(Boolean);
  return [...new Set(candidates.map((file) => path.resolve(file)))];
}

async function hashDesktopArtifact(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size <= 0 || stat.size > 1024 * 1024 * 1024) return null;
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return {
    product: APP_TITLE,
    version: app.getVersion(),
    executableSha256: hash.digest("hex"),
    executableBytes: stat.size
  };
}

async function resolveDesktopArtifactIdentity() {
  if (desktopArtifactIdentityCache) return desktopArtifactIdentityCache;
  if (!app.isPackaged || process.platform !== "win32") return null;
  for (const file of desktopArtifactCandidates()) {
    try {
      const identity = await hashDesktopArtifact(file);
      if (identity) { desktopArtifactIdentityCache = identity; return desktopArtifactIdentityCache; }
    } catch { /* try the next byte-identical physical artifact candidate */ }
  }
  return null;
}

function startDeviceHeartbeat() {
  stopDeviceHeartbeat();
  if (!unlocked || !readDeviceToken()) return;
  deviceHeartbeatTimer = setTimeout(() => void sendDeviceHeartbeatOnce(), 1200);
}

function stopLiveClient() {
  liveClient?.stop();
  liveClient = null;
  stopDeviceHeartbeat();
}

function startLiveClient() {
  stopLiveClient();
  const credentials = liveCredentials();
  const credential = credentials[0] || { mode: "none", token: "" };
  if (!unlocked || !credential.token) {
    send("live:connection", {
      kind: "benjadmin",
      ok: false,
      configured: Boolean(credential.token),
      mode: credential.mode,
      error: credential.token ? "A munkatér zárolva." : "A BENJADMIN élő státuszkapcsolat nincs párosítva."
    });
    return;
  }
  liveClient = new BenjadminLiveClient({
    baseUrl: config.benjadminBaseUrl,
    authMode: credential.mode,
    authToken: credential.token,
    authCandidates: credentials,
    pollIntervalMs: config.pollIntervalMs,
    onSnapshot(snapshot) {
      latestLiveSnapshot = snapshot;
      syncWorkspaceStandbyLocks(snapshot);
      send("live:snapshot", enrichSnapshotWithTaskLaunch(snapshot));
      send("live:connection", { kind: "benjadmin", ok: true, configured: true, mode: credential.mode, transport: snapshot.transport || "UNKNOWN", realtimeMode: snapshot.realtimeMode || "UNKNOWN", fullSnapshotPolling: snapshot.fullSnapshotPolling === true, at: snapshot.generatedAt });
    },
    onEvent(event) {
      handleWorkerEvent(event);
    },
    onError(error) {
      send("live:connection", { kind: "benjadmin", ok: false, configured: true, mode: credential.mode, error: error.message });
    }
  });
  liveClient.start();
  if (credential.mode === "device") startDeviceHeartbeat();
}
function workerLabel(workerCode) {
  const cell = config.cells.find((item) => item.workerCode === workerCode);
  return cell?.label || workerCode || "Kódmérnök";
}


async function chatNotificationDiagnostic(chatId, view, requestPermission = false) {
  if (!view || view.webContents.isDestroyed()) return null;
  const url = view.webContents.getURL();
  if (!isChatGptUrl(url)) return { chatId, url, isChatGpt: false };
  const script = `(${async function notificationProbe(shouldRequest) {
    const notificationSupported = typeof window.Notification !== "undefined";
    let permission = notificationSupported ? String(window.Notification.permission || "default") : "unsupported";
    let requestResult = null;
    if (shouldRequest && notificationSupported && typeof window.Notification.requestPermission === "function") {
      try {
        requestResult = String(await window.Notification.requestPermission());
        permission = String(window.Notification.permission || requestResult || "default");
      } catch (error) {
        requestResult = `error:${String(error?.message || error || "request failed").slice(0, 240)}`;
      }
    }
    const serviceWorkerSupported = "serviceWorker" in navigator;
    let serviceWorkerController = false;
    let serviceWorkerRegistrationCount = 0;
    if (serviceWorkerSupported) {
      try {
        serviceWorkerController = Boolean(navigator.serviceWorker.controller);
        serviceWorkerRegistrationCount = (await navigator.serviceWorker.getRegistrations()).length;
      } catch {}
    }
    return {
      href: location.href,
      notificationSupported,
      permission,
      requestResult,
      serviceWorkerSupported,
      serviceWorkerController,
      serviceWorkerRegistrationCount,
      pushManagerSupported: typeof window.PushManager !== "undefined",
      secureContext: window.isSecureContext === true,
      visibilityState: document.visibilityState,
    };
  }.toString()})(${requestPermission === true ? "true" : "false"})`;
  try {
    const result = await view.webContents.executeJavaScript(script, requestPermission === true);
    return { chatId, url, isChatGpt: true, ...result };
  } catch (error) {
    return { chatId, url, isChatGpt: true, error: error instanceof Error ? error.message.slice(0, 400) : "Notification probe failed" };
  }
}

async function getNotificationDiagnostics({ requestWebPermission = false } = {}) {
  const views = [];
  for (const [chatId, view] of chatViews.entries()) {
    const diagnostic = await chatNotificationDiagnostic(chatId, view, requestWebPermission);
    if (diagnostic) views.push(diagnostic);
  }
  const chatGptViews = views.filter((item) => item.isChatGpt === true);
  const grantedCount = chatGptViews.filter((item) => item.permission === "granted").length;
  const deniedCount = chatGptViews.filter((item) => item.permission === "denied").length;
  const defaultCount = chatGptViews.filter((item) => item.permission === "default").length;
  const webPushReadyCount = chatGptViews.filter((item) => item.permission === "granted" && item.serviceWorkerSupported && item.pushManagerSupported).length;
  let webStatus = "NO_CHATGPT_VIEW";
  if (chatGptViews.length) {
    if (grantedCount === chatGptViews.length) webStatus = webPushReadyCount === chatGptViews.length ? "GRANTED" : "GRANTED_LIMITED";
    else if (deniedCount === chatGptViews.length) webStatus = "DENIED";
    else if (defaultCount === chatGptViews.length) webStatus = "DEFAULT";
    else webStatus = "MIXED";
  }
  return {
    checkedAt: new Date().toISOString(),
    windows: {
      supported: Notification.isSupported(),
      enabled: config?.notifications?.windowsToast !== false,
      fallbackActive: Notification.isSupported() && config?.notifications?.windowsToast !== false,
    },
    web: {
      status: webStatus,
      openChatGptViews: chatGptViews.length,
      grantedCount,
      deniedCount,
      defaultCount,
      webPushReadyCount,
      electronPermissionPolicy: "CHATGPT_ONLY_ALLOW",
    },
    views,
  };
}

function handleWorkerEvent(event) {
  if (!["assigned", "stage_completed", "completed", "blocked", "failed"].includes(event.type)) return;
  const configuredWorker = config?.cells?.some((cell) => cell.enabled !== false && cell.workerCode === event.workerCode);
  if (!configuredWorker && event.test !== true) return;
  send("worker:event", event);
  const label = workerLabel(event.workerCode);
  const title = event.type === "assigned"
    ? `${label}: új feladat érkezett`
    : event.type === "stage_completed" ? `${label}: fejlesztési rész elkészült`
      : event.type === "completed" ? `${label} befejezte a munkát`
        : event.type === "blocked" ? `${label} elakadt / döntést kér` : `${label} hibát jelzett`;
  if (config.notifications.flashTaskbar && shellWindow && !shellWindow.isFocused()) shellWindow.flashFrame(true);
  if (config.notifications.windowsToast && Notification.isSupported()) {
    const notification = new Notification({ title, body: event.taskTitle || "BENJADMIN worker esemény.", silent: true });
    notification.on("click", () => {
      if (!shellWindow) return;
      shellWindow.show();
      shellWindow.restore();
      shellWindow.focus();
      shellWindow.flashFrame(false);
    });
    notification.show();
  }
}

function createShellWindow() {
  shellWindow = new BrowserWindow({
    title: APP_TITLE,
    width: 1500,
    height: 950,
    minWidth: 980,
    minHeight: 650,
    frame: false,
    show: false,
    backgroundColor: "#071018",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });
  shellWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  shellWindow.webContents.on("before-input-event", (event, input) => { handleLocalShortcutInput(event, input); });
  shellWindow.once("ready-to-show", () => {
    shellWindow.maximize();
    shellWindow.show();
    });
  shellWindow.on("resize", () => { updateViewBounds(); positionUsageGuideWindow(); });
  shellWindow.on("move", () => { positionUsageGuideWindow(); });
  shellWindow.on("maximize", () => send("layout:state", { maximizedCellId, windowMaximized: true, openCellIds: [...chatViews.keys()] }));
  shellWindow.on("unmaximize", () => send("layout:state", { maximizedCellId, windowMaximized: false, openCellIds: [...chatViews.keys()] }));
  shellWindow.on("focus", () => shellWindow?.flashFrame(false));
  shellWindow.on("closed", () => {
    stopLiveClient();
    cancelChatGridPairing();
    destroyChatViews();
    if (centralWindow && !centralWindow.isDestroyed()) centralWindow.destroy();
    centralWindow = null;
    if (guideWindow && !guideWindow.isDestroyed()) guideWindow.destroy();
    guideWindow = null;
    if (contextWorkspaceWindow && !contextWorkspaceWindow.isDestroyed()) contextWorkspaceWindow.destroy();
    contextWorkspaceWindow = null;
    shellWindow = null;
  });
}

async function fetchDeveloperGridSystemHealth() {
  if (!unlocked) return { ok: false, error: "A Developer Grid zárolva van.", code: "LOCKED" };
  const credentials = liveCredentials();
  if (!credentials.length) return { ok: false, error: "A Developer Grid nincs párosítva.", code: "AUTH_REQUIRED", unauthorized: true };
  let lastAuthError = null;
  for (const credential of credentials) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(`${config.benjadminBaseUrl}/api/dev/grid/system-health`, { method: "GET", headers: credentialHeaders(credential), cache: "no-store", signal: controller.signal });
      const payload = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        lastAuthError = { ok: false, error: payload?.error || `System Health HTTP ${response.status}`, code: "AUTH_REJECTED", unauthorized: true };
        continue;
      }
      if (!response.ok || !payload?.ok) return { ok: false, error: payload?.error || `System Health HTTP ${response.status}`, code: `HTTP_${response.status}` };
      return { ok: true, health: payload.health, authMode: credential.mode };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "System Health kapcsolat sikertelen.", code: "NETWORK_ERROR" };
    } finally { clearTimeout(timer); }
  }
  return lastAuthError || { ok: false, error: "A Developer Grid hitelesítése sikertelen.", code: "AUTH_REJECTED", unauthorized: true };
}

function registerIpc() {
  ipcMain.handle("app:get-version", () => ({ ok: true, version: app.getVersion() }));
  ipcMain.handle("chat-refresh:get", () => ({ ok: unlocked, state: publicChatRefreshState() }));
  ipcMain.handle("chat-refresh:run", () => unlocked ? refreshOpenChatViews("manual-all") : ({ ok: false, error: "A ChatGrid zárolva van." }));
  ipcMain.handle("shortcuts:get-status", () => ({ ok: true, shortcuts: shortcutRegistrationState.map((item) => ({ ...item })) }));
  ipcMain.handle("system-health:get", () => fetchDeveloperGridSystemHealth());
  ipcMain.handle("security:get-state", () => securityState());
  ipcMain.handle("security:setup", (_event, payload) => {
    if (loadPasswordRecord(userDataPath())) return { ok: false, error: "A jelszó már be van állítva." };
    try {
      const record = createPasswordRecord(String(payload?.password || ""));
      savePasswordRecord(userDataPath(), record);
      failedAttempts = 0;
      lockedUntil = 0;
      unlocked = true;
      createEnabledChatViews();
      startLiveClient();
      const state = securityState();
      send("security:state", state);
      showUsageGuideAfterUnlock();
      return { ok: true, state };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "A jelszó nem menthető." };
    }
  });
  ipcMain.handle("security:unlock", (_event, payload) => {
    const now = Date.now();
    if (lockedUntil > now) return { ok: false, lockedUntil, error: "Túl sok hibás próbálkozás. Próbáld újra később." };
    const record = loadPasswordRecord(userDataPath());
    if (!record) return { ok: false, error: "Nincs beállított ChatGrid jelszó." };
    const ok = verifyPassword(String(payload?.password || ""), record);
    if (!ok) {
      failedAttempts += 1;
      if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
        lockedUntil = Date.now() + LOCKOUT_MS;
        failedAttempts = 0;
      }
      return { ok: false, failedAttempts, lockedUntil: lockedUntil > Date.now() ? lockedUntil : 0, error: "Hibás jelszó." };
    }
    failedAttempts = 0;
    lockedUntil = 0;
    unlocked = true;
    createEnabledChatViews();
    startLiveClient();
    const state = securityState();
    send("security:state", state);
    showUsageGuideAfterUnlock();
    return { ok: true, state };
  });
  ipcMain.handle("security:lock", () => { lockWorkspace("manual"); return { ok: true }; });

  ipcMain.handle("guide:get", () => {
    if (!unlocked) return { ok: false, error: "A ChatGrid zárolva van." };
    return { ok: true, content: config?.usageGuide?.content || DEFAULT_USAGE_GUIDE, showOnUnlock: config?.usageGuide?.showOnUnlock !== false };
  });
  ipcMain.handle("guide:save", (_event, payload) => {
    if (!unlocked) return { ok: false, error: "A ChatGrid zárolva van." };
    const content = String(payload?.content || "").trim();
    if (!content) return { ok: false, error: "Az útmutató nem lehet üres." };
    config.usageGuide = { showOnUnlock: payload?.showOnUnlock !== false, content: content.slice(0, 100_000) };
    saveConfig(config);
    send("config:state", config);
    return { ok: true, content: config.usageGuide.content, showOnUnlock: config.usageGuide.showOnUnlock };
  });
  ipcMain.handle("guide:reset", () => unlocked ? { ok: true, content: DEFAULT_USAGE_GUIDE } : { ok: false, error: "A ChatGrid zárolva van." });
  ipcMain.handle("guide:close", () => { if (guideWindow && !guideWindow.isDestroyed()) guideWindow.hide(); return { ok: true }; });
  ipcMain.handle("central:get-state", () => unlocked ? { ok: true, state: centralUiState() } : { ok: false });
  ipcMain.handle("central:window-action", (_event, action) => {
    if (!centralWindow || centralWindow.isDestroyed()) return { ok: false };
    if (action === "minimize") centralWindow.minimize();
    else if (action === "toggle-maximize") centralWindow.isMaximized() ? centralWindow.unmaximize() : centralWindow.maximize();
    else if (action === "close") toggleCentralChat(false);
    return { ok: true };
  });
  ipcMain.handle("central:profile-toggle", () => {
    if (!unlocked || !centralWindow || centralWindow.isDestroyed()) return { ok: false };
    centralProfileVisible = !centralProfileVisible;
    updateCentralViewBounds();
    sendCentralUiState();
    return { ok: true, visible: centralProfileVisible };
  });
  ipcMain.handle("central:profile-close", () => {
    centralProfileVisible = false;
    updateCentralViewBounds();
    sendCentralUiState();
    return { ok: true };
  });
  ipcMain.handle("central:open-settings", () => {
    if (!unlocked || !shellWindow || shellWindow.isDestroyed()) return { ok: false, error: "A ChatGrid zárolva van." };
    centralProfileVisible = false;
    updateCentralViewBounds();
    sendCentralUiState();
    if (shellWindow.isMinimized()) shellWindow.restore();
    shellWindow.show();
    shellWindow.focus();
    shellWindow.webContents.send("ui:open-settings");
    return { ok: true };
  });

  ipcMain.handle("config:get", () => ({ ok: unlocked, config: unlocked ? config : null }));
  ipcMain.handle("config:update", (_event, nextConfig) => {
    if (!unlocked) return { ok: false, error: "A ChatGrid zárolva van." };
    const previousCells = new Map(config.cells.map((cell) => [cell.id, { ...cell }]));
    const previousCentral = config.centralChat ? { ...config.centralChat } : null;
    // The Context Workspace is runtime-owned by context:mode. Renderer config can be stale
    // when the panel was opened after the last config snapshot (e.g. theme toggle).
    // Preserve the authoritative runtime layout so an appearance save cannot hide/detach it.
    const runtimeContextWorkspace = config.contextWorkspace ? { ...config.contextWorkspace } : null;
    const mergedConfig = runtimeContextWorkspace
      ? { ...(nextConfig || {}), contextWorkspace: runtimeContextWorkspace }
      : nextConfig;
    const saved = saveConfig(mergedConfig);
    for (const cell of saved.cells) {
      const previous = previousCells.get(cell.id);
      if (!cell.enabled) closeChatView(cell.id);
      else if (!chatViews.has(cell.id)) createChatView(cell);
      else if (previous?.url !== cell.url) void chatViews.get(cell.id)?.webContents.loadURL(cell.url);

    }
    if (saved.centralChat?.enabled === false) closeChatView("central");
    else if (!chatViews.has("central")) createChatView(saved.centralChat);
    else if (previousCentral?.url !== saved.centralChat?.url) void chatViews.get("central")?.webContents.loadURL(saved.centralChat.url);
    applyWorkspaceZoom();
    applyAllChatWatermarks();
    updateViewBounds();
    startLiveClient();
    send("config:state", saved);
    if (runtimeContextWorkspace) send("context:layout", { ...saved.contextWorkspace, docked: contextWorkspaceDocked() });
    sendCentralUiState();
    return { ok: true, config: saved };
  });

  ipcMain.handle("connection:set-reporter-key", (_event, payload) => {
    if (!unlocked) return { ok: false, error: "A ChatGrid zárolva van." };
    try {
      writeReporterKey(payload?.key);
      startLiveClient();
      return { ok: true, configured: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "A BENJADMIN kulcs nem menthető." };
    }
  });
  ipcMain.handle("connection:get-state", () => {
    const credential = unlocked ? liveCredential() : { mode: "none", token: "" };
    return {
      ok: unlocked,
      configured: unlocked ? Boolean(credential.token) : false,
      mode: unlocked ? credential.mode : "none",
      device: unlocked && credential.mode === "device" ? readDeviceMeta() : null,
      pairing: unlocked ? publicPairingState() : { status: "idle" },
      baseUrl: unlocked ? config.benjadminBaseUrl : null
    };
  });
  ipcMain.handle("connection:open-pairing-page", async () => {
    if (!unlocked) return { ok: false, error: "A ChatGrid zárolva van." };
    const url = `${config.benjadminBaseUrl}/admin/dev-console/chatgrid-pairing?client=developer-grid`;
    try { await shell.openExternal(url); return { ok: true, url }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "A BENJADMIN párosítási oldal nem nyitható meg." }; }
  });
  ipcMain.handle("system-health:open-supabase-monitoring", async () => {
    if (!unlocked) return { ok: false, error: "A Developer Grid zárolva van." };
    const url = `${config.benjadminBaseUrl}/api/dev/grid/supabase-monitoring/setup`;
    try { await shell.openExternal(url); return { ok: true, url }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "A Supabase monitoring beállítóoldal nem nyitható meg." }; }
  });
  ipcMain.handle("connection:pairing-start", async (_event, payload) => {
    try { return { ok: true, pairing: await beginChatGridPairing(payload?.activationCode) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "A ChatGrid párosítás sikertelen." }; }
  });
  ipcMain.handle("connection:pairing-cancel", () => { cancelChatGridPairing(); return { ok: true }; });
  ipcMain.handle("connection:forget-device", () => {
    if (!unlocked) return { ok: false, error: "A ChatGrid zárolva van." };
    forgetDeviceToken();
    stopLiveClient();
    startLiveClient();
    send("live:snapshot", { workers: [], tasks: [], workerPresence: [], generatedAt: new Date().toISOString() });
    return { ok: true, configured: Boolean(readReporterKey()), mode: readReporterKey() ? "reporter" : "none" };
  });

  ipcMain.handle("ui:overlay", (_event, payload) => {
    if (!unlocked) return { ok: false, error: "A ChatGrid zárolva van." };
    uiOverlayVisible = payload?.visible === true;
    updateViewBounds();
    return { ok: true, visible: uiOverlayVisible };
  });

  ipcMain.handle("context:get", async (_event, filters) => {
    try { return { ok: true, context: await getContextWorkspacePayload(filters || {}) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "A Context Workspace nem tölthető be." }; }
  });
  ipcMain.handle("work-start:get", async () => {
    if (!unlocked) return { ok: false, error: "A Developer Grid zárolva van." };
    try { return { ok: true, activeWork: await fetchDeveloperGridActiveWork({ baseUrl: config.benjadminBaseUrl, deviceToken: readDeviceToken() }) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Az aktív munka nem tölthető be." }; }
  });
  ipcMain.handle("build-runs:get", async () => {
    if (!unlocked) return { ok:false, error:"A Developer Grid zárolva van." };
    try { return { ok:true, buildRuns: await fetchDeveloperGridBuildRuns({ baseUrl:config.benjadminBaseUrl, deviceToken:readDeviceToken() }) }; }
    catch (error) { return { ok:false, error:error instanceof Error ? error.message : "A Build Runner Pool állapota nem tölthető be." }; }
  });
  ipcMain.handle("build-runs:request", async (_event, payload) => {
    if (!unlocked) return { ok:false, error:"A Developer Grid zárolva van." };
    try {
      const build = await requestDeveloperGridFullBuild({ baseUrl:config.benjadminBaseUrl, deviceToken:readDeviceToken(), input:payload || {} });
      send("context:refresh", { reason:"build-requested", runId:build?.run?.id || null });
      return { ok:true, build };
    } catch (error) { return { ok:false, error:error instanceof Error ? error.message : "A FULL BUILD indítása sikertelen." }; }
  });
  ipcMain.handle("evidence:get", async (_event, payload) => {
    if (!unlocked) return { ok:false, error:"A Developer Grid zárolva van." };
    try { return { ok:true, ...(await fetchDeveloperGridEvidence({ baseUrl:config.benjadminBaseUrl, deviceToken:readDeviceToken(), taskId:String(payload?.taskId || ""), limit:160 })) }; }
    catch (error) { return { ok:false, error:error instanceof Error ? error.message : "A Diagnostic Evidence nem tölthető be." }; }
  });
  ipcMain.handle("windows-e2e:get", async () => {
    if (!unlocked) return { ok:false, error:"A Developer Grid zárolva van." };
    try { return { ok:true, windowsE2E: await fetchDeveloperGridWindowsE2E({ baseUrl:config.benjadminBaseUrl, deviceToken:readDeviceToken() }) }; }
    catch (error) { return { ok:false, error:error instanceof Error ? error.message : "A Physical Windows E2E állapot nem tölthető be." }; }
  });
  ipcMain.handle("review-gate:get", async (_event, payload) => {
    if (!unlocked) return { ok:false, error:"A Developer Grid zárolva van." };
    try { return { ok:true, ...(await fetchDeveloperGridReviewGate({ baseUrl:config.benjadminBaseUrl, deviceToken:readDeviceToken(), taskId:String(payload?.taskId || ""), target:String(payload?.target || "REVIEW") })) }; }
    catch (error) { return { ok:false, error:error instanceof Error ? error.message : "A Review Gate nem tölthető be." }; }
  });
  ipcMain.handle("review-gate:run", async (_event, payload) => {
    if (!unlocked) return { ok:false, error:"A Developer Grid zárolva van." };
    try {
      const review = await requestDeveloperGridVGuardReview({ baseUrl:config.benjadminBaseUrl, deviceToken:readDeviceToken(), input:payload || {} });
      send("context:refresh", { reason:"vguard-review-completed", taskId:review?.taskId || payload?.taskId || null });
      return { ok:true, review };
    } catch (error) { return { ok:false, error:error instanceof Error ? error.message : "A V.Guard review sikertelen." }; }
  });
  ipcMain.handle("work-start:create", async (_event, payload) => {
    if (!unlocked) return { ok: false, error: "A Developer Grid zárolva van." };
    const conversationGuards = captureWorkerConversationGuards();
    try {
      const work = await startDeveloperGridWork({ baseUrl: config.benjadminBaseUrl, deviceToken: readDeviceToken(), input: payload || {} });
      preserveWorkerConversationsAfterWorkStart(conversationGuards);
      const chatPlan = await initializeTaskChatPlan(work, payload?.chatLaunchMode, conversationGuards);
      let taskLaunch = null;
      const launchTask = launchTaskFromWork(work, chatPlan);
      const launchWorkerCode = assignedWorkerCodeFromWork(work);
      if (work?.routingState === "ROUTED" && launchTask && launchWorkerCode && chatPlan?.conversationBound === true) {
        taskLaunch = await prepareWorkerTaskLaunch(launchWorkerCode, launchTask.id, { autoSend:true, taskOverride:launchTask });
      }
      send("context:refresh", { reason: "work-started", taskId: work?.task?.id || null });
      return { ok: true, work, chatPlan, taskLaunch };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "A Developer Grid munkaindítás sikertelen." }; }
  });
  ipcMain.handle("context:mode", (_event, payload) => {
    if (!unlocked) return { ok: false, error: "A ChatGrid zárolva van." };
    return setContextWorkspaceMode(String(payload?.action || ""), payload || {});
  });
  ipcMain.handle("context:bind", (_event, payload) => {
    if (!unlocked) return { ok: false, error: "A ChatGrid zárolva van." };
    try { const items = bindContextItem(payload?.workerCode, payload?.item || {}); return { ok: true, workerCode: String(payload?.workerCode || "").toUpperCase(), items, bindings: loadContextBindings() }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "A kontextus nem rendelhető a workerhez." }; }
  });
  ipcMain.handle("context:clear", (_event, payload) => {
    if (!unlocked) return { ok: false, error: "A ChatGrid zárolva van." };
    try { return { ok: true, bindings: clearContextBindings(payload?.workerCode) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "A Context Pack nem üríthető." }; }
  });
  ipcMain.handle("context:upload", async (_event, payload) => {
    try { return { ok: true, resources: await uploadContextWorkspaceFiles(payload?.metadata || {}, payload?.files || []) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "A segédanyag feltöltése sikertelen." }; }
  });
  ipcMain.handle("handoff:prepare", async (_event, payload) => {
    try { return await prepareWorkerHandoff(payload?.workerCode); }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Az ÁTADÁS előkészítése sikertelen." }; }
  });
  ipcMain.handle("handoff:capture-save", async (_event, payload) => {
    try { return await captureAndSaveWorkerHandoff(payload?.workerCode); }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Az átadó mentése sikertelen." }; }
  });
  ipcMain.handle("handoff:download", async (_event, payload) => {
    try { return await promptHandoffDownload(String(payload?.handoffId || ""), String(payload?.fileName || "")); }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Az átadó .md letöltése sikertelen." }; }
  });
  ipcMain.handle("handoff:get-state", async () => ({ ok: unlocked, records: unlocked ? await currentHandoffStates() : {} }));

  ipcMain.handle("review:get", async () => {
    if (!unlocked) return { ok: false, error: "A ChatGrid zárolva van." };
    try {
      const reviewRoom = await fetchReviewRoomSnapshot({ baseUrl: config?.benjadminBaseUrl, deviceToken: readDeviceToken() });
      return { ok: true, reviewRoom };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Az External Review Room nem tölthető be." };
    }
  });

  ipcMain.handle("window:action", (_event, action) => {
    if (!shellWindow) return { ok: false };
    if (action === "minimize") shellWindow.minimize();
    else if (action === "toggle-maximize") shellWindow.isMaximized() ? shellWindow.unmaximize() : shellWindow.maximize();
    else if (action === "close") shellWindow.close();
    return { ok: true };
  });


  ipcMain.handle("task:bind-conversation", async (_event, payload) => {
    try {
      const code = String(payload?.workerCode || "").toUpperCase();
      return await bindCurrentTaskConversation(code, payload?.taskId, { launchAfterBind:true });
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "A worker ChatGPT csevegés rögzítése sikertelen." }; }
  });

  ipcMain.handle("task:prepare-launch", async (_event, payload) => {
    try {
      const code = String(payload?.workerCode || "").toUpperCase();
      return await prepareWorkerTaskLaunch(code, payload?.taskId);
    }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "A worker ChatGPT indítás előkészítése sikertelen." }; }
  });

  ipcMain.handle("stage-action:prepare", async (_event, payload) => {
    try {
      const code = String(payload?.workerCode || "").toUpperCase();
      const action = String(payload?.action || "");
      return await prepareWorkerStageAction(code, action);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "A Developer Grid stage action előkészítése sikertelen." };
    }
  });

  ipcMain.handle("notification:diagnostics", async () => {
    if (!unlocked) return { ok: false, error: "A ChatGrid zárolva van." };
    return { ok: true, diagnostics: await getNotificationDiagnostics() };
  });

  ipcMain.handle("notification:request-web", async () => {
    if (!unlocked) return { ok: false, error: "A ChatGrid zárolva van." };
    const diagnostics = await getNotificationDiagnostics({ requestWebPermission: true });
    return { ok: true, diagnostics };
  });

  ipcMain.handle("notification:test", (_event, payload) => {
    if (!unlocked) return { ok: false, error: "A ChatGrid zárolva van." };
    const type = ["stage_completed", "completed", "blocked", "failed"].includes(payload?.type) ? payload.type : "completed";
    handleWorkerEvent({
      type,
      workerCode: "BENAI",
      taskId: "chatgrid-notification-test",
      taskTitle: "ChatGrid értesítési teszt",
      projectId: null,
      stageIndex: type === "stage_completed" ? 2 : null,
      nextStageIndex: type === "stage_completed" ? 3 : null,
      at: new Date().toISOString(),
      test: true
    });
    return { ok: true, type };
  });

  ipcMain.handle("workspace:action", (_event, payload) => {
    if (!unlocked && payload?.action !== "shell-toggle") return { ok: false, error: "A ChatGrid zárolva van." };
    const action = payload?.action;
    if (action === "zoom-in") setWorkspaceZoom((config.workspaceZoomPercent || 100) + 10);
    else if (action === "zoom-out") setWorkspaceZoom((config.workspaceZoomPercent || 100) - 10);
    else if (action === "zoom-reset") setWorkspaceZoom(100);
    else if (action === "toggle-layout") toggleLayoutMode();
    else if (action === "set-split") {
      if (!setSplitSlot(payload?.side, payload?.chatId)) return { ok: false, error: "A kétcellás nézet bal és jobb oldala nem lehet ugyanaz a csevegő." };
    } else if (action === "central-toggle") toggleCentralChat();
    else if (action === "system-health-mode") setSystemHealthMode(payload?.mode);
    else if (action === "shortcut") handleChatGridShortcut(payload?.shortcut);
    else if (action === "shell-toggle") toggleShellTaskbar();
    else return { ok: false, error: "Ismeretlen munkatér-művelet." };
    return {
      ok: true,
      layoutMode: config.layoutMode,
      splitView: config.splitView,
      workspaceZoomPercent: config.workspaceZoomPercent,
      maximizedCellId,
      centralVisible
    };
  });

  ipcMain.handle("cell:action", async (_event, payload) => {
    if (!unlocked) return { ok: false, error: "A ChatGrid zárolva van." };
    const cell = chatConfigById(payload?.cellId);
    if (!cell) return { ok: false, error: "Ismeretlen ChatGrid cella." };
    if (payload.action === "toggle-maximize" && cell.id !== "central") {
      toggleCellMaximize(cell.id);
    } else if (payload.action === "close") {
      if (cell.id === "central") toggleCentralChat(false);
      else closeChatView(cell.id);
    } else if (payload.action === "toggle-central") toggleCentralChat();
    else if (payload.action === "reopen") { createChatView(cell); updateViewBounds(); }
    else if (payload.action === "reload") return { ok: true, ...(await requestChatRefresh(cell.id, "manual-cell")), state: publicChatRefreshState() };
    else if (payload.action === "focus") chatViews.get(cell.id)?.webContents.focus();
    else if (payload.action === "zoom-in") setWorkspaceZoom((config.workspaceZoomPercent || 100) + 10);
    else if (payload.action === "zoom-out") setWorkspaceZoom((config.workspaceZoomPercent || 100) - 10);
    else if (payload.action === "zoom-reset") setWorkspaceZoom(100);
    else if (payload.action === "microphone") {
      if (!config.microphoneEnabled) return { ok: false, error: "A ChatGPT mikrofon a Beállításokban ki van kapcsolva." };
      const view = chatViews.get(cell.id);
      if (!view) return { ok: false, error: "A ChatGPT felület nincs megnyitva." };
      view.webContents.focus();
      const clicked = await view.webContents.executeJavaScript(`(() => {
        const selectors = [
          'button[data-testid="composer-speech-button"]',
          'button[data-testid="voice-mode-button"]',
          'button[aria-label*="microphone" i]',
          'button[aria-label*="dictat" i]',
          'button[aria-label*="hang" i]'
        ];
        for (const selector of selectors) {
          const button = document.querySelector(selector);
          if (button && button.getClientRects().length) { button.click(); return true; }
        }
        return false;
      })()`, true).catch(() => false);
      return { ok: true, microphoneAttempted: true, microphoneButtonFound: clicked === true, zoomPercent: config.workspaceZoomPercent || 100 };
    }
    return { ok: true, maximizedCellId, centralVisible, open: chatViews.has(cell.id), zoomPercent: config.workspaceZoomPercent || 100 };
  });
}

app.whenReady().then(() => {
  app.setName(APP_TITLE);
  config = loadConfig();
  // v0.1.13: a dockolt Fejlesztői Vezérlőpult futásidejű felület.
  // Induláskor mindig zártan kezd, hogy a négy ChatGPT WebContentsView teljes cellaszélességet kapjon.
  config.contextWorkspace = { ...config.contextWorkspace, visible: false, detached: false };
  nativeTheme.themeSource = config.appearance === "light" ? "light" : "dark";
  applyLoginItemSetting();
  registerIpc();
  const chatSession = session.fromPartition(CHAT_PARTITION);
  chatSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => {
    const origin = requestingOrigin || details?.requestingUrl || details?.securityOrigin || "";
    if (permission === "notifications") return isChatGptUrl(origin);
    if (permission === "clipboard-sanitized-write" || permission === "clipboard-write") return isChatGptUrl(origin);
    if (permission === "fileSystem") {
      return isChatGptUrl(origin) && details?.fileAccessType !== "writable" && details?.isDirectory !== true;
    }
    if (permission !== "media" || config.microphoneEnabled !== true || !isChatGptUrl(origin)) return false;
    const mediaType = details?.mediaType;
    return !mediaType || mediaType === "audio" || mediaType === "unknown";
  });
  chatSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const requestUrl = details?.requestingUrl || details?.requestingOrigin || "";
    if (permission === "notifications") { callback(isChatGptUrl(requestUrl)); return; }
    if (permission === "clipboard-sanitized-write" || permission === "clipboard-write") { callback(isChatGptUrl(requestUrl)); return; }
    if (permission === "fileSystem") {
      callback(isChatGptUrl(requestUrl) && details?.fileAccessType !== "writable" && details?.isDirectory !== true);
      return;
    }
    if (permission === "media" && config.microphoneEnabled === true) {
      const mediaTypes = Array.isArray(details?.mediaTypes) ? details.mediaTypes : [];
      callback(isChatGptUrl(requestUrl) && (mediaTypes.length === 0 || mediaTypes.every((type) => type === "audio")));
      return;
    }
    callback(false);
  });
  chatSession.on("file-system-access-restricted", (_event, details, callback) => {
    callback(isChatGptUrl(details?.origin || "") && details?.isDirectory !== true ? "allow" : "deny");
  });
  createShellWindow();
  registerGlobalShortcuts();
  startChatRefreshMaintenance();
  powerMonitor.on("lock-screen", () => lockWorkspace("windows-session-lock"));
});

app.on("before-quit", () => { appQuitting = true; });
app.on("will-quit", () => { stopChatRefreshMaintenance(); globalShortcut.unregisterAll(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (!shellWindow) createShellWindow(); });
