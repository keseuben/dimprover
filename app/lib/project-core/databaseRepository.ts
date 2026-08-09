import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { permissionsForRole } from "./permissions";
import { ProjectCoreRepositoryError } from "./errors";
import {
  PROJECT_CORE_BOOTSTRAP_ID,
  PROJECT_CORE_MIGRATION_COUNT,
  PROJECT_CORE_SCHEMA_VERSION,
  PROJECT_CORE_TABLES,
  getProjectCoreSchemaSelect,
} from "./projectCoreSchema";
import type {
  Project,
  ProjectAccessContext,
  ProjectAuditEvent,
  ProjectCoreState,
  ProjectLifecycleStatus,
  ProjectListItem,
  ProjectMembership,
  ProjectMembershipRole,
} from "./types";

type DbProject = {
  id: string;
  organization_id: string | null;
  code: string;
  name: string;
  description: string;
  status: ProjectLifecycleStatus;
  progress_percent: number;
  current_phase: string;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type DbMembership = {
  id: string;
  project_id: string;
  user_id: string;
  email: string | null;
  display_name: string;
  organization_name: string | null;
  role: ProjectMembershipRole;
  status: ProjectMembership["status"];
  invited_at: string;
  accepted_at: string | null;
  updated_at: string;
};

type DbAuditEvent = {
  id: string;
  project_id: string;
  actor_user_id: string;
  event_type: string;
  entity_type: ProjectAuditEvent["entityType"];
  entity_id: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function getDatabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey || serviceKey.includes("<") || serviceKey.includes(">")) {
    throw new ProjectCoreRepositoryError(
      "A Project Core szerveroldali Supabase-kapcsolata nincs beállítva.",
      "PROJECT_CORE_DATABASE_NOT_CONFIGURED",
      503,
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-project-core/0.2.0" } },
  });
}

function databaseError(message: string, error: unknown, status = 500): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const missingSchema = candidate?.code === "PGRST205" || candidate?.code === "42P01";
  throw new ProjectCoreRepositoryError(
    missingSchema ? "A Project Core PostgreSQL-sémája még nincs alkalmazva." : message,
    missingSchema ? "PROJECT_CORE_SCHEMA_NOT_READY" : candidate?.code || "PROJECT_CORE_DATABASE_ERROR",
    missingSchema ? 503 : status,
    candidate ? { message: candidate.message, details: candidate.details, hint: candidate.hint } : undefined,
  );
}

function mapProject(row: DbProject): Project {
  return {
    id: row.id,
    organizationId: row.organization_id,
    code: row.code,
    name: row.name,
    description: row.description || "",
    status: row.status,
    progressPercent: Number(row.progress_percent || 0),
    currentPhase: row.current_phase || "Előkészítés",
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMembership(row: DbMembership): ProjectMembership {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    email: row.email || undefined,
    displayName: row.display_name,
    organizationName: row.organization_name || undefined,
    role: row.role,
    status: row.status,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
    updatedAt: row.updated_at,
  };
}

function mapAudit(row: DbAuditEvent): ProjectAuditEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    actorUserId: row.actor_user_id,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    metadata: row.metadata || undefined,
    createdAt: row.created_at,
  };
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeProgress(value: unknown, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeDate(value: unknown) {
  const text = normalizeText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeRole(value: unknown): ProjectMembershipRole {
  const roles: ProjectMembershipRole[] = ["OWNER", "PROJECT_MANAGER", "CONTRIBUTOR", "REVIEWER", "VIEWER"];
  return roles.includes(value as ProjectMembershipRole) ? value as ProjectMembershipRole : "VIEWER";
}

function uniqueAliases(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)));
}

function findMembership(rows: DbMembership[], projectId: string, aliases: string[]) {
  const normalizedAliases = uniqueAliases(aliases);
  return rows.find((row) => {
    if (row.project_id !== projectId || row.status !== "ACTIVE") return false;
    return uniqueAliases([row.user_id, row.email]).some((alias) => normalizedAliases.includes(alias));
  });
}

