import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const workStart = fs.readFileSync(path.join(root, "app/lib/developer-grid/work-start.ts"), "utf8");
let n = 0;
const check = (name, fn) => { fn(); n += 1; console.log("PASS", name); };

check("manual rebind has explicit pre-BOOT WAITING path", () => {
  assert.ok(workStart.includes('const preBootManualRebind = ctx.bootAckState === "WAITING" && ctx.bootAckCodingAllowed !== true;'));
});
check("pre-BOOT rebind is limited to stage 1", () => {
  assert.ok(workStart.includes("DEVELOPER_GRID_PREBOOT_REBIND_STAGE_DENIED"));
});
check("pre-BOOT rebind requires VERIFIED source", () => {
  assert.ok(workStart.includes("DEVELOPER_GRID_PREBOOT_REBIND_SOURCE_NOT_VERIFIED"));
});
check("pre-BOOT rebind requires clean source", () => {
  assert.ok(workStart.includes("verifyCurrentSourceExecutionState(session.sourceProvenance, { requireClean:true })"));
});
check("pre-BOOT rebind requires active READY engine ownership", () => {
  assert.ok(workStart.includes("DEVELOPER_GRID_PREBOOT_REBIND_ENGINE_BINDING_INVALID"));
});
check("pre-BOOT rebind self-recovers expired engine execution without changing Grid identity", () => {
  const manual = workStart.slice(workStart.indexOf("  if (manualRebind) {"), workStart.indexOf("  if (conversationRollover) {", workStart.indexOf("  if (manualRebind) {")));
  assert.ok(manual.includes("recoverDeveloperGridLaunchExecution({"));
  assert.ok(manual.includes("sessionId: session.id"));
  assert.ok(manual.includes("recoveredSession.id !== session.id"));
  assert.ok(manual.includes("recoveredSession.taskId !== taskId"));
  assert.ok(manual.includes("DEVELOPER_GRID_PREBOOT_REBIND_RECOVERY_IDENTITY_MISMATCH"));
});
check("pre-BOOT rebind recovery preserves exact source HEAD and worktree", () => {
  const manual = workStart.slice(workStart.indexOf("  if (manualRebind) {"), workStart.indexOf("  if (conversationRollover) {", workStart.indexOf("  if (manualRebind) {")));
  assert.ok(manual.includes("sourceHeadBeforeRecovery"));
  assert.ok(manual.includes("sourceWorktreeBeforeRecovery"));
  assert.ok(manual.includes("recoveredHead !== sourceHeadBeforeRecovery"));
  assert.ok(manual.includes("recoveredWorktree !== sourceWorktreeBeforeRecovery"));
  assert.ok(manual.includes('recoveredSession.developmentContext.bootAckState !== "WAITING"'));
});
check("pre-BOOT rebind requires write gate + lock + worktree lease", () => {
  assert.ok(workStart.includes('assertDevEngineOperation(engineSessionId, "write")'));
  assert.ok(workStart.includes("DEVELOPER_GRID_PREBOOT_REBIND_LOCK_REQUIRED"));
});
check("pre-BOOT rebind requires CENTRAL_CORE VERIFIED source proof", () => {
  assert.ok(workStart.includes("DEVELOPER_GRID_PREBOOT_REBIND_SOURCE_PROOF_INVALID"));
  assert.ok(workStart.includes('sourceProof.authority !== "CENTRAL_CORE"'));
});
check("normal validated rebind still requires continuity", () => {
  assert.ok(workStart.includes("validatedManualRebind && (!ctx.contextSnapshotId || !ctx.handoffPackId)"));
});
check("manual rebind still enforces same ChatGPT Project", () => {
  assert.ok(workStart.includes("DEVELOPER_GRID_MANUAL_REBIND_PROJECT_MISMATCH"));
});
check("manual rebind still enforces PROD DENY", () => {
  assert.ok(workStart.includes("Kézi conversation rebind PROD hozzáféréssel tiltott."));
});

console.log("Developer Grid v0.1.98 pre-BOOT manual rebind contract PASS · " + n + "/" + n);
