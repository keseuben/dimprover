"use strict";

const { createHash } = require("node:crypto");

const CONTINUATION_PROTOCOL_VERSION = "BENJADMIN_CONTINUATION_PROTOCOL_V2";
const CONTINUATION_CAPSULE_SCHEMA = "BENJADMIN_CONTINUATION_CAPSULE_V1";
const DEVELOPMENT_RULE_PACK_ID = "BENJADMIN_DEVELOPMENT_RULE_PACK_V1";
const SKILL_MANIFEST_ID = "BENJADMIN_SKILL_MANIFEST_V1";
const TIME_TRACKING_POLICY_VERSION = "BENJADMIN_TIME_TRACKING_V1";

function text(value, max = 8000) { return String(value ?? "").trim().slice(0, max); }
function normalizeWorker(value) { const code = text(value, 40).toUpperCase(); return code === "BENAI" ? "BENJAMINAI" : code; }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => { out[key] = stable(value[key]); return out; }, {});
}
function sha256(value) { return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
function list(value) {
  if (Array.isArray(value)) return value.map((item) => {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") return text(item, 2000);
    if (item && typeof item === "object") return text(item.summary || item.description || item.key || JSON.stringify(stable(item)), 2000);
    return "";
  }).filter(Boolean);
  if (value && typeof value === "object") return [text(value.summary || value.description || value.key || JSON.stringify(stable(value)), 8000)].filter(Boolean);
  const raw = text(value, 8000);
  return raw ? [raw] : [];
}
function projectKey(value) {
  try { return new URL(String(value || "")).pathname.match(/^\/g\/(g-p-[^/]+)(?:\/|$)/)?.[1] || ""; }
  catch { return ""; }
}

function buildRulePack() {
  const payload = {
    id: DEVELOPMENT_RULE_PACK_ID,
    version: 1,
    environment: "DEV",
    productionAccess: "DENY",
    timezone: "Europe/Budapest",
    sourcePriority: [
      "CENTRAL_CORE_ACTIVE_TASK_SESSION",
      "SOURCE_PROVENANCE",
      "ACTUAL_GIT_WORKTREE_HEAD_STATUS",
      "PROJECT_HANDOFF_CHECKPOINT",
      "CURRENT_USER_DIRECTIVE",
    ],
    sixStageWorkflow: ["ELEMZES", "FEJLESZTES", "TESZTELES", "ELLENORZES", "BUILD_KIADAS", "LEZARAS"],
    requiredRules: [
      "FAIL_CLOSED_ON_TASK_SESSION_SOURCE_SCOPE_MISMATCH",
      "NO_NEW_TASK_SESSION_WORKTREE_BRANCH_FOR_CONVERSATION_ROLLOVER",
      "LOCAL_REMOTE_GRID_HEAD_MUST_MATCH_AT_CHECKPOINT",
      "COMMIT_REMOTE_PUSH_GRID_SYNC_HANDOFF_AFTER_LOGICAL_BLOCK",
      "CENTRAL_CORE_EXECUTION_BRIDGE_V1_ONLY_FOR_CHATGPT_DEV_EXECUTION",
      "SAFE_DELETE_REQUIRED_BEFORE_DESTRUCTIVE_DELETE",
      "STAGE_SKIP_FORBIDDEN",
      "PROD_DENY",
      "SUCCESSOR_CHAT_HAS_NO_EXECUTION_AUTHORITY_BEFORE_VALID_ACK",
      "STATUS_AND_SUBTASK_REPORTS_REQUIRE_START_REPORT_FINISH_ELAPSED_TIMES",
      "TASK_AND_SUBTASKS_REQUIRE_PRE_START_ESTIMATE_AND_POST_FINISH_VARIANCE",
      "ORIGINAL_ESTIMATE_IMMUTABLE_REVISIONS_APPEND_ONLY",
    ],
  };
  return { ...payload, sha256: sha256(payload) };
}

function buildSkillManifest(task = {}) {
  const requested = Array.isArray(task.requiredSkills) ? task.requiredSkills : [];
  const skills = [
    {
      id: "DIMPRO_SAFE_DELETE",
      required: true,
      source: "/srv/dimpro-dev/development-library/skills/dimpro-safe-delete/SKILL.md",
      sourceSha256: text(task.safeDeleteSkillSha256, 64) || null,
      requiredBefore: ["DELETE", "CLEANUP", "RETIREMENT"],
    },
    ...requested.map((item) => typeof item === "string" ? { id:text(item,160), required:true } : item).filter(Boolean),
  ];
  const payload = { id: SKILL_MANIFEST_ID, version: 1, skills };
  return { ...payload, sha256: sha256(payload) };
}

function buildContinuationCapsule({ task, workerCode, previousConversationId, previousConversationUrl = "", memory, sourceProofSha256 }) {
  const context = memory?.context || {};
  const handoff = memory?.handoff || {};
  const proof = task?.sourceExecutionProof && typeof task.sourceExecutionProof === "object" ? task.sourceExecutionProof : {};
  const rulePack = buildRulePack();
  const skillManifest = buildSkillManifest(task || {});
  const createdAt = text(context.createdAt || handoff.createdAt || task?.startedAt || task?.createdAt, 100) || null;
  const capsule = {
    schema: CONTINUATION_CAPSULE_SCHEMA,
    schemaVersion: 1,
    protocolVersion: CONTINUATION_PROTOCOL_VERSION,
    createdAt,
    environment: "DEV",
    productionAccess: "DENY",
    identity: {
      taskId: text(task?.id, 220),
      sessionId: text(task?.sessionId, 240),
      workerCode: normalizeWorker(workerCode),
      projectId: text(context.projectId || task?.projectId, 220),
      chatProjectKey: projectKey(previousConversationUrl),
      previousConversationId: text(previousConversationId, 180),
    },
    source: {
      repository: text(proof.repository || task?.sourceRepository || task?.repository, 1000),
      branch: text(context.branch || task?.branchName, 600),
      worktree: text(context.worktree || task?.worktreePath, 1200),
      baseHead: text(task?.baseHead || task?.startHead || task?.sourceHead, 64).toLowerCase(),
      currentHead: text(context.sourceHead || task?.sourceHead, 64).toLowerCase(),
      sourceProofSha256: text(sourceProofSha256, 64).toLowerCase(),
      sourceProofAuthority: text(proof.authority || task?.sourceProofAuthority || "CENTRAL_CORE", 40),
      sourceProofState: text(proof.state || task?.sourceProofState || "VERIFIED", 40),
      engineSessionId: text(proof.engineSessionId || task?.sourceProofEngineSessionId || task?.engineSessionId, 240),
      activeScopeLockCount: Number(proof.activeScopeLockCount ?? task?.sourceProofActiveScopeLockCount ?? 0),
      activeWorktreeLeaseCount: Number(proof.activeWorktreeLeaseCount ?? task?.sourceProofActiveWorktreeLeaseCount ?? 0),
    },
    taskContract: {
      title: text(task?.title || task?.workItem, 800),
      mainModule: text(context.mainModule || task?.mainModule, 300),
      moduleName: text(context.moduleName || task?.moduleName, 300),
      submoduleName: text(context.submoduleName || task?.submoduleName, 300) || null,
      workItem: text(context.workItem || task?.workItem || task?.description, 1800),
      stage: Number(context.stage || context.workStageIndex || task?.workStageIndex || 1),
      stageLabel: text(context.stageLabel, 120),
      allowedScope: list(task?.scopeText ?? task?.scope ?? task?.allowedScope ?? task?.allowedScopes),
      denyScope: list(task?.denyScope ?? task?.deniedScope).concat(["PROD", "OTHER_WORKER_SCOPE", "UNAUTHORIZED_PATH", "DESTRUCTIVE_DELETE_WITHOUT_SAFE_DELETE"]),
      acceptance: list(task?.acceptanceText ?? task?.acceptance ?? task?.acceptanceCriteria),
    },
    policy: {
      rulePackId: rulePack.id,
      rulePackVersion: rulePack.version,
      rulePackSha256: rulePack.sha256,
      timeTrackingPolicyVersion: TIME_TRACKING_POLICY_VERSION,
    },
    skills: {
      skillManifestId: skillManifest.id,
      skillManifestVersion: skillManifest.version,
      skillManifestSha256: skillManifest.sha256,
    },
    continuity: {
      rawTranscriptSnapshotSha256: text(context.rawSnapshotSha256 || task?.rawTranscriptSnapshotSha256, 64).toLowerCase() || null,
      contextSnapshotId: text(context.id || task?.contextSnapshotId, 260),
      contextRevision: Number(context.revision || task?.contextRevision || 0),
      handoffPackId: text(handoff.id || task?.handoffPackId, 260),
      canonicalHandoffId: text(handoff.canonicalHandoffId || task?.continuityHandoffId, 260) || null,
      blockers: Array.isArray(context.unresolvedBlockers) ? context.unresolvedBlockers.slice(0, 30) : [],
      summary: text(context.summary || handoff.summary || task?.contextSnapshotSummary, 12000),
      nextStep: text(handoff.nextStep || task?.nextStep, 2000) || null,
    },
    timing: {
      timezone: "Europe/Budapest",
      taskStartedAt: text(task?.startedAt, 100) || null,
      estimateCreatedAt: text(task?.estimateCreatedAt, 100) || null,
      estimatedTotalSeconds: Number.isFinite(Number(task?.estimatedTotalSeconds)) ? Number(task.estimatedTotalSeconds) : null,
      estimateConfidence: ["ALACSONY","KOZEPES","MAGAS"].includes(text(task?.estimateConfidence, 40).toUpperCase()) ? text(task.estimateConfidence, 40).toUpperCase() : null,
      remainingEstimateSeconds: Number.isFinite(Number(task?.remainingEstimateSeconds)) ? Number(task.remainingEstimateSeconds) : null,
    },
  };
  const capsuleSha256 = sha256(capsule);
  const seed = sha256({ taskId:capsule.identity.taskId, sessionId:capsule.identity.sessionId, previousConversationId:capsule.identity.previousConversationId, contextSnapshotId:capsule.continuity.contextSnapshotId, contextRevision:capsule.continuity.contextRevision, capsuleSha256 });
  return {
    ...capsule,
    id: `cc-${text(task?.id, 80) || "task"}-${seed.slice(0, 16)}`,
    capsuleSha256,
    rulePack,
    skillManifest,
  };
}

function verifyContinuationCapsule(capsule) {
  if (!capsule || typeof capsule !== "object") return { ok:false, code:"CONTINUATION_CAPSULE_MISSING" };
  const copy = { ...capsule };
  delete copy.id;
  delete copy.capsuleSha256;
  delete copy.rulePack;
  delete copy.skillManifest;
  const actual = sha256(copy);
  const expected = text(capsule.capsuleSha256, 64).toLowerCase();
  const ok = /^[0-9a-f]{64}$/.test(expected) && actual === expected;
  return { ok, code:ok ? "VERIFIED" : "CONTINUATION_CAPSULE_HASH_MISMATCH", actual, expected };
}

module.exports = {
  CONTINUATION_PROTOCOL_VERSION,
  CONTINUATION_CAPSULE_SCHEMA,
  DEVELOPMENT_RULE_PACK_ID,
  SKILL_MANIFEST_ID,
  TIME_TRACKING_POLICY_VERSION,
  buildRulePack,
  buildSkillManifest,
  buildContinuationCapsule,
  verifyContinuationCapsule,
};
