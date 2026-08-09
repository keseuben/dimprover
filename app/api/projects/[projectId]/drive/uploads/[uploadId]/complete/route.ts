import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { completeDriveObjectUpload } from "@/app/lib/drive-core/store";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = { params: Promise<{ projectId: string; uploadId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId, uploadId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    const result = await completeDriveObjectUpload({ projectId, uploadId, actorUserId: access.actor.userId });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
