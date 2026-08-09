import { randomUUID } from "node:crypto";
import { DialogCoreRepositoryError } from "./errors";
import {
  addDialogMessageRecord,
  createDialogThreadRecord,
  getDialogCoreDatabaseHealth,
  getDialogThreadBundleRecord,
  listDialogThreadsRecord,
  updateDialogThreadRecord,
} from "./repository";
import type {
  DialogMessageType,
  DialogPriority,
  DialogSummary,
  DialogThread,
  DialogThreadStatus,
  DialogThreadType,
} from "./types";

const THREAD_TYPES: DialogThreadType[] = ["RFI", "DATA_REQUEST", "DESIGN_COMMENT", "COORDINATION", "DECISION_LOG"];
const STATUSES: DialogThreadStatus[] = ["OPEN", "WAITING_RESPONSE", "IN_PROGRESS", "RESOLVED", "CLOSED", "CANCELLED"];
const PRIORITIES: DialogPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const MESSAGE_TYPES: DialogMessageType[] = ["COMMENT", "QUESTION", "ANSWER", "STATUS_NOTE"];

function text(value: unknown, max: number, fallback = "") {
  return (typeof value === "string" ? value.trim() : fallback).slice(0, max);
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  const candidate = typeof value === "string" ? value.trim().toUpperCase() as T : fallback;
  return allowed.includes(candidate) ? candidate : fallback;
}

