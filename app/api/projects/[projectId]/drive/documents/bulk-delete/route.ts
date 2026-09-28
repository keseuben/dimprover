import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { softDeleteDriveDocuments } from "@/app/lib/drive-core/store";

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
    ? input.documentIds.filter((value): value is string => typeof value === "string")
    : [];

  try {
    const result = await softDeleteDriveDocuments(projectId, documentIds, access.actor.userId);
    return NextResponse.json(result, {
      status: result.ok ? 200 : 400,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
