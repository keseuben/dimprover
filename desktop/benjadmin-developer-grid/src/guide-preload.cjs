"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("benjadminGuide", {
  get: () => ipcRenderer.invoke("guide:get"),
  save: (payload) => ipcRenderer.invoke("guide:save", payload),
  reset: () => ipcRenderer.invoke("guide:reset"),
  close: () => ipcRenderer.invoke("guide:close")
});
