import { randomUUID } from "node:crypto";
import { DecideCoreRepositoryError } from "./errors";
import {
  addDecideNoteRecord,
  createDecideRequestRecord,
  getDecideCoreDatabaseHealth,
  getDecideRequestBundleRecord,
  listDecideRequestsRecord,
  respondDecideApproverRecord,
  updateDecideRequestRecord,
} from "./repository";
import type {
  DecideNoteType,
  DecidePriority,
  DecideRequest,
  DecideRequestStatus,
  DecideRequestType,
  DecideResponse,
  DecideStageMode,
  DecideSummary,
} from "./types";

const REQUEST_TYPES: DecideRequestType[] = [
  "PLAN_APPROVAL",
  "PRODUCT_SUBSTITUTION",
  "COST_IMPACT",
  "SCHEDULE_IMPACT",
  "TECHNICAL_DECISION",
];
const STATUSES: DecideRequestStatus[] = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "CHANGES_REQUESTED", "CANCELLED"];
const PRIORITIES: DecidePriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const RESPONSES: DecideResponse[] = ["APPROVED", "REJECTED", "CHANGES_REQUESTED"];
const STAGE_MODES: DecideStageMode[] = ["ALL", "ANY"];
const NOTE_TYPES: DecideNoteType[] = ["COMMENT", "STATUS_NOTE"];

function text(value: unknown, max: number, fallback = "") {
  return (typeof value === "string" ? value.trim() : fallback).slice(0, max);
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  const candidate = typeof value === "string" ? value.trim().toUpperCase() as T : fallback;
  return allowed.includes(candidate) ? candidate : fallback;
}

function optionalDate(value: unknown) {
  if (value == null || value === "") return null;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) {
    throw new DecideCoreRepositoryError("Érvénytelen döntési határidő.", "DECIDE_DUE_DATE_INVALID", 400);
  }
  return date.toISOString();
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(candidate)));
}

function nullableInteger(value: unknown, min: number, max: number) {
  if (value == null || value === "") return null;
  const candidate = Number(value);
  if (!Number.isFinite(candidate) || !Number.isInteger(candidate) || candidate < min || candidate > max) {
    throw new DecideCoreRepositoryError("Érvénytelen számszerű döntési hatás.", "DECIDE_IMPACT_INVALID", 400);
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
    throw new DecideCoreRepositoryError("A módosításhoz a kérelem aktuális verziója szükséges.", "DECIDE_EXPECTED_VERSION_REQUIRED", 400);
  }
  return version;
}

function normalizeApprovers(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new DecideCoreRepositoryError("Legalább egy jóváhagyó szükséges.", "DECIDE_APPROVERS_REQUIRED", 400);
  }
  const normalized = value.slice(0, 30).map((item, index) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const stageNumber = integer(row.stageNumber, 1, 1, 20);
    const stageMode = enumValue(row.stageMode, STAGE_MODES, "ALL");
    const approverUserId = text(row.approverUserId, 180);
    const approverName = text(row.approverName, 240);
    if (!approverUserId || !approverName) {
      throw new DecideCoreRepositoryError(
        `A(z) ${index + 1}. jóváhagyónál a felhasználóazonosító és a név kötelező.`,
        "DECIDE_APPROVER_IDENTITY_REQUIRED",
        400,
      );
    }
    return {
      id: `decide-approver-${randomUUID().slice(0, 18)}`,
      stage_number: stageNumber,
      stage_mode: stageMode,
      approver_user_id: approverUserId,
      approver_name: approverName,
      approver_role: text(row.approverRole, 160),
    };
  });
  const keys = new Set<string>();
  for (const approver of normalized) {
    const key = `${approver.stage_number}:${approver.approver_user_id}`;
    if (keys.has(key)) {
      throw new DecideCoreRepositoryError("Ugyanaz a jóváhagyó egy szakaszban csak egyszer szerepelhet.", "DECIDE_APPROVER_DUPLICATE", 400);
    }
    keys.add(key);
  }
  const stages = [...new Set(normalized.map((item) => item.stage_number))].sort((a, b) => a - b);
  if (stages[0] !== 1 || stages.some((stage, index) => stage !== index + 1)) {
    throw new DecideCoreRepositoryError("A jóváhagyási szakaszoknak 1-től folyamatosan kell következniük.", "DECIDE_STAGE_SEQUENCE_INVALID", 400);
  }
  for (const stage of stages) {
    const modes = new Set(normalized.filter((item) => item.stage_number === stage).map((item) => item.stage_mode));
    if (modes.size !== 1) {
      throw new DecideCoreRepositoryError("Egy jóváhagyási szakaszon belül azonos működési mód szükséges.", "DECIDE_STAGE_MODE_MISMATCH", 400);
    }
  }
  return normalized;
}

