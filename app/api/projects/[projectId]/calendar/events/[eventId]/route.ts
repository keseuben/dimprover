import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { projectCalendarErrorResponse } from "@/app/lib/project-calendar/api";
import {
  cancelProjectCalendarEvent,
  updateProjectCalendarEvent,
} from "@/app/lib/project-calendar/store";

type RouteContext = { params: Promise<{ projectId: string; eventId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { projectId, eventId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "calendar.write");
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error, code: "code" in access ? access.code : undefined }, { status: access.status });
  }
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 }); }
  try {
    const result = await updateProjectCalendarEvent({
      projectId,
      eventId,
      body,
      actorUserId: access.actor.userId,
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return projectCalendarErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { projectId, eventId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "calendar.write");
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error, code: "code" in access ? access.code : undefined }, { status: access.status });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  try {
    const result = await cancelProjectCalendarEvent({
      projectId,
      eventId,
      body,
      actorUserId: access.actor.userId,
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return projectCalendarErrorResponse(error);
  }
}
