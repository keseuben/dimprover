"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("chatGridPlus", { openCentral: () => ipcRenderer.send("plus:click") });
