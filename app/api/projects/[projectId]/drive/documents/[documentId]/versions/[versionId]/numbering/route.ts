import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { updateDriveVersionNumbering } from "@/app/lib/drive-core/databaseRepository";
import { requireDriveDocumentAccess } from "@/app/lib/drive-core/store";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = {
  params: Promise<{ projectId: string; documentId: string; versionId: string }>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { projectId, documentId, versionId } = await context.params;
  const writeAccess = await requireProjectPermission(request, projectId, "document.write");
  if (!writeAccess.ok) return NextResponse.json({ ok: false, error: writeAccess.error }, { status: writeAccess.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  }

  const mode = body.mode === "IMPORT" ? "IMPORT" : body.mode === "CORRECT" ? "CORRECT" : null;
  if (!mode) return NextResponse.json({ ok: false, error: "Érvénytelen számozási művelet." }, { status: 400 });

  if (mode === "CORRECT") {
    const approveAccess = await requireProjectPermission(request, projectId, "document.approve");
    if (!approveAccess.ok) return NextResponse.json({ ok: false, error: approveAccess.error }, { status: approveAccess.status });
  }

  try {
    await requireDriveDocumentAccess(projectId, documentId, writeAccess.access);
    const result = await updateDriveVersionNumbering({
      projectId,
      documentId,
      versionId,
      mode,
      versionNumber: Number(body.versionNumber),
      revisionNumber: Number(body.revisionNumber),
      reason: typeof body.reason === "string" ? body.reason : "",
      actorUserId: writeAccess.actor.userId,
    });
    return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
