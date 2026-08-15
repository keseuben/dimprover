import { createClient } from "@supabase/supabase-js";
import { assertDevEngineOperation } from "./engine-repository";
import type { DevEngineOperation } from "./engine-types";

export type ControlTarget = "DEV" | "STAGING" | "PRODUCTION" | "CONTROL";
export type ControlOperation =
  | "read"
  | "monitor"
  | "write"
  | "build"
  | "test"
  | "migration"
  | "restart"
  | "deploy"
  | "release"
  | "recovery";

export type ControlCommandName =
  | "refresh_state"
  | "collect_metrics"
  | "run_build"
  | "run_tests"
  | "run_migration"
  | "restart_service"
  | "deploy_release"
  | "create_release"
  | "run_recovery";

export type ControlCommandRequest = {
  targetEnvironment: ControlTarget;
  operation: ControlOperation;
  commandName: ControlCommandName;
  requestedBy: string;
  startContextId?: string;
  sessionId?: string;
  approvalId?: string;
  payload?: Record<string, unknown>;
};

export class ControlPlaneCommandError extends Error {
  status: number;
  code: string;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "ControlPlaneCommandError";
    this.status = status;
    this.code = code;
  }
}

const TARGETS: ControlTarget[] = ["DEV", "STAGING", "PRODUCTION", "CONTROL"];
const OPERATIONS: ControlOperation[] = [
  "read",
  "monitor",
  "write",
  "build",
  "test",
  "migration",
  "restart",
  "deploy",
  "release",
  "recovery",
];
const COMMANDS: ControlCommandName[] = [
  "refresh_state",
  "collect_metrics",
  "run_build",
  "run_tests",
  "run_migration",
  "restart_service",
  "deploy_release",
  "create_release",
  "run_recovery",
];
const MUTATING_OPERATIONS: ControlOperation[] = [
  "write",
  "build",
  "test",
  "migration",
  "restart",
  "deploy",
  "release",
  "recovery",
];
const DEV_ENGINE_OPERATIONS: DevEngineOperation[] = [
  "write",
  "build",
  "test",
  "migration",
  "restart",
  "deploy",
];
const DEV_DESTRUCTIVE_OPERATIONS: ControlOperation[] = ["migration", "restart", "deploy"];
const DEV_APPROVAL_TYPE: Partial<Record<ControlOperation, string>> = {
  migration: "dev_migration",
  restart: "dev_restart",
  deploy: "dev_deploy",
};

