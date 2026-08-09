import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ActivityLog,
  Notification,
  NotificationListQuery,
  NotificationRecipient,
  NotificationType,
  NotificationWithRecipient,
} from "./types";
import { getDefaultProjectRecipientUserIds, uniqueUserIds } from "./notificationAccess";

function getRuntimeProjectRoot() {
  const currentWorkingDirectory = process.cwd();
  if (currentWorkingDirectory.endsWith(path.join(".next", "standalone"))) {
    return path.resolve(currentWorkingDirectory, "..", "..");
  }
  return currentWorkingDirectory;
}

const runtimeProjectRoot = getRuntimeProjectRoot();
const notificationDataRoot = path.join(runtimeProjectRoot, ".data", "dimpro-notifications");
const notificationsPath = path.join(notificationDataRoot, "notifications.jsonl");
const recipientsPath = path.join(notificationDataRoot, "recipients.jsonl");
const activityPath = path.join(notificationDataRoot, "activity.jsonl");

async function ensureNotificationRoot() {
  await mkdir(notificationDataRoot, { recursive: true });
}

async function readJsonLines<T>(filePath: string): Promise<T[]> {
  await ensureNotificationRoot();
  try {
    const raw = await readFile(filePath, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as T;
        } catch {
          return null;
        }
      })
      .filter((item): item is T => Boolean(item));
  } catch {
    return [];
  }
}

async function appendJsonLine<T>(filePath: string, record: T) {
  await ensureNotificationRoot();
  await writeFile(filePath, `${JSON.stringify(record)}\n`, { flag: "a", encoding: "utf8" });
}

async function rewriteJsonLines<T>(filePath: string, records: T[]) {
  await ensureNotificationRoot();
  const content = records.length ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "";
  await writeFile(filePath, content, "utf8");
}

function nowIso() {
  return new Date().toISOString();
}

function normalizePositiveInt(value: unknown, fallback: number, max: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return fallback;
  return Math.min(Math.floor(numberValue), max);
}

function typeMatches(notification: Notification, type?: NotificationType | "ALL") {
  return !type || type === "ALL" || notification.type === type;
}

function toNotificationWithRecipient(notification: Notification, recipient: NotificationRecipient): NotificationWithRecipient {
  return {
    ...notification,
    recipient,
    isUnread: !recipient.readAt,
  };
}

function visibleRecipientForNotification(notificationId: string, userAliases: string[], recipients: NotificationRecipient[]) {
  return recipients.find(
    (recipient) => recipient.notificationId === notificationId && userAliases.includes(recipient.userId),
  );
}

export async function getNotificationStorageStatus() {
  await ensureNotificationRoot();
  return {
    storage: "file" as const,
    dataRoot: notificationDataRoot,
  };
}

export async function createNotification(input: {
  type: NotificationType;
  title: string;
  message: string;
  recipientUserIds: string[];
  projectId?: string;
  projectName?: string;
  relatedFileId?: string;
  relatedFileName?: string;
  relatedMinuteId?: string;
  relatedDeadlineId?: string;
  createdByUserId?: string;
  createdByName?: string;
  source?: Notification["source"];
  sourceClient?: string;
  priority?: Notification["priority"];
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}) {
  const createdAt = nowIso();
  const notification: Notification = {
    id: `ntf_${Date.now()}_${randomUUID().slice(0, 8)}`,
    type: input.type,
    title: input.title,
    message: input.message,
    projectId: input.projectId,
    projectName: input.projectName,
    relatedFileId: input.relatedFileId,
    relatedFileName: input.relatedFileName,
    relatedMinuteId: input.relatedMinuteId,
    relatedDeadlineId: input.relatedDeadlineId,
    createdByUserId: input.createdByUserId,
    createdByName: input.createdByName,
    source: input.source || "server",
    sourceClient: input.sourceClient,
    priority: input.priority || "normal",
    actionUrl: input.actionUrl,
    createdAt,
    metadata: input.metadata,
  };

  const recipientUserIds = uniqueUserIds(input.recipientUserIds);
  const recipients = recipientUserIds.map<NotificationRecipient>((userId) => ({
    id: `ntr_${Date.now()}_${randomUUID().slice(0, 8)}`,
    notificationId: notification.id,
    userId,
    deliveredAt: createdAt,
    readAt: null,
    archivedAt: null,
    emailSentAt: null,
    desktopShownAt: null,
    webShownAt: null,
  }));

  await appendJsonLine(notificationsPath, notification);
  for (const recipient of recipients) {
    await appendJsonLine(recipientsPath, recipient);
  }

  await appendActivityLog({
    projectId: notification.projectId,
    userId: notification.createdByUserId,
    actionType: notification.type,
    entityType: "notification",
    entityId: notification.id,
    message: notification.title,
    sourceClient: notification.sourceClient || notification.source,
    metadata: {
      relatedFileId: notification.relatedFileId,
      relatedMinuteId: notification.relatedMinuteId,
      recipientCount: recipients.length,
    },
  });

  return { notification, recipients };
}

