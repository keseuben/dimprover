export const DEV_WEB_USER_ID = "dev-web-user";
export const DEV_DESKTOP_USER_ID = "desktop-dev-client";

export function uniqueUserIds(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

export function getDefaultProjectRecipientUserIds(params?: {
  actorUserId?: string;
  clientId?: string;
  extraUserIds?: string[];
}) {
  return uniqueUserIds([
    params?.actorUserId,
    params?.clientId,
    DEV_WEB_USER_ID,
    DEV_DESKTOP_USER_ID,
    ...(params?.extraUserIds || []),
  ]);
}

export function normalizeNotificationUserId(value: string | null | undefined) {
  return String(value || "").trim() || DEV_WEB_USER_ID;
}
