import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const stateRoot = process.env.DIMPRO_DEVELOPER_GRID_STATE_ROOT || "/srv/dimpro-dev/coordination/developer-grid";
const args = Object.fromEntries(process.argv.slice(2).map((entry) => { const at = entry.indexOf("="); return at < 0 ? [entry, ""] : [entry.slice(0, at), entry.slice(at + 1)]; }));
const allowed = new Set(["analysis","coding","file-change","diff","test","build","commit","release","handoff"]);
const kind = allowed.has(args.kind) ? args.kind : "analysis";
const origin = args.origin === "BACKFILL" ? "BACKFILL" : "LIVE";
fs.mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
const statePath = path.join(stateRoot, "state.json");
let state = { schemaVersion: 1, task: null, sessions: [], lastSequence: 0, updatedAt: "" };
try { state = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch {}
const sequence = Math.max(0, Number(state.lastSequence) || 0) + 1;
const timestamp = new Date().toISOString();
const event = {
  id: `grid-event-${crypto.randomUUID()}`,
  sequence,
  kind,
  origin,
  workerCode: "OUTMINAI",
  taskId: args.taskId || "dev-task-benjadmin-developer-grid-v1-night-20260827",
  projectId: "project_dimprover",
  branch: args.branch || "feature/benjadmin-developer-grid-v1-20260827",
  worktree: "/srv/dimpro-dev/worktrees/benjadmin-developer-grid-v1-20260827",
  head: args.head || null,
  timestamp,
  productionAccess: "DENY",
  delta: { summary: String(args.summary || "").slice(0, 1000), mainModule: "BENJADMIN", moduleName: "Developer Grid V1", submoduleName: args.submodule || null, workItem: args.workItem || null, workStageIndex: Number(args.stage) || null, sanitized: true },
};
fs.appendFileSync(path.join(stateRoot, "events.jsonl"), `${JSON.stringify(event)}\n`, { mode: 0o600 });
fs.writeFileSync(statePath, `${JSON.stringify({ ...state, lastSequence: sequence, updatedAt: timestamp }, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ ok: true, sequence, kind, origin, timestamp }));
