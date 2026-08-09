import { randomUUID } from "node:crypto";
import { DiaryCoreRepositoryError } from "./errors";
import {
  addDiaryEventRecord,
  closeDiaryEntryRecord,
  createDiaryEntryRecord,
  getDiaryCoreDatabaseHealth,
  getDiaryEntryBundleRecord,
  getDiaryEventSummaryRecord,
  listDiaryEntriesRecord,
  updateDiaryEntryRecord,
  updateDiaryEventRecord,
} from "./repository";
import type {
  DiaryEntry,
  DiaryEntryStatus,
  DiaryEventStatus,
  DiaryEventType,
  DiarySeverity,
  DiarySummary,
  DiaryWeatherCondition,
} from "./types";

const ENTRY_STATUSES: DiaryEntryStatus[] = ["DRAFT", "OPEN", "CLOSED", "CANCELLED"];
const WEATHER_CONDITIONS: DiaryWeatherCondition[] = [
  "CLEAR",
  "PARTLY_CLOUDY",
  "CLOUDY",
  "RAIN",
  "SNOW",
  "STORM",
  "FOG",
  "OTHER",
];
const EVENT_TYPES: DiaryEventType[] = [
  "WORK_PROGRESS",
  "OBSTACLE",
  "INCIDENT",
  "INSPECTION",
  "DELIVERY",
  "SAFETY",
  "WEATHER",
  "NOTE",
];
const EVENT_STATUSES: DiaryEventStatus[] = ["OPEN", "RESOLVED", "CANCELLED"];
const SEVERITIES: DiarySeverity[] = ["INFO", "MEDIUM", "HIGH", "CRITICAL"];

function text(value: unknown, max: number, fallback = "") {
  return (typeof value === "string" ? value.trim() : fallback).slice(0, max);
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  const candidate = typeof value === "string" ? value.trim().toUpperCase() as T : fallback;
  return allowed.includes(candidate) ? candidate : fallback;
}

function optionalDateTime(value: unknown, message = "Érvénytelen dátum vagy időpont.") {
  if (value == null || value === "") return null;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) {
    throw new DiaryCoreRepositoryError(message, "DIARY_DATE_INVALID", 400);
  }
  return date.toISOString();
}

