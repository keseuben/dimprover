import { randomUUID } from "node:crypto";
import { ProjectCalendarRepositoryError } from "./errors";
import {
  cancelProjectCalendarEventRecord,
  createProjectCalendarEventRecord,
  getProjectCalendarDatabaseHealth,
  listProjectCalendarEventsRecord,
  updateProjectCalendarEventRecord,
} from "./repository";
import type {
  ProjectCalendarEvent,
  ProjectCalendarEventStatus,
  ProjectCalendarEventType,
  ProjectCalendarPriority,
  ProjectCalendarSourceModule,
  ProjectCalendarSummary,
} from "./types";

const EVENT_TYPES: ProjectCalendarEventType[] = ["MEETING", "DEADLINE", "TASK", "INSPECTION", "MILESTONE", "REMINDER"];
const SOURCE_MODULES: ProjectCalendarSourceModule[] = ["DOCK", "DIALOG", "DECIDE", "DIARY", "DRIVE", "SYSTEM"];
const STATUSES: ProjectCalendarEventStatus[] = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const PRIORITIES: ProjectCalendarPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function text(value: unknown, max: number, fallback = "") {
  return (typeof value === "string" ? value.trim() : fallback).slice(0, max);
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  const candidate = typeof value === "string" ? value.trim().toUpperCase() as T : fallback;
  return allowed.includes(candidate) ? candidate : fallback;
}

function dateValue(value: unknown, fallback?: Date) {
  const date = value instanceof Date ? value : new Date(typeof value === "string" ? value : fallback || Number.NaN);
  if (!Number.isFinite(date.getTime())) {
    throw new ProjectCalendarRepositoryError("Érvénytelen dátum vagy időpont.", "PROJECT_CALENDAR_DATE_INVALID", 400);
  }
  return date;
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(candidate)));
}

function normalizeInterval(body: Record<string, unknown>, current?: ProjectCalendarEvent) {
  const start = dateValue(body.startsAt ?? current?.startsAt, current ? undefined : new Date());
  const defaultEnd = new Date(start.getTime() + 60 * 60 * 1000);
  const end = dateValue(body.endsAt ?? current?.endsAt, current ? undefined : defaultEnd);
  if (end.getTime() < start.getTime()) {
    throw new ProjectCalendarRepositoryError(
      "Az esemény befejezése nem lehet korábbi a kezdésnél.",
      "PROJECT_CALENDAR_INVALID_INTERVAL",
      400,
    );
  }
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

function normalizeSourceReference(body: Record<string, unknown>, current?: ProjectCalendarEvent) {
  const sourceEntityType = text(body.sourceEntityType ?? current?.sourceEntityType, 80) || null;
  const sourceEntityId = text(body.sourceEntityId ?? current?.sourceEntityId, 180) || null;
  if (Boolean(sourceEntityType) !== Boolean(sourceEntityId)) {
    throw new ProjectCalendarRepositoryError(
      "A forráskapcsolathoz típus és azonosító egyaránt szükséges.",
      "PROJECT_CALENDAR_SOURCE_REFERENCE_INCOMPLETE",
      400,
    );
  }
  return { sourceEntityType, sourceEntityId };
}

export async function getProjectCalendarHealth() {
  const database = await getProjectCalendarDatabaseHealth();
  return {
    component: "project-calendar-core",
    version: "0.5.0",
    database,
    ready: database.ready,
  };
}

export async function listProjectCalendarEvents(input: {
  projectId: string;
  startsBefore?: string | null;
  endsAfter?: string | null;
  status?: string | null;
  eventType?: string | null;
  sourceModule?: string | null;
}) {
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0, 23, 59, 59, 999);
  const endsAfter = dateValue(input.endsAfter || defaultStart).toISOString();
  const startsBefore = dateValue(input.startsBefore || defaultEnd).toISOString();
  if (new Date(startsBefore).getTime() < new Date(endsAfter).getTime()) {
    throw new ProjectCalendarRepositoryError("A lekérdezési időszak hibás.", "PROJECT_CALENDAR_RANGE_INVALID", 400);
  }
  const status = input.status ? enumValue(input.status, STATUSES, "PLANNED") : null;
  const eventType = input.eventType ? enumValue(input.eventType, EVENT_TYPES, "TASK") : null;
  const sourceModule = input.sourceModule ? enumValue(input.sourceModule, SOURCE_MODULES, "DOCK") : null;
  const events = await listProjectCalendarEventsRecord({
    projectId: input.projectId,
    startsBefore,
    endsAfter,
    status,
    eventType,
    sourceModule,
  });
  return { events, summary: summarizeProjectCalendarEvents(events) };
}

