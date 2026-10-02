import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { listDriveEngineeringMetadata } from "@/app/lib/drive-core/workspaceRepository";
import { listDriveTreeForAccess } from "@/app/lib/drive-core/store";

type RouteContext = { params: Promise<{ projectId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    const [tree, metadata] = await Promise.all([
      listDriveTreeForAccess(projectId, access.access),
      listDriveEngineeringMetadata(projectId),
    ]);
    const visibleDocumentIds = new Set(tree.documents.map((document) => document.id));
    const visibleMetadata = metadata.filter((item) => visibleDocumentIds.has(item.documentId));
    return NextResponse.json({ ok: true, metadata: visibleMetadata }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
