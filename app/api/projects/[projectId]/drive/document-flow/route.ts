import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { listDriveDocumentFlow } from "@/app/lib/drive-core/documentFlowRepository";
import { listDriveTreeForAccess } from "@/app/lib/drive-core/store";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = { params: Promise<{ projectId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    const [tree, flow] = await Promise.all([
      listDriveTreeForAccess(projectId, access.access),
      listDriveDocumentFlow(projectId),
    ]);
    const visibleDocumentIds = new Set(tree.documents.map((document) => document.id));
    const governance = flow.governance.filter((item) => visibleDocumentIds.has(item.documentId));
    const issues = flow.issues.filter((item) => visibleDocumentIds.has(item.documentId));
    return NextResponse.json({ ok: true, governance, issues }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
