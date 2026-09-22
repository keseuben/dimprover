import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=(rel)=>fs.readFileSync(path.join(root,rel),"utf8");
const main=read("desktop/benjadmin-developer-grid/src/main.cjs");
const renderer=read("desktop/benjadmin-developer-grid/src/renderer/renderer.js");
const work=read("app/lib/developer-grid/work-start.ts");
const types=read("app/lib/developer-grid/types.ts");
const pkg=JSON.parse(read("desktop/benjadmin-developer-grid/package.json"));

let n=0;
function check(label,fn){ fn(); n+=1; console.log("PASS "+String(n).padStart(2,"0")+" "+label); }

check("desktop version v0.1.65",()=>assert.equal(pkg.version,"0.1.65"));
check("backend version v0.1.65-dev",()=>assert.ok(types.includes('DEVELOPER_GRID_VERSION = "0.1.65-dev"')));
check("client derives verified legacy source proof",()=>assert.ok(main.includes("function derivedVerifiedSourceProvenanceProofSha256(task)")));
check("legacy proof requires VERIFIED source state",()=>assert.ok(main.includes('toUpperCase() !== "VERIFIED"')));
check("client proof canonical fields present",()=>{
  for(const token of [
    'repository:String(task?.sourceRepository || "")',
    'worktree:String(task?.worktreePath || "")',
    'branch:String(task?.branchName || "")',
    'head:String(task?.sourceHead || "").toLowerCase()',
    'worker:normalizedProofWorkerCode(task?.assignedWorkerId || task?.requestedWorkerId)',
    'taskId:String(task?.id || "")',
    'sessionId:String(task?.sessionId || "")',
    'verifiedAt:String(task?.sourceVerifiedAt || "")',
    'sourceState:"VERIFIED"'
  ]) assert.ok(main.includes(token),token);
});
check("backend derives same verified source provenance proof",()=>assert.ok(work.includes("function derivedVerifiedSourceProvenanceProofSha256(session: WorkerSession)")));
check("backend uses derived proof only as missing explicit proof fallback",()=>assert.ok(work.includes('ctx.sourceExecutionProof?.sha256, 64).toLowerCase() || derivedVerifiedSourceProvenanceProofSha256(session)')));
check("clipboard copied and ACK wait suspend task pin",()=>assert.ok(main.includes('"HANDOFF_SAVED", "NAVIGATING", "CONTINUATION_SENT", "CLIPBOARD_COPIED", "ACK_WAIT"')));
check("same project mismatch uses native confirmation",()=>{
  assert.ok(main.includes("Csevegés átkötése szükséges"));
  assert.ok(main.includes("Átkötés és rollover folytatása"));
});
check("confirmed mismatch reuses authoritative rebind",()=>assert.ok(main.includes("rebindCurrentTaskConversation(code, task.id)")));
check("different project stays fail closed",()=>assert.ok(main.includes("ROLLOVER_PIN_PROJECT_MISMATCH")));
check("rollover block state persists exact error",()=>{
  assert.ok(main.includes("function blockManualConversationRollover"));
  assert.ok(main.includes("conversationRolloverState:ROLLOVER_STATES.BLOCKED"));
  assert.ok(main.includes("conversationRolloverErrorCode"));
  assert.ok(main.includes("conversationRolloverError:String"));
});
check("renderer blocked tooltip includes exact error",()=>{
  assert.ok(renderer.includes("conversationRolloverErrorCode"));
  assert.ok(renderer.includes("conversationRolloverError ||"));
});
check("renderer catches rejected rollover IPC",()=>{
  const start=renderer.indexOf("async function handleConversationRolloverAction");
  const end=renderer.indexOf("async function handleConversationRolloverDownload",start);
  const body=renderer.slice(start,end);
  assert.ok(body.includes("catch (error)"));
  assert.ok(body.includes('button.dataset.rolloverState = "blocked"'));
});
check("manual rollover still never starts new task",()=>{
  const start=main.indexOf("async function prepareManualConversationRollover");
  const end=main.indexOf("async function manualConversationRolloverPrompt",start);
  const body=main.slice(start,end);
  assert.ok(!body.includes("startDeveloperGridWork"));
  assert.ok(!body.includes("prepareWorkerTaskLaunch"));
  assert.ok(!body.includes("TASK_LAUNCH_PROMPT_MARKER"));
});

console.log("Developer Grid manual rollover hotfix v0.1.65 contract PASS · "+n+"/"+n);
