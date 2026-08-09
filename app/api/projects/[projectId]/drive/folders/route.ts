import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { createDriveFolder } from "@/app/lib/drive-core/store";

type RouteContext = { params: Promise<{ projectId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  let input: Record<string, unknown>;
  try { input = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 }); }
  try {
    const result = await createDriveFolder(projectId, input, access.actor.userId);
    return NextResponse.json(result, { status: result.ok ? 201 : 400, headers: { "cache-control": "no-store" } });
  } catch (error) { return driveCoreErrorResponse(error); }
}