export async function getDecideCoreHealth() {
  const database = await getDecideCoreDatabaseHealth();
  return { component: "decide-core", version: "0.7.0", database, ready: database.ready };
}

export async function listDecideRequests(input: {
  projectId: string;
  status?: string | null;
  requestType?: string | null;
  priority?: string | null;
  query?: string | null;
}) {
  const status = input.status ? enumValue(input.status, STATUSES, "PENDING") : null;
  const requestType = input.requestType ? enumValue(input.requestType, REQUEST_TYPES, "TECHNICAL_DECISION") : null;
  const priority = input.priority ? enumValue(input.priority, PRIORITIES, "MEDIUM") : null;
  let requests = await listDecideRequestsRecord({ projectId: input.projectId, status, requestType, priority });
  const query = text(input.query, 160).toLocaleLowerCase("hu-HU");
  if (query) {
    requests = requests.filter((request) => [
      request.code,
      request.title,
      request.description,
      request.requesterName,
      request.ownerName,
    ].join(" ").toLocaleLowerCase("hu-HU").includes(query));
  }
  return { requests, summary: summarizeDecideRequests(requests) };
}

export async function getDecideRequest(projectId: string, requestId: string) {
  return getDecideRequestBundleRecord(projectId, requestId);
}

export async function createDecideRequest(input: {
  projectId: string;
  body: Record<string, unknown>;
  actorUserId: string;
  actorDisplayName: string;
}) {
  const title = text(input.body.title, 240);
  if (!title) throw new DecideCoreRepositoryError("A döntési kérelem címe kötelező.", "DECIDE_TITLE_REQUIRED", 400);
  const approvers = normalizeApprovers(input.body.approvers);
  const id = `decide-request-${randomUUID().slice(0, 18)}`;
  const now = new Date().toISOString();
  const request = {
    id,
    request_type: enumValue(input.body.requestType, REQUEST_TYPES, "TECHNICAL_DECISION"),
    title,
    description: text(input.body.description, 6000),
    status: "PENDING",
    priority: enumValue(input.body.priority, PRIORITIES, "MEDIUM"),
    requester_user_id: input.actorUserId,
    requester_name: input.actorDisplayName || input.actorUserId,
    owner_user_id: text(input.body.ownerUserId, 180) || input.actorUserId,
    owner_name: text(input.body.ownerName, 240, input.actorDisplayName || input.actorUserId),
    due_at: optionalDate(input.body.dueAt),
    cost_impact_minor: nullableInteger(input.body.costImpactMinor, -999_999_999_999, 999_999_999_999),
    currency: text(input.body.currency, 3, "HUF").toUpperCase() || "HUF",
    schedule_impact_days: nullableInteger(input.body.scheduleImpactDays, -36500, 36500),
    related_document_ids: stringList(input.body.relatedDocumentIds, 50, 180),
    dialog_thread_id: text(input.body.dialogThreadId, 180) || null,
    version: 1,
    created_at: now,
    updated_at: now,
  };
  const initialNoteBody = text(input.body.initialNote, 6000, request.description);
  const initialNote = initialNoteBody ? {
    id: `decide-note-${randomUUID().slice(0, 18)}`,
    note_type: "COMMENT",
    body: initialNoteBody,
    author_name: input.actorDisplayName || input.actorUserId,
    created_at: now,
  } : null;
  const result = await createDecideRequestRecord({
    projectId: input.projectId,
    request,
    approvers,
    initialNote,
    actorUserId: input.actorUserId,
  });
  return { ok: true as const, ...result };
}