export async function getProjectCoreDatabaseHealth() {
  try {
    const client = getDatabaseClient();
    const checks = await Promise.all(PROJECT_CORE_TABLES.map(async (table) => {
      const { error } = await client.from(table).select(getProjectCoreSchemaSelect(table)).limit(0);
      return { table, ready: !error, errorCode: error?.code || null, errorMessage: error?.message || null };
    }));
    const tables = Object.fromEntries(checks.map((check) => [check.table, check.ready]));
    const { data: marker, error: markerError } = await client
      .from("project_core_schema_meta")
      .select("schema_version,migration_count,bootstrap_id")
      .eq("component", "project-core")
      .maybeSingle();
    const markerReady = !markerError
      && marker?.schema_version === PROJECT_CORE_SCHEMA_VERSION
      && Number(marker?.migration_count) === PROJECT_CORE_MIGRATION_COUNT
      && marker?.bootstrap_id === PROJECT_CORE_BOOTSTRAP_ID;
    return {
      configured: true,
      ready: checks.every((check) => check.ready) && markerReady,
      provider: "supabase" as const,
      expectedSchemaVersion: PROJECT_CORE_SCHEMA_VERSION,
      actualSchemaVersion: marker?.schema_version || null,
      migrationCount: marker?.migration_count == null ? null : Number(marker.migration_count),
      bootstrapId: marker?.bootstrap_id || null,
      tables,
      checks,
      errorCode: checks.find((check) => !check.ready)?.errorCode || markerError?.code || (markerReady ? null : "PROJECT_CORE_SCHEMA_VERSION_MISMATCH"),
    };
  } catch (error) {
    return {
      configured: !(error instanceof ProjectCoreRepositoryError && error.code === "PROJECT_CORE_DATABASE_NOT_CONFIGURED"),
      ready: false,
      provider: "supabase" as const,
      expectedSchemaVersion: PROJECT_CORE_SCHEMA_VERSION,
      actualSchemaVersion: null,
      migrationCount: null,
      bootstrapId: null,
      tables: Object.fromEntries(PROJECT_CORE_TABLES.map((table) => [table, false])),
      checks: PROJECT_CORE_TABLES.map((table) => ({ table, ready: false, errorCode: error instanceof ProjectCoreRepositoryError ? error.code : "PROJECT_CORE_DATABASE_ERROR", errorMessage: null })),
      errorCode: error instanceof ProjectCoreRepositoryError ? error.code : "PROJECT_CORE_DATABASE_ERROR",
    };
  }
}

async function requireReadyClient() {
  const health = await getProjectCoreDatabaseHealth();
  if (!health.ready) {
    throw new ProjectCoreRepositoryError(
      "A Project Core PostgreSQL-sémája nem áll készen.",
      health.errorCode || "PROJECT_CORE_SCHEMA_NOT_READY",
      503,
      health,
    );
  }
  return getDatabaseClient();
}

export async function getProjectCoreState(): Promise<ProjectCoreState> {
  const client = await requireReadyClient();
  const [projectsResult, membershipsResult, auditResult] = await Promise.all([
    client.from("project_core_projects").select("*").order("created_at", { ascending: false }),
    client.from("project_core_memberships").select("*").order("invited_at", { ascending: false }),
    client.from("project_core_audit_events").select("*").order("created_at", { ascending: false }),
  ]);
  if (projectsResult.error) databaseError("A projektek betöltése sikertelen.", projectsResult.error);
  if (membershipsResult.error) databaseError("A projekttagságok betöltése sikertelen.", membershipsResult.error);
  if (auditResult.error) databaseError("A projektaudit betöltése sikertelen.", auditResult.error);
  return {
    schemaVersion: 1,
    projects: (projectsResult.data || []).map((row) => mapProject(row as DbProject)),
    memberships: (membershipsResult.data || []).map((row) => mapMembership(row as DbMembership)),
    auditEvents: (auditResult.data || []).map((row) => mapAudit(row as DbAuditEvent)),
    updatedAt: new Date().toISOString(),
  };
}

