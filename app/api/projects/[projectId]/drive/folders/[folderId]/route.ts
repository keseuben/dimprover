import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { listDriveDocumentDeleteDependencies, listDriveFolderDocumentIds, moveDriveFolder, requireDriveFolderAccess, softDeleteDriveFolderTree } from "@/app/lib/drive-core/store";

type RouteContext = { params: Promise<{ projectId: string; folderId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


export async function PATCH(request: NextRequest, context: RouteContext) {
  const { projectId, folderId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const input = await request.json().catch(() => null) as { targetParentId?: unknown } | null;
  const targetParentId = typeof input?.targetParentId === "string" && input.targetParentId.trim() && input.targetParentId !== "all"
    ? input.targetParentId.trim()
    : null;
  try {
    await requireDriveFolderAccess(projectId, folderId, access.access);
    if (targetParentId) await requireDriveFolderAccess(projectId, targetParentId, access.access);
    const result = await moveDriveFolder(projectId, folderId, targetParentId, access.actor.userId);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { projectId, folderId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "folder.delete");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  try {
    await requireDriveFolderAccess(projectId, folderId, access.access);
    const documentIds = await listDriveFolderDocumentIds(projectId, folderId);
    const dependencies = await listDriveDocumentDeleteDependencies(projectId, documentIds);
    if (dependencies.length) {
      return NextResponse.json({
        ok: false,
        code: "DRIVE_FOLDER_DELETE_DEPENDENCY_BLOCKED",
        error: "A mappa nem helyezhető Lomtárba, mert kapcsolt dokumentumot tartalmaz.",
        dependencies,
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    const result = await softDeleteDriveFolderTree(projectId, folderId, access.actor.userId);
    return NextResponse.json(result, {
      status: result.ok ? 200 : 400,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
