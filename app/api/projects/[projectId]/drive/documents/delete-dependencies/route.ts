import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import {
  listDriveDocumentDeleteDependencies,
  listDriveFolderDocumentIds,
  listDriveTreeForAccess,
  requireDriveDocumentAccess,
  requireDriveFolderAccess,
} from "@/app/lib/drive-core/store";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = { params: Promise<{ projectId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.delete");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  let body: { documentIds?: unknown; folderId?: unknown };
  try { body = await request.json() as { documentIds?: unknown; folderId?: unknown }; }
  catch { return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 }); }

  try {
    const requestedIds = Array.isArray(body.documentIds)
      ? [...new Set(body.documentIds.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()))]
      : [];
    const folderId = typeof body.folderId === "string" ? body.folderId.trim() : "";
    let documentIds = requestedIds;

    if (folderId) {
      await requireDriveFolderAccess(projectId, folderId, access.access);
      documentIds = await listDriveFolderDocumentIds(projectId, folderId);
    } else if (documentIds.length) {
      const tree = await listDriveTreeForAccess(projectId, access.access);
      const visibleIds = new Set(tree.documents.map((document) => document.id));
      for (const documentId of documentIds) {
        if (!visibleIds.has(documentId)) await requireDriveDocumentAccess(projectId, documentId, access.access);
      }
    }

    const dependencies = await listDriveDocumentDeleteDependencies(projectId, documentIds);
    return NextResponse.json({
      ok: true,
      blocked: dependencies.length > 0,
      documentIds,
      dependencies,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
