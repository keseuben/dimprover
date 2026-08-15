import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ProjectIssueSeverity = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type ProjectIssueStatus = "NEW" | "IN_PROGRESS" | "FIXED" | "VERIFIED" | "CLOSED" | "REOPENED";

export type ProjectIssue = {
  id: string;
  projectId: string;
  serial: string;
  sourceType: string;
  sourceId: string;
  title: string;
  description: string;
  location: string;
  discipline: string;
  severity: ProjectIssueSeverity;
  status: ProjectIssueStatus;
  responsibleUserId: string | null;
  responsibleName: string;
  dueAt: string | null;
  note: string;
  metadata: Record<string, unknown>;
  version: number;
  createdBy: string;
  createdByName: string;
  updatedBy: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
};

type DbIssue = {
  id: string;
  project_id: string;
  serial: string;
  source_type: string;
  source_id: string;
  title: string;
  description: string;
  location: string;
  discipline: string;
  severity: ProjectIssueSeverity;
  status: ProjectIssueStatus;
  responsible_user_id: string | null;
  responsible_name: string;
  due_at: string | null;
  note: string;
  metadata: Record<string, unknown> | null;
  version: number;
  created_by: string;
  created_by_name: string;
  updated_by: string;
  updated_by_name: string;
  created_at: string;
  updated_at: string;
};

type DbLink = {
  id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  relation_type: string;
  created_at: string;
  created_by: string;
};

export class ProjectIssueRepositoryError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = "PROJECT_ISSUE_REPOSITORY_ERROR", status = 500) {
    super(message);
    this.name = "ProjectIssueRepositoryError";
    this.code = code;
    this.status = status;
  }
}

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || key.includes("<") || key.includes(">")) {
    throw new ProjectIssueRepositoryError("A Project Issue Core szerveroldali Supabase-kapcsolata nincs beállítva.", "PROJECT_ISSUE_DATABASE_NOT_CONFIGURED", 503);
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-project-issue-core/0.2.0" } },
  });
}

function dbError(message: string, error: unknown, status = 500): never {
  const candidate = error as { code?: string; message?: string; details?: string } | null;
  const text = `${candidate?.message || ""} ${candidate?.details || ""}`;
  const code = candidate?.code || "PROJECT_ISSUE_DATABASE_ERROR";
  const missing = code === "PGRST205" || code === "42P01" || code === "42883";
  if (text.includes("PROJECT_ISSUE_COMPARE_FINDING_NOT_FOUND")) {
    throw new ProjectIssueRepositoryError("A Compare Finding nem található vagy már archivált.", "PROJECT_ISSUE_COMPARE_FINDING_NOT_FOUND", 404);
  }
  if (text.includes("PROJECT_ISSUE_COMPARE_FINDING_REQUIRES_FIX_REQUIRED")) {
    throw new ProjectIssueRepositoryError("Hibajegy csak emberi döntéssel JAVÍTANDÓ státuszú eltérésből hozható létre.", "PROJECT_ISSUE_COMPARE_FINDING_REQUIRES_FIX_REQUIRED", 409);
  }
  if (text.includes("PROJECT_ISSUE_NOT_FOUND")) {
    throw new ProjectIssueRepositoryError("A hibajegy nem található vagy már archivált.", "PROJECT_ISSUE_NOT_FOUND", 404);
  }
  if (text.includes("PROJECT_ISSUE_VERSION_CONFLICT")) {
    throw new ProjectIssueRepositoryError("A hibajegyet közben más is módosította. Frissítsd a listát.", "PROJECT_ISSUE_VERSION_CONFLICT", 409);
  }
  if (text.includes("PROJECT_ISSUE_RESPONSIBLE_NOT_ACTIVE")) {
    throw new ProjectIssueRepositoryError("Felelősként csak aktív projekttag választható.", "PROJECT_ISSUE_RESPONSIBLE_NOT_ACTIVE", 400);
  }
  if (text.includes("PROJECT_ISSUE_DUE_AT_INVALID")) {
    throw new ProjectIssueRepositoryError("Érvénytelen hibajegy-határidő.", "PROJECT_ISSUE_DUE_AT_INVALID", 400);
  }
  if (text.includes("PROJECT_ISSUE_STATUS_INVALID")) {
    throw new ProjectIssueRepositoryError("Érvénytelen hibajegy-státusz.", "PROJECT_ISSUE_STATUS_INVALID", 400);
  }
  if (text.includes("PROJECT_ISSUE_SEVERITY_INVALID")) {
    throw new ProjectIssueRepositoryError("Érvénytelen hibajegy-súlyosság.", "PROJECT_ISSUE_SEVERITY_INVALID", 400);
  }
  if (text.includes("PROJECT_ISSUE_TITLE_REQUIRED")) {
    throw new ProjectIssueRepositoryError("A hibajegy címe nem lehet üres.", "PROJECT_ISSUE_TITLE_REQUIRED", 400);
  }
  throw new ProjectIssueRepositoryError(
    missing ? "A Project Issue Core V0.2 PostgreSQL-séma még nincs alkalmazva." : message,
    missing ? "PROJECT_ISSUE_SCHEMA_NOT_READY" : code,
    missing ? 503 : status,
  );
}

