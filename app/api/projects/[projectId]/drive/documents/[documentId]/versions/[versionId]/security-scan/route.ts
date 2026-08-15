import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { getDriveVersionSecurityStatus, scanDriveQuarantinedVersion } from "@/app/lib/drive-core/securityScanService";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = {
  params: Promise<{ projectId: string; documentId: string; versionId: string }>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId, documentId, versionId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    const result = await getDriveVersionSecurityStatus({ projectId, documentId, versionId });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId, documentId, versionId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.approve");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    const result = await scanDriveQuarantinedVersion({
      projectId,
      documentId,
      versionId,
      actorUserId: access.actor.userId,
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
