import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { deleteDriveCompareFinding, updateDriveCompareFinding } from "@/app/lib/drive-core/compareFindingsRepository";

type RouteContext = { params: Promise<{ projectId: string; findingId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { projectId, findingId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input) return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  try {
    const result = await updateDriveCompareFinding(projectId, findingId, input, access.actor.userId, access.actor.displayName || access.actor.userId);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { projectId, findingId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const expectedVersion = Number(new URL(request.url).searchParams.get("expectedVersion") || 0);
  try {
    const result = await deleteDriveCompareFinding(projectId, findingId, Number.isFinite(expectedVersion) ? Math.round(expectedVersion) : 0, access.actor.userId, access.actor.displayName || access.actor.userId);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