export async function getProjectAccess(projectId: string, userAliases: string[]): Promise<ProjectAccessContext | null> {
  const client = await requireReadyClient();
  const [{ data: projectRow, error: projectError }, { data: membershipRows, error: membershipError }] = await Promise.all([
    client.from("project_core_projects").select("*").eq("id", projectId).neq("status", "DELETED").maybeSingle(),
    client.from("project_core_memberships").select("*").eq("project_id", projectId).eq("status", "ACTIVE"),
  ]);
  if (projectError) databaseError("A projekt betöltése sikertelen.", projectError);
  if (membershipError) databaseError("A projekttagság betöltése sikertelen.", membershipError);
  if (!projectRow) return null;
  const membershipRow = findMembership((membershipRows || []) as DbMembership[], projectId, userAliases);
  if (!membershipRow) return null;
  const membership = mapMembership(membershipRow);
  return { project: mapProject(projectRow as DbProject), membership, permissions: permissionsForRole(membership.role) };
}

export async function listAccessibleProjects(userAliases: string[]): Promise<ProjectListItem[]> {
  const client = await requireReadyClient();
  const [{ data: projects, error: projectError }, { data: memberships, error: membershipError }] = await Promise.all([
    client.from("project_core_projects").select("*").neq("status", "DELETED").order("updated_at", { ascending: false }),
    client.from("project_core_memberships").select("*").eq("status", "ACTIVE"),
  ]);
  if (projectError) databaseError("A projektlista betöltése sikertelen.", projectError);
  if (membershipError) databaseError("A projekttagságok betöltése sikertelen.", membershipError);
  const membershipRows = (memberships || []) as DbMembership[];
  return ((projects || []) as DbProject[]).map((row) => {
    const membershipRow = findMembership(membershipRows, row.id, userAliases);
    if (!membershipRow) return null;
    const membership = mapMembership(membershipRow);
    return {
      ...mapProject(row),
      membership,
      permissions: permissionsForRole(membership.role),
      activeMemberCount: membershipRows.filter((item) => item.project_id === row.id && item.status === "ACTIVE").length,
    } satisfies ProjectListItem;
  }).filter((item): item is ProjectListItem => Boolean(item));
}

export async function createProject(input: Record<string, unknown>, actor: { userId: string; displayName: string }) {
  const client = await requireReadyClient();
  const name = normalizeText(input.name);
  if (!name) return { ok: false as const, error: "A projekt neve kötelező." };
  const now = new Date().toISOString();
  const projectId = normalizeText(input.id) || `project-${randomUUID().slice(0, 12)}`;
  const project = {
    id: projectId,
    organization_id: normalizeText(input.organizationId) || null,
    code: normalizeText(input.code) || `PRJ-${Date.now().toString().slice(-6)}`,
    name,
    description: normalizeText(input.description),
    status: "DRAFT",
    progress_percent: normalizeProgress(input.progressPercent),
    current_phase: normalizeText(input.currentPhase, "Előkészítés"),
    starts_at: normalizeDate(input.startsAt),
    ends_at: normalizeDate(input.endsAt),
    created_by: actor.userId,
    created_at: now,
    updated_at: now,
  };
  const membership = {
    id: `membership-${randomUUID().slice(0, 12)}`,
    project_id: projectId,
    user_id: actor.userId,
    email: null,
    display_name: actor.displayName,
    organization_name: null,
    role: "OWNER",
    status: "ACTIVE",
    invited_at: now,
    accepted_at: now,
    updated_at: now,
  };
  const audit = {
    id: `project-audit-${randomUUID().slice(0, 12)}`,
    project_id: projectId,
    actor_user_id: actor.userId,
    event_type: "PROJECT_CREATED",
    entity_type: "project",
    entity_id: projectId,
    summary: `Projekt létrehozva: ${name}`,
    metadata: {},
    created_at: now,
  };
  const { data, error } = await client.rpc("project_core_create_project_atomic", { p_project: project, p_membership: membership, p_audit: audit });
  if (error) {
    if (error.code === "23505") return { ok: false as const, error: "Ez a projektazonosító vagy projektkód már használatban van." };
    databaseError("A projekt tranzakciós létrehozása sikertelen.", error);
  }
  const result = data as { project: DbProject; membership: DbMembership };
  return { ok: true as const, project: mapProject(result.project), membership: mapMembership(result.membership) };
}

