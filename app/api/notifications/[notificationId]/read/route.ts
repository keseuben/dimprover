import { NextRequest, NextResponse } from "next/server";
import { resolveNotificationAuth, unauthorizedNotificationResponse } from "@/app/lib/notifications/notificationAuth";
import { markNotificationRead } from "@/app/lib/notifications/notificationStore";

type RouteContext = {
  params: Promise<{
    notificationId: string;
  }>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await resolveNotificationAuth(request);
  if (!auth.ok) return NextResponse.json(unauthorizedNotificationResponse(auth), { status: 401 });

  const params = await context.params;
  const recipient = await markNotificationRead(params.notificationId, auth.userAliases, auth.userId);
  if (!recipient) {
    return NextResponse.json({ ok: false, error: "Az értesítés nem található vagy nincs hozzá jogosultság." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, recipient });
}
