import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { listDriveChanges } from "@/app/lib/drive-core/store";

type RouteContext = { params: Promise<{ projectId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    const cursor = Number(request.nextUrl.searchParams.get("cursor") || 0);
    const limit = Number(request.nextUrl.searchParams.get("limit") || 100);
    const result = await listDriveChanges(projectId, cursor, limit);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) { return driveCoreErrorResponse(error); }
}
