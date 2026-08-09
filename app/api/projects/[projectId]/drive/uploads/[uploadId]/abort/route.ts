import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { abortDriveObjectUpload } from "@/app/lib/drive-core/store";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = { params: Promise<{ projectId: string; uploadId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId, uploadId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const body = await request.json().catch(() => ({})) as { reason?: string };
  try {
    const result = await abortDriveObjectUpload({
      projectId,
      uploadId,
      actorUserId: access.actor.userId,
      reason: typeof body.reason === "string" ? body.reason : undefined,
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
