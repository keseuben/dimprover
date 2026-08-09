import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DecideCoreRepositoryError } from "./errors";
import {
  DECIDE_CORE_BOOTSTRAP_ID,
  DECIDE_CORE_COMPONENT,
  DECIDE_CORE_MIGRATION_COUNT,
  DECIDE_CORE_SCHEMA_VERSION,
  DECIDE_CORE_TABLES,
  getDecideCoreSchemaSelect,
} from "./schema";
import type {
  DecideApprover,
  DecideApproverStatus,
  DecideNote,
  DecideNoteType,
  DecidePriority,
  DecideRequest,
  DecideRequestStatus,
  DecideRequestType,
  DecideStageMode,
} from "./types";

type DbRequest = {
  id: string;
  project_id: string;
  code: string;
  request_type: DecideRequestType;
  title: string;
  description: string;
  status: DecideRequestStatus;
  priority: DecidePriority;
  requester_user_id: string;
  requester_name: string;
  owner_user_id: string | null;
  owner_name: string;
  due_at: string | null;
  cost_impact_minor: number | string | null;
  currency: string;
  schedule_impact_days: number | string | null;
  related_document_ids: string[] | null;
  dialog_thread_id: string | null;
  calendar_event_id: string | null;
  current_stage: number | string;
  stage_count: number | string;
  version: number | string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  resolved_at: string | null;
};

type DbApprover = {
  id: string;
  project_id: string;
  request_id: string;
  stage_number: number | string;
  stage_mode: DecideStageMode;
  approver_user_id: string;
  approver_name: string;
  approver_role: string;
  status: DecideApproverStatus;
  response_comment: string;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};

type DbNote = {
  id: string;
  project_id: string;
  request_id: string;
  note_type: DecideNoteType;
  body: string;
  author_user_id: string;
  author_name: string;
  created_at: string;
};

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || key.includes("<") || key.includes(">")) {
    throw new DecideCoreRepositoryError(
      "A DECIDE szerveroldali Supabase-kapcsolata nincs beállítva.",
      "DECIDE_CORE_DATABASE_NOT_CONFIGURED",
      503,
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-client-info": "dimpro-decide-core/0.7.0" } },
  });
}

function mapRequest(row: DbRequest): DecideRequest {
  return {
    id: row.id,
    projectId: row.project_id,
    code: row.code,
    requestType: row.request_type,
    title: row.title,
    description: row.description || "",
    status: row.status,
    priority: row.priority,
    requesterUserId: row.requester_user_id,
    requesterName: row.requester_name || "",
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name || "",
    dueAt: row.due_at,
    costImpactMinor: row.cost_impact_minor == null ? null : Number(row.cost_impact_minor),
    currency: row.currency || "HUF",
    scheduleImpactDays: row.schedule_impact_days == null ? null : Number(row.schedule_impact_days),
    relatedDocumentIds: row.related_document_ids || [],
    dialogThreadId: row.dialog_thread_id,
    calendarEventId: row.calendar_event_id,
    currentStage: Number(row.current_stage || 0),
    stageCount: Number(row.stage_count || 0),
    version: Number(row.version || 1),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
    resolvedAt: row.resolved_at,
  };
}

