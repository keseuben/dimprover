import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEV_WEB_USER_ID } from "@/app/lib/notifications/notificationAccess";
import { permissionsForRole } from "./permissions";
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

function runtimeRoot() {
  const cwd = process.cwd();
  if (cwd.endsWith(path.join(".next", "standalone"))) return path.resolve(cwd, "..", "..");
  return cwd;
}

const dataRoot = path.join(runtimeRoot(), ".data", "dimpro-project-core");
const statePath = path.join(dataRoot, "state.json");

function nowIso() {
  return new Date().toISOString();
}

function uniqueAliases(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)));
}

function createSeedState(): ProjectCoreState {
  const now = nowIso();
  const project: Project = {
    id: "d6-irodaepulet",
    organizationId: "dimpro-demo-organization",
    code: "D6-001",
    name: "D6 Irodaépület",
    description: "Koncepciós DIMPRO Projektkapu munkakörnyezet a D6 Core modulok fejlesztéséhez.",
    status: "ACTIVE",
    progressPercent: 68,
    currentPhase: "Tervezés és előkészítés",
    startsAt: "2026-05-01T00:00:00.000Z",
    endsAt: "2027-03-31T00:00:00.000Z",
    createdBy: DEV_WEB_USER_ID,
    createdAt: now,
    updatedAt: now,
  };

  const ownerMembership: ProjectMembership = {
    id: "membership-d6-owner",
    projectId: project.id,
    userId: DEV_WEB_USER_ID,
    displayName: "DIMPRO projektgazda",
    organizationName: "DIMPRO",
    role: "OWNER",
    status: "ACTIVE",
    invitedAt: now,
    acceptedAt: now,
    updatedAt: now,
  };

  const demoMemberships: ProjectMembership[] = [
    ownerMembership,
    {
      id: "membership-d6-designer",
      projectId: project.id,
      userId: "demo-designer",
      email: "tervezo@example.invalid",
      displayName: "Építész tervező",
      organizationName: "Tervező szervezet",
      role: "CONTRIBUTOR",
      status: "ACTIVE",
      invitedAt: now,
      acceptedAt: now,
      updatedAt: now,
    },
    {
      id: "membership-d6-reviewer",
      projectId: project.id,
      userId: "demo-reviewer",
      email: "ellenor@example.invalid",
      displayName: "Műszaki ellenőr",
      organizationName: "Műszaki ellenőri szervezet",
      role: "REVIEWER",
      status: "ACTIVE",
      invitedAt: now,
      acceptedAt: now,
      updatedAt: now,
    },
  ];

  return {
    schemaVersion: 1,
    projects: [project],
    memberships: demoMemberships,
    auditEvents: [
      {
        id: "audit-d6-project-created",
        projectId: project.id,
        actorUserId: DEV_WEB_USER_ID,
        eventType: "PROJECT_CREATED",
        entityType: "project",
        entityId: project.id,
        summary: "A D6 Irodaépület projektkörnyezet létrejött.",
        createdAt: now,
      },
    ],
    updatedAt: now,
  };
}

async function ensureRoot() {
  await mkdir(dataRoot, { recursive: true });
}

async function writeState(state: ProjectCoreState) {
  await ensureRoot();
  const temporaryPath = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(state, null, 2), "utf8");
  await rename(temporaryPath, statePath);
}

function isState(value: unknown): value is ProjectCoreState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProjectCoreState>;
  return candidate.schemaVersion === 1
    && Array.isArray(candidate.projects)
    && Array.isArray(candidate.memberships)
    && Array.isArray(candidate.auditEvents);
}

export async function getProjectCoreState() {
  await ensureRoot();
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8")) as unknown;
    if (!isState(parsed)) throw new Error("invalid project core state");
    return parsed;
  } catch {
    const seed = createSeedState();
    await writeState(seed);
    return seed;
  }
}

function findMembership(
  state: ProjectCoreState,
  projectId: string,
  aliases: string[],
) {
  const normalizedAliases = uniqueAliases(aliases);
  return state.memberships.find((membership) => {
    if (membership.projectId !== projectId || membership.status !== "ACTIVE") return false;
    const membershipAliases = uniqueAliases([membership.userId, membership.email]);
    return membershipAliases.some((alias) => normalizedAliases.includes(alias));
  });
}

