import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { reviewDriveQuarantinedVersion } from "@/app/lib/drive-core/reviewService";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = {
  params: Promise<{ projectId: string; documentId: string; versionId: string }>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId, documentId, versionId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.approve");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 }); }
  try {
    const result = await reviewDriveQuarantinedVersion({
      projectId,
      documentId,
      versionId,
      body,
      actorUserId: access.actor.userId,
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