function mapApprover(row: DbApprover): DecideApprover {
  return {
    id: row.id,
    projectId: row.project_id,
    requestId: row.request_id,
    stageNumber: Number(row.stage_number),
    stageMode: row.stage_mode,
    approverUserId: row.approver_user_id,
    approverName: row.approver_name,
    approverRole: row.approver_role || "",
    status: row.status,
    responseComment: row.response_comment || "",
    respondedAt: row.responded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNote(row: DbNote): DecideNote {
  return {
    id: row.id,
    projectId: row.project_id,
    requestId: row.request_id,
    noteType: row.note_type,
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
    throw new DecideCoreRepositoryError(
      "A DECIDE Workflow Core 0.7.0 PostgreSQL-sémája még nincs alkalmazva.",
      "DECIDE_CORE_SCHEMA_NOT_READY",
      503,
    );
  }
  const mapped: Array<[string, string, string, number]> = [
    ["DECIDE_REQUEST_NOT_FOUND", "A jóváhagyási kérelem nem található.", "DECIDE_REQUEST_NOT_FOUND", 404],
    ["DECIDE_REQUEST_VERSION_CONFLICT", "A kérelmet közben másik felhasználó módosította. Frissítsd a listát.", "DECIDE_REQUEST_VERSION_CONFLICT", 409],
    ["DECIDE_REQUEST_TERMINAL", "A lezárt döntési kérelem már nem módosítható.", "DECIDE_REQUEST_TERMINAL", 409],
    ["DECIDE_INVALID_STATUS_TRANSITION", "Ez a döntési állapotváltás nem engedélyezett.", "DECIDE_INVALID_STATUS_TRANSITION", 409],
    ["DECIDE_APPROVERS_REQUIRED", "Legalább egy jóváhagyó szükséges.", "DECIDE_APPROVERS_REQUIRED", 400],
    ["DECIDE_APPROVER_NOT_FOUND", "A jóváhagyói feladat nem található.", "DECIDE_APPROVER_NOT_FOUND", 404],
    ["DECIDE_APPROVER_ACTOR_MISMATCH", "Erre a jóváhagyói feladatra másik felhasználó van kijelölve.", "DECIDE_APPROVER_ACTOR_MISMATCH", 403],
    ["DECIDE_APPROVER_NOT_ACTIVE", "Ez a jóváhagyási szakasz még nem aktív.", "DECIDE_APPROVER_NOT_ACTIVE", 409],
    ["DECIDE_APPROVER_ALREADY_RESPONDED", "Erre a jóváhagyói feladatra már érkezett válasz.", "DECIDE_APPROVER_ALREADY_RESPONDED", 409],
    ["DECIDE_CALENDAR_REQUIRED", "A DECIDE határidőkapcsolathoz aktív Project Calendar Core szükséges.", "DECIDE_CALENDAR_REQUIRED", 503],
    ["DECIDE_CODE_CONFLICT", "A DECIDE sorszám létrehozása ütközött. Próbáld újra.", "DECIDE_CODE_CONFLICT", 409],
  ];
  for (const [needle, text, code, mappedStatus] of mapped) {
    if (marker.includes(needle)) throw new DecideCoreRepositoryError(text, code, mappedStatus);
  }
  throw new DecideCoreRepositoryError(
    message,
    candidate?.code || "DECIDE_CORE_DATABASE_ERROR",
    status,
    candidate ? { message: candidate.message, details: candidate.details, hint: candidate.hint } : undefined,
  );
}

export async function getDecideCoreDatabaseHealth() {
  try {
    const client = getClient();
    const checks = await Promise.all(DECIDE_CORE_TABLES.map(async (table) => {
      const { error } = await client.from(table).select(getDecideCoreSchemaSelect(table)).limit(0);
      return { table, ready: !error, errorCode: error?.code || null, errorMessage: error?.message || null };
    }));
    const { data: marker, error: markerError } = await client
      .from("decide_core_schema_meta")
      .select("schema_version,migration_count,bootstrap_id")
      .eq("component", DECIDE_CORE_COMPONENT)
      .maybeSingle();
    const markerReady = !markerError
      && marker?.schema_version === DECIDE_CORE_SCHEMA_VERSION
      && Number(marker?.migration_count) === DECIDE_CORE_MIGRATION_COUNT
      && marker?.bootstrap_id === DECIDE_CORE_BOOTSTRAP_ID;
    return {
      configured: true,
      ready: checks.every((check) => check.ready) && markerReady,
      provider: "supabase" as const,
      expectedSchemaVersion: DECIDE_CORE_SCHEMA_VERSION,
      actualSchemaVersion: marker?.schema_version || null,
      migrationCount: marker?.migration_count == null ? null : Number(marker.migration_count),
      bootstrapId: marker?.bootstrap_id || null,
      tables: Object.fromEntries(checks.map((check) => [check.table, check.ready])),
      checks,
      errorCode: checks.find((check) => !check.ready)?.errorCode
        || markerError?.code
        || (markerReady ? null : "DECIDE_CORE_SCHEMA_VERSION_MISMATCH"),
    };
  } catch (error) {
    return {
      configured: !(error instanceof DecideCoreRepositoryError && error.code === "DECIDE_CORE_DATABASE_NOT_CONFIGURED"),
      ready: false,
      provider: "supabase" as const,
      expectedSchemaVersion: DECIDE_CORE_SCHEMA_VERSION,
      actualSchemaVersion: null,
      migrationCount: null,
      bootstrapId: null,
      tables: Object.fromEntries(DECIDE_CORE_TABLES.map((table) => [table, false])),
      checks: DECIDE_CORE_TABLES.map((table) => ({
        table,
        ready: false,
        errorCode: error instanceof DecideCoreRepositoryError ? error.code : "DECIDE_CORE_DATABASE_ERROR",
        errorMessage: null,
      })),
      errorCode: error instanceof DecideCoreRepositoryError ? error.code : "DECIDE_CORE_DATABASE_ERROR",
    };
  }
}

async function requireReadyClient() {
  const health = await getDecideCoreDatabaseHealth();
  if (!health.ready) {
    throw new DecideCoreRepositoryError(
      "A DECIDE Workflow Core 0.7.0 adatbázissémája nem áll készen.",
      "DECIDE_CORE_SCHEMA_NOT_READY",
      503,
      health,
    );
  }
  return getClient();
}

export async function listDecideRequestsRecord(input: {
  projectId: string;
  status?: DecideRequestStatus | null;
  requestType?: DecideRequestType | null;
  priority?: DecidePriority | null;
}) {
  const client = await requireReadyClient();
  let query = client.from("decide_core_requests")
    .select("*")
    .eq("project_id", input.projectId)
    .order("updated_at", { ascending: false });
  if (input.status) query = query.eq("status", input.status);
  else query = query.neq("status", "CANCELLED");
  if (input.requestType) query = query.eq("request_type", input.requestType);
  if (input.priority) query = query.eq("priority", input.priority);
  const { data, error } = await query;
  if (error) databaseError("A DECIDE kérelmek betöltése sikertelen.", error);
  return (data || []).map((row) => mapRequest(row as DbRequest));
}

export async function getDecideRequestBundleRecord(projectId: string, requestId: string) {
  const client = await requireReadyClient();
  const [requestResult, approverResult, noteResult] = await Promise.all([
    client.from("decide_core_requests").select("*").eq("project_id", projectId).eq("id", requestId).maybeSingle(),
    client.from("decide_core_approvers").select("*").eq("project_id", projectId).eq("request_id", requestId)
      .order("stage_number", { ascending: true }).order("created_at", { ascending: true }),
    client.from("decide_core_notes").select("*").eq("project_id", projectId).eq("request_id", requestId)
      .order("created_at", { ascending: true }),
  ]);
  if (requestResult.error) databaseError("A DECIDE kérelem betöltése sikertelen.", requestResult.error);
  if (!requestResult.data) throw new DecideCoreRepositoryError("A jóváhagyási kérelem nem található.", "DECIDE_REQUEST_NOT_FOUND", 404);
  if (approverResult.error) databaseError("A jóváhagyási lánc betöltése sikertelen.", approverResult.error);
  if (noteResult.error) databaseError("A döntési megjegyzések betöltése sikertelen.", noteResult.error);
  return {
    request: mapRequest(requestResult.data as DbRequest),
    approvers: (approverResult.data || []).map((row) => mapApprover(row as DbApprover)),
    notes: (noteResult.data || []).map((row) => mapNote(row as DbNote)),
  };
}

export async function createDecideRequestRecord(input: {
  projectId: string;
  request: Record<string, unknown>;
  approvers: Array<Record<string, unknown>>;
  initialNote: Record<string, unknown> | null;
  actorUserId: string;
}) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("decide_core_create_request_atomic", {
    p_project_id: input.projectId,
    p_request: input.request,
    p_approvers: input.approvers,
    p_initial_note: input.initialNote,
    p_actor_user_id: input.actorUserId,
  });
  if (error) databaseError("A DECIDE kérelem létrehozása sikertelen.", error);
  const result = data as { request: DbRequest; approvers: DbApprover[]; note: DbNote | null };
  return {
    request: mapRequest(result.request),
    approvers: (result.approvers || []).map(mapApprover),
    note: result.note ? mapNote(result.note) : null,
  };
}

export async function updateDecideRequestRecord(input: {
  projectId: string;
  requestId: string;
  expectedVersion: number;
  patch: Record<string, unknown>;
  actorUserId: string;
}) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("decide_core_update_request_atomic", {
    p_project_id: input.projectId,
    p_request_id: input.requestId,
    p_expected_version: input.expectedVersion,
    p_patch: input.patch,
    p_actor_user_id: input.actorUserId,
  });
  if (error) databaseError("A DECIDE kérelem módosítása sikertelen.", error);
  return mapRequest(data as DbRequest);
}

