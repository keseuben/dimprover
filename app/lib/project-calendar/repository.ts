import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ProjectCalendarRepositoryError } from "./errors";
import {
  PROJECT_CALENDAR_BOOTSTRAP_ID,
  PROJECT_CALENDAR_COMPONENT,
  PROJECT_CALENDAR_MIGRATION_COUNT,
  PROJECT_CALENDAR_SCHEMA_VERSION,
  PROJECT_CALENDAR_TABLES,
  getProjectCalendarSchemaSelect,
} from "./schema";
import type {
  ProjectCalendarEvent,
  ProjectCalendarEventStatus,
  ProjectCalendarEventType,
  ProjectCalendarPriority,
  ProjectCalendarSourceModule,
} from "./types";

type DbProjectCalendarEvent = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  event_type: ProjectCalendarEventType;
  source_module: ProjectCalendarSourceModule;
  status: ProjectCalendarEventStatus;
  priority: ProjectCalendarPriority;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string;
  owner_user_id: string | null;
  owner_name: string;
  source_entity_type: string | null;
  source_entity_id: string | null;
  version: number | string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || key.includes("<") || key.includes(">")) {
    throw new ProjectCalendarRepositoryError(
      "A Project Calendar Core szerveroldali adatbázis-kapcsolata nincs beállítva.",
      "PROJECT_CALENDAR_DATABASE_NOT_CONFIGURED",
      503,
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-client-info": "dimpro-project-calendar/0.5.0" } },
  });
}

function mapEvent(row: DbProjectCalendarEvent): ProjectCalendarEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description || "",
    eventType: row.event_type,
    sourceModule: row.source_module,
    status: row.status,
    priority: row.priority,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: Boolean(row.all_day),
    location: row.location || "",
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name || "",
    sourceEntityType: row.source_entity_type,
    sourceEntityId: row.source_entity_id,
    version: Number(row.version || 1),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function databaseError(message: string, error: unknown, status = 500): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const marker = [candidate?.code, candidate?.message, candidate?.details, candidate?.hint]
    .filter(Boolean).join(" ").toUpperCase();
  const missingSchema = candidate?.code === "PGRST205" || candidate?.code === "42P01" || candidate?.code === "42883";
  if (missingSchema) {
    throw new ProjectCalendarRepositoryError(
      "A Project Calendar Core 0.5.0 PostgreSQL-sémája még nincs alkalmazva.",
      "PROJECT_CALENDAR_SCHEMA_NOT_READY",
      503,
    );
  }
  if (marker.includes("PROJECT_CALENDAR_EVENT_NOT_FOUND")) {
    throw new ProjectCalendarRepositoryError("A projektnaptár-esemény nem található.", "PROJECT_CALENDAR_EVENT_NOT_FOUND", 404);
  }
  if (marker.includes("PROJECT_CALENDAR_VERSION_CONFLICT")) {
    throw new ProjectCalendarRepositoryError(
      "Az eseményt közben másik felhasználó módosította. Frissítsd a naptárt, majd próbáld újra.",
      "PROJECT_CALENDAR_VERSION_CONFLICT",
      409,
    );
  }
  if (marker.includes("PROJECT_CALENDAR_SOURCE_CONFLICT") || candidate?.code === "23505") {
    throw new ProjectCalendarRepositoryError(
      "Ehhez a forrásügyhöz már tartozik aktív naptáresemény.",
      "PROJECT_CALENDAR_SOURCE_CONFLICT",
      409,
    );
  }
  if (marker.includes("PROJECT_CALENDAR_INVALID_INTERVAL")) {
    throw new ProjectCalendarRepositoryError("Az esemény befejezése nem lehet korábbi a kezdésnél.", "PROJECT_CALENDAR_INVALID_INTERVAL", 400);
  }
  if (marker.includes("PROJECT_CALENDAR_EVENT_CANCELLED")) {
    throw new ProjectCalendarRepositoryError("A visszavont esemény már nem módosítható.", "PROJECT_CALENDAR_EVENT_CANCELLED", 409);
  }
  throw new ProjectCalendarRepositoryError(
    message,
    candidate?.code || "PROJECT_CALENDAR_DATABASE_ERROR",
    status,
    candidate ? { message: candidate.message, details: candidate.details, hint: candidate.hint } : undefined,
  );
}

