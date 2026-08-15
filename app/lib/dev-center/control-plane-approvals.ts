import { createClient } from "@supabase/supabase-js";
import { assertDevEngineOperation } from "./engine-repository";
import type { DevEngineOperation } from "./engine-types";
import type { ControlCommandName, ControlOperation } from "./control-plane-commands";

export type DevDestructiveOperation = Extract<ControlOperation, "migration" | "restart" | "deploy">;
export type DevApprovalType = "dev_migration" | "dev_restart" | "dev_deploy";

export const DEV_DESTRUCTIVE_OPERATIONS: DevDestructiveOperation[] = ["migration", "restart", "deploy"];
export const DEV_APPROVAL_TTL_SECONDS = 300;

const APPROVAL_TYPE: Record<DevDestructiveOperation, DevApprovalType> = {
  migration: "dev_migration",
  restart: "dev_restart",
  deploy: "dev_deploy",
};
const COMMAND_OPERATION: Partial<Record<ControlCommandName, DevDestructiveOperation>> = {
  run_migration: "migration",
  restart_service: "restart",
  deploy_release: "deploy",
};
const CONFIRMATION: Record<DevDestructiveOperation, string> = {
  migration: "APPROVE_DEV_MIGRATION",
  restart: "APPROVE_DEV_RESTART",
  deploy: "APPROVE_DEV_DEPLOY",
};

