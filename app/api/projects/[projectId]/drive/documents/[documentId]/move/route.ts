import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { moveDriveDocument } from "@/app/lib/drive-core/store";

type RouteContext = { params: Promise<{ projectId: string; documentId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId, documentId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const input = await request.json().catch(() => null) as { targetFolderId?: unknown } | null;
  const targetFolderId = typeof input?.targetFolderId === "string" ? input.targetFolderId.trim() : "";
  if (!targetFolderId) return NextResponse.json({ ok: false, error: "A célmappa kiválasztása kötelező." }, { status: 400 });
  try {
    const result = await moveDriveDocument(projectId, documentId, targetFolderId, access.actor.userId);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
