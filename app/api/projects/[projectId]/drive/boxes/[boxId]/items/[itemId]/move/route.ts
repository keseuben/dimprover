import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { moveDriveBoxItemToFolder } from "@/app/lib/drive-core/store";

type RouteContext = { params: Promise<{ projectId: string; boxId: string; itemId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId, boxId, itemId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input) return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });

  try {
    const result = await moveDriveBoxItemToFolder(projectId, boxId, itemId, input, access.actor.userId);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