export async function appendActivityLog(input: Omit<ActivityLog, "id" | "createdAt">) {
  const activity: ActivityLog = {
    ...input,
    id: `act_${Date.now()}_${randomUUID().slice(0, 8)}`,
    createdAt: nowIso(),
  };
  await appendJsonLine(activityPath, activity);
  return activity;
}

export async function ensureNotificationSeedForUser(userId: string, displayName?: string) {
  const recipients = await readJsonLines<NotificationRecipient>(recipientsPath);
  if (recipients.some((recipient) => recipient.userId === userId)) return;

  await createNotification({
    type: "FILE_UPLOADED",
    title: "Új tervlap érkezett",
    message: "A DIMPRO Drive projektmappába új mintaterv PDF érkezett. A webes Értesítési Központ és a desktop kliens ugyanazt az olvasottsági állapotot fogja használni.",
    projectId: "DIMPRO_DEMO",
    projectName: "DIMPRO Demo projekt",
    relatedFileId: "DIMPRO_DEMO_mintaterv_pdf",
    relatedFileName: "mintaterv.pdf",
    recipientUserIds: getDefaultProjectRecipientUserIds({ actorUserId: userId }),
    createdByUserId: "system",
    createdByName: "DIMPROVER rendszer",
    source: "drive",
    sourceClient: "web",
    priority: "normal",
    actionUrl: "/drive",
    metadata: { seed: true, forUser: displayName || userId },
  });

  await createNotification({
    type: "DEADLINE_SOON",
    title: "Határidő közeledik",
    message: "A projekt következő ellenőrzési határideje közeledik. A határidős értesítés később az ütemterv modulból automatikusan jön létre.",
    projectId: "DIMPRO_DEMO",
    projectName: "DIMPRO Demo projekt",
    recipientUserIds: getDefaultProjectRecipientUserIds({ actorUserId: userId }),
    createdByUserId: "system",
    createdByName: "DIMPROVER rendszer",
    source: "schedule",
    sourceClient: "web",
    priority: "high",
    actionUrl: "/utemezes",
    metadata: { seed: true },
  });

  await createNotification({
    type: "MINUTES_CREATED",
    title: "Jegyzőkönyv előkészítve",
    message: "Új kooperációs jegyzőkönyv értesítésminta készült. A későbbi verzióban a jegyzőkönyv export és címzettlista automatikusan generálja.",
    projectId: "DIMPRO_DEMO",
    projectName: "DIMPRO Demo projekt",
    relatedMinuteId: "minute-demo-001",
    recipientUserIds: getDefaultProjectRecipientUserIds({ actorUserId: userId }),
    createdByUserId: "system",
    createdByName: "DIMPROVER rendszer",
    source: "minutes",
    sourceClient: "web",
    priority: "normal",
    actionUrl: "/jegyzokonyvek",
    metadata: { seed: true },
  });
}

export async function listNotificationsForUser(userAliases: string[], query: NotificationListQuery = {}) {
  const notifications = await readJsonLines<Notification>(notificationsPath);
  const recipients = await readJsonLines<NotificationRecipient>(recipientsPath);
  const page = normalizePositiveInt(query.page, 1, 10_000);
  const pageSize = normalizePositiveInt(query.pageSize, 20, 100);

  const visible = notifications
    .map((notification) => {
      const recipient = visibleRecipientForNotification(notification.id, userAliases, recipients);
      if (!recipient) return null;
      if (!query.includeArchived && recipient.archivedAt) return null;
      if (query.projectId && notification.projectId !== query.projectId) return null;
      if (!typeMatches(notification, query.type)) return null;
      if (query.unreadOnly && recipient.readAt) return null;
      return toNotificationWithRecipient(notification, recipient);
    })
    .filter((item): item is NotificationWithRecipient => Boolean(item))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const unreadCount = notifications.reduce((count, notification) => {
    const recipient = visibleRecipientForNotification(notification.id, userAliases, recipients);
    if (!recipient || recipient.archivedAt || recipient.readAt) return count;
    return count + 1;
  }, 0);

  const start = (page - 1) * pageSize;
  return {
    notifications: visible.slice(start, start + pageSize),
    total: visible.length,
    page,
    pageSize,
    unreadCount,
  };
}

export async function getUnreadNotificationCount(userAliases: string[]) {
  const notifications = await readJsonLines<Notification>(notificationsPath);
  const recipients = await readJsonLines<NotificationRecipient>(recipientsPath);
  return notifications.reduce((count, notification) => {
    const recipient = visibleRecipientForNotification(notification.id, userAliases, recipients);
    if (!recipient || recipient.archivedAt || recipient.readAt) return count;
    return count + 1;
  }, 0);
}

export async function getNotificationForUser(notificationId: string, userAliases: string[]) {
  const notifications = await readJsonLines<Notification>(notificationsPath);
  const recipients = await readJsonLines<NotificationRecipient>(recipientsPath);
  const notification = notifications.find((item) => item.id === notificationId);
  if (!notification) return null;
  const recipient = visibleRecipientForNotification(notification.id, userAliases, recipients);
  if (!recipient || recipient.archivedAt) return null;
  return toNotificationWithRecipient(notification, recipient);
}

