import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DiaryCoreRepositoryError } from "./errors";
import {
  DIARY_CORE_BOOTSTRAP_ID,
  DIARY_CORE_COMPONENT,
  DIARY_CORE_MIGRATION_COUNT,
  DIARY_CORE_SCHEMA_VERSION,
  DIARY_CORE_TABLES,
  getDiaryCoreSchemaSelect,
} from "./schema";
import type {
  DiaryEntry,
  DiaryEntryStatus,
  DiaryEvent,
  DiaryEventStatus,
  DiaryEventType,
  DiarySeverity,
  DiaryWeatherCondition,
} from "./types";

type DbEntry = {
  id: string;
  project_id: string;
  code: string;
  diary_date: string;
  title: string;
  status: DiaryEntryStatus;
  weather_condition: DiaryWeatherCondition;
  weather_note: string;
  temperature_min_c: number | string | null;
  temperature_max_c: number | string | null;
  workforce_total: number | string;
  workforce_breakdown: string[] | null;
  work_summary: string;
  blocker_summary: string;
  safety_summary: string;
  inspection_summary: string;
  related_document_ids: string[] | null;
  next_event_number: number | string;
  version: number | string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  closing_note: string;
};

type DbEvent = {
  id: string;
  project_id: string;
  entry_id: string;
  sequence_number: number | string;
  code: string;
  event_type: DiaryEventType;
  title: string;
  description: string;
  status: DiaryEventStatus;
  severity: DiarySeverity;
  occurred_at: string;
  responsible_user_id: string | null;
  responsible_name: string;
  due_at: string | null;
  calendar_event_id: string | null;
  related_document_ids: string[] | null;
  dialog_thread_id: string | null;
  decide_request_id: string | null;
  resolution: string;
  version: number | string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || key.includes("<") || key.includes(">")) {
    throw new DiaryCoreRepositoryError(
      "A DIARY szerveroldali Supabase-kapcsolata nincs beállítva.",
      "DIARY_CORE_DATABASE_NOT_CONFIGURED",
      503,
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-client-info": "dimpro-diary-core/0.8.0" } },
  });
}

function mapEntry(row: DbEntry): DiaryEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    code: row.code,
    diaryDate: row.diary_date,
    title: row.title,
    status: row.status,
    weatherCondition: row.weather_condition,
    weatherNote: row.weather_note || "",
    temperatureMinC: row.temperature_min_c == null ? null : Number(row.temperature_min_c),
    temperatureMaxC: row.temperature_max_c == null ? null : Number(row.temperature_max_c),
    workforceTotal: Number(row.workforce_total || 0),
    workforceBreakdown: row.workforce_breakdown || [],
    workSummary: row.work_summary || "",
    blockerSummary: row.blocker_summary || "",
    safetySummary: row.safety_summary || "",
    inspectionSummary: row.inspection_summary || "",
    relatedDocumentIds: row.related_document_ids || [],
    nextEventNumber: Number(row.next_event_number || 1),
    version: Number(row.version || 1),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    closingNote: row.closing_note || "",
  };
}

function mapEvent(row: DbEvent): DiaryEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    entryId: row.entry_id,
    sequenceNumber: Number(row.sequence_number),
    code: row.code,
    eventType: row.event_type,
    title: row.title,
    description: row.description || "",
    status: row.status,
    severity: row.severity,
    occurredAt: row.occurred_at,
    responsibleUserId: row.responsible_user_id,
    responsibleName: row.responsible_name || "",
    dueAt: row.due_at,
    calendarEventId: row.calendar_event_id,
    relatedDocumentIds: row.related_document_ids || [],
    dialogThreadId: row.dialog_thread_id,
    decideRequestId: row.decide_request_id,
    resolution: row.resolution || "",
    version: Number(row.version || 1),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  };
}

