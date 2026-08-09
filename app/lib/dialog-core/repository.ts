import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DialogCoreRepositoryError } from "./errors";
import {
  DIALOG_CORE_BOOTSTRAP_ID,
  DIALOG_CORE_COMPONENT,
  DIALOG_CORE_MIGRATION_COUNT,
  DIALOG_CORE_SCHEMA_VERSION,
  DIALOG_CORE_TABLES,
  getDialogCoreSchemaSelect,
} from "./schema";
import type {
  DialogMessage,
  DialogMessageType,
  DialogPriority,
  DialogThread,
  DialogThreadStatus,
  DialogThreadType,
} from "./types";

type DbThread = {
  id: string;
  project_id: string;
  code: string;
  thread_type: DialogThreadType;
  title: string;
  description: string;
  discipline: string;
  status: DialogThreadStatus;
  priority: DialogPriority;
  owner_user_id: string | null;
  owner_name: string;
  participant_names: string[] | null;
  related_document_ids: string[] | null;
  due_at: string | null;
  calendar_event_id: string | null;
  version: number | string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  resolved_at: string | null;
  closed_at: string | null;
};

type DbMessage = {
  id: string;
  project_id: string;
  thread_id: string;
  message_type: DialogMessageType;
  body: string;
  author_user_id: string;
  author_name: string;
  created_at: string;
};

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || key.includes("<") || key.includes(">")) {
    throw new DialogCoreRepositoryError(
      "A DIALOG szerveroldali Supabase-kapcsolata nincs beállítva.",
      "DIALOG_CORE_DATABASE_NOT_CONFIGURED",
      503,
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-client-info": "dimpro-dialog-core/0.6.0" } },
  });
}

function mapThread(row: DbThread): DialogThread {
  return {
    id: row.id,
    projectId: row.project_id,
    code: row.code,
    threadType: row.thread_type,
    title: row.title,
    description: row.description || "",
    discipline: row.discipline || "",
    status: row.status,
    priority: row.priority,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name || "",
    participantNames: row.participant_names || [],
    relatedDocumentIds: row.related_document_ids || [],
    dueAt: row.due_at,
    calendarEventId: row.calendar_event_id,
    version: Number(row.version || 1),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActivityAt: row.last_activity_at,
    resolvedAt: row.resolved_at,
    closedAt: row.closed_at,
  };
}

function mapMessage(row: DbMessage): DialogMessage {
  return {
    id: row.id,
    projectId: row.project_id,
    threadId: row.thread_id,
    messageType: row.message_type,
    body: row.body,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    createdAt: row.created_at,
  };
}

function databaseError(message: string, error: unknown, status = 500): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const marker = [candidate?.code, candidate?.message, candidate?.details, candidate?.hint]
    .filter(Boolean).join(" ").toUpperCase();
  const missingSchema = candidate?.code === "PGRST205" || candidate?.code === "42P01" || candidate?.code === "42883";
  if (missingSchema) {
    throw new DialogCoreRepositoryError(
      "A DIALOG Communication Core 0.6.0 PostgreSQL-sémája még nincs alkalmazva.",
      "DIALOG_CORE_SCHEMA_NOT_READY",
      503,
    );
  }
  const mapped: Array<[string, string, string, number]> = [
    ["DIALOG_THREAD_NOT_FOUND", "Az egyeztetési témakártya nem található.", "DIALOG_THREAD_NOT_FOUND", 404],
    ["DIALOG_THREAD_VERSION_CONFLICT", "A témakártyát közben másik felhasználó módosította. Frissítsd a listát.", "DIALOG_THREAD_VERSION_CONFLICT", 409],
    ["DIALOG_THREAD_CLOSED", "A lezárt vagy visszavont témakártya már nem módosítható.", "DIALOG_THREAD_CLOSED", 409],
    ["DIALOG_INVALID_STATUS_TRANSITION", "Ez a DIALOG állapotváltás nem engedélyezett.", "DIALOG_INVALID_STATUS_TRANSITION", 409],
    ["DIALOG_CALENDAR_REQUIRED", "A DIALOG határidőkapcsolathoz aktív Project Calendar Core szükséges.", "DIALOG_CALENDAR_REQUIRED", 503],
    ["DIALOG_CODE_CONFLICT", "A DIALOG sorszám létrehozása ütközött. Próbáld újra.", "DIALOG_CODE_CONFLICT", 409],
  ];
  for (const [needle, text, code, mappedStatus] of mapped) {
    if (marker.includes(needle)) throw new DialogCoreRepositoryError(text, code, mappedStatus);
  }
  throw new DialogCoreRepositoryError(
    message,
    candidate?.code || "DIALOG_CORE_DATABASE_ERROR",
    status,
    candidate ? { message: candidate.message, details: candidate.details, hint: candidate.hint } : undefined,
  );
}

