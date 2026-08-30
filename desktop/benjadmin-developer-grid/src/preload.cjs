"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("chatGrid", {
  getAppVersion: () => ipcRenderer.invoke("app:get-version"),
  getShortcutStatus: () => ipcRenderer.invoke("shortcuts:get-status"),
  getSystemHealth: () => ipcRenderer.invoke("system-health:get"),
  getSecurityState: () => ipcRenderer.invoke("security:get-state"),
  setupPassword: (password) => ipcRenderer.invoke("security:setup", { password }),
  unlock: (password) => ipcRenderer.invoke("security:unlock", { password }),
  lock: () => ipcRenderer.invoke("security:lock"),
  getConfig: () => ipcRenderer.invoke("config:get"),
  updateConfig: (config) => ipcRenderer.invoke("config:update", config),
  setReporterKey: (key) => ipcRenderer.invoke("connection:set-reporter-key", { key }),
  getConnectionState: () => ipcRenderer.invoke("connection:get-state"),
  openPairingPage: () => ipcRenderer.invoke("connection:open-pairing-page"),
  startPairing: (activationCode) => ipcRenderer.invoke("connection:pairing-start", { activationCode }),
  cancelPairing: () => ipcRenderer.invoke("connection:pairing-cancel"),
  forgetDevice: () => ipcRenderer.invoke("connection:forget-device"),
  testNotification: (type) => ipcRenderer.invoke("notification:test", { type }),
  getNotificationDiagnostics: () => ipcRenderer.invoke("notification:diagnostics"),
  requestWebNotificationPermission: () => ipcRenderer.invoke("notification:request-web"),
  setUiOverlay: (visible) => ipcRenderer.invoke("ui:overlay", { visible }),
  getReviewRoom: () => ipcRenderer.invoke("review:get"),
  getContextWorkspace: (filters = {}) => ipcRenderer.invoke("context:get", filters),
  getDeveloperGridActiveWork: () => ipcRenderer.invoke("work-start:get"),
  startDeveloperGridWork: (input = {}) => ipcRenderer.invoke("work-start:create", input),
  bindTaskConversation: (workerCode, taskId) => ipcRenderer.invoke("task:bind-conversation", { workerCode, taskId }),
  contextWorkspaceMode: (action, payload = {}) => ipcRenderer.invoke("context:mode", { action, ...payload }),
  bindContext: (workerCode, item) => ipcRenderer.invoke("context:bind", { workerCode, item }),
  clearContext: (workerCode) => ipcRenderer.invoke("context:clear", { workerCode }),
  uploadContextResources: async (metadata, files = []) => {
    const encoded = [];
    for (const file of files) encoded.push({ name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    return ipcRenderer.invoke("context:upload", { metadata, files: encoded });
  },
  prepareHandoff: (workerCode) => ipcRenderer.invoke("handoff:prepare", { workerCode }),
  captureSaveHandoff: (workerCode) => ipcRenderer.invoke("handoff:capture-save", { workerCode }),
  downloadHandoff: (handoffId, fileName = "") => ipcRenderer.invoke("handoff:download", { handoffId, fileName }),
  getHandoffState: () => ipcRenderer.invoke("handoff:get-state"),
  windowAction: (action) => ipcRenderer.invoke("window:action", action),
  workspaceAction: (action, payload = {}) => ipcRenderer.invoke("workspace:action", { action, ...payload }),
  cellAction: (cellId, action) => ipcRenderer.invoke("cell:action", { cellId, action }),
  prepareDailyStart: () => ipcRenderer.invoke("daily:prepare-start"),
  prepareTaskLaunch: (workerCode, taskId) => ipcRenderer.invoke("task:prepare-launch", { workerCode, taskId }),
  prepareStageAction: (workerCode, action) => ipcRenderer.invoke("stage-action:prepare", { workerCode, action }),
  onSecurityState: (callback) => ipcRenderer.on("security:state", (_event, payload) => callback(payload)),
  onLiveState: (callback) => ipcRenderer.on("live:snapshot", (_event, payload) => callback(payload)),
  onLiveConnection: (callback) => ipcRenderer.on("live:connection", (_event, payload) => callback(payload)),
  onPairingState: (callback) => ipcRenderer.on("connection:pairing", (_event, payload) => callback(payload)),
  onWorkerEvent: (callback) => ipcRenderer.on("worker:event", (_event, payload) => callback(payload)),
  onConfig: (callback) => ipcRenderer.on("config:state", (_event, payload) => callback(payload)),
  onLayout: (callback) => ipcRenderer.on("layout:state", (_event, payload) => callback(payload)),
  onHandoffState: (callback) => ipcRenderer.on("handoff:state", (_event, payload) => callback(payload)),
  onContextLayout: (callback) => ipcRenderer.on("context:layout", (_event, payload) => callback(payload)),
  onContextRefresh: (callback) => ipcRenderer.on("context:refresh", (_event, payload) => callback(payload)),
  onOpenSettings: (callback) => ipcRenderer.on("ui:open-settings", () => callback())
});