function databaseError(message: string, error: unknown, status = 500): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const marker = [candidate?.code, candidate?.message, candidate?.details, candidate?.hint]
    .filter(Boolean).join(" ").toUpperCase();
  const missingSchema = candidate?.code === "PGRST205" || candidate?.code === "42P01" || candidate?.code === "42883";
  if (missingSchema) {
    throw new DiaryCoreRepositoryError(
      "A DIARY Project Log Core 0.8.0 PostgreSQL-sémája még nincs alkalmazva.",
      "DIARY_CORE_SCHEMA_NOT_READY",
      503,
    );
  }
  const mapped: Array<[string, string, string, number]> = [
    ["DIARY_ENTRY_NOT_FOUND", "A napi projektnapló-bejegyzés nem található.", "DIARY_ENTRY_NOT_FOUND", 404],
    ["DIARY_ENTRY_VERSION_CONFLICT", "A naplóbejegyzést közben másik felhasználó módosította. Frissítsd a listát.", "DIARY_ENTRY_VERSION_CONFLICT", 409],
    ["DIARY_ENTRY_TERMINAL", "A lezárt vagy visszavont naplóbejegyzés már nem módosítható.", "DIARY_ENTRY_TERMINAL", 409],
    ["DIARY_ENTRY_DATE_CONFLICT", "Ehhez a projekthez ezen a napon már létezik naplóbejegyzés.", "DIARY_ENTRY_DATE_CONFLICT", 409],
    ["DIARY_INVALID_STATUS_TRANSITION", "Ez a naplóállapot-váltás nem engedélyezett.", "DIARY_INVALID_STATUS_TRANSITION", 409],
    ["DIARY_EVENT_NOT_FOUND", "A naplóesemény nem található.", "DIARY_EVENT_NOT_FOUND", 404],
    ["DIARY_EVENT_VERSION_CONFLICT", "A naplóeseményt közben másik felhasználó módosította.", "DIARY_EVENT_VERSION_CONFLICT", 409],
    ["DIARY_EVENT_TERMINAL", "A lezárt naplóesemény már nem módosítható.", "DIARY_EVENT_TERMINAL", 409],
    ["DIARY_EVENT_ENTRY_CLOSED", "Lezárt vagy visszavont napi naplóhoz új esemény nem rögzíthető.", "DIARY_EVENT_ENTRY_CLOSED", 409],
    ["DIARY_CALENDAR_REQUIRED", "A DIARY határidőkapcsolathoz aktív Project Calendar Core szükséges.", "DIARY_CALENDAR_REQUIRED", 503],
    ["DIARY_CODE_CONFLICT", "A DIARY sorszám létrehozása ütközött. Próbáld újra.", "DIARY_CODE_CONFLICT", 409],
  ];
  for (const [needle, text, code, mappedStatus] of mapped) {
    if (marker.includes(needle)) throw new DiaryCoreRepositoryError(text, code, mappedStatus);
  }
  throw new DiaryCoreRepositoryError(
    message,
    candidate?.code || "DIARY_CORE_DATABASE_ERROR",
    status,
    candidate ? { message: candidate.message, details: candidate.details, hint: candidate.hint } : undefined,
  );
}

export async function getDiaryCoreDatabaseHealth() {
  try {
    const client = getClient();
    const checks = await Promise.all(DIARY_CORE_TABLES.map(async (table) => {
      const { error } = await client.from(table).select(getDiaryCoreSchemaSelect(table)).limit(0);
      return { table, ready: !error, errorCode: error?.code || null, errorMessage: error?.message || null };
    }));
    const { data: marker, error: markerError } = await client
      .from("diary_core_schema_meta")
      .select("schema_version,migration_count,bootstrap_id")
      .eq("component", DIARY_CORE_COMPONENT)
      .maybeSingle();
    const markerReady = !markerError
      && marker?.schema_version === DIARY_CORE_SCHEMA_VERSION
      && Number(marker?.migration_count) === DIARY_CORE_MIGRATION_COUNT
      && marker?.bootstrap_id === DIARY_CORE_BOOTSTRAP_ID;
    return {
      configured: true,
      ready: checks.every((check) => check.ready) && markerReady,
      provider: "supabase" as const,
      expectedSchemaVersion: DIARY_CORE_SCHEMA_VERSION,
      actualSchemaVersion: marker?.schema_version || null,
      migrationCount: marker?.migration_count == null ? null : Number(marker.migration_count),
      bootstrapId: marker?.bootstrap_id || null,
      tables: Object.fromEntries(checks.map((check) => [check.table, check.ready])),
      checks,
      errorCode: checks.find((check) => !check.ready)?.errorCode
        || markerError?.code
        || (markerReady ? null : "DIARY_CORE_SCHEMA_VERSION_MISMATCH"),
    };
  } catch (error) {
    return {
      configured: !(error instanceof DiaryCoreRepositoryError && error.code === "DIARY_CORE_DATABASE_NOT_CONFIGURED"),
      ready: false,
      provider: "supabase" as const,
      expectedSchemaVersion: DIARY_CORE_SCHEMA_VERSION,
      actualSchemaVersion: null,
      migrationCount: null,
      bootstrapId: null,
      tables: Object.fromEntries(DIARY_CORE_TABLES.map((table) => [table, false])),
      checks: DIARY_CORE_TABLES.map((table) => ({
        table,
        ready: false,
        errorCode: error instanceof DiaryCoreRepositoryError ? error.code : "DIARY_CORE_DATABASE_ERROR",
        errorMessage: null,
      })),
      errorCode: error instanceof DiaryCoreRepositoryError ? error.code : "DIARY_CORE_DATABASE_ERROR",
    };
  }
}

async function requireReadyClient() {
  const health = await getDiaryCoreDatabaseHealth();
  if (!health.ready) {
    throw new DiaryCoreRepositoryError(
      "A DIARY Project Log Core 0.8.0 adatbázissémája nem áll készen.",
      "DIARY_CORE_SCHEMA_NOT_READY",
      503,
      health,
    );
  }
  return getClient();
}

