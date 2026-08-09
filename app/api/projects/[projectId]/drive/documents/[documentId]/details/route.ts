import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { getDriveDocumentWorkspaceDetails } from "@/app/lib/drive-core/store";

type RouteContext = { params: Promise<{ projectId: string; documentId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId, documentId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    const details = await getDriveDocumentWorkspaceDetails(projectId, documentId);
    return NextResponse.json({ ok: true, details }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
