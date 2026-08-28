"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("benjadminCentral", {
  getState: () => ipcRenderer.invoke("central:get-state"),
  cellAction: (action) => ipcRenderer.invoke("cell:action", { cellId: "central", action }),
  windowAction: (action) => ipcRenderer.invoke("central:window-action", action),
  toggleProfile: () => ipcRenderer.invoke("central:profile-toggle"),
  closeProfile: () => ipcRenderer.invoke("central:profile-close"),
  openGlobalSettings: () => ipcRenderer.invoke("central:open-settings"),
  onState: (callback) => ipcRenderer.on("central:state", (_event, payload) => callback(payload))
});