export async function updateDecideRequest(input: {
  projectId: string;
  requestId: string;
  body: Record<string, unknown>;
  actorUserId: string;
}) {
  const version = expectedVersion(input.body.expectedVersion);
  const patch: Record<string, unknown> = {};
  if ("title" in input.body) {
    patch.title = text(input.body.title, 240);
    if (!patch.title) throw new DecideCoreRepositoryError("A döntési kérelem címe kötelező.", "DECIDE_TITLE_REQUIRED", 400);
  }
  if ("description" in input.body) patch.description = text(input.body.description, 6000);
  if ("requestType" in input.body) patch.request_type = enumValue(input.body.requestType, REQUEST_TYPES, "TECHNICAL_DECISION");
  if ("priority" in input.body) patch.priority = enumValue(input.body.priority, PRIORITIES, "MEDIUM");
  if ("ownerUserId" in input.body) patch.owner_user_id = text(input.body.ownerUserId, 180) || null;
  if ("ownerName" in input.body) patch.owner_name = text(input.body.ownerName, 240);
  if ("dueAt" in input.body) patch.due_at = optionalDate(input.body.dueAt);
  if ("costImpactMinor" in input.body) patch.cost_impact_minor = nullableInteger(input.body.costImpactMinor, -999_999_999_999, 999_999_999_999);
  if ("currency" in input.body) patch.currency = text(input.body.currency, 3, "HUF").toUpperCase() || "HUF";
  if ("scheduleImpactDays" in input.body) patch.schedule_impact_days = nullableInteger(input.body.scheduleImpactDays, -36500, 36500);
  if ("relatedDocumentIds" in input.body) patch.related_document_ids = stringList(input.body.relatedDocumentIds, 50, 180);
  if ("dialogThreadId" in input.body) patch.dialog_thread_id = text(input.body.dialogThreadId, 180) || null;
  if ("status" in input.body) {
    const status = enumValue(input.body.status, STATUSES, "PENDING");
    if (status !== "CANCELLED") {
      throw new DecideCoreRepositoryError("Kézi állapotváltással csak visszavonás végezhető.", "DECIDE_CANCEL_ONLY", 400);
    }
    patch.status = status;
  }
  if (Object.keys(patch).length === 0) {
    throw new DecideCoreRepositoryError("Nincs módosítandó döntési adat.", "DECIDE_PATCH_EMPTY", 400);
  }
  const request = await updateDecideRequestRecord({
    projectId: input.projectId,
    requestId: input.requestId,
    expectedVersion: version,
    patch,
    actorUserId: input.actorUserId,
  });
  return { ok: true as const, request };
}

export async function respondDecideRequest(input: {
  projectId: string;
  requestId: string;
  body: Record<string, unknown>;
  actorUserId: string;
}) {
  const approverId = text(input.body.approverId, 180);
  if (!approverId) throw new DecideCoreRepositoryError("A jóváhagyói feladat azonosítója kötelező.", "DECIDE_APPROVER_ID_REQUIRED", 400);
  const response = enumValue(input.body.response, RESPONSES, "APPROVED");
  const comment = text(input.body.comment, 3000);
  if (response !== "APPROVED" && !comment) {
    throw new DecideCoreRepositoryError("Elutasításnál vagy módosításkérésnél az indoklás kötelező.", "DECIDE_RESPONSE_COMMENT_REQUIRED", 400);
  }
  const result = await respondDecideApproverRecord({
    projectId: input.projectId,
    requestId: input.requestId,
    approverId,
    response,
    comment,
    actorUserId: input.actorUserId,
  });
  return { ok: true as const, ...result };
}

export async function addDecideNote(input: {
  projectId: string;
  requestId: string;
  body: Record<string, unknown>;
  actorUserId: string;
  actorDisplayName: string;
}) {
  const body = text(input.body.body, 6000);
  if (!body) throw new DecideCoreRepositoryError("A megjegyzés szövege kötelező.", "DECIDE_NOTE_BODY_REQUIRED", 400);
  const now = new Date().toISOString();
  const result = await addDecideNoteRecord({
    projectId: input.projectId,
    requestId: input.requestId,
    note: {
      id: `decide-note-${randomUUID().slice(0, 18)}`,
      note_type: enumValue(input.body.noteType, NOTE_TYPES, "COMMENT"),
      body,
      author_name: input.actorDisplayName || input.actorUserId,
      created_at: now,
    },
    actorUserId: input.actorUserId,
  });
  return { ok: true as const, ...result };
}

export function summarizeDecideRequests(requests: DecideRequest[]): DecideSummary {
  const now = Date.now();
  return {
    total: requests.length,
    pending: requests.filter((request) => request.status === "PENDING").length,
    approved: requests.filter((request) => request.status === "APPROVED").length,
    rejected: requests.filter((request) => request.status === "REJECTED").length,
    changesRequested: requests.filter((request) => request.status === "CHANGES_REQUESTED").length,
    overdue: requests.filter((request) => request.status === "PENDING" && request.dueAt && new Date(request.dueAt).getTime() < now).length,
    critical: requests.filter((request) => request.priority === "CRITICAL" && request.status === "PENDING").length,
  };
}