export async function respondDecideApproverRecord(input: {
  projectId: string;
  requestId: string;
  approverId: string;
  response: string;
  comment: string;
  actorUserId: string;
}) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("decide_core_respond_atomic", {
    p_project_id: input.projectId,
    p_request_id: input.requestId,
    p_approver_id: input.approverId,
    p_response: input.response,
    p_comment: input.comment,
    p_actor_user_id: input.actorUserId,
  });
  if (error) databaseError("A DECIDE jóváhagyói válasz mentése sikertelen.", error);
  const result = data as { request: DbRequest; approvers: DbApprover[]; responded_approver: DbApprover };
  return {
    request: mapRequest(result.request),
    approvers: (result.approvers || []).map(mapApprover),
    respondedApprover: mapApprover(result.responded_approver),
  };
}

export async function addDecideNoteRecord(input: {
  projectId: string;
  requestId: string;
  note: Record<string, unknown>;
  actorUserId: string;
}) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("decide_core_add_note_atomic", {
    p_project_id: input.projectId,
    p_request_id: input.requestId,
    p_note: input.note,
    p_actor_user_id: input.actorUserId,
  });
  if (error) databaseError("A DECIDE megjegyzés mentése sikertelen.", error);
  const result = data as { request: DbRequest; note: DbNote };
  return { request: mapRequest(result.request), note: mapNote(result.note) };
}
