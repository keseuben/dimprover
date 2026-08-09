import type {
  NotificationDetailResponse,
  NotificationListQuery,
  NotificationListResponse,
  NotificationType,
  NotificationUnreadCountResponse,
} from "@/app/lib/notifications/types";

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Értesítési API hiba.");
  }
  return payload;
}

function buildListQuery(query: NotificationListQuery = {}) {
  const params = new URLSearchParams();
  if (query.projectId) params.set("projectId", query.projectId);
  if (query.type && query.type !== "ALL") params.set("type", query.type);
  if (query.unreadOnly) params.set("unreadOnly", "true");
  if (query.includeArchived) params.set("includeArchived", "true");
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const value = params.toString();
  return value ? `?${value}` : "";
}

export async function listNotifications(query: NotificationListQuery = {}) {
  const response = await fetch(`/api/notifications${buildListQuery(query)}`, { cache: "no-store" });
  return parseJsonResponse<NotificationListResponse>(response);
}

export async function getUnreadNotificationCount() {
  const response = await fetch("/api/notifications/unread-count", { cache: "no-store" });
  return parseJsonResponse<NotificationUnreadCountResponse>(response);
}

export async function getNotificationDetail(notificationId: string) {
  const response = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}`, { cache: "no-store" });
  return parseJsonResponse<NotificationDetailResponse>(response);
}

export async function markNotificationRead(notificationId: string) {
  const response = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  return parseJsonResponse<{ ok: boolean }>(response);
}

export async function archiveNotification(notificationId: string) {
  const response = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/archive`, {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  return parseJsonResponse<{ ok: boolean }>(response);
}

export async function markAllNotificationsRead(input: { projectId?: string; type?: NotificationType | "ALL" } = {}) {
  const response = await fetch("/api/notifications/mark-all-read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJsonResponse<{ ok: boolean; changed: number }>(response);
}