export async function updateProject(projectId: string, input: Record<string, unknown>, actorUserId: string) {
  const client = await requireReadyClient();
  const { data: current, error: currentError } = await client.from("project_core_projects").select("*").eq("id", projectId).neq("status", "DELETED").maybeSingle();
  if (currentError) databaseError("A projekt betöltése sikertelen.", currentError);
  if (!current) return { ok: false as const, error: "A projekt nem található." };
  const row = current as DbProject;
  const patch = {
    name: input.name !== undefined ? normalizeText(input.name, row.name) : row.name,
    description: input.description !== undefined ? normalizeText(input.description) : row.description,
    code: input.code !== undefined ? normalizeText(input.code, row.code) : row.code,
    current_phase: input.currentPhase !== undefined ? normalizeText(input.currentPhase, row.current_phase) : row.current_phase,
    progress_percent: input.progressPercent !== undefined ? normalizeProgress(input.progressPercent, row.progress_percent) : row.progress_percent,
    starts_at: input.startsAt !== undefined ? normalizeDate(input.startsAt) : row.starts_at,
    ends_at: input.endsAt !== undefined ? normalizeDate(input.endsAt) : row.ends_at,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client.rpc("project_core_update_project_atomic", {
    p_project_id: projectId,
    p_patch: patch,
    p_actor_user_id: actorUserId,
    p_summary: `Projektadatok módosítva: ${patch.name}`,
  });
  if (error) databaseError("A projekt tranzakciós módosítása sikertelen.", error);
  if (!data) return { ok: false as const, error: "A projekt nem található." };
  return { ok: true as const, project: mapProject(data as DbProject) };
}

export async function addProjectMembership(projectId: string, input: Record<string, unknown>, actorUserId: string) {
  const client = await requireReadyClient();
  const userId = normalizeText(input.userId);
  const email = normalizeText(input.email).toLowerCase();
  if (!userId && !email) return { ok: false as const, error: "Felhasználóazonosító vagy e-mail-cím szükséges." };
  const existing = await listProjectMemberships(projectId);
  if (existing.some((item) => item.status !== "REVOKED" && ((userId && item.userId.toLowerCase() === userId.toLowerCase()) || (email && item.email?.toLowerCase() === email)))) {
    return { ok: false as const, error: "A résztvevő már kapcsolódik a projekthez." };
  }
  const now = new Date().toISOString();
  const membership = {
    id: `membership-${randomUUID().slice(0, 12)}`,
    project_id: projectId,
    user_id: userId || email,
    email: email || null,
    display_name: normalizeText(input.displayName, email || userId),
    organization_name: normalizeText(input.organizationName) || null,
    role: normalizeRole(input.role),
    status: input.activateImmediately === true ? "ACTIVE" : "INVITED",
    invited_at: now,
    accepted_at: input.activateImmediately === true ? now : null,
    updated_at: now,
  };
  const { data, error } = await client.rpc("project_core_add_membership_atomic", {
    p_project_id: projectId,
    p_membership: membership,
    p_actor_user_id: actorUserId,
  });
  if (error) databaseError("A projekttagság tranzakciós létrehozása sikertelen.", error);
  return { ok: true as const, membership: mapMembership(data as DbMembership) };
}

export async function listProjectMemberships(projectId: string) {
  const client = await requireReadyClient();
  const { data, error } = await client.from("project_core_memberships").select("*").eq("project_id", projectId).order("invited_at", { ascending: false });
  if (error) databaseError("A projekttagságok betöltése sikertelen.", error);
  return (data || []).map((row) => mapMembership(row as DbMembership));
}

export async function changeProjectLifecycle(projectId: string, nextStatus: ProjectLifecycleStatus, actorUserId: string) {
  const client = await requireReadyClient();
  const { data: current, error: currentError } = await client.from("project_core_projects").select("*").eq("id", projectId).neq("status", "DELETED").maybeSingle();
  if (currentError) databaseError("A projekt betöltése sikertelen.", currentError);
  if (!current) return { ok: false as const, error: "A projekt nem található." };
  const previousStatus = (current as DbProject).status;
  const transitions: Record<ProjectLifecycleStatus, ProjectLifecycleStatus[]> = {
    DRAFT: ["ACTIVE", "DELETION_SCHEDULED"], ACTIVE: ["CLOSING"], CLOSING: ["ACTIVE", "READ_ONLY"],
    READ_ONLY: ["ARCHIVED"], ARCHIVED: ["DELETION_SCHEDULED"], DELETION_SCHEDULED: ["ARCHIVED", "DELETED"], DELETED: [],
  };
  if (!transitions[previousStatus].includes(nextStatus)) return { ok: false as const, error: `Nem engedélyezett állapotváltás: ${previousStatus} → ${nextStatus}.` };
  const { data, error } = await client.rpc("project_core_change_lifecycle_atomic", {
    p_project_id: projectId,
    p_expected_status: previousStatus,
    p_next_status: nextStatus,
    p_actor_user_id: actorUserId,
  });
  if (error) databaseError("A projektéletciklus tranzakciós módosítása sikertelen.", error);
  if (!data) return { ok: false as const, error: "A projekt állapota időközben megváltozott." };
  return { ok: true as const, project: mapProject(data as DbProject), previousStatus };
}

export async function listProjectAuditEvents(projectId: string, limit = 20) {
  const client = await requireReadyClient();
  const { data, error } = await client.from("project_core_audit_events").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(Math.max(1, Math.min(100, limit)));
  if (error) databaseError("A projektaudit betöltése sikertelen.", error);
  return (data || []).map((row) => mapAudit(row as DbAuditEvent));
}

export async function bootstrapProjectCoreState(state: ProjectCoreState, actorUserId: string) {
  const client = await requireReadyClient();
  const payload = {
    projects: state.projects.map((project) => ({
      id: project.id, organization_id: project.organizationId, code: project.code, name: project.name,
      description: project.description, status: project.status, progress_percent: project.progressPercent,
      current_phase: project.currentPhase, starts_at: project.startsAt, ends_at: project.endsAt,
      created_by: project.createdBy, created_at: project.createdAt, updated_at: project.updatedAt,
    })),
    memberships: state.memberships.map((membership) => ({
      id: membership.id, project_id: membership.projectId, user_id: membership.userId, email: membership.email || null,
      display_name: membership.displayName, organization_name: membership.organizationName || null, role: membership.role,
      status: membership.status, invited_at: membership.invitedAt, accepted_at: membership.acceptedAt, updated_at: membership.updatedAt,
    })),
    audit_events: state.auditEvents.map((event) => ({
      id: event.id, project_id: event.projectId, actor_user_id: event.actorUserId, event_type: event.eventType,
      entity_type: event.entityType, entity_id: event.entityId, summary: event.summary, metadata: event.metadata || {}, created_at: event.createdAt,
    })),
  };
  const { data, error } = await client.rpc("project_core_bootstrap_state", { p_state: payload, p_actor_user_id: actorUserId });
  if (error) databaseError("A file-backed Project Core állapot PostgreSQL-be emelése sikertelen.", error);
  return data as { projects: number; memberships: number; auditEvents: number; alreadyBootstrapped: boolean };
}
