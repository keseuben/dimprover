import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, lstat, stat, unlink } from "node:fs/promises";
import path from "node:path";
import {
  getPartnerDevelopmentDatabaseClient,
  getPartnerProjectById,
  PartnerDevelopmentError,
  type PartnerDeliveryModel,
  type PartnerProvisionState,
} from "./partner-projects";
import { getPartnerRuntimeIsolationStatus, OUTMIN_TOKEN_HASH_FILE } from "./partner-runtime";
import { PARTNER_REPOSITORY_ROOT, PARTNER_WORKTREE_ROOT } from "./partner-isolation";

type JsonRecord = Record<string, unknown>;

type ProvisionPlan = {
  idempotent: boolean;
  projectId: string;
  projectCode: string;
  provisionState: PartnerProvisionState;
  repositoryId: string;
  repositoryPath: string;
  worktreePath: string;
  devEnvironmentId: string;
  stagEnvironmentId: string;
  deliveryTargetId: string | null;
  deliveryModel: PartnerDeliveryModel;
};

type ExecResult = { stdout: string; stderr: string };

type OsIdentity = { uid: number; gid: number };

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function jsonRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function provisioningCode(error: { message?: string | null } | null) {
  const message = error?.message || "";
  return [
    "PARTNER_PROJECT_ID_REQUIRED",
    "PARTNER_PROJECT_NOT_FOUND",
    "PARTNER_GENERIC_PROJECT_NOT_FOUND",
    "PARTNER_DEFAULT_WORKER_INVALID",
    "PARTNER_PROJECT_NOT_PROVISIONABLE",
    "PARTNER_PROVISION_STATE_INVALID",
    "PARTNER_PROVISION_STATE_MISMATCH",
    "PARTNER_PROVISION_TRANSITION_DENIED",
  ].find((code) => message.includes(code)) || null;
}

function provisioningStatus(code: string) {
  if (code === "PARTNER_PROJECT_NOT_FOUND" || code === "PARTNER_GENERIC_PROJECT_NOT_FOUND") return 404;
  if (code === "PARTNER_PROJECT_NOT_PROVISIONABLE" || code === "PARTNER_PROVISION_STATE_MISMATCH" || code === "PARTNER_PROVISION_TRANSITION_DENIED") return 409;
  if (code === "PARTNER_DEFAULT_WORKER_INVALID") return 503;
  return 400;
}

function dbError(message: string, error: { code?: string; message?: string; details?: string; hint?: string } | null): never {
  const known = provisioningCode(error);
  if (known) throw new PartnerDevelopmentError(error?.message || known, known, provisioningStatus(known));
  const schemaMissing = error?.code === "PGRST202" || error?.code === "PGRST205" || error?.code === "42P01" || error?.code === "42703";
  throw new PartnerDevelopmentError(
    schemaMissing ? "A BENJADMIN B3.2 P3 provisioning séma még nincs alkalmazva." : message,
    schemaMissing ? "PARTNER_P3_SCHEMA_NOT_READY" : error?.code || "PARTNER_PROVISION_DATABASE_ERROR",
    schemaMissing ? 503 : 500,
    error ? { code: error.code, message: error.message, details: error.details, hint: error.hint } : undefined,
  );
}

