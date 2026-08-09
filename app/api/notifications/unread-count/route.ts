import { NextRequest, NextResponse } from "next/server";
import { resolveNotificationAuth, unauthorizedNotificationResponse } from "@/app/lib/notifications/notificationAuth";
import {
  ensureNotificationSeedForUser,
  getNotificationStorageStatus,
  getUnreadNotificationCount,
} from "@/app/lib/notifications/notificationStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await resolveNotificationAuth(request);
  if (!auth.ok) return NextResponse.json(unauthorizedNotificationResponse(auth), { status: 401 });

  await ensureNotificationSeedForUser(auth.userId, auth.displayName);
  const unreadCount = await getUnreadNotificationCount(auth.userAliases);
  const storage = await getNotificationStorageStatus();

  return NextResponse.json(
    {
      ok: true,
      unreadCount,
      storage: storage.storage,
      authMode: auth.mode,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
