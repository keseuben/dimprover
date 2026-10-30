import type { GridBuildRun, WorkerSession } from "./types";

export type DevDeliveryTarget = "NONE" | "DRIVE_DEV";
export type DevDeliveryIdentity = {
  taskId: string; sessionId: string; workerCode: string; sourceCommit: string;
  sourceBranch: string; buildRunId: string; buildId: string; artifactSha256: string;
};
export type DevDeliveryRecord = DevDeliveryIdentity & {
  schemaVersion: 1; id: string; target: "DRIVE_DEV"; environment: "DEV"; productionAccess: "DENY";
  status: "APPROVED" | "STAGING" | "CANDIDATE_READY" | "PUBLIC_PENDING_BROWSER" | "PASS_ASSISTED" | "ROLLED_BACK" | "BLOCKED";
  approvedAt: string; updatedAt: string; code: string | null;
  browserVerification: { result: "PASS" | "FAIL"; note: string; observedAt: string; authority: "PAIRED_OPERATOR" } | null;
  [key: string]: unknown;
};

function fail(code: string, message: string): never { throw Object.assign(new Error(message), { code, status: 409 }); }

export function normalizeDevDeliveryTarget(raw: unknown, projectId: string, moduleName: string): DevDeliveryTarget {
  const target = raw == null ? "NONE" : String(raw);
  if (!["NONE", "DRIVE_DEV"].includes(target)) fail("DEV_DELIVERY_TARGET_INVALID", "Ismeretlen DEV-kihelyezési cél.");
  if (target === "DRIVE_DEV" && (projectId !== "project_dimprover" || moduleName.trim().toLowerCase() !== "dimpro drive")) {
    fail("DEV_DELIVERY_MODULE_MISMATCH", "A Drive DEV-kihelyezés kizárólag a DIMPRO Drive modulhoz választható.");
  }
  return target as DevDeliveryTarget;
}

export function devDeliveryIdentity(session: WorkerSession, runs: GridBuildRun[]): DevDeliveryIdentity {
  if (session.endedAt || Number(session.developmentContext.workStageIndex) !== 6 || session.developmentContext.bootAckState !== "VALIDATED") {
    fail("DEV_DELIVERY_SESSION_REQUIRED", "A DEV-kihelyezéshez aktív, validált 6/6-os munkamenet kell.");
  }
  if (session.developmentContext.devDeliveryTarget !== "DRIVE_DEV") fail("DEV_DELIVERY_NOT_AUTHORIZED", "Ehhez a feladathoz nem kértek DEV-kihelyezést.");
  normalizeDevDeliveryTarget("DRIVE_DEV", session.developmentContext.projectId, session.developmentContext.moduleName);
  if (session.sourceProvenance.sourceState !== "VERIFIED" || session.sourceProvenance.blockCode) fail("DEV_DELIVERY_SOURCE_UNVERIFIED", "A modulforrás nincs igazolva.");
  const relevant = runs.filter(r => r.taskId === session.taskId && r.sessionId === session.id && r.workerCode === session.workerCode);
  relevant.sort((a,b) => Date.parse(b.queuedAt) - Date.parse(a.queuedAt));
  // A newer failed or pending build must not silently select an older PASS.
  const run = relevant[0];
  if (!run || run.status !== "PASS" || run.exitCode !== 0 || run.productionAccess !== "DENY" || run.sourceCommit !== session.sourceProvenance.head || run.sourceBranch !== session.sourceProvenance.branch) {
    fail("DEV_DELIVERY_BUILD_REQUIRED", "Az aktuális task/session/HEAD legutóbbi buildje nem igazolt PASS.");
  }
  if (!/^[0-9a-f]{40}$/.test(run.sourceCommit) || !/^[0-9a-f]{64}$/.test(run.artifactSha256 || "") || !/^[A-Za-z0-9_-]{1,180}$/.test(run.buildId || "")) {
    fail("DEV_DELIVERY_ARTIFACT_INVALID", "Hiányos build- vagy artifact-azonosság.");
  }
  return { taskId: session.taskId, sessionId: session.id, workerCode: session.workerCode, sourceCommit: run.sourceCommit, sourceBranch: run.sourceBranch, buildRunId: run.id, buildId: run.buildId!, artifactSha256: run.artifactSha256! };
}

export function sameDevDeliveryIdentity(record: DevDeliveryIdentity, expected: DevDeliveryIdentity) {
  return (Object.keys(expected) as (keyof DevDeliveryIdentity)[]).every(key => record[key] === expected[key]);
}

export function devDeliveryAllowsClosure(session: WorkerSession, record: DevDeliveryRecord | null, expected?: DevDeliveryIdentity) {
  if (!session.developmentContext.devDeliveryTarget || session.developmentContext.devDeliveryTarget === "NONE") return true;
  return Boolean(expected && record && sameDevDeliveryIdentity(record, expected) && record.target === "DRIVE_DEV" && record.environment === "DEV" && record.productionAccess === "DENY" && record.status === "PASS_ASSISTED" && record.browserVerification?.result === "PASS" && record.browserVerification.authority === "PAIRED_OPERATOR");
}
