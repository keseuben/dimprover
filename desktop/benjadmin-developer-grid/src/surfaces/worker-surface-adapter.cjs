"use strict";

const {
  WORKER_SURFACE_TYPES,
  normalizeWorkerSurfaceType,
  workerSurfaceDefinition,
} = require("./worker-surface.cjs");

class WorkerSurfaceAdapter {
  constructor(type) {
    this.type = normalizeWorkerSurfaceType(type);
    this.definition = workerSurfaceDefinition(this.type);
  }
  get embedded() { return this.definition.embedded === true; }
  get selectable() { return this.definition.selectable === true; }
  get automationReady() { return false; }
  automationBlock() {
    return { ok: false, code: "WORKER_SURFACE_AUTOMATION_UNAVAILABLE", error: `${this.type} surface automatizálása nincs engedélyezve.` };
  }
}

class ChatGptSurfaceAdapter extends WorkerSurfaceAdapter {
  constructor() { super(WORKER_SURFACE_TYPES.CHATGPT); }
  get automationReady() { return true; }
  automationBlock() { return { ok: true, code: null, error: null }; }
}

class CodexSurfaceAdapter extends WorkerSurfaceAdapter {
  constructor() { super(WORKER_SURFACE_TYPES.CODEX); }
  automationBlock() {
    return {
      ok: false,
      code: "CODEX_TASK_BRIDGE_REQUIRED",
      error: "A Codex OpenAI first-party fejlesztői surface Task Bridge végrehajtást használ. Embedded ChatGPT Launch/BOOT ACK/DOM transcript automatizálás Codexhez tiltott; használd a Developer Grid Codex Task Bridge-et.",
    };
  }
}

class WorkSurfaceAdapter extends WorkerSurfaceAdapter {
  constructor() { super(WORKER_SURFACE_TYPES.WORK); }
  automationBlock() {
    return {
      ok: false,
      code: "WORK_SURFACE_PLANNED_V0145",
      error: "A Work surface adapter v0.1.45-ben aktiválódik. v0.1.44-ben a Stage-1 BOOT ACK recovery hotfix miatt a modell/provenance továbbra is előkészített, de a választás fail-closed.",
    };
  }
}

const ADAPTERS = Object.freeze({
  CHATGPT: new ChatGptSurfaceAdapter(),
  CODEX: new CodexSurfaceAdapter(),
  WORK: new WorkSurfaceAdapter(),
});

function workerSurfaceAdapter(type) {
  return ADAPTERS[normalizeWorkerSurfaceType(type)] || ADAPTERS.CHATGPT;
}

module.exports = {
  WorkerSurfaceAdapter,
  ChatGptSurfaceAdapter,
  CodexSurfaceAdapter,
  WorkSurfaceAdapter,
  workerSurfaceAdapter,
};
