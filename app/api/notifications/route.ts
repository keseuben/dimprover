import { NextRequest, NextResponse } from "next/server";
import type { NotificationListQuery, NotificationType } from "@/app/lib/notifications/types";
import { resolveNotificationAuth, unauthorizedNotificationResponse } from "@/app/lib/notifications/notificationAuth";
import {
  ensureNotificationSeedForUser,
  getNotificationStorageStatus,
  listNotificationsForUser,
} from "@/app/lib/notifications/notificationStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseBoolean(value: string | null) {
  return value === "1" || value === "true" || value === "yes";
}

function parseQuery(request: NextRequest): NotificationListQuery {
  const searchParams = request.nextUrl.searchParams;
  return {
    projectId: searchParams.get("projectId") || undefined,
    type: (searchParams.get("type") || "ALL") as NotificationType | "ALL",
    unreadOnly: parseBoolean(searchParams.get("unreadOnly")),
    includeArchived: parseBoolean(searchParams.get("includeArchived")),
    page: Number(searchParams.get("page") || 1),
    pageSize: Number(searchParams.get("pageSize") || 20),
  };
}

export async function GET(request: NextRequest) {
  const auth = await resolveNotificationAuth(request);
  if (!auth.ok) return NextResponse.json(unauthorizedNotificationResponse(auth), { status: 401 });

  await ensureNotificationSeedForUser(auth.userId, auth.displayName);
  const result = await listNotificationsForUser(auth.userAliases, parseQuery(request));
  const storage = await getNotificationStorageStatus();

  return NextResponse.json(
    {
      ok: true,
      ...result,
      storage: storage.storage,
      authMode: auth.mode,
      userId: auth.userId,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