export async function createProjectCalendarEvent(input: {
  projectId: string;
  body: Record<string, unknown>;
  actorUserId: string;
  actorDisplayName?: string | null;
}) {
  const title = text(input.body.title, 240);
  if (!title) throw new ProjectCalendarRepositoryError("Az esemény címe kötelező.", "PROJECT_CALENDAR_TITLE_REQUIRED", 400);
  const interval = normalizeInterval(input.body);
  const source = normalizeSourceReference(input.body);
  const now = new Date().toISOString();
  const ownerUserId = text(input.body.ownerUserId, 180) || input.actorUserId || null;
  const event: ProjectCalendarEvent = {
    id: `project-calendar-${randomUUID().slice(0, 18)}`,
    projectId: input.projectId,
    title,
    description: text(input.body.description, 4000),
    eventType: enumValue(input.body.eventType, EVENT_TYPES, "TASK"),
    sourceModule: enumValue(input.body.sourceModule, SOURCE_MODULES, "DOCK"),
    status: enumValue(input.body.status, STATUSES, "PLANNED"),
    priority: enumValue(input.body.priority, PRIORITIES, "MEDIUM"),
    ...interval,
    allDay: input.body.allDay === true,
    location: text(input.body.location, 500),
    ownerUserId,
    ownerName: text(input.body.ownerName, 240, input.actorDisplayName || input.actorUserId),
    ...source,
    version: 1,
    createdBy: input.actorUserId,
    updatedBy: input.actorUserId,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  const created = await createProjectCalendarEventRecord({ projectId: input.projectId, event, actorUserId: input.actorUserId });
  return { ok: true as const, event: created };
}

export async function updateProjectCalendarEvent(input: {
  projectId: string;
  eventId: string;
  body: Record<string, unknown>;
  actorUserId: string;
}) {
  const expectedVersion = integer(input.body.expectedVersion, 0, 1, Number.MAX_SAFE_INTEGER);
  if (!expectedVersion) {
    throw new ProjectCalendarRepositoryError("A módosításhoz az esemény aktuális verziója szükséges.", "PROJECT_CALENDAR_EXPECTED_VERSION_REQUIRED", 400);
  }
  const patch: Record<string, unknown> = {};
  if ("title" in input.body) {
    patch.title = text(input.body.title, 240);
    if (!patch.title) throw new ProjectCalendarRepositoryError("Az esemény címe kötelező.", "PROJECT_CALENDAR_TITLE_REQUIRED", 400);
  }
  if ("description" in input.body) patch.description = text(input.body.description, 4000);
  if ("eventType" in input.body) patch.event_type = enumValue(input.body.eventType, EVENT_TYPES, "TASK");
  if ("sourceModule" in input.body) patch.source_module = enumValue(input.body.sourceModule, SOURCE_MODULES, "DOCK");
  if ("status" in input.body) {
    const status = enumValue(input.body.status, STATUSES, "PLANNED");
    if (status === "CANCELLED") {
      throw new ProjectCalendarRepositoryError(
        "Eseményt a külön visszavonási művelettel lehet törölni.",
        "PROJECT_CALENDAR_CANCEL_ROUTE_REQUIRED",
        400,
      );
    }
    patch.status = status;
  }
  if ("priority" in input.body) patch.priority = enumValue(input.body.priority, PRIORITIES, "MEDIUM");
  if ("startsAt" in input.body || "endsAt" in input.body) {
    if (!("startsAt" in input.body) || !("endsAt" in input.body)) {
      throw new ProjectCalendarRepositoryError(
        "Időpontmódosításkor a kezdés és a befejezés együtt szükséges.",
        "PROJECT_CALENDAR_INTERVAL_PAIR_REQUIRED",
        400,
      );
    }
    const interval = normalizeInterval(input.body);
    patch.starts_at = interval.startsAt;
    patch.ends_at = interval.endsAt;
  }
  if ("allDay" in input.body) patch.all_day = input.body.allDay === true;
  if ("location" in input.body) patch.location = text(input.body.location, 500);
  if ("ownerUserId" in input.body) patch.owner_user_id = text(input.body.ownerUserId, 180) || null;
  if ("ownerName" in input.body) patch.owner_name = text(input.body.ownerName, 240);
  if ("sourceEntityType" in input.body || "sourceEntityId" in input.body) {
    const source = normalizeSourceReference(input.body);
    patch.source_entity_type = source.sourceEntityType;
    patch.source_entity_id = source.sourceEntityId;
  }
  if (Object.keys(patch).length === 0) {
    throw new ProjectCalendarRepositoryError("Nincs módosítandó eseményadat.", "PROJECT_CALENDAR_PATCH_EMPTY", 400);
  }
  const event = await updateProjectCalendarEventRecord({
    projectId: input.projectId,
    eventId: input.eventId,
    expectedVersion,
    patch,
    actorUserId: input.actorUserId,
  });
  return { ok: true as const, event };
}

export async function cancelProjectCalendarEvent(input: {
  projectId: string;
  eventId: string;
  body: Record<string, unknown>;
  actorUserId: string;
}) {
  const expectedVersion = integer(input.body.expectedVersion, 0, 1, Number.MAX_SAFE_INTEGER);
  if (!expectedVersion) {
    throw new ProjectCalendarRepositoryError("A visszavonáshoz az esemény aktuális verziója szükséges.", "PROJECT_CALENDAR_EXPECTED_VERSION_REQUIRED", 400);
  }
  const reason = text(input.body.reason, 1000, "Esemény visszavonva.");
  const event = await cancelProjectCalendarEventRecord({
    projectId: input.projectId,
    eventId: input.eventId,
    expectedVersion,
    actorUserId: input.actorUserId,
    reason,
  });
  return { ok: true as const, event };
}

export function summarizeProjectCalendarEvents(events: ProjectCalendarEvent[]): ProjectCalendarSummary {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const byType = Object.fromEntries(EVENT_TYPES.map((type) => [type, 0])) as Record<ProjectCalendarEventType, number>;
  let overdue = 0;
  let today = 0;
  let upcoming7Days = 0;
  let completed = 0;
  for (const event of events) {
    byType[event.eventType] += 1;
    const start = new Date(event.startsAt);
    const end = new Date(event.endsAt);
    if (event.status === "COMPLETED") completed += 1;
    if (!["COMPLETED", "CANCELLED"].includes(event.status) && end.getTime() < now.getTime()) overdue += 1;
    if (start.getTime() < tomorrowStart.getTime() && end.getTime() >= todayStart.getTime()) today += 1;
    if (start.getTime() < nextWeek.getTime() && end.getTime() >= todayStart.getTime()) upcoming7Days += 1;
  }
  return { total: events.length, overdue, today, upcoming7Days, completed, byType };
}
