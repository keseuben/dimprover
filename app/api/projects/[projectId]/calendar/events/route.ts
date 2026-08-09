import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { projectCalendarErrorResponse } from "@/app/lib/project-calendar/api";
import {
  createProjectCalendarEvent,
  listProjectCalendarEvents,
} from "@/app/lib/project-calendar/store";

type RouteContext = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "calendar.read");
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error, code: "code" in access ? access.code : undefined }, { status: access.status });
  }
  try {
    const result = await listProjectCalendarEvents({
      projectId,
      startsBefore: request.nextUrl.searchParams.get("startsBefore"),
      endsAfter: request.nextUrl.searchParams.get("endsAfter"),
      status: request.nextUrl.searchParams.get("status"),
      eventType: request.nextUrl.searchParams.get("eventType"),
      sourceModule: request.nextUrl.searchParams.get("sourceModule"),
    });
    return NextResponse.json({
      ok: true,
      projectId,
      ...result,
      permissions: access.access.permissions.filter((permission) => permission.startsWith("calendar.")),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return projectCalendarErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "calendar.write");
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error, code: "code" in access ? access.code : undefined }, { status: access.status });
  }
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 }); }
  try {
    const result = await createProjectCalendarEvent({
      projectId,
      body,
      actorUserId: access.actor.userId,
      actorDisplayName: access.actor.displayName,
    });
    return NextResponse.json(result, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return projectCalendarErrorResponse(error);
  }
}