function mapIssue(row: DbIssue): ProjectIssue {
  return {
    id: row.id,
    projectId: row.project_id,
    serial: row.serial,
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title,
    description: row.description || "",
    location: row.location || "",
    discipline: row.discipline || "",
    severity: row.severity,
    status: row.status,
    responsibleUserId: row.responsible_user_id,
    responsibleName: row.responsible_name || "",
    dueAt: row.due_at,
    note: row.note || "",
    metadata: row.metadata || {},
    version: Number(row.version),
    createdBy: row.created_by,
    createdByName: row.created_by_name || "",
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getProjectIssueHealth() {
  try {
    const client = getClient();
    const [table, marker] = await Promise.all([
      client.from("project_core_issues").select("id,project_id,serial,version").limit(0),
      client.from("project_issue_schema_meta").select("schema_version,migration_count,bootstrap_id").eq("component", "project-issue-core").maybeSingle(),
    ]);
    const ready = !table.error && !marker.error && marker.data?.schema_version === "0.2.0" && Number(marker.data?.migration_count) === 2 && marker.data?.bootstrap_id === "project-issue-core-v020-20260815";
    return { ready, schemaVersion: marker.data?.schema_version || null, bootstrapId: marker.data?.bootstrap_id || null, errorCode: table.error?.code || marker.error?.code || null };
  } catch (error) {
    return { ready: false, schemaVersion: null, bootstrapId: null, errorCode: error instanceof ProjectIssueRepositoryError ? error.code : "PROJECT_ISSUE_HEALTH_FAILED" };
  }
}

export async function listProjectIssues(projectId: string) {
  const client = getClient();
  const result = await client.from("project_core_issues").select("*").eq("project_id", projectId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(500);
  if (result.error) dbError("A projekt hibajegyzéke nem tölthető be.", result.error);
  return { ok: true as const, issues: ((result.data || []) as DbIssue[]).map(mapIssue) };
}

export async function convertCompareFindingToIssue(projectId: string, findingId: string, actorUserId: string, actorName: string) {
  const client = getClient();
  const result = await client.rpc("project_issue_create_from_compare_finding_atomic", {
    p_project_id: projectId,
    p_finding_id: findingId,
    p_actor_user_id: actorUserId,
    p_actor_name: actorName,
  });
  if (result.error) dbError("A Compare Finding hibajeggyé alakítása sikertelen.", result.error);
  const payload = result.data as { issue?: DbIssue; link?: DbLink; created?: boolean } | null;
  if (!payload?.issue?.id) throw new ProjectIssueRepositoryError("A hibajegy létrejöttét a szerver nem tudta visszaigazolni.", "PROJECT_ISSUE_CREATE_RESPONSE_INVALID", 500);
  return {
    ok: true as const,
    issue: mapIssue(payload.issue),
    link: payload.link || null,
    created: Boolean(payload.created),
  };
}


const ISSUE_STATUSES: ProjectIssueStatus[] = ["NEW", "IN_PROGRESS", "FIXED", "VERIFIED", "CLOSED", "REOPENED"];
const ISSUE_SEVERITIES: ProjectIssueSeverity[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const ISSUE_PATCH_KEYS = ["title", "description", "location", "discipline", "severity", "status", "responsibleUserId", "dueAt", "note"] as const;

function buildIssuePatch(input: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const key of ISSUE_PATCH_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = input[key];
    if (key === "status") {
      if (!ISSUE_STATUSES.includes(value as ProjectIssueStatus)) throw new ProjectIssueRepositoryError("Érvénytelen hibajegy-státusz.", "PROJECT_ISSUE_STATUS_INVALID", 400);
      patch.status = value;
    } else if (key === "severity") {
      if (!ISSUE_SEVERITIES.includes(value as ProjectIssueSeverity)) throw new ProjectIssueRepositoryError("Érvénytelen hibajegy-súlyosság.", "PROJECT_ISSUE_SEVERITY_INVALID", 400);
      patch.severity = value;
    } else if (key === "responsibleUserId") {
      patch.responsibleUserId = typeof value === "string" ? value.trim().slice(0, 240) : "";
    } else if (key === "dueAt") {
      if (value === null || value === "") patch.dueAt = "";
      else if (typeof value === "string" && !Number.isNaN(new Date(value).getTime())) patch.dueAt = new Date(value).toISOString();
      else throw new ProjectIssueRepositoryError("Érvénytelen hibajegy-határidő.", "PROJECT_ISSUE_DUE_AT_INVALID", 400);
    } else {
      const limits: Record<string, number> = { title: 500, description: 12000, location: 1000, discipline: 240, note: 4000 };
      patch[key] = typeof value === "string" ? value.slice(0, limits[key] || 4000) : "";
    }
  }
  if (Object.keys(patch).length === 0) throw new ProjectIssueRepositoryError("Nincs módosítható hibajegymező a kérésben.", "PROJECT_ISSUE_PATCH_EMPTY", 400);
  if (Object.prototype.hasOwnProperty.call(patch, "title") && !String(patch.title || "").trim()) throw new ProjectIssueRepositoryError("A hibajegy címe nem lehet üres.", "PROJECT_ISSUE_TITLE_REQUIRED", 400);
  return patch;
}

export async function updateProjectIssue(projectId: string, issueId: string, input: Record<string, unknown>, actorUserId: string, actorName: string) {
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new ProjectIssueRepositoryError("A módosításhoz érvényes expectedVersion szükséges.", "PROJECT_ISSUE_EXPECTED_VERSION_REQUIRED", 400);
  }
  const patch = buildIssuePatch(input);
  const client = getClient();
  const result = await client.rpc("project_issue_update_atomic", {
    p_project_id: projectId,
    p_issue_id: issueId,
    p_expected_version: expectedVersion,
    p_patch: patch,
    p_actor_user_id: actorUserId,
    p_actor_name: actorName,
  });
  if (result.error) dbError("A hibajegy frissítése sikertelen.", result.error);
  if (!result.data) throw new ProjectIssueRepositoryError("A hibajegy frissítését a szerver nem tudta visszaigazolni.", "PROJECT_ISSUE_UPDATE_RESPONSE_INVALID", 500);
  return { ok: true as const, issue: mapIssue(result.data as DbIssue) };
}