export async function getDialogCoreDatabaseHealth() {
  try {
    const client = getClient();
    const checks = await Promise.all(DIALOG_CORE_TABLES.map(async (table) => {
      const { error } = await client.from(table).select(getDialogCoreSchemaSelect(table)).limit(0);
      return { table, ready: !error, errorCode: error?.code || null, errorMessage: error?.message || null };
    }));
    const { data: marker, error: markerError } = await client
      .from("dialog_core_schema_meta")
      .select("schema_version,migration_count,bootstrap_id")
      .eq("component", DIALOG_CORE_COMPONENT)
      .maybeSingle();
    const markerReady = !markerError
      && marker?.schema_version === DIALOG_CORE_SCHEMA_VERSION
      && Number(marker?.migration_count) === DIALOG_CORE_MIGRATION_COUNT
      && marker?.bootstrap_id === DIALOG_CORE_BOOTSTRAP_ID;
    return {
      configured: true,
      ready: checks.every((check) => check.ready) && markerReady,
      provider: "supabase" as const,
      expectedSchemaVersion: DIALOG_CORE_SCHEMA_VERSION,
      actualSchemaVersion: marker?.schema_version || null,
      migrationCount: marker?.migration_count == null ? null : Number(marker.migration_count),
      bootstrapId: marker?.bootstrap_id || null,
      tables: Object.fromEntries(checks.map((check) => [check.table, check.ready])),
      checks,
      errorCode: checks.find((check) => !check.ready)?.errorCode
        || markerError?.code
        || (markerReady ? null : "DIALOG_CORE_SCHEMA_VERSION_MISMATCH"),
    };
  } catch (error) {
    return {
      configured: !(error instanceof DialogCoreRepositoryError && error.code === "DIALOG_CORE_DATABASE_NOT_CONFIGURED"),
      ready: false,
      provider: "supabase" as const,
      expectedSchemaVersion: DIALOG_CORE_SCHEMA_VERSION,
      actualSchemaVersion: null,
      migrationCount: null,
      bootstrapId: null,
      tables: Object.fromEntries(DIALOG_CORE_TABLES.map((table) => [table, false])),
      checks: DIALOG_CORE_TABLES.map((table) => ({
        table,
        ready: false,
        errorCode: error instanceof DialogCoreRepositoryError ? error.code : "DIALOG_CORE_DATABASE_ERROR",
        errorMessage: null,
      })),
      errorCode: error instanceof DialogCoreRepositoryError ? error.code : "DIALOG_CORE_DATABASE_ERROR",
    };
  }
}

async function requireReadyClient() {
  const health = await getDialogCoreDatabaseHealth();
  if (!health.ready) {
    throw new DialogCoreRepositoryError(
      "A DIALOG Communication Core 0.6.0 adatbázissémája nem áll készen.",
      "DIALOG_CORE_SCHEMA_NOT_READY",
      503,
      health,
    );
  }
  return getClient();
}

export async function listDialogThreadsRecord(input: {
  projectId: string;
  status?: DialogThreadStatus | null;
  threadType?: DialogThreadType | null;
  priority?: DialogPriority | null;
}) {
  const client = await requireReadyClient();
  let query = client.from("dialog_core_threads")
    .select("*")
    .eq("project_id", input.projectId)
    .order("last_activity_at", { ascending: false });
  if (input.status) query = query.eq("status", input.status);
  else query = query.neq("status", "CANCELLED");
  if (input.threadType) query = query.eq("thread_type", input.threadType);
  if (input.priority) query = query.eq("priority", input.priority);
  const { data, error } = await query;
  if (error) databaseError("A DIALOG témakártyák betöltése sikertelen.", error);
  return (data || []).map((row) => mapThread(row as DbThread));
}

export async function getDialogThreadBundleRecord(projectId: string, threadId: string) {
  const client = await requireReadyClient();
  const [threadResult, messagesResult] = await Promise.all([
    client.from("dialog_core_threads").select("*").eq("project_id", projectId).eq("id", threadId).maybeSingle(),
    client.from("dialog_core_messages").select("*").eq("project_id", projectId).eq("thread_id", threadId).order("created_at", { ascending: true }),
  ]);
  if (threadResult.error) databaseError("A DIALOG témakártya betöltése sikertelen.", threadResult.error);
  if (!threadResult.data) throw new DialogCoreRepositoryError("Az egyeztetési témakártya nem található.", "DIALOG_THREAD_NOT_FOUND", 404);
  if (messagesResult.error) databaseError("A DIALOG hozzászólások betöltése sikertelen.", messagesResult.error);
  return {
    thread: mapThread(threadResult.data as DbThread),
    messages: (messagesResult.data || []).map((row) => mapMessage(row as DbMessage)),
  };
}

export async function createDialogThreadRecord(input: {
  projectId: string;
  thread: Record<string, unknown>;
  initialMessage: Record<string, unknown> | null;
  actorUserId: string;
}) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("dialog_core_create_thread_atomic", {
    p_project_id: input.projectId,
    p_thread: input.thread,
    p_initial_message: input.initialMessage,
    p_actor_user_id: input.actorUserId,
  });
  if (error) databaseError("A DIALOG témakártya létrehozása sikertelen.", error);
  const result = data as { thread: DbThread; message: DbMessage | null };
  return { thread: mapThread(result.thread), message: result.message ? mapMessage(result.message) : null };
}

export async function updateDialogThreadRecord(input: {
  projectId: string;
  threadId: string;
  expectedVersion: number;
  patch: Record<string, unknown>;
  actorUserId: string;
}) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("dialog_core_update_thread_atomic", {
    p_project_id: input.projectId,
    p_thread_id: input.threadId,
    p_expected_version: input.expectedVersion,
    p_patch: input.patch,
    p_actor_user_id: input.actorUserId,
  });
  if (error) databaseError("A DIALOG témakártya módosítása sikertelen.", error);
  return mapThread(data as DbThread);
}

export async function addDialogMessageRecord(input: {
  projectId: string;
  threadId: string;
  message: Record<string, unknown>;
  actorUserId: string;
}) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("dialog_core_add_message_atomic", {
    p_project_id: input.projectId,
    p_thread_id: input.threadId,
    p_message: input.message,
    p_actor_user_id: input.actorUserId,
  });
  if (error) databaseError("A DIALOG hozzászólás mentése sikertelen.", error);
  const result = data as { thread: DbThread; message: DbMessage };
  return { thread: mapThread(result.thread), message: mapMessage(result.message) };
}