export class ControlPlaneApprovalError extends Error {
  constructor(message: string, public code: string, public status = 400) {
    super(message);
    this.name = "ControlPlaneApprovalError";
  }
}

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new ControlPlaneApprovalError("A Control Plane approval adatbázis nincs konfigurálva.", "CONTROL_APPROVAL_DB_NOT_CONFIGURED", 503);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function uuidLike(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function devSessionIdLike(value: string) { return /^dev-session-[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value) && value.length <= 120; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function ensureScope(operation: string, commandName: string, sessionId: string) {
  if (!DEV_DESTRUCTIVE_OPERATIONS.includes(operation as DevDestructiveOperation)) throw new ControlPlaneApprovalError("Ehhez a DEV művelethez nem használható destruktív approval.", "CONTROL_DEV_APPROVAL_OPERATION_DENIED", 400);
  const expected = COMMAND_OPERATION[commandName as ControlCommandName];
  if (expected !== operation) throw new ControlPlaneApprovalError("A DEV approval command/operation scope hibás.", "CONTROL_DEV_APPROVAL_COMMAND_MISMATCH", 400);
  if (!devSessionIdLike(sessionId)) throw new ControlPlaneApprovalError("Érvényes BENJADMIN worker session azonosító szükséges a DEV approvalhoz.", "CONTROL_DEV_APPROVAL_SESSION_INVALID", 400);
  return operation as DevDestructiveOperation;
}

export function devApprovalConfirmation(operation: DevDestructiveOperation) { return CONFIRMATION[operation]; }

export async function requestDevDestructiveApproval(input: {
  operation: string;
  commandName: string;
  sessionId: string;
  requestedBy: string;
  reason?: string;
}) {
  const operation = ensureScope(text(input.operation), text(input.commandName), text(input.sessionId));
  const sessionId = text(input.sessionId);
  const commandName = text(input.commandName) as ControlCommandName;
  const requestedBy = text(input.requestedBy) || "BENJADMIN_TERMINAL_HUB";
  await assertDevEngineOperation(sessionId, operation as DevEngineOperation);
  const expiresAt = new Date(Date.now() + DEV_APPROVAL_TTL_SECONDS * 1000).toISOString();
  const client = getClient();
  const result = await client.from("dev_center_approvals").insert({
    approval_type: APPROVAL_TYPE[operation],
    target_environment: "DEV",
    operation,
    requested_by: requestedBy.slice(0, 120),
    status: "pending",
    expires_at: expiresAt,
    reason: text(input.reason).slice(0, 500) || `Terminal Hub DEV ${operation} megerősítés.`,
    metadata: { commandName, sessionId, origin: "TERMINAL_HUB_MANAGED_COMMAND", singleUse: true },
  }).select("id,approval_type,target_environment,operation,status,requested_by,requested_at,expires_at,reason,metadata").single();
  if (result.error?.code === "PGRST205") throw new ControlPlaneApprovalError("A P9 approval séma még nincs alkalmazva.", "CONTROL_APPROVAL_SCHEMA_NOT_READY", 409);
  if (result.error) throw new ControlPlaneApprovalError(result.error.message, "CONTROL_DEV_APPROVAL_CREATE_FAILED", 500);
  return { approval: result.data, confirmation: CONFIRMATION[operation], ttlSeconds: DEV_APPROVAL_TTL_SECONDS };
}

export async function approveDevDestructiveApproval(input: {
  approvalId: string;
  operation: string;
  commandName: string;
  sessionId: string;
  confirmation: string;
  approvedBy: string;
}) {
  const approvalId = text(input.approvalId);
  if (!uuidLike(approvalId)) throw new ControlPlaneApprovalError("Érvénytelen approval azonosító.", "CONTROL_APPROVAL_ID_INVALID", 400);
  const operation = ensureScope(text(input.operation), text(input.commandName), text(input.sessionId));
  const sessionId = text(input.sessionId);
  const commandName = text(input.commandName);
  if (text(input.confirmation) !== CONFIRMATION[operation]) throw new ControlPlaneApprovalError("A destruktív DEV művelet explicit megerősítése hiányzik.", "CONTROL_DEV_APPROVAL_CONFIRMATION_REQUIRED", 409);
  await assertDevEngineOperation(sessionId, operation as DevEngineOperation);
  const client = getClient();
  const selected = await client.from("dev_center_approvals")
    .select("id,approval_type,target_environment,operation,status,requested_by,requested_at,approved_by,approved_at,expires_at,reason,metadata")
    .eq("id", approvalId).maybeSingle();
  if (selected.error?.code === "PGRST205") throw new ControlPlaneApprovalError("A P9 approval séma még nincs alkalmazva.", "CONTROL_APPROVAL_SCHEMA_NOT_READY", 409);
  if (selected.error) throw new ControlPlaneApprovalError(selected.error.message, "CONTROL_APPROVAL_READ_FAILED", 500);
  const row = selected.data as Record<string, unknown> | null;
  if (!row) throw new ControlPlaneApprovalError("A DEV approval nem található.", "CONTROL_DEV_APPROVAL_NOT_FOUND", 404);
  if (text(row.status) !== "pending") throw new ControlPlaneApprovalError("A DEV approval már nem pending állapotú.", "CONTROL_DEV_APPROVAL_NOT_PENDING", 409);
  if (text(row.target_environment) !== "DEV" || text(row.operation) !== operation) throw new ControlPlaneApprovalError("A DEV approval környezeti/műveleti scope eltér.", "CONTROL_DEV_APPROVAL_SCOPE_MISMATCH", 403);
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
  if (text(metadata.commandName) !== commandName || text(metadata.sessionId) !== sessionId || metadata.singleUse !== true) throw new ControlPlaneApprovalError("A DEV approval command/session scope eltér.", "CONTROL_DEV_APPROVAL_SCOPE_MISMATCH", 403);
  const expiresAt = text(row.expires_at);
  if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
    await client.from("dev_center_approvals").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", approvalId).eq("status", "pending");
    throw new ControlPlaneApprovalError("A DEV approval lejárt.", "CONTROL_DEV_APPROVAL_EXPIRED", 409);
  }
  const now = new Date().toISOString();
  const update = await client.from("dev_center_approvals").update({
    status: "approved",
    approved_by: text(input.approvedBy).slice(0, 120) || "BENJADMIN",
    approved_at: now,
    updated_at: now,
  }).eq("id", approvalId).eq("status", "pending").select("id,approval_type,target_environment,operation,status,approved_by,approved_at,expires_at,metadata").maybeSingle();
  if (update.error) throw new ControlPlaneApprovalError(update.error.message, "CONTROL_DEV_APPROVAL_UPDATE_FAILED", 500);
  if (!update.data) throw new ControlPlaneApprovalError("A DEV approval közben megváltozott; új jóváhagyás szükséges.", "CONTROL_DEV_APPROVAL_RACE", 409);
  return { approval: update.data };
}
