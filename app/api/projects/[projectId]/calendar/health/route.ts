import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { getProjectCalendarHealth } from "@/app/lib/project-calendar/store";

type RouteContext = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "calendar.read");
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error, code: "code" in access ? access.code : undefined }, { status: access.status });
  }
  const health = await getProjectCalendarHealth();
  return NextResponse.json({
    ok: true,
    projectId,
    ...health,
    permissions: access.access.permissions.filter((permission) => permission.startsWith("calendar.")),
  }, { headers: { "cache-control": "no-store" } });
}