function stringList(value: unknown, maxItems: number, maxLength: number) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;\n]/)
      : [];
  return [...new Set(raw.map((item) => text(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function optionalDate(value: unknown) {
  if (value == null || value === "") return null;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) {
    throw new DialogCoreRepositoryError("Érvénytelen válaszadási határidő.", "DIALOG_DUE_DATE_INVALID", 400);
  }
  return date.toISOString();
}

function expectedVersion(value: unknown) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new DialogCoreRepositoryError("A módosításhoz az aktuális témakártya-verzió szükséges.", "DIALOG_EXPECTED_VERSION_REQUIRED", 400);
  }
  return number;
}

export async function getDialogCoreHealth() {
  const database = await getDialogCoreDatabaseHealth();
  return { component: "dialog-core", version: "0.6.0", database, ready: database.ready };
}

export async function listDialogThreads(input: {
  projectId: string;
  status?: string | null;
  threadType?: string | null;
  priority?: string | null;
  query?: string | null;
}) {
  const status = input.status ? enumValue(input.status, STATUSES, "OPEN") : null;
  const threadType = input.threadType ? enumValue(input.threadType, THREAD_TYPES, "RFI") : null;
  const priority = input.priority ? enumValue(input.priority, PRIORITIES, "MEDIUM") : null;
  let threads = await listDialogThreadsRecord({ projectId: input.projectId, status, threadType, priority });
  const query = text(input.query, 160).toLocaleLowerCase("hu-HU");
  if (query) {
    threads = threads.filter((thread) => [thread.code, thread.title, thread.description, thread.discipline, thread.ownerName, ...thread.participantNames]
      .join(" ").toLocaleLowerCase("hu-HU").includes(query));
  }
  return { threads, summary: summarizeDialogThreads(threads) };
}

export async function getDialogThread(projectId: string, threadId: string) {
  return getDialogThreadBundleRecord(projectId, threadId);
}

export async function createDialogThread(input: {
  projectId: string;
  body: Record<string, unknown>;
  actorUserId: string;
  actorDisplayName: string;
}) {
  const title = text(input.body.title, 240);
  if (!title) throw new DialogCoreRepositoryError("A témakártya címe kötelező.", "DIALOG_TITLE_REQUIRED", 400);
  const description = text(input.body.description, 6000);
  const initialBody = text(input.body.initialMessage, 6000, description);
  const id = `dialog-thread-${randomUUID().slice(0, 18)}`;
  const now = new Date().toISOString();
  const thread = {
    id,
    thread_type: enumValue(input.body.threadType, THREAD_TYPES, "RFI"),
    title,
    description,
    discipline: text(input.body.discipline, 160),
    status: enumValue(input.body.status, STATUSES, "OPEN"),
    priority: enumValue(input.body.priority, PRIORITIES, "MEDIUM"),
    owner_user_id: text(input.body.ownerUserId, 180) || input.actorUserId,
    owner_name: text(input.body.ownerName, 240, input.actorDisplayName || input.actorUserId),
    participant_names: stringList(input.body.participantNames, 30, 240),
    related_document_ids: stringList(input.body.relatedDocumentIds, 50, 180),
    due_at: optionalDate(input.body.dueAt),
    version: 1,
    created_at: now,
    updated_at: now,
  };
  const initialMessage = initialBody ? {
    id: `dialog-message-${randomUUID().slice(0, 18)}`,
    message_type: enumValue(input.body.initialMessageType, MESSAGE_TYPES, "QUESTION"),
    body: initialBody,
    author_name: input.actorDisplayName || input.actorUserId,
    created_at: now,
  } : null;
  const result = await createDialogThreadRecord({
    projectId: input.projectId,
    thread,
    initialMessage,
    actorUserId: input.actorUserId,
  });
  return { ok: true as const, ...result };
}

export async function updateDialogThread(input: {
  projectId: string;
  threadId: string;
  body: Record<string, unknown>;
  actorUserId: string;
}) {
  const version = expectedVersion(input.body.expectedVersion);
  const patch: Record<string, unknown> = {};
  if ("title" in input.body) {
    patch.title = text(input.body.title, 240);
    if (!patch.title) throw new DialogCoreRepositoryError("A témakártya címe kötelező.", "DIALOG_TITLE_REQUIRED", 400);
  }
  if ("description" in input.body) patch.description = text(input.body.description, 6000);
  if ("threadType" in input.body) patch.thread_type = enumValue(input.body.threadType, THREAD_TYPES, "RFI");
  if ("discipline" in input.body) patch.discipline = text(input.body.discipline, 160);
  if ("status" in input.body) patch.status = enumValue(input.body.status, STATUSES, "OPEN");
  if ("priority" in input.body) patch.priority = enumValue(input.body.priority, PRIORITIES, "MEDIUM");
  if ("ownerUserId" in input.body) patch.owner_user_id = text(input.body.ownerUserId, 180) || null;
  if ("ownerName" in input.body) patch.owner_name = text(input.body.ownerName, 240);
  if ("participantNames" in input.body) patch.participant_names = stringList(input.body.participantNames, 30, 240);
  if ("relatedDocumentIds" in input.body) patch.related_document_ids = stringList(input.body.relatedDocumentIds, 50, 180);
  if ("dueAt" in input.body) patch.due_at = optionalDate(input.body.dueAt);
  if (Object.keys(patch).length === 0) throw new DialogCoreRepositoryError("Nincs módosítandó témakártyaadat.", "DIALOG_PATCH_EMPTY", 400);
  const thread = await updateDialogThreadRecord({
    projectId: input.projectId,
    threadId: input.threadId,
    expectedVersion: version,
    patch,
    actorUserId: input.actorUserId,
  });
  return { ok: true as const, thread };
}

export async function addDialogMessage(input: {
  projectId: string;
  threadId: string;
  body: Record<string, unknown>;
  actorUserId: string;
  actorDisplayName: string;
}) {
  const body = text(input.body.body, 6000);
  if (!body) throw new DialogCoreRepositoryError("A hozzászólás szövege kötelező.", "DIALOG_MESSAGE_BODY_REQUIRED", 400);
  const now = new Date().toISOString();
  const result = await addDialogMessageRecord({
    projectId: input.projectId,
    threadId: input.threadId,
    message: {
      id: `dialog-message-${randomUUID().slice(0, 18)}`,
      message_type: enumValue(input.body.messageType, MESSAGE_TYPES, "COMMENT"),
      body,
      author_name: input.actorDisplayName || input.actorUserId,
      created_at: now,
    },
    actorUserId: input.actorUserId,
  });
  return { ok: true as const, ...result };
}

export function summarizeDialogThreads(threads: DialogThread[]): DialogSummary {
  const now = Date.now();
  return {
    total: threads.length,
    open: threads.filter((thread) => ["OPEN", "IN_PROGRESS"].includes(thread.status)).length,
    waitingResponse: threads.filter((thread) => thread.status === "WAITING_RESPONSE").length,
    overdue: threads.filter((thread) => thread.dueAt && !["RESOLVED", "CLOSED", "CANCELLED"].includes(thread.status) && new Date(thread.dueAt).getTime() < now).length,
    resolved: threads.filter((thread) => ["RESOLVED", "CLOSED"].includes(thread.status)).length,
    critical: threads.filter((thread) => thread.priority === "CRITICAL" && !["CLOSED", "CANCELLED"].includes(thread.status)).length,
  };
}