export async function listDiaryEntriesRecord(input: {
  projectId: string;
  status?: DiaryEntryStatus | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}) {
  const client = await requireReadyClient();
  let query = client.from("diary_core_entries")
    .select("*")
    .eq("project_id", input.projectId)
    .order("diary_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (input.status) query = query.eq("status", input.status);
  else query = query.neq("status", "CANCELLED");
  if (input.dateFrom) query = query.gte("diary_date", input.dateFrom);
  if (input.dateTo) query = query.lte("diary_date", input.dateTo);
  const { data, error } = await query;
  if (error) databaseError("A DIARY naplóbejegyzések betöltése sikertelen.", error);
  return (data || []).map((row) => mapEntry(row as DbEntry));
}

export async function getDiaryEventSummaryRecord(projectId: string) {
  const client = await requireReadyClient();
  const { data, error } = await client.from("diary_core_events")
    .select("status,severity")
    .eq("project_id", projectId);
  if (error) databaseError("A DIARY eseményösszesítő betöltése sikertelen.", error);
  const rows = (data || []) as Array<{ status: DiaryEventStatus; severity: DiarySeverity }>;
  return {
    unresolvedEvents: rows.filter((row) => row.status === "OPEN").length,
    criticalEvents: rows.filter((row) => row.status === "OPEN" && row.severity === "CRITICAL").length,
  };
}

export async function getDiaryEntryBundleRecord(projectId: string, entryId: string) {
  const client = await requireReadyClient();
  const [entryResult, eventResult] = await Promise.all([
    client.from("diary_core_entries").select("*").eq("project_id", projectId).eq("id", entryId).maybeSingle(),
    client.from("diary_core_events").select("*").eq("project_id", projectId).eq("entry_id", entryId)
      .order("occurred_at", { ascending: true }).order("sequence_number", { ascending: true }),
  ]);
  if (entryResult.error) databaseError("A DIARY naplóbejegyzés betöltése sikertelen.", entryResult.error);
  if (!entryResult.data) throw new DiaryCoreRepositoryError("A napi projektnapló-bejegyzés nem található.", "DIARY_ENTRY_NOT_FOUND", 404);
  if (eventResult.error) databaseError("A DIARY események betöltése sikertelen.", eventResult.error);
  return {
    entry: mapEntry(entryResult.data as DbEntry),
    events: (eventResult.data || []).map((row) => mapEvent(row as DbEvent)),
  };
}

export async function createDiaryEntryRecord(input: {
  projectId: string;
  entry: Record<string, unknown>;
  actorUserId: string;
}) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("diary_core_create_entry_atomic", {
    p_project_id: input.projectId,
    p_entry: input.entry,
    p_actor_user_id: input.actorUserId,
  });
  if (error) databaseError("A DIARY naplóbejegyzés létrehozása sikertelen.", error);
  return mapEntry(data as DbEntry);
}

export async function updateDiaryEntryRecord(input: {
  projectId: string;
  entryId: string;
  expectedVersion: number;
  patch: Record<string, unknown>;
  actorUserId: string;
}) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("diary_core_update_entry_atomic", {
    p_project_id: input.projectId,
    p_entry_id: input.entryId,
    p_expected_version: input.expectedVersion,
    p_patch: input.patch,
    p_actor_user_id: input.actorUserId,
  });
  if (error) databaseError("A DIARY naplóbejegyzés módosítása sikertelen.", error);
  return mapEntry(data as DbEntry);
}

export async function closeDiaryEntryRecord(input: {
  projectId: string;
  entryId: string;
  expectedVersion: number;
  closingNote: string;
  actorUserId: string;
}) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("diary_core_close_entry_atomic", {
    p_project_id: input.projectId,
    p_entry_id: input.entryId,
    p_expected_version: input.expectedVersion,
    p_closing_note: input.closingNote,
    p_actor_user_id: input.actorUserId,
  });
  if (error) databaseError("A DIARY naplóbejegyzés lezárása sikertelen.", error);
  return mapEntry(data as DbEntry);
}

export async function addDiaryEventRecord(input: {
  projectId: string;
  entryId: string;
  event: Record<string, unknown>;
  actorUserId: string;
}) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("diary_core_add_event_atomic", {
    p_project_id: input.projectId,
    p_entry_id: input.entryId,
    p_event: input.event,
    p_actor_user_id: input.actorUserId,
  });
  if (error) databaseError("A DIARY esemény mentése sikertelen.", error);
  const result = data as { entry: DbEntry; event: DbEvent };
  return { entry: mapEntry(result.entry), event: mapEvent(result.event) };
}

export async function updateDiaryEventRecord(input: {
  projectId: string;
  entryId: string;
  eventId: string;
  expectedVersion: number;
  patch: Record<string, unknown>;
  actorUserId: string;
}) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("diary_core_update_event_atomic", {
    p_project_id: input.projectId,
    p_entry_id: input.entryId,
    p_event_id: input.eventId,
    p_expected_version: input.expectedVersion,
    p_patch: input.patch,
    p_actor_user_id: input.actorUserId,
  });
  if (error) databaseError("A DIARY esemény módosítása sikertelen.", error);
  const result = data as { entry: DbEntry; event: DbEvent };
  return { entry: mapEntry(result.entry), event: mapEvent(result.event) };
}