function planFrom(value: unknown): ProvisionPlan {
  const row = jsonRecord(value);
  const projectCode = text(row.projectCode);
  const plan: ProvisionPlan = {
    idempotent: row.idempotent === true,
    projectId: text(row.projectId),
    projectCode,
    provisionState: text(row.provisionState, "PROVISIONING") as PartnerProvisionState,
    repositoryId: text(row.repositoryId),
    repositoryPath: text(row.repositoryPath),
    worktreePath: text(row.worktreePath),
    devEnvironmentId: text(row.devEnvironmentId),
    stagEnvironmentId: text(row.stagEnvironmentId),
    deliveryTargetId: text(row.deliveryTargetId) || null,
    deliveryModel: text(row.deliveryModel, "HANDOFF") as PartnerDeliveryModel,
  };

  if (!plan.projectId || !/^PART-[0-9]{4,}$/.test(projectCode) || !plan.repositoryId || !plan.devEnvironmentId || !plan.stagEnvironmentId) {
    throw new PartnerDevelopmentError("A P3 provisioning terv hiányos vagy érvénytelen.", "PARTNER_PROVISION_PLAN_INVALID", 500);
  }

  const expectedRepo = path.join(PARTNER_REPOSITORY_ROOT, `${projectCode}.git`);
  const expectedWorktree = path.join(PARTNER_WORKTREE_ROOT, "outmin", projectCode);
  if (path.resolve(plan.repositoryPath) !== path.resolve(expectedRepo) || path.resolve(plan.worktreePath) !== path.resolve(expectedWorktree)) {
    throw new PartnerDevelopmentError(
      "A provisioning terv repository/worktree útvonala kívül esik a determinisztikus partner scope-on.",
      "PARTNER_PROVISION_PATH_INVALID",
      500,
      { projectCode, repositoryPath: plan.repositoryPath, worktreePath: plan.worktreePath },
    );
  }
  return plan;
}

async function pathExists(target: string) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function outminIdentity(): Promise<OsIdentity> {
  const [worktreeOwner, repositoryOwner] = await Promise.all([
    stat(path.join(PARTNER_WORKTREE_ROOT, "outmin")),
    stat(PARTNER_REPOSITORY_ROOT),
  ]);
  if (worktreeOwner.uid <= 0 || worktreeOwner.gid <= 0 || repositoryOwner.uid !== worktreeOwner.uid || repositoryOwner.gid !== worktreeOwner.gid) {
    throw new PartnerDevelopmentError(
      "Az OutminAI partner runtime tulajdonosi identity nem érvényes.",
      "PARTNER_OUTMIN_OS_IDENTITY_INVALID",
      503,
      { worktreeUid: worktreeOwner.uid, worktreeGid: worktreeOwner.gid, repositoryUid: repositoryOwner.uid, repositoryGid: repositoryOwner.gid },
    );
  }
  return { uid: worktreeOwner.uid, gid: worktreeOwner.gid };
}

function execAsIdentity(file: string, args: string[], identity: OsIdentity): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      uid: identity.uid,
      gid: identity.gid,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/srv/partner-dev/home/outmin", LANG: "C.UTF-8", NODE_ENV: process.env.NODE_ENV || "production" },
    }, (error, stdout, stderr) => {
      if (error) {
        const wrapped = new Error(`command failed: ${path.basename(file)}`) as Error & { cause?: unknown; stderr?: string };
        wrapped.cause = error;
        wrapped.stderr = String(stderr || "").slice(0, 2000);
        reject(wrapped);
        return;
      }
      resolve({ stdout: String(stdout || "").trim(), stderr: String(stderr || "").trim() });
    });
  });
}

async function commandMustFail(file: string, args: string[], identity: OsIdentity) {
  try {
    await execAsIdentity(file, args, identity);
    return false;
  } catch (error) {
    const cause = (error as Error & { cause?: NodeJS.ErrnoException }).cause;
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT") throw error;
    return true;
  }
}

async function verifyOwnedByIdentity(target: string, identity: OsIdentity) {
  const info = await stat(target);
  if (info.uid !== identity.uid || info.gid !== identity.gid) {
    throw new PartnerDevelopmentError(
      "A provisionált partner fájlrendszer-elem tulajdonosa nem az OutminAI service identity.",
      "PARTNER_PROVISION_OWNERSHIP_INVALID",
      500,
      { target, uid: info.uid, gid: info.gid },
    );
  }
}

