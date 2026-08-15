import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { completeDriveObjectUpload, scanDriveQuarantinedVersion } from "@/app/lib/drive-core/store";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = { params: Promise<{ projectId: string; uploadId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId, uploadId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    const result = await completeDriveObjectUpload({ projectId, uploadId, actorUserId: access.actor.userId });
    let securityScan: Record<string, unknown> | null = null;
    const documentId = result.session.finalizedDocumentId;
    const versionId = result.session.finalizedVersionId;
    if (documentId && versionId) {
      try {
        securityScan = await scanDriveQuarantinedVersion({ projectId, documentId, versionId, actorUserId: access.actor.userId });
      } catch (scanError) {
        securityScan = {
          ok: false,
          error: scanError instanceof Error ? scanError.message : "A DRIVE vírusvizsgálat nem futott le.",
          code: scanError && typeof scanError === "object" && "code" in scanError
            ? String((scanError as { code?: unknown }).code || "DRIVE_SECURITY_SCAN_FAILED")
            : "DRIVE_SECURITY_SCAN_FAILED",
        };
      }
    }
    return NextResponse.json({ ...result, securityScan }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
