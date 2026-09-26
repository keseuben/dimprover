import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const main = fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/src/main.cjs"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/package.json"), "utf8"));
const types = fs.readFileSync(path.join(root, "app/lib/developer-grid/types.ts"), "utf8");
let n=0; const check=(label,fn)=>{fn();n+=1;console.log(`PASS ${String(n).padStart(2,"0")} ${label}`)};

check("desktop version v0.1.71",()=>assert.equal(pkg.version,"0.1.71"));
check("backend version v0.1.71-dev",()=>assert.match(types,/DEVELOPER_GRID_VERSION = "0\.1\.71-dev"/));
check("conversation monitor reads local rollover record before server state",()=>{
  assert.match(main,/const localRolloverRecord = loadTaskLaunchRecords\(\)\[String\(live\.task\.id\)\] \|\| \{\};/);
  assert.match(main,/const rolloverState = String\(localRolloverRecord\.conversationRolloverState \|\| live\.task\?\.conversationRolloverState \|\| live\.task\?\.chatLaunch\?\.conversationRolloverState \|\| ""\)\.toUpperCase\(\);/);
});
check("markerless ACK detection remains gated by ACK_WAIT",()=>assert.match(main,/rolloverState === ROLLOVER_STATES\.ACK_WAIT/));
check("strict markerless parser remains the detector",()=>assert.match(main,/parseConversationRolloverAck\(latestAssistant\.text\)\?\.ok/));
check("ACK processor itself still prefers local rollover state",()=>assert.match(main,/const state = String\(record\.conversationRolloverState \|\| task\?\.conversationRolloverState \|\| task\?\.chatLaunch\?\.conversationRolloverState \|\| ""\)\.toUpperCase\(\);/));
check("execution bridge remains blocked while rollover pending",()=>assert.match(main,/CONVERSATION_ROLLOVER_ACK_REQUIRED/));
check("PROD remains denied in rollover binding",()=>assert.match(main,/productionAccess:"DENY"/));
console.log(`Developer Grid markerless startup recovery v0.1.70 contract PASS · ${n}/${n}`);