async function ensureBareRepository(plan: ProvisionPlan, identity: OsIdentity) {
  if (!(await pathExists(plan.repositoryPath))) {
    await execAsIdentity("/usr/bin/git", ["init", "--bare", "--initial-branch=main", plan.repositoryPath], identity);
  }
  const bare = await execAsIdentity("/usr/bin/git", ["--git-dir", plan.repositoryPath, "rev-parse", "--is-bare-repository"], identity);
  if (bare.stdout !== "true") {
    throw new PartnerDevelopmentError("A partner repository nem bare Git repository.", "PARTNER_PROVISION_REPOSITORY_INVALID", 500);
  }
  await verifyOwnedByIdentity(plan.repositoryPath, identity);
}

async function ensureWorktree(plan: ProvisionPlan, identity: OsIdentity) {
  if (!(await pathExists(plan.worktreePath))) {
    await execAsIdentity("/usr/bin/git", ["clone", plan.repositoryPath, plan.worktreePath], identity);
  }
  const inside = await execAsIdentity("/usr/bin/git", ["-C", plan.worktreePath, "rev-parse", "--is-inside-work-tree"], identity);
  if (inside.stdout !== "true") {
    throw new PartnerDevelopmentError("A partner worktree nem érvényes Git worktree.", "PARTNER_PROVISION_WORKTREE_INVALID", 500);
  }
  await verifyOwnedByIdentity(plan.worktreePath, identity);
}

async function baselineAcceptance(plan: ProvisionPlan, identity: OsIdentity) {
  const branch = await execAsIdentity("/usr/bin/git", ["-C", plan.worktreePath, "symbolic-ref", "--short", "HEAD"], identity);
  if (branch.stdout !== "main") {
    throw new PartnerDevelopmentError("A partner worktree alapértelmezett branch-e nem main.", "PARTNER_PROVISION_BRANCH_INVALID", 500, { branch: branch.stdout });
  }

  const probe = path.join(plan.worktreePath, `.benjadmin-p3-write-${Date.now()}`);
  await execAsIdentity("/usr/bin/touch", [probe], identity);
  await access(probe, fsConstants.F_OK);
  await unlink(probe);

  const internalReadDenied = await commandMustFail("/usr/bin/test", ["-r", "/srv/dimpro-dev"], identity);
  const internalTraverseDenied = await commandMustFail("/usr/bin/test", ["-x", "/srv/dimpro-dev"], identity);
  const secretReadDenied = await commandMustFail("/usr/bin/test", ["-r", OUTMIN_TOKEN_HASH_FILE], identity);
  if (!internalReadDenied || !internalTraverseDenied || !secretReadDenied) {
    throw new PartnerDevelopmentError(
      "A P3 baseline izolációs acceptance sikertelen.",
      "PARTNER_PROVISION_ISOLATION_FAILED",
      500,
      { internalReadDenied, internalTraverseDenied, secretReadDenied },
    );
  }

  await execAsIdentity("/usr/bin/git", ["-C", plan.worktreePath, "status", "--porcelain"], identity);
  return {
    repository: "READY",
    worktree: "READY",
    branch: "main",
    partnerWrite: true,
    internalReadDenied,
    internalTraverseDenied,
    secretReadDenied,
  };
}

async function transition(projectId: string, expectedState: PartnerProvisionState, nextState: PartnerProvisionState, actor: string, metadata: JsonRecord = {}) {
  const db = getPartnerDevelopmentDatabaseClient();
  const { data, error } = await db.rpc("dev_center_transition_partner_provisioning_atomic", {
    p_project_id: projectId,
    p_expected_state: expectedState,
    p_next_state: nextState,
    p_actor: actor,
    p_summary: `Partner provisioning: ${expectedState} -> ${nextState}`,
    p_metadata: metadata,
  });
  if (error) dbError("A partner provisioning state átmenet sikertelen.", error);
  return jsonRecord(data);
}

async function registerFailure(projectId: string, code: string, actor: string, metadata: JsonRecord = {}) {
  try {
    const db = getPartnerDevelopmentDatabaseClient();
    await db.rpc("dev_center_fail_partner_provisioning_atomic", {
      p_project_id: projectId,
      p_error_code: code,
      p_actor: actor,
      p_metadata: metadata,
    });
  } catch {
    // Best effort only; az eredeti provisioning hiba marad az elsődleges.
  }
}

