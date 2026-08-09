import { NextRequest, NextResponse } from "next/server";
import type { NotificationType } from "@/app/lib/notifications/types";
import { resolveNotificationAuth, unauthorizedNotificationResponse } from "@/app/lib/notifications/notificationAuth";
import { markAllNotificationsRead } from "@/app/lib/notifications/notificationStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await resolveNotificationAuth(request);
  if (!auth.ok) return NextResponse.json(unauthorizedNotificationResponse(auth), { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    type?: NotificationType | "ALL";
  };
  const result = await markAllNotificationsRead(auth.userAliases, auth.userId, {
    projectId: body.projectId,
    type: body.type || "ALL",
  });

  return NextResponse.json({ ok: true, ...result });
}
