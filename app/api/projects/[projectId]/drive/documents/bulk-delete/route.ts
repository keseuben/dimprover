import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { listDriveDocumentDeleteDependencies, listDriveTreeForAccess, requireDriveDocumentAccess, softDeleteDriveDocuments } from "@/app/lib/drive-core/store";

type RouteContext = { params: Promise<{ projectId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.delete");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  let input: { documentIds?: unknown };
  try {
    input = await request.json() as { documentIds?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  }

  const documentIds = Array.isArray(input.documentIds)
    ? [...new Set(input.documentIds
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
      .map((value) => value.trim()))]
    : [];

  try {
    if (documentIds.length) {
      const tree = await listDriveTreeForAccess(projectId, access.access);
      const visibleDocumentIds = new Set(tree.documents.map((document) => document.id));
      const hiddenDocumentId = documentIds.find((documentId) => !visibleDocumentIds.has(documentId));
      if (hiddenDocumentId) await requireDriveDocumentAccess(projectId, hiddenDocumentId, access.access);
    }
    const dependencies = await listDriveDocumentDeleteDependencies(projectId, documentIds);
    if (dependencies.length) {
      return NextResponse.json({
        ok: false,
        code: "DRIVE_DOCUMENT_DELETE_DEPENDENCY_BLOCKED",
        error: "A dokumentum nem helyezhető Lomtárba, amíg aktív hibajegy/projektügy- vagy formális kiadási kapcsolata van.",
        dependencies,
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    const result = await softDeleteDriveDocuments(projectId, documentIds, access.actor.userId);
    return NextResponse.json(result, {
      status: result.ok ? 200 : 400,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
