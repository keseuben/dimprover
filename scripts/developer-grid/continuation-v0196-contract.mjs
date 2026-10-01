import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rollover = require(`${root}/desktop/benjadmin-developer-grid/src/context-workspace/conversation-rollover.cjs`);
const contract = require(`${root}/desktop/benjadmin-developer-grid/src/context-workspace/continuation-contract.cjs`);
const main = fs.readFileSync(`${root}/desktop/benjadmin-developer-grid/src/main.cjs`, "utf8");
const workStart = fs.readFileSync(`${root}/app/lib/developer-grid/work-start.ts`, "utf8");
const types = fs.readFileSync(`${root}/app/lib/developer-grid/types.ts`, "utf8");

let n = 0;
function check(name, fn) { fn(); n += 1; console.log(`PASS ${String(n).padStart(2,"0")} ${name}`); }

const task = {
  id:"task-cont-v2",
  sessionId:"session-cont-v2",
  projectId:"project_dimprover",
  title:"Developer Grid continuation V2",
  scopeText:"module:Developer Grid V1",
  acceptance:["same task", "PROD DENY"],
  branchName:"worker/outminai/developer-grid-v0195-preboot-rebind-20260929",
  worktree:"/srv/dimpro-dev/worktrees/worker-outminai-developer-grid-v0195-preboot-rebind-20260929",
  worktreePath:"/srv/dimpro-dev/worktrees/worker-outminai-developer-grid-v0195-preboot-rebind-20260929",
  sourceHead:"a".repeat(40),
  baseHead:"a".repeat(40),
  workStageIndex:2,
  sourceExecutionProof:{
    state:"VERIFIED", authority:"CENTRAL_CORE", repository:"/srv/dimpro-dev/repositories/dimprover.git",
    worktree:"/srv/dimpro-dev/worktrees/worker-outminai-developer-grid-v0195-preboot-rebind-20260929",
    branch:"worker/outminai/developer-grid-v0195-preboot-rebind-20260929", head:"a".repeat(40),
    engineSessionId:"dev-session-v2", handshakeStage:"READY", activeScopeLockCount:1, activeWorktreeLeaseCount:1,
    productionAccess:"DENY", sha256:"b".repeat(64), verifiedAt:"2026-10-01T20:00:00Z",
  },
};
const memory = {
  context:{ id:"ctx-v2", revision:7, projectId:"project_dimprover", mainModule:"BENJADMIN", moduleName:"Developer Grid V1", workItem:"continuation", stage:2, stageLabel:"FEJLESZTÉS", branch:task.branchName, worktree:task.worktreePath, sourceHead:task.sourceHead, rawSnapshotSha256:"c".repeat(64), summary:"same task continuation", unresolvedBlockers:[], createdAt:"2026-10-01T20:10:00Z" },
  handoff:{ id:"hp-v2", canonicalHandoffId:"handoff-v2", summary:"same task continuation", nextStep:"continue", createdAt:"2026-10-01T20:10:00Z" },
};
const previousConversationUrl = "https://chatgpt.com/g/g-p-gridproject/c/old-conversation";
const prompt = rollover.buildConversationRolloverPrompt({ task, workerCode:"OUTMINAI", previousConversationId:"old-conversation", previousConversationUrl, memory, sourceProofSha256:"b".repeat(64) });
const parsed = rollover.parseConversationRolloverPrompt(prompt);