export async function provisionPartnerProject(projectId: string, actor = "BenjAdmin") {
  const normalizedProjectId = text(projectId);
  if (!normalizedProjectId) throw new PartnerDevelopmentError("A projectId kötelező.", "PARTNER_PROJECT_ID_REQUIRED", 400);

  const runtimeIsolation = await getPartnerRuntimeIsolationStatus();
  if (!runtimeIsolation.ready) {
    throw new PartnerDevelopmentError(
      "A P3 provisioning csak P2 RUNTIME READY állapotból indítható.",
      "PARTNER_RUNTIME_NOT_READY",
      503,
      { stage: runtimeIsolation.stage, blockers: runtimeIsolation.blockers },
    );
  }

  const before = await getPartnerProjectById(normalizedProjectId);
  if (!before.health.ready) {
    throw new PartnerDevelopmentError("A P3 partner schema nem READY.", "PARTNER_P3_SCHEMA_NOT_READY", 503, before.health);
  }
  if (!before.project) throw new PartnerDevelopmentError("A partnerprojekt nem található.", "PARTNER_PROJECT_NOT_FOUND", 404);

  const db = getPartnerDevelopmentDatabaseClient();
  let plan: ProvisionPlan | null = null;
  try {
    const prepared = await db.rpc("dev_center_prepare_partner_provisioning_atomic", {
      p_project_id: normalizedProjectId,
      p_created_by: actor,
    });
    if (prepared.error) dbError("A partner provisioning terv előkészítése sikertelen.", prepared.error);
    plan = planFrom(prepared.data);

    if (plan.provisionState === "READY") {
      const readySnapshot = await getPartnerProjectById(normalizedProjectId);
      return { ready: true, idempotent: true, plan, baseline: null, project: readySnapshot.project };
    }

    const identity = await outminIdentity();
    await ensureBareRepository(plan, identity);
    await ensureWorktree(plan, identity);

    if (plan.deliveryModel !== "HANDOFF") {
      await registerFailure(normalizedProjectId, "PARTNER_HOSTED_RESOURCE_PROVIDER_REQUIRED", actor, {
        deliveryModel: plan.deliveryModel,
        repositoryReady: true,
        worktreeReady: true,
      });
      const pending = await getPartnerProjectById(normalizedProjectId);
      return {
        ready: false,
        idempotent: plan.idempotent,
        pendingProvider: true,
        code: "PARTNER_HOSTED_RESOURCE_PROVIDER_REQUIRED",
        plan,
        baseline: null,
        project: pending.project,
      };
    }

    if (plan.provisionState !== "BASELINE_TEST") {
      await transition(normalizedProjectId, "PROVISIONING", "BASELINE_TEST", actor, {
        repositoryId: plan.repositoryId,
        worktreePath: plan.worktreePath,
      });
    }

    const baseline = await baselineAcceptance(plan, identity);
    await transition(normalizedProjectId, "BASELINE_TEST", "READY", actor, {
      repositoryId: plan.repositoryId,
      worktreePath: plan.worktreePath,
      baseline,
    });

    const after = await getPartnerProjectById(normalizedProjectId);
    return { ready: true, idempotent: plan.idempotent, plan, baseline, project: after.project };
  } catch (error) {
    const code = error instanceof PartnerDevelopmentError ? error.code : "PARTNER_PROVISION_RUNTIME_FAILED";
    if (plan) {
      await registerFailure(normalizedProjectId, code, actor, {
        repositoryId: plan.repositoryId,
        worktreePath: plan.worktreePath,
      });
    }
    if (error instanceof PartnerDevelopmentError) throw error;
    throw new PartnerDevelopmentError(
      "A partner runtime provisioning sikertelen.",
      code,
      500,
      { message: error instanceof Error ? error.message : "unknown" },
    );
  }
}
