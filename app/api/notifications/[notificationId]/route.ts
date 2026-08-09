import { NextRequest, NextResponse } from "next/server";
import { resolveNotificationAuth, unauthorizedNotificationResponse } from "@/app/lib/notifications/notificationAuth";
import {
  getNotificationForUser,
  getNotificationStorageStatus,
} from "@/app/lib/notifications/notificationStore";

type RouteContext = {
  params: Promise<{
    notificationId: string;
  }>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await resolveNotificationAuth(request);
  if (!auth.ok) return NextResponse.json(unauthorizedNotificationResponse(auth), { status: 401 });

  const params = await context.params;
  const notification = await getNotificationForUser(params.notificationId, auth.userAliases);
  if (!notification) {
    return NextResponse.json({ ok: false, error: "Az értesítés nem található vagy nincs hozzá jogosultság." }, { status: 404 });
  }

  const storage = await getNotificationStorageStatus();
  return NextResponse.json(
    {
      ok: true,
      notification,
      storage: storage.storage,
      authMode: auth.mode,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
