import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { requireDriveFolderAccess, softDeleteDriveFolderTree } from "@/app/lib/drive-core/store";

type RouteContext = { params: Promise<{ projectId: string; folderId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { projectId, folderId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "folder.delete");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  try {
    await requireDriveFolderAccess(projectId, folderId, access.access);
    const result = await softDeleteDriveFolderTree(projectId, folderId, access.actor.userId);
    return NextResponse.json(result, {
      status: result.ok ? 200 : 400,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
