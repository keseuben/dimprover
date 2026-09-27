import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const main = fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/src/main.cjs"),"utf8");
const types = fs.readFileSync(path.join(root,"app/lib/developer-grid/types.ts"),"utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/package.json"),"utf8"));
let n=0; const check=(label,fn)=>{fn();n++;console.log(`PASS ${String(n).padStart(2,"0")} ${label}`);};

check("desktop version v0.1.73",()=>assert.equal(pkg.version,"0.1.80"));
check("backend version v0.1.73-dev",()=>assert.match(types,/DEVELOPER_GRID_VERSION = "0\.1\.80-dev"/));
check("memory identity keeps authoritative and local conversation ids separate",()=>{
  assert.match(main,/const authoritativeConversationId = String\(/);
  assert.match(main,/const localConversationId = String\(/);
  assert.match(main,/const expectedConversationId = authoritativeConversationId \|\| localConversationId/);
});
check("authoritative orphan detection runs even when local expected equals current successor",()=>{
  const a=main.indexOf("if (currentId\n    && live.authoritativeConversationId");
  const b=main.indexOf("if (!currentId || currentId !== live.expectedConversationId)",a);
  assert.ok(a>0 && b>a);
});
check("authoritative predecessor is used for orphan proof",()=>{
  assert.match(main,/previousConversationId:live\.authoritativeConversationId/);
});
check("manual clipboard flow retains precedence guard",()=>{
  assert.match(main,/manualClipboardActive/);
  assert.match(main,/conversationRolloverMode \|\| ""\) === "MANUAL_CLIPBOARD"/);
  assert.match(main,/conversationRolloverState \|\| ""\)\.toUpperCase\(\) === ROLLOVER_STATES\.CLIPBOARD_COPIED/);
});
check("no new task session worktree is created by detection",()=>{
  const start=main.indexOf("function conversationMemoryTaskForWorker");
  const end=main.indexOf("async function syncConversationMemoryOnce",start);
  const block=main.slice(start,end);
  assert.doesNotMatch(block,/prepareDeveloperGridWorkStart|TASK_LAUNCH|materializeGridTaskSession|worktree add/);
});
check("orphan recovery still requires strict v0.1.72 bootstrap validator",()=>{
  assert.match(main,/validateConversationRolloverPrompt\(markerMessage\.text, expected\)/);
});
check("orphan recovery remains same-project only",()=>assert.match(main,/sameChatProjectConversation\(authoritativeUrl, captureUrl\)/));
check("PROD safeguards remain explicit",()=>assert.match(main,/productionAccess/));

console.log(`Developer Grid authoritative orphan detection v0.1.73 contract PASS · ${n}/${n}`);
