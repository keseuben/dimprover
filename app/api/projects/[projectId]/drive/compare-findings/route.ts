import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { createDriveCompareFinding, listDriveCompareFindings } from "@/app/lib/drive-core/compareFindingsRepository";

type RouteContext = { params: Promise<{ projectId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const url = new URL(request.url);
  const pageNumber = Number(url.searchParams.get("pageNumber") || 0);
  try {
    const result = await listDriveCompareFindings(projectId, {
      leftVersionId: url.searchParams.get("leftVersionId") || undefined,
      rightVersionId: url.searchParams.get("rightVersionId") || undefined,
      pageNumber: Number.isFinite(pageNumber) && pageNumber > 0 ? Math.round(pageNumber) : undefined,
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input) return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  try {
    const result = await createDriveCompareFinding(projectId, input, access.actor.userId, access.actor.displayName || access.actor.userId);
    return NextResponse.json(result, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
