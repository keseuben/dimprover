import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DriveCoreRepositoryError } from "./errors";
import { getDatabaseClient } from "./databaseRepository";

export type DriveFolderPasswordRecord = {
  projectId: string;
  folderId: string;
  passwordHash: string;
  passwordVersion: number;
  unlockTtlMinutes: number;
  maxAttempts: number;
  lockoutMinutes: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type DriveFolderPasswordPublicConfig = Omit<DriveFolderPasswordRecord, "passwordHash">;

export type DriveFolderPasswordAttemptState = {
  failureCount: number;
  lockedUntil: string | null;
  locked: boolean;
};

type DbPassword = {
  project_id: string;
  folder_id: string;
  password_hash: string;
  password_version: number | string;
  unlock_ttl_minutes: number | string;
  max_attempts: number | string;
  lockout_minutes: number | string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

function dbError(message: string, error: unknown, status = 500): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const missingSchema = candidate?.code === "PGRST205" || candidate?.code === "42P01" || candidate?.code === "42883";
  throw new DriveCoreRepositoryError(
    missingSchema ? "A DRIVE Core mappajelszó-sémája még nincs alkalmazva." : message,
    missingSchema ? "DRIVE_CORE_SCHEMA_NOT_READY" : candidate?.code || "DRIVE_FOLDER_PASSWORD_DATABASE_ERROR",
    missingSchema ? 503 : status,
  );
}

function mapPassword(row: DbPassword): DriveFolderPasswordRecord {
  return {
    projectId: row.project_id,
    folderId: row.folder_id,
    passwordHash: row.password_hash,
    passwordVersion: Number(row.password_version || 0),
    unlockTtlMinutes: Number(row.unlock_ttl_minutes || 120),
    maxAttempts: Number(row.max_attempts || 5),
    lockoutMinutes: Number(row.lockout_minutes || 15),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeConfig(row: DriveFolderPasswordRecord): DriveFolderPasswordPublicConfig {
  return {
    projectId: row.projectId,
    folderId: row.folderId,
    passwordVersion: row.passwordVersion,
    unlockTtlMinutes: row.unlockTtlMinutes,
    maxAttempts: row.maxAttempts,
    lockoutMinutes: row.lockoutMinutes,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function passwordClient(): SupabaseClient {
  return getDatabaseClient();
}

export async function listDriveFolderPasswordRecords(projectId: string) {
  const client = passwordClient();
  const { data, error } = await client
    .from("drive_core_folder_passwords")
    .select("project_id,folder_id,password_hash,password_version,unlock_ttl_minutes,max_attempts,lockout_minutes,created_by,updated_by,created_at,updated_at")
    .eq("project_id", projectId);
  if (error) dbError("A mappajelszó-védelem állapota nem tölthető be.", error);
  return ((data || []) as DbPassword[]).map(mapPassword);
}

export async function getDriveFolderPasswordRecord(projectId: string, folderId: string) {
  const client = passwordClient();
  const { data, error } = await client
    .from("drive_core_folder_passwords")
    .select("project_id,folder_id,password_hash,password_version,unlock_ttl_minutes,max_attempts,lockout_minutes,created_by,updated_by,created_at,updated_at")
    .eq("project_id", projectId)
    .eq("folder_id", folderId)
    .maybeSingle();
  if (error) dbError("A mappajelszó-védelem állapota nem tölthető be.", error);
  return data ? mapPassword(data as DbPassword) : null;
}

export async function setDriveFolderPasswordRecord(input: {
  projectId: string;
  folderId: string;
  passwordHash: string;
  unlockTtlMinutes: number;
  actorUserId: string;
}) {
  const client = passwordClient();
  const { data, error } = await client.rpc("drive_core_set_folder_password_atomic", {
    p_project_id: input.projectId,
    p_folder_id: input.folderId,
    p_password_hash: input.passwordHash,
    p_unlock_ttl_minutes: input.unlockTtlMinutes,
    p_actor_user_id: input.actorUserId,
  });
  if (error) dbError("A mappajelszó nem állítható be.", error);
  return data as DriveFolderPasswordPublicConfig;
}

export async function clearDriveFolderPasswordRecord(projectId: string, folderId: string, actorUserId: string) {
  const client = passwordClient();
  const { data, error } = await client.rpc("drive_core_clear_folder_password_atomic", {
    p_project_id: projectId,
    p_folder_id: folderId,
    p_actor_user_id: actorUserId,
  });
  if (error) dbError("A mappajelszó-védelem nem törölhető.", error);
  return data as { cleared: boolean; projectId: string; folderId: string };
}

export async function getDriveFolderPasswordAttemptState(projectId: string, folderId: string, actorUserId: string) {
  const client = passwordClient();
  const { data, error } = await client
    .from("drive_core_folder_password_attempts")
    .select("failure_count,locked_until")
    .eq("project_id", projectId)
    .eq("folder_id", folderId)
    .eq("actor_user_id", actorUserId)
    .maybeSingle();
  if (error) dbError("A mappajelszó-próbálkozás állapota nem tölthető be.", error);
  if (!data) return { failureCount: 0, lockedUntil: null, locked: false } satisfies DriveFolderPasswordAttemptState;
  const lockedUntil = typeof data.locked_until === "string" ? data.locked_until : null;
  return {
    failureCount: Number(data.failure_count || 0),
    lockedUntil,
    locked: Boolean(lockedUntil && new Date(lockedUntil).getTime() > Date.now()),
  } satisfies DriveFolderPasswordAttemptState;
}

export async function recordDriveFolderPasswordFailure(projectId: string, folderId: string, actorUserId: string) {
  const client = passwordClient();
  const { data, error } = await client.rpc("drive_core_record_folder_password_failure_atomic", {
    p_project_id: projectId,
    p_folder_id: folderId,
    p_actor_user_id: actorUserId,
  });
  if (error) dbError("A hibás mappajelszó-próbálkozás nem naplózható.", error);
  const state = data as { failureCount?: unknown; lockedUntil?: unknown; locked?: unknown };
  return {
    failureCount: Number(state.failureCount || 0),
    lockedUntil: typeof state.lockedUntil === "string" ? state.lockedUntil : null,
    locked: state.locked === true,
  } satisfies DriveFolderPasswordAttemptState;
}

export async function recordDriveFolderPasswordUnlock(
  projectId: string,
  folderId: string,
  passwordVersion: number,
  actorUserId: string,
) {
  const client = passwordClient();
  const { data, error } = await client.rpc("drive_core_record_folder_password_unlock_atomic", {
    p_project_id: projectId,
    p_folder_id: folderId,
    p_password_version: passwordVersion,
    p_actor_user_id: actorUserId,
  });
  if (error) dbError("A mappajelszó-feloldás nem naplózható.", error);
  return data as { ok: boolean; projectId: string; folderId: string; passwordVersion: number };
}

export function publicDriveFolderPasswordConfig(row: DriveFolderPasswordRecord) {
  return safeConfig(row);
}