check("continuation protocol V2 is explicit", () => assert.equal(contract.CONTINUATION_PROTOCOL_VERSION, "BENJADMIN_CONTINUATION_PROTOCOL_V2"));
check("rollover prompt parses V2 contract", () => assert.equal(parsed.ok, true));
check("capsule hash is present", () => assert.match(parsed.prompt.continuationCapsuleSha256, /^[0-9a-f]{64}$/));
check("rule pack hash is present", () => assert.match(parsed.prompt.rulePackSha256, /^[0-9a-f]{64}$/));
check("skill manifest hash is present", () => assert.match(parsed.prompt.skillManifestSha256, /^[0-9a-f]{64}$/));
check("rule pack contains timing + estimate requirements", () => {
  const rp = contract.buildRulePack();
  assert.ok(rp.requiredRules.includes("STATUS_AND_SUBTASK_REPORTS_REQUIRE_START_REPORT_FINISH_ELAPSED_TIMES"));
  assert.ok(rp.requiredRules.includes("TASK_AND_SUBTASKS_REQUIRE_PRE_START_ESTIMATE_AND_POST_FINISH_VARIANCE"));
});
check("safe delete is mandatory skill", () => {
  const sm = contract.buildSkillManifest(task);
  assert.equal(sm.skills[0].id, "DIMPRO_SAFE_DELETE");
  assert.equal(sm.skills[0].required, true);
});
const ack = {
  schemaVersion:1, taskId:task.id, sessionId:task.sessionId, workerCode:"OUTMINAI", previousConversationId:"old-conversation",
  contextSnapshotId:"ctx-v2", contextRevision:7, handoffPackId:"hp-v2", sourceHead:"a".repeat(40), sourceProofSha256:"b".repeat(64),
  continuationProtocolVersion:parsed.prompt.continuationProtocolVersion,
  continuationCapsuleId:parsed.prompt.continuationCapsuleId,
  continuationCapsuleSha256:parsed.prompt.continuationCapsuleSha256,
  rulePackSha256:parsed.prompt.rulePackSha256,
  skillManifestSha256:parsed.prompt.skillManifestSha256,
  productionAccess:"DENY", sameTask:true, newTaskLaunch:false,
};
const expected = { ...ack }; delete expected.schemaVersion; delete expected.productionAccess; delete expected.sameTask; delete expected.newTaskLaunch;
check("exact V2 ACK validates", () => assert.equal(rollover.validateConversationRolloverAck(`${rollover.ROLLOVER_ACK_MARKER}\n${JSON.stringify(ack)}`, expected).validated, true));
check("capsule hash mismatch fails closed", () => {
  const bad = {...ack, continuationCapsuleSha256:"d".repeat(64)};
  const v = rollover.validateConversationRolloverAck(`${rollover.ROLLOVER_ACK_MARKER}\n${JSON.stringify(bad)}`, expected);
  assert.equal(v.validated, false); assert.ok(v.mismatches.includes("continuationCapsuleSha256"));
});
check("main persists candidate conversation separately", () => assert.match(main, /conversationRolloverCandidateConversationId:newConversationId/));
check("main does not locally promote new auto successor in ACK_WAIT", () => {
  const ackWaitBlock = main.slice(main.indexOf('"conversation-rollover-ack-wait"') - 1000, main.indexOf('"conversation-rollover-ack-wait"') + 100);
  assert.doesNotMatch(ackWaitBlock, /surfaceConversationId:newConversationId/);
  assert.doesNotMatch(ackWaitBlock, /chatSessionId:newConversationId/);
});
check("Central Core has candidate-only rollover authority gate", () => assert.match(workStart, /candidateOnlyRollover = conversationRollover && conversationRolloverState !== "READY"/));
check("Central Core preserves current authoritative conversation during candidate phase", () => assert.match(workStart, /authoritativeSurfaceConversationId = candidateOnlyRollover \? text\(currentContext\.surfaceConversationId/));
check("Central Core requires same ChatGPT Project for rollover", () => assert.match(workStart, /projectIdentityOk = Boolean\(authoritativeProjectKey && successorProjectKey && authoritativeProjectKey === successorProjectKey\)/));
check("Central Core freezes capsule rule and skill hashes", () => {
  assert.match(workStart, /conversationContinuationCapsuleSha256/);
  assert.match(workStart, /conversationContinuationRulePackSha256/);
  assert.match(workStart, /conversationContinuationSkillManifestSha256/);
});
check("DevelopmentContext models candidate and continuation identity", () => {
  assert.match(types, /conversationRolloverCandidateConversationId/);
  assert.match(types, /conversationContinuationCapsuleSha256/);
  assert.match(types, /conversationContinuationState/);
});
check("validated manual rebind uses Continuation V2 helper", () => {
  assert.match(main, /async function startValidatedManualRebindContinuationV2/);
  assert.match(main, /return startValidatedManualRebindContinuationV2\(\{ code, task, cell, view, pin, candidateConversationId:conversationId, candidateUrl \}\)/);
});
check("candidate chat is monitored for ACK without authority promotion", () => {
  assert.match(main, /continuationV2Candidate/);
  assert.match(main, /monitoringCandidate:continuationV2Candidate/);
  assert.match(main, /live\.monitoringCandidate && currentId === live\.expectedConversationId/);
});
check("validated direct manual rebind is rejected by Central Core", () => assert.match(workStart, /DEVELOPER_GRID_VALIDATED_REBIND_REQUIRES_CONTINUATION_V2/));
check("predecessor remains authoritative while candidate waits", () => {
  assert.match(workStart, /candidateOnlyRollover = conversationRollover && conversationRolloverState !== "READY"/);
  assert.match(workStart, /surfaceConversationId: authoritativeSurfaceConversationId/);
});
console.log(`Developer Grid Continuation V2 contract PASS · ${n}/${n}`);
