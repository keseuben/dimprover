import { NextRequest, NextResponse } from "next/server";
import { resolveNotificationAuth, unauthorizedNotificationResponse } from "@/app/lib/notifications/notificationAuth";
import { listProjectActivity } from "@/app/lib/notifications/notificationStore";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await resolveNotificationAuth(request);
  if (!auth.ok) return NextResponse.json(unauthorizedNotificationResponse(auth), { status: 401 });

  const params = await context.params;
  const activity = await listProjectActivity(params.projectId, auth.userAliases);
  return NextResponse.json(
    {
      ok: true,
      projectId: params.projectId,
      activity,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
