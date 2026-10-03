import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import {
  listDriveTreeForAccess,
  requireDriveDocumentAccess,
} from "@/app/lib/drive-core/store";
import {
  listDriveUserFavoriteEntityIds,
  setDriveUserFavorite,
} from "@/app/lib/drive-core/favoriteRepository";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  try {
    const [tree, storedIds] = await Promise.all([
      listDriveTreeForAccess(projectId, access.access),
      listDriveUserFavoriteEntityIds(projectId, access.actor.userId, "DOCUMENT"),
    ]);
    const visible = new Set(tree.documents.map((document) => document.id));
    const documentIds = storedIds.filter((id) => visible.has(id));
    return NextResponse.json({ ok: true, documentIds }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  }

  const documentId = String(body.documentId || "").trim();
  if (!documentId || typeof body.favorite !== "boolean") {
    return NextResponse.json({ ok: false, error: "A documentId és favorite mező kötelező." }, { status: 400 });
  }

  try {
    await requireDriveDocumentAccess(projectId, documentId, access.access);
    await setDriveUserFavorite({
      projectId,
      userId: access.actor.userId,
      entityType: "DOCUMENT",
      entityId: documentId,
      favorite: body.favorite,
    });

    const [tree, storedIds] = await Promise.all([
      listDriveTreeForAccess(projectId, access.access),
      listDriveUserFavoriteEntityIds(projectId, access.actor.userId, "DOCUMENT"),
    ]);
    const visible = new Set(tree.documents.map((document) => document.id));
    const documentIds = storedIds.filter((id) => visible.has(id));

    return NextResponse.json(
      { ok: true, documentId, favorite: body.favorite, documentIds },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