function dateOnly(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new DiaryCoreRepositoryError("A napló dátuma ÉÉÉÉ-HH-NN formátumban kötelező.", "DIARY_DATE_REQUIRED", 400);
  }
  const date = new Date(`${raw}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new DiaryCoreRepositoryError("Érvénytelen naplódátum.", "DIARY_DATE_INVALID", 400);
  }
  return raw;
}

function optionalNumber(value: unknown, min: number, max: number, code: string) {
  if (value == null || value === "") return null;
  const candidate = Number(value);
  if (!Number.isFinite(candidate) || candidate < min || candidate > max) {
    throw new DiaryCoreRepositoryError("Érvénytelen számszerű naplóadat.", code, 400);
  }
  return Math.round(candidate * 10) / 10;
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  if (value == null || value === "") return fallback;
  const candidate = Number(value);
  if (!Number.isInteger(candidate) || candidate < min || candidate > max) {
    throw new DiaryCoreRepositoryError("Érvénytelen egész számérték.", "DIARY_INTEGER_INVALID", 400);
  }
  return candidate;
}

function stringList(value: unknown, maxItems: number, maxLength: number) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;\n]/)
      : [];
  return [...new Set(raw.map((item) => text(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function expectedVersion(value: unknown) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) {
    throw new DiaryCoreRepositoryError("A módosításhoz az aktuális verzió szükséges.", "DIARY_EXPECTED_VERSION_REQUIRED", 400);
  }
  return version;
}

function todayInBudapest() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function getDiaryCoreHealth() {
  const database = await getDiaryCoreDatabaseHealth();
  return { component: "diary-core", version: "0.8.0", database, ready: database.ready };
}

export async function listDiaryEntries(input: {
  projectId: string;
  status?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  query?: string | null;
}) {
  const status = input.status ? enumValue(input.status, ENTRY_STATUSES, "OPEN") : null;
  const dateFrom = input.dateFrom ? dateOnly(input.dateFrom) : null;
  const dateTo = input.dateTo ? dateOnly(input.dateTo) : null;
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new DiaryCoreRepositoryError("A kezdődátum nem lehet későbbi a záródátumnál.", "DIARY_DATE_RANGE_INVALID", 400);
  }
  let entries = await listDiaryEntriesRecord({ projectId: input.projectId, status, dateFrom, dateTo });
  const query = text(input.query, 160).toLocaleLowerCase("hu-HU");
  if (query) {
    entries = entries.filter((entry) => [
      entry.code,
      entry.title,
      entry.diaryDate,
      entry.workSummary,
      entry.blockerSummary,
      ...entry.workforceBreakdown,
    ].join(" ").toLocaleLowerCase("hu-HU").includes(query));
  }
  const eventSummary = await getDiaryEventSummaryRecord(input.projectId);
  return { entries, summary: summarizeDiaryEntries(entries, eventSummary) };
}

export async function getDiaryEntry(projectId: string, entryId: string) {
  return getDiaryEntryBundleRecord(projectId, entryId);
}

export async function createDiaryEntry(input: {
  projectId: string;
  body: Record<string, unknown>;
  actorUserId: string;
  actorDisplayName: string;
}) {
  const diaryDate = dateOnly(input.body.diaryDate || todayInBudapest());
  const temperatureMinC = optionalNumber(input.body.temperatureMinC, -60, 70, "DIARY_TEMPERATURE_INVALID");
  const temperatureMaxC = optionalNumber(input.body.temperatureMaxC, -60, 70, "DIARY_TEMPERATURE_INVALID");
  if (temperatureMinC != null && temperatureMaxC != null && temperatureMinC > temperatureMaxC) {
    throw new DiaryCoreRepositoryError("A minimum hőmérséklet nem lehet nagyobb a maximumnál.", "DIARY_TEMPERATURE_RANGE_INVALID", 400);
  }
  const title = text(input.body.title, 240, `${diaryDate} napi projektnapló`);
  const status = enumValue(input.body.status, ["DRAFT", "OPEN"] as const, "OPEN");
  const now = new Date().toISOString();
  const entry = {
    id: `diary-entry-${randomUUID().slice(0, 18)}`,
    diary_date: diaryDate,
    title,
    status,
    weather_condition: enumValue(input.body.weatherCondition, WEATHER_CONDITIONS, "OTHER"),
    weather_note: text(input.body.weatherNote, 1000),
    temperature_min_c: temperatureMinC,
    temperature_max_c: temperatureMaxC,
    workforce_total: integer(input.body.workforceTotal, 0, 0, 100000),
    workforce_breakdown: stringList(input.body.workforceBreakdown, 100, 240),
    work_summary: text(input.body.workSummary, 6000),
    blocker_summary: text(input.body.blockerSummary, 4000),
    safety_summary: text(input.body.safetySummary, 4000),
    inspection_summary: text(input.body.inspectionSummary, 4000),
    related_document_ids: stringList(input.body.relatedDocumentIds, 100, 180),
    version: 1,
    created_at: now,
    updated_at: now,
    created_by_name: input.actorDisplayName || input.actorUserId,
  };
  const created = await createDiaryEntryRecord({
    projectId: input.projectId,
    entry,
    actorUserId: input.actorUserId,
  });
  return { ok: true as const, entry: created };
}

export async function updateDiaryEntry(input: {
  projectId: string;
  entryId: string;
  body: Record<string, unknown>;
  actorUserId: string;
}) {
  const version = expectedVersion(input.body.expectedVersion);
  const patch: Record<string, unknown> = {};
  if ("title" in input.body) {
    patch.title = text(input.body.title, 240);
    if (!patch.title) throw new DiaryCoreRepositoryError("A naplóbejegyzés címe kötelező.", "DIARY_TITLE_REQUIRED", 400);
  }
  if ("status" in input.body) {
    const status = enumValue(input.body.status, ["DRAFT", "OPEN", "CANCELLED"] as const, "OPEN");
    patch.status = status;
  }
  if ("weatherCondition" in input.body) patch.weather_condition = enumValue(input.body.weatherCondition, WEATHER_CONDITIONS, "OTHER");
  if ("weatherNote" in input.body) patch.weather_note = text(input.body.weatherNote, 1000);
  if ("temperatureMinC" in input.body) patch.temperature_min_c = optionalNumber(input.body.temperatureMinC, -60, 70, "DIARY_TEMPERATURE_INVALID");
  if ("temperatureMaxC" in input.body) patch.temperature_max_c = optionalNumber(input.body.temperatureMaxC, -60, 70, "DIARY_TEMPERATURE_INVALID");
  if ("workforceTotal" in input.body) patch.workforce_total = integer(input.body.workforceTotal, 0, 0, 100000);
  if ("workforceBreakdown" in input.body) patch.workforce_breakdown = stringList(input.body.workforceBreakdown, 100, 240);
  if ("workSummary" in input.body) patch.work_summary = text(input.body.workSummary, 6000);
  if ("blockerSummary" in input.body) patch.blocker_summary = text(input.body.blockerSummary, 4000);
  if ("safetySummary" in input.body) patch.safety_summary = text(input.body.safetySummary, 4000);
  if ("inspectionSummary" in input.body) patch.inspection_summary = text(input.body.inspectionSummary, 4000);
  if ("relatedDocumentIds" in input.body) patch.related_document_ids = stringList(input.body.relatedDocumentIds, 100, 180);
  if (Object.keys(patch).length === 0) {
    throw new DiaryCoreRepositoryError("Nincs módosítandó naplóadat.", "DIARY_PATCH_EMPTY", 400);
  }
  if ("temperature_min_c" in patch && "temperature_max_c" in patch
    && patch.temperature_min_c != null && patch.temperature_max_c != null
    && Number(patch.temperature_min_c) > Number(patch.temperature_max_c)) {
    throw new DiaryCoreRepositoryError("A minimum hőmérséklet nem lehet nagyobb a maximumnál.", "DIARY_TEMPERATURE_RANGE_INVALID", 400);
  }
  const entry = await updateDiaryEntryRecord({
    projectId: input.projectId,
    entryId: input.entryId,
    expectedVersion: version,
    patch,
    actorUserId: input.actorUserId,
  });
  return { ok: true as const, entry };
}

export async function closeDiaryEntry(input: {
  projectId: string;
  entryId: string;
  body: Record<string, unknown>;
  actorUserId: string;
}) {
  const version = expectedVersion(input.body.expectedVersion);
  const closingNote = text(input.body.closingNote, 3000);
  const entry = await closeDiaryEntryRecord({
    projectId: input.projectId,
    entryId: input.entryId,
    expectedVersion: version,
    closingNote,
    actorUserId: input.actorUserId,
  });
  return { ok: true as const, entry };
}

export async function addDiaryEvent(input: {
  projectId: string;
  entryId: string;
  body: Record<string, unknown>;
  actorUserId: string;
}) {
  const title = text(input.body.title, 240);
  if (!title) throw new DiaryCoreRepositoryError("A naplóesemény címe kötelező.", "DIARY_EVENT_TITLE_REQUIRED", 400);
  const now = new Date().toISOString();
  const event = {
    id: `diary-event-${randomUUID().slice(0, 18)}`,
    event_type: enumValue(input.body.eventType, EVENT_TYPES, "NOTE"),
    title,
    description: text(input.body.description, 6000),
    status: "OPEN",
    severity: enumValue(input.body.severity, SEVERITIES, "INFO"),
    occurred_at: optionalDateTime(input.body.occurredAt, "Érvénytelen eseményidőpont.") || now,
    responsible_user_id: text(input.body.responsibleUserId, 180) || null,
    responsible_name: text(input.body.responsibleName, 240),
    due_at: optionalDateTime(input.body.dueAt, "Érvénytelen eseményhatáridő."),
    related_document_ids: stringList(input.body.relatedDocumentIds, 100, 180),
    dialog_thread_id: text(input.body.dialogThreadId, 180) || null,
    decide_request_id: text(input.body.decideRequestId, 180) || null,
    resolution: "",
    version: 1,
    created_at: now,
    updated_at: now,
  };
  const result = await addDiaryEventRecord({
    projectId: input.projectId,
    entryId: input.entryId,
    event,
    actorUserId: input.actorUserId,
  });
  return { ok: true as const, ...result };
}

export async function updateDiaryEvent(input: {
  projectId: string;
  entryId: string;
  eventId: string;
  body: Record<string, unknown>;
  actorUserId: string;
}) {
  const version = expectedVersion(input.body.expectedVersion);
  const patch: Record<string, unknown> = {};
  if ("title" in input.body) {
    patch.title = text(input.body.title, 240);
    if (!patch.title) throw new DiaryCoreRepositoryError("A naplóesemény címe kötelező.", "DIARY_EVENT_TITLE_REQUIRED", 400);
  }
  if ("description" in input.body) patch.description = text(input.body.description, 6000);
  if ("eventType" in input.body) patch.event_type = enumValue(input.body.eventType, EVENT_TYPES, "NOTE");
  if ("severity" in input.body) patch.severity = enumValue(input.body.severity, SEVERITIES, "INFO");
  if ("occurredAt" in input.body) patch.occurred_at = optionalDateTime(input.body.occurredAt, "Érvénytelen eseményidőpont.");
  if ("responsibleUserId" in input.body) patch.responsible_user_id = text(input.body.responsibleUserId, 180) || null;
  if ("responsibleName" in input.body) patch.responsible_name = text(input.body.responsibleName, 240);
  if ("dueAt" in input.body) patch.due_at = optionalDateTime(input.body.dueAt, "Érvénytelen eseményhatáridő.");
  if ("relatedDocumentIds" in input.body) patch.related_document_ids = stringList(input.body.relatedDocumentIds, 100, 180);
  if ("dialogThreadId" in input.body) patch.dialog_thread_id = text(input.body.dialogThreadId, 180) || null;
  if ("decideRequestId" in input.body) patch.decide_request_id = text(input.body.decideRequestId, 180) || null;
  if ("status" in input.body) patch.status = enumValue(input.body.status, EVENT_STATUSES, "OPEN");
  if ("resolution" in input.body) patch.resolution = text(input.body.resolution, 4000);
  if (patch.status === "RESOLVED" && !text(input.body.resolution, 4000)) {
    throw new DiaryCoreRepositoryError("Megoldott eseménynél a lezárási leírás kötelező.", "DIARY_EVENT_RESOLUTION_REQUIRED", 400);
  }
  if (Object.keys(patch).length === 0) {
    throw new DiaryCoreRepositoryError("Nincs módosítandó eseményadat.", "DIARY_EVENT_PATCH_EMPTY", 400);
  }
  const result = await updateDiaryEventRecord({
    projectId: input.projectId,
    entryId: input.entryId,
    eventId: input.eventId,
    expectedVersion: version,
    patch,
    actorUserId: input.actorUserId,
  });
  return { ok: true as const, ...result };
}

export function summarizeDiaryEntries(
  entries: DiaryEntry[],
  eventSummary: { unresolvedEvents: number; criticalEvents: number },
): DiarySummary {
  const today = todayInBudapest();
  return {
    total: entries.length,
    draft: entries.filter((entry) => entry.status === "DRAFT").length,
    open: entries.filter((entry) => entry.status === "OPEN").length,
    closed: entries.filter((entry) => entry.status === "CLOSED").length,
    today: entries.filter((entry) => entry.diaryDate === today && entry.status !== "CANCELLED").length,
    unresolvedEvents: eventSummary.unresolvedEvents,
    criticalEvents: eventSummary.criticalEvents,
  };
}