export async function getProjectAccess(
  projectId: string,
  userAliases: string[],
): Promise<ProjectAccessContext | null> {
  const state = await getProjectCoreState();
  const project = state.projects.find((item) => item.id === projectId && item.status !== "DELETED");
  if (!project) return null;
  const membership = findMembership(state, projectId, userAliases);
  if (!membership) return null;
  return { project, membership, permissions: permissionsForRole(membership.role) };
}

export async function listAccessibleProjects(userAliases: string[]): Promise<ProjectListItem[]> {
  const state = await getProjectCoreState();
  return state.projects
    .filter((project) => project.status !== "DELETED")
    .map((project) => {
      const membership = findMembership(state, project.id, userAliases);
      if (!membership) return null;
      return {
        ...project,
        membership,
        permissions: permissionsForRole(membership.role),
        activeMemberCount: state.memberships.filter(
          (item) => item.projectId === project.id && item.status === "ACTIVE",
        ).length,
      } satisfies ProjectListItem;
    })
    .filter((project): project is ProjectListItem => Boolean(project));
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

function auditEvent(input: Omit<ProjectAuditEvent, "id" | "createdAt">): ProjectAuditEvent {
  return {
    ...input,
    id: `project-audit-${randomUUID().slice(0, 12)}`,
    createdAt: nowIso(),
  };
}

export async function createProject(input: Record<string, unknown>, actor: { userId: string; displayName: string }) {
  const state = await getProjectCoreState();
  const name = normalizeText(input.name);
  if (!name) return { ok: false as const, error: "A projekt neve kötelező." };

  const now = nowIso();
  const projectId = normalizeText(input.id) || `project-${randomUUID().slice(0, 12)}`;
  if (state.projects.some((project) => project.id === projectId)) {
    return { ok: false as const, error: "Ez a projektazonosító már használatban van." };
  }

  const project: Project = {
    id: projectId,
    organizationId: normalizeText(input.organizationId) || null,
    code: normalizeText(input.code) || `PRJ-${state.projects.length + 1}`,
    name,
    description: normalizeText(input.description),
    status: "DRAFT",
    progressPercent: normalizeProgress(input.progressPercent),
    currentPhase: normalizeText(input.currentPhase, "Előkészítés"),
    startsAt: normalizeDate(input.startsAt),
    endsAt: normalizeDate(input.endsAt),
    createdBy: actor.userId,
    createdAt: now,
    updatedAt: now,
  };

  const membership: ProjectMembership = {
    id: `membership-${randomUUID().slice(0, 12)}`,
    projectId: project.id,
    userId: actor.userId,
    displayName: actor.displayName,
    role: "OWNER",
    status: "ACTIVE",
    invitedAt: now,
    acceptedAt: now,
    updatedAt: now,
  };

  state.projects.unshift(project);
  state.memberships.unshift(membership);
  state.auditEvents.unshift(auditEvent({
    projectId: project.id,
    actorUserId: actor.userId,
    eventType: "PROJECT_CREATED",
    entityType: "project",
    entityId: project.id,
    summary: `Projekt létrehozva: ${project.name}`,
  }));
  state.updatedAt = now;
  await writeState(state);
  return { ok: true as const, project, membership };
}

export async function updateProject(
  projectId: string,
  input: Record<string, unknown>,
  actorUserId: string,
) {
  const state = await getProjectCoreState();
  const project = state.projects.find((item) => item.id === projectId && item.status !== "DELETED");
  if (!project) return { ok: false as const, error: "A projekt nem található." };

  if (input.name !== undefined) project.name = normalizeText(input.name, project.name);
  if (input.description !== undefined) project.description = normalizeText(input.description);
  if (input.code !== undefined) project.code = normalizeText(input.code, project.code);
  if (input.currentPhase !== undefined) project.currentPhase = normalizeText(input.currentPhase, project.currentPhase);
  if (input.progressPercent !== undefined) project.progressPercent = normalizeProgress(input.progressPercent, project.progressPercent);
  if (input.startsAt !== undefined) project.startsAt = normalizeDate(input.startsAt);
  if (input.endsAt !== undefined) project.endsAt = normalizeDate(input.endsAt);
  project.updatedAt = nowIso();

  state.auditEvents.unshift(auditEvent({
    projectId,
    actorUserId,
    eventType: "PROJECT_UPDATED",
    entityType: "project",
    entityId: projectId,
    summary: `Projektadatok módosítva: ${project.name}`,
  }));
  state.updatedAt = project.updatedAt;
  await writeState(state);
  return { ok: true as const, project };
}

export async function addProjectMembership(
  projectId: string,
  input: Record<string, unknown>,
  actorUserId: string,
) {
  const state = await getProjectCoreState();
  const project = state.projects.find((item) => item.id === projectId && item.status !== "DELETED");
  if (!project) return { ok: false as const, error: "A projekt nem található." };

  const userId = normalizeText(input.userId);
  const email = normalizeText(input.email).toLowerCase();
  if (!userId && !email) return { ok: false as const, error: "Felhasználóazonosító vagy e-mail-cím szükséges." };

  const duplicate = state.memberships.find((membership) =>
    membership.projectId === projectId
    && membership.status !== "REVOKED"
    && (
      (userId && membership.userId.toLowerCase() === userId.toLowerCase())
      || (email && membership.email?.toLowerCase() === email)
    ));
  if (duplicate) return { ok: false as const, error: "A résztvevő már kapcsolódik a projekthez." };

  const now = nowIso();
  const membership: ProjectMembership = {
    id: `membership-${randomUUID().slice(0, 12)}`,
    projectId,
    userId: userId || email,
    email: email || undefined,
    displayName: normalizeText(input.displayName, email || userId),
    organizationName: normalizeText(input.organizationName) || undefined,
    role: normalizeRole(input.role),
    status: input.activateImmediately === true ? "ACTIVE" : "INVITED",
    invitedAt: now,
    acceptedAt: input.activateImmediately === true ? now : null,
    updatedAt: now,
  };

  state.memberships.unshift(membership);
  state.auditEvents.unshift(auditEvent({
    projectId,
    actorUserId,
    eventType: "PROJECT_MEMBER_INVITED",
    entityType: "membership",
    entityId: membership.id,
    summary: `Projekt-résztvevő hozzáadva: ${membership.displayName}`,
    metadata: { role: membership.role, status: membership.status },
  }));
  state.updatedAt = now;
  await writeState(state);
  return { ok: true as const, membership };
}

export async function listProjectMemberships(projectId: string) {
  const state = await getProjectCoreState();
  return state.memberships.filter((membership) => membership.projectId === projectId);
}

export async function changeProjectLifecycle(
  projectId: string,
  nextStatus: ProjectLifecycleStatus,
  actorUserId: string,
) {
  const state = await getProjectCoreState();
  const project = state.projects.find((item) => item.id === projectId && item.status !== "DELETED");
  if (!project) return { ok: false as const, error: "A projekt nem található." };

  const transitions: Record<ProjectLifecycleStatus, ProjectLifecycleStatus[]> = {
    DRAFT: ["ACTIVE", "DELETION_SCHEDULED"],
    ACTIVE: ["CLOSING"],
    CLOSING: ["ACTIVE", "READ_ONLY"],
    READ_ONLY: ["ARCHIVED"],
    ARCHIVED: ["DELETION_SCHEDULED"],
    DELETION_SCHEDULED: ["ARCHIVED", "DELETED"],
    DELETED: [],
  };

  if (!transitions[project.status].includes(nextStatus)) {
    return { ok: false as const, error: `Nem engedélyezett állapotváltás: ${project.status} → ${nextStatus}.` };
  }

  const previousStatus = project.status;
  project.status = nextStatus;
  project.updatedAt = nowIso();
  state.auditEvents.unshift(auditEvent({
    projectId,
    actorUserId,
    eventType: "PROJECT_LIFECYCLE_CHANGED",
    entityType: "lifecycle",
    entityId: projectId,
    summary: `Projektállapot módosítva: ${previousStatus} → ${nextStatus}`,
    metadata: { previousStatus, nextStatus },
  }));
  state.updatedAt = project.updatedAt;
  await writeState(state);
  return { ok: true as const, project, previousStatus };
}

export async function listProjectAuditEvents(projectId: string, limit = 20) {
  const state = await getProjectCoreState();
  return state.auditEvents
    .filter((event) => event.projectId === projectId)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, Math.max(1, Math.min(100, limit)));
}