async function updateRecipientForUser(
  notificationId: string,
  userAliases: string[],
  update: (recipient: NotificationRecipient) => NotificationRecipient,
) {
  const recipients = await readJsonLines<NotificationRecipient>(recipientsPath);
  let updatedRecipient: NotificationRecipient | null = null;
  const nextRecipients = recipients.map((recipient) => {
    if (updatedRecipient || recipient.notificationId !== notificationId || !userAliases.includes(recipient.userId)) return recipient;
    updatedRecipient = update(recipient);
    return updatedRecipient;
  });

  if (!updatedRecipient) return null;
  await rewriteJsonLines(recipientsPath, nextRecipients);
  return updatedRecipient;
}

export async function markNotificationRead(notificationId: string, userAliases: string[], actorUserId: string) {
  const updated = await updateRecipientForUser(notificationId, userAliases, (recipient) => ({
    ...recipient,
    readAt: recipient.readAt || nowIso(),
    webShownAt: recipient.webShownAt || nowIso(),
  }));
  if (!updated) return null;
  await appendActivityLog({
    userId: actorUserId,
    actionType: "NOTIFICATION_READ",
    entityType: "notification",
    entityId: notificationId,
    message: "Értesítés olvasottnak jelölve.",
    sourceClient: "web",
  });
  return updated;
}

export async function archiveNotification(notificationId: string, userAliases: string[], actorUserId: string) {
  const updated = await updateRecipientForUser(notificationId, userAliases, (recipient) => ({
    ...recipient,
    archivedAt: recipient.archivedAt || nowIso(),
  }));
  if (!updated) return null;
  await appendActivityLog({
    userId: actorUserId,
    actionType: "NOTIFICATION_ARCHIVED",
    entityType: "notification",
    entityId: notificationId,
    message: "Értesítés archiválva.",
    sourceClient: "web",
  });
  return updated;
}

export async function markAllNotificationsRead(userAliases: string[], actorUserId: string, query: NotificationListQuery = {}) {
  const listed = await listNotificationsForUser(userAliases, { ...query, includeArchived: false, page: 1, pageSize: 10_000 });
  const visibleIds = new Set(listed.notifications.map((notification) => notification.id));
  const readAt = nowIso();
  const recipients = await readJsonLines<NotificationRecipient>(recipientsPath);
  let changed = 0;
  const nextRecipients = recipients.map((recipient) => {
    if (!visibleIds.has(recipient.notificationId) || !userAliases.includes(recipient.userId) || recipient.readAt) return recipient;
    changed += 1;
    return { ...recipient, readAt, webShownAt: recipient.webShownAt || readAt };
  });
  await rewriteJsonLines(recipientsPath, nextRecipients);
  await appendActivityLog({
    userId: actorUserId,
    actionType: "NOTIFICATIONS_MARK_ALL_READ",
    entityType: "notification",
    message: `${changed} értesítés olvasottnak jelölve.` ,
    sourceClient: "web",
    metadata: { changed },
  });
  return { changed };
}

export async function listProjectActivity(projectId: string, userAliases: string[]) {
  const activity = await readJsonLines<ActivityLog>(activityPath);
  const notifications = await listNotificationsForUser(userAliases, { projectId, page: 1, pageSize: 50, includeArchived: true });
  const notificationActivity: ActivityLog[] = notifications.notifications.map((notification) => ({
    id: `activity_${notification.id}`,
    projectId: notification.projectId,
    userId: notification.createdByUserId,
    actionType: notification.type,
    entityType: "notification",
    entityId: notification.id,
    message: notification.title,
    sourceClient: notification.sourceClient || notification.source,
    createdAt: notification.createdAt,
    metadata: {
      message: notification.message,
      relatedFileId: notification.relatedFileId,
      relatedFileName: notification.relatedFileName,
    },
  }));

  return [...activity.filter((item) => item.projectId === projectId), ...notificationActivity]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 100);
}

export async function createFileUploadedNotification(params: {
  projectId: string;
  projectName?: string;
  fileId: string;
  fileName: string;
  actorUserId?: string;
  actorName?: string;
  sourceClient?: string;
  clientId?: string;
}) {
  return createNotification({
    type: "FILE_UPLOADED",
    title: `Új fájl feltöltve: ${params.fileName}`,
    message: `A(z) ${params.fileName} fájl feltöltése megtörtént a ${params.projectName || params.projectId} projektbe.`,
    projectId: params.projectId,
    projectName: params.projectName || params.projectId,
    relatedFileId: params.fileId,
    relatedFileName: params.fileName,
    recipientUserIds: getDefaultProjectRecipientUserIds({
      actorUserId: params.actorUserId,
      clientId: params.clientId,
    }),
    createdByUserId: params.actorUserId || params.clientId || "drive-api",
    createdByName: params.actorName || params.sourceClient || "DIMPRO Drive",
    source: params.sourceClient === "desktop" ? "desktop" : "drive",
    sourceClient: params.sourceClient || "drive-api",
    priority: "normal",
    actionUrl: "/drive",
    metadata: {
      generatedBy: "completeUploadSession",
    },
  });
}