const COMMAND_OPERATION: Record<ControlCommandName, ControlOperation[]> = {
  refresh_state: ["read"],
  collect_metrics: ["monitor"],
  run_build: ["build"],
  run_tests: ["test"],
  run_migration: ["migration"],
  restart_service: ["restart"],
  deploy_release: ["deploy"],
  create_release: ["release"],
  run_recovery: ["recovery"],
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function uuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new ControlPlaneCommandError(
      "A Control Plane adatbázis-kapcsolata nincs beállítva.",
      "CONTROL_DB_NOT_CONFIGURED",
      503,
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function parseControlCommandRequest(value: unknown): ControlCommandRequest {
  const input = record(value);
  const targetEnvironment = text(input.targetEnvironment) as ControlTarget;
  const operation = text(input.operation) as ControlOperation;
  const commandName = text(input.commandName) as ControlCommandName;
  const requestedBy = text(input.requestedBy);
  const startContextId = text(input.startContextId);
  const sessionId = text(input.sessionId);
  const approvalId = text(input.approvalId);
  const payload = record(input.payload);

  if (!TARGETS.includes(targetEnvironment)) {
    throw new ControlPlaneCommandError("Érvényes célkörnyezet szükséges.", "CONTROL_TARGET_INVALID");
  }
  if (!OPERATIONS.includes(operation)) {
    throw new ControlPlaneCommandError("Érvényes Control Plane művelet szükséges.", "CONTROL_OPERATION_INVALID");
  }
  if (!COMMANDS.includes(commandName) || !COMMAND_OPERATION[commandName].includes(operation)) {
    throw new ControlPlaneCommandError(
      "A command és operation párosítás nem engedélyezett.",
      "CONTROL_COMMAND_OPERATION_MISMATCH",
    );
  }
  if (!requestedBy || requestedBy.length > 120) {
    throw new ControlPlaneCommandError(
      "A requestedBy mező kötelező és legfeljebb 120 karakter lehet.",
      "CONTROL_REQUESTER_INVALID",
    );
  }
  if (startContextId && !uuidLike(startContextId)) {
    throw new ControlPlaneCommandError("Érvénytelen START context azonosító.", "CONTROL_START_CONTEXT_INVALID");
  }
  if (approvalId && !uuidLike(approvalId)) {
    throw new ControlPlaneCommandError("Érvénytelen approval azonosító.", "CONTROL_APPROVAL_ID_INVALID");
  }

  for (const dangerousKey of ["command", "shell", "script", "argv", "executable"]) {
    if (Object.prototype.hasOwnProperty.call(payload, dangerousKey)) {
      throw new ControlPlaneCommandError(
        "A Control Plane nem fogad nyers shell/parancs payloadot.",
        "CONTROL_RAW_COMMAND_FORBIDDEN",
      );
    }
  }

  if (targetEnvironment === "PRODUCTION" && MUTATING_OPERATIONS.includes(operation) && !approvalId) {
    throw new ControlPlaneCommandError(
      "PRODUCTION módosító művelet csak explicit approval azonosítóval queue-zható.",
      "CONTROL_PROD_APPROVAL_REQUIRED",
      409,
    );
  }

  if (targetEnvironment === "DEV" && DEV_DESTRUCTIVE_OPERATIONS.includes(operation) && !approvalId) {
    throw new ControlPlaneCommandError(
      "DEV destruktív művelet csak explicit, rövid életű approval azonosítóval queue-zható.",
      "CONTROL_DEV_APPROVAL_REQUIRED",
      409,
    );
  }

  if (
    targetEnvironment === "DEV"
    && DEV_ENGINE_OPERATIONS.includes(operation as DevEngineOperation)
    && !sessionId
  ) {
    throw new ControlPlaneCommandError(
      "DEV módosító művelethez READY worker session szükséges.",
      "CONTROL_DEV_SESSION_REQUIRED",
      409,
    );
  }

  return {
    targetEnvironment,
    operation,
    commandName,
    requestedBy,
    startContextId: startContextId || undefined,
    sessionId: sessionId || undefined,
    approvalId: approvalId || undefined,
    payload,
  };
}

async function assertApprovedControlOperation(input: ControlCommandRequest) {
  const productionApproval = input.targetEnvironment === "PRODUCTION" && MUTATING_OPERATIONS.includes(input.operation);
  const devDestructiveApproval = input.targetEnvironment === "DEV" && DEV_DESTRUCTIVE_OPERATIONS.includes(input.operation);
  if (!productionApproval && !devDestructiveApproval) return null;
  if (!input.approvalId) {
    throw new ControlPlaneCommandError(
      devDestructiveApproval ? "Hiányzó DEV destruktív approval." : "Hiányzó PROD approval.",
      devDestructiveApproval ? "CONTROL_DEV_APPROVAL_REQUIRED" : "CONTROL_PROD_APPROVAL_REQUIRED",
      409,
    );
  }

  const client = getClient();
  const result = await client
    .from("dev_center_approvals")
    .select("id,approval_type,target_environment,operation,status,requested_by,approved_by,approved_at,expires_at,metadata")
    .eq("id", input.approvalId)
    .maybeSingle();

  if (result.error?.code === "PGRST205") {
    throw new ControlPlaneCommandError("A B3.1/P9 approval séma még nincs alkalmazva.", "CONTROL_SCHEMA_NOT_READY", 409);
  }
  if (result.error) throw new ControlPlaneCommandError(result.error.message, "CONTROL_APPROVAL_READ_FAILED", 500);

  const row = result.data as Record<string, unknown> | null;
  const prefix = devDestructiveApproval ? "CONTROL_DEV_APPROVAL" : "CONTROL_PROD_APPROVAL";
  if (!row || text(row.status) !== "approved") {
    throw new ControlPlaneCommandError("Az approval nem jóváhagyott vagy nem található.", `${prefix}_NOT_APPROVED`, 403);
  }
  if (text(row.target_environment) !== input.targetEnvironment || text(row.operation) !== input.operation) {
    throw new ControlPlaneCommandError("Az approval nem ehhez a célhoz/művelethez tartozik.", `${prefix}_SCOPE_MISMATCH`, 403);
  }
  const expiresAt = text(row.expires_at);
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
    throw new ControlPlaneCommandError("Az approval lejárt.", `${prefix}_EXPIRED`, 403);
  }

  if (devDestructiveApproval) {
    if (text(row.approval_type) !== DEV_APPROVAL_TYPE[input.operation]) {
      throw new ControlPlaneCommandError("A DEV approval típusa nem egyezik a művelettel.", "CONTROL_DEV_APPROVAL_TYPE_MISMATCH", 403);
    }
    const metadata = record(row.metadata);
    if (text(metadata.commandName) !== input.commandName || text(metadata.sessionId) !== (input.sessionId || "") || metadata.singleUse !== true) {
      throw new ControlPlaneCommandError("A DEV approval command/session scope eltér.", "CONTROL_DEV_APPROVAL_SCOPE_MISMATCH", 403);
    }
  }
  return row;
}

function approvalRpcError(error: { code?: string; message?: string }) {
  if (error.code === "PGRST202") return new ControlPlaneCommandError("A P9 atomikus approval queue function még nincs alkalmazva.", "CONTROL_SCHEMA_NOT_READY", 409);
  const message = String(error.message || "");
  const map: Record<string, string> = {
    APPROVAL_REQUIRED: "CONTROL_APPROVAL_REQUIRED",
    APPROVAL_NOT_FOUND: "CONTROL_APPROVAL_NOT_FOUND",
    APPROVAL_NOT_APPROVED: "CONTROL_APPROVAL_NOT_APPROVED",
    APPROVAL_EXPIRED: "CONTROL_APPROVAL_EXPIRED",
    APPROVAL_SCOPE_MISMATCH: "CONTROL_APPROVAL_SCOPE_MISMATCH",
    APPROVAL_COMMAND_MISMATCH: "CONTROL_APPROVAL_COMMAND_MISMATCH",
    APPROVAL_SESSION_MISMATCH: "CONTROL_APPROVAL_SESSION_MISMATCH",
    APPROVAL_CONSUME_FAILED: "CONTROL_APPROVAL_CONSUME_FAILED",
  };
  const matched = Object.keys(map).find((key) => message.includes(key));
  if (error.code === "23505") return new ControlPlaneCommandError("Az approval már fel lett használva.", "CONTROL_APPROVAL_ALREADY_USED", 409);
  return new ControlPlaneCommandError(message || "Az approval-alapú queue művelet sikertelen.", matched ? map[matched] : "CONTROL_APPROVED_COMMAND_QUEUE_FAILED", 409);
}

async function assertDevOperation(input: ControlCommandRequest) {
  if (
    input.targetEnvironment !== "DEV"
    || !DEV_ENGINE_OPERATIONS.includes(input.operation as DevEngineOperation)
  ) {
    return null;
  }
  if (!input.sessionId) {
    throw new ControlPlaneCommandError(
      "Hiányzó DEV session.",
      "CONTROL_DEV_SESSION_REQUIRED",
      409,
   );
  }
  return assertDevEngineOperation(input.sessionId, input.operation as DevEngineOperation);
}

export async function queueControlCommand(value: unknown) {
  const input = parseControlCommandRequest(value);
  const [approval, devAuthorization] = await Promise.all([
    assertApprovedControlOperation(input),
    assertDevOperation(input),
  ]);

  const client = getClient();
  const payload = {
    ...input.payload,
    sessionId: input.sessionId || null,
    validatedAt: new Date().toISOString(),
    devAuthorization: devAuthorization ? {
      environment: devAuthorization.environment.code,
      activeLockCount: devAuthorization.activeLockCount,
      activeWorktreeLeaseCount: devAuthorization.activeWorktreeLeaseCount,
    } : null,
  };
  const approvalRequired = Boolean(approval);

  if (approvalRequired) {
    const rpc = await client.rpc("dev_center_queue_approved_command", {
      p_approval_id: input.approvalId,
      p_target_environment: input.targetEnvironment,
      p_operation: input.operation,
      p_command_name: input.commandName,
      p_requested_by: input.requestedBy,
      p_start_context_id: input.startContextId || null,
      p_payload: payload,
    });
    if (rpc.error) throw approvalRpcError(rpc.error);
    const command = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    if (!command) throw new ControlPlaneCommandError("Az atomikus command queue nem adott vissza rekordot.", "CONTROL_APPROVED_COMMAND_QUEUE_EMPTY", 500);
    return { ok: true as const, command, approval: { id: input.approvalId, status: "consumed" as const } };
  }

  const insert = await client.from("dev_center_command_queue").insert({
    start_context_id: input.startContextId || null,
    approval_id: null,
    target_environment: input.targetEnvironment,
    operation: input.operation,
    command_name: input.commandName,
    requested_by: input.requestedBy,
    status: "queued",
    requires_approval: false,
    payload,
  }).select("*").single();
  if (insert.error?.code === "PGRST205") throw new ControlPlaneCommandError("A B3.1 command queue séma még nincs alkalmazva.", "CONTROL_SCHEMA_NOT_READY", 409);
  if (insert.error) throw new ControlPlaneCommandError(insert.error.message, "CONTROL_COMMAND_QUEUE_FAILED", 500);
  return { ok: true as const, command: insert.data, approval: null };

}