export async function getProjectCalendarDatabaseHealth() {
  try {
    const client = getClient();
    const checks = await Promise.all(PROJECT_CALENDAR_TABLES.map(async (table) => {
      const { error } = await client.from(table).select(getProjectCalendarSchemaSelect(table)).limit(0);
      return { table, ready: !error, errorCode: error?.code || null, errorMessage: error?.message || null };
    }));
    const { data: marker, error: markerError } = await client
      .from("project_calendar_schema_meta")
      .select("schema_version,migration_count,bootstrap_id")
      .eq("component", PROJECT_CALENDAR_COMPONENT)
      .maybeSingle();
    const markerReady = !markerError
      && marker?.schema_version === PROJECT_CALENDAR_SCHEMA_VERSION
      && Number(marker?.migration_count) === PROJECT_CALENDAR_MIGRATION_COUNT
      && marker?.bootstrap_id === PROJECT_CALENDAR_BOOTSTRAP_ID;
    return {
      configured: true,
      ready: checks.every((check) => check.ready) && markerReady,
      provider: "supabase" as const,
      expectedSchemaVersion: PROJECT_CALENDAR_SCHEMA_VERSION,
      actualSchemaVersion: marker?.schema_version || null,
      migrationCount: marker?.migration_count == null ? null : Number(marker.migration_count),
      bootstrapId: marker?.bootstrap_id || null,
      tables: Object.fromEntries(checks.map((check) => [check.table, check.ready])),
      checks,
      errorCode: checks.find((check) => !check.ready)?.errorCode
        || markerError?.code
        || (markerReady ? null : "PROJECT_CALENDAR_SCHEMA_VERSION_MISMATCH"),
    };
  } catch (error) {
    return {
      configured: !(error instanceof ProjectCalendarRepositoryError && error.code === "PROJECT_CALENDAR_DATABASE_NOT_CONFIGURED"),
      ready: false,
      provider: "supabase" as const,
      expectedSchemaVersion: PROJECT_CALENDAR_SCHEMA_VERSION,
      actualSchemaVersion: null,
      migrationCount: null,
      bootstrapId: null,
      tables: Object.fromEntries(PROJECT_CALENDAR_TABLES.map((table) => [table, false])),
      checks: PROJECT_CALENDAR_TABLES.map((table) => ({
        table,
        ready: false,
        errorCode: error instanceof ProjectCalendarRepositoryError ? error.code : "PROJECT_CALENDAR_DATABASE_ERROR",
        errorMessage: null,
      })),
      errorCode: error instanceof ProjectCalendarRepositoryError ? error.code : "PROJECT_CALENDAR_DATABASE_ERROR",
    };
  }
}

async function requireReadyClient() {
  const health = await getProjectCalendarDatabaseHealth();
  if (!health.ready) {
    throw new ProjectCalendarRepositoryError(
      "A Project Calendar Core 0.5.0 adatbázissémája nem áll készen.",
      "PROJECT_CALENDAR_SCHEMA_NOT_READY",
      503,
      health,
    );
  }
  return getClient();
}

export async function listProjectCalendarEventsRecord(input: {
  projectId: string;
  startsBefore: string;
  endsAfter: string;
  status?: ProjectCalendarEventStatus | null;
  eventType?: ProjectCalendarEventType | null;
  sourceModule?: ProjectCalendarSourceModule | null;
}) {
  const client = await requireReadyClient();
  let query = client.from("project_calendar_events")
    .select("*")
    .eq("project_id", input.projectId)
    .lte("starts_at", input.startsBefore)
    .gte("ends_at", input.endsAfter)
    .order("starts_at", { ascending: true })
    .order("priority", { ascending: false });
  if (input.status) query = query.eq("status", input.status);
  else query = query.neq("status", "CANCELLED");
  if (input.eventType) query = query.eq("event_type", input.eventType);
  if (input.sourceModule) query = query.eq("source_module", input.sourceModule);
  const { data, error } = await query;
  if (error) databaseError("A projektnaptár-események betöltése sikertelen.", error);
  return (data || []).map((row) => mapEvent(row as DbProjectCalendarEvent));
}

export async function createProjectCalendarEventRecord(input: {
  projectId: string;
  event: ProjectCalendarEvent;
  actorUserId: string;
}) {
  const client = await requireReadyClient();
  const event = {
    id: input.event.id,
    title: input.event.title,
    description: input.event.description,
    event_type: input.event.eventType,
    source_module: input.event.sourceModule,
    status: input.event.status,
    priority: input.event.priority,
    starts_at: input.event.startsAt,
    ends_at: input.event.endsAt,
    all_day: input.event.allDay,
    location: input.event.location,
    owner_user_id: input.event.ownerUserId,
    owner_name: input.event.ownerName,
    source_entity_type: input.event.sourceEntityType,
    source_entity_id: input.event.sourceEntityId,
    version: input.event.version,
    created_at: input.event.createdAt,
    updated_at: input.event.updatedAt,
  };
  const { data, error } = await client.rpc("project_calendar_create_event_atomic", {
    p_project_id: input.projectId,
    p_event: event,
    p_actor_user_id: input.actorUserId,
  });
  if (error) databaseError("A projektnaptár-esemény létrehozása sikertelen.", error);
  return mapEvent(data as DbProjectCalendarEvent);
}

export async function updateProjectCalendarEventRecord(input: {
  projectId: string;
  eventId: string;
  expectedVersion: number;
  patch: Record<string, unknown>;
  actorUserId: string;
}) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("project_calendar_update_event_atomic", {
    p_project_id: input.projectId,
    p_event_id: input.eventId,
    p_expected_version: input.expectedVersion,
    p_patch: input.patch,
    p_actor_user_id: input.actorUserId,
  });
  if (error) databaseError("A projektnaptár-esemény módosítása sikertelen.", error);
  return mapEvent(data as DbProjectCalendarEvent);
}

export async function cancelProjectCalendarEventRecord(input: {
  projectId: string;
  eventId: string;
  expectedVersion: number;
  actorUserId: string;
  reason: string;
}) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("project_calendar_cancel_event_atomic", {
    p_project_id: input.projectId,
    p_event_id: input.eventId,
    p_expected_version: input.expectedVersion,
    p_actor_user_id: input.actorUserId,
    p_reason: input.reason,
  });
  if (error) databaseError("A projektnaptár-esemény visszavonása sikertelen.", error);
  return mapEvent(data as DbProjectCalendarEvent);
}
