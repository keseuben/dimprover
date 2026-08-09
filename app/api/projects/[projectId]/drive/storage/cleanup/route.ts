import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { processDriveObjectCleanup } from "@/app/lib/drive-core/reviewService";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.approve");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  try {
    const result = await processDriveObjectCleanup({
      projectId,
      actorUserId: access.actor.userId,
      limit: Number(body.limit || 20),
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
