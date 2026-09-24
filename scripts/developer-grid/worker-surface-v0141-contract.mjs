import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const pkg = JSON.parse(read("desktop/benjadmin-developer-grid/package.json"));
const types = read("app/lib/developer-grid/types.ts");
const workStart = read("app/lib/developer-grid/work-start.ts");
const memory = read("app/lib/developer-grid/conversation-memory.ts");
const defaults = read("desktop/benjadmin-developer-grid/src/config/defaults.cjs");
const surface = read("desktop/benjadmin-developer-grid/src/surfaces/worker-surface.cjs");
const adapter = read("desktop/benjadmin-developer-grid/src/surfaces/worker-surface-adapter.cjs");
const main = read("desktop/benjadmin-developer-grid/src/main.cjs");
const renderer = read("desktop/benjadmin-developer-grid/src/renderer/renderer.js");
const context = read("desktop/benjadmin-developer-grid/src/renderer/context-workspace.js");
const html = read("desktop/benjadmin-developer-grid/src/renderer/index.html");
const live = read("desktop/benjadmin-developer-grid/src/live/benjadmin-live-client.cjs");

let n = 0;
function check(name, fn) { fn(); n += 1; console.log(`PASS ${String(n).padStart(2,"0")} ${name}`); }

check("desktop version v0.1.68", () => assert.equal(pkg.version, "0.1.68"));
check("backend version v0.1.68-dev", () => assert.match(types, /DEVELOPER_GRID_VERSION = "0\.1\.68-dev"/));
check("surface type contract includes ChatGPT Codex Work", () => assert.match(types, /WorkerSurfaceType = "CHATGPT" \| "CODEX" \| "WORK"/));
check("all four worker cells default to ChatGPT", () => assert.equal((defaults.match(/surfaceType: "CHATGPT"/g) || []).length, 4));
check("config v14 persists normalized per-cell surface", () => { assert.match(defaults,/CONFIG_VERSION = 14/); assert.match(defaults,/normalizeWorkerSurfaceType/); assert.match(defaults,/surfaceType,/); });
check("header exposes one surface selector per worker cell", () => assert.equal((html.match(/data-role="surface-select"/g) || []).length, 4));
check("selector exposes ChatGPT and Codex while Work stays planned", () => { assert.match(html,/<option value="CHATGPT">ChatGPT<\/option>/); assert.match(html,/<option value="CODEX">Codex<\/option>/); assert.match(html,/<option value="WORK" disabled>Work · v0\.1\.60<\/option>/); });
check("surface adapter separates embedded ChatGPT from Codex Task Bridge", () => { assert.match(adapter,/class ChatGptSurfaceAdapter/); assert.match(adapter,/class CodexSurfaceAdapter/); assert.match(adapter,/CODEX_TASK_BRIDGE_REQUIRED/); });
check("Work adapter remains fail-closed in the v0.1.61 UI/startup patch", () => assert.match(adapter,/WORK_SURFACE_PLANNED_V0159/));
check("main process never creates embedded view for non-embedded surface", () => assert.match(main,/!isEmbeddedWorkerSurface\(surfaceType\)/));
check("active task blocks surface mutation", () => assert.match(main,/WORKER_SURFACE_ACTIVE_TASK_LOCKED/));
check("Central Core sends selected surface with work-start", () => { assert.match(context,/selectedWorkerSurface/); assert.match(context,/surfaceType,idempotencyKey/); });
check("Codex uses Task Bridge while Work remains fail-closed", () => { assert.match(context,/startDeveloperGridTaskBridge/); assert.match(context,/OPENAI FIRST-PARTY · TASK BRIDGE/); assert.match(workStart,/CODEX_TASK_BRIDGE_REQUIRED/); assert.match(workStart,/WORK_SURFACE_PLANNED_V0159/); });
check("unknown explicit surface fails closed instead of falling back to ChatGPT", () => assert.match(workStart,/DEVELOPER_GRID_SURFACE_INVALID/));
check("work-start persists surface into authoritative development context", () => { assert.match(workStart,/surfaceType: input\.surfaceType/); assert.match(workStart,/DEVELOPER_GRID_SURFACE_MISMATCH/); });
check("generic surface conversation provenance coexists with legacy ChatGPT fields", () => { for (const key of ["surfaceConversationId","surfaceConversationUrl","surfaceConversationTitle","surfaceConversationConfirmedAt"]) assert.match(types,new RegExp(key)); assert.match(workStart,/chatConversationId: chatConversationId \|\| null/); });
check("Conversation Memory keys RAW and derived state by surface", () => { assert.match(memory,/surfaceMemoryKey/); assert.match(memory,/DEVELOPER_GRID_RAW_SURFACE_MISMATCH/); assert.match(memory,/surfaceType:currentSurfaceType/); });
check("legacy v0.1.40 ChatGPT memory remains readable and chain-continuable", () => { assert.match(memory,/if\(type==="CHATGPT"\)/); assert.match(memory,/rawMemoryFile/); assert.match(memory,/latestMemoryFile/); assert.match(memory,/surfaceType:latest\.surfaceType\|\|"CHATGPT"/); });
check("desktop RAW chat capture remains ChatGPT-only; Codex uses Task Bridge artifacts", () => assert.match(main,/if \(surfaceType !== "CHATGPT"\) return null/));
check("live state exposes generic surface provenance", () => { assert.match(live,/surfaceType:/); assert.match(live,/surfaceConversationId:/); });
check("renderer persists per-cell selection and disables active-task switching", () => { assert.match(renderer,/changeWorkerSurface/); assert.match(renderer,/Aktív task közben a worker surface nem váltható/); });
check("planned Work surface remains recoverable to an active choice", () => { assert.match(renderer,/surfaceSelect\.disabled = locked/); assert.doesNotMatch(renderer,/surfaceSelect\.disabled = locked \|\| surfaceType === "WORK"/); });
check("Codex cannot inherit ChatGPT URL as surface URL", () => assert.match(surface,/if \(type === WORKER_SURFACE_TYPES\.CODEX\) return ""/));
check("Codex binding accepts only absent URL or codex protocol identity", () => assert.match(workStart,/surfaceConversationUrl\.toLowerCase\(\)\.startsWith\("codex:"\)/));

console.log(`Developer Grid Worker Surface Selector v0.1.57 contract PASS · ${n}/${n}`);
