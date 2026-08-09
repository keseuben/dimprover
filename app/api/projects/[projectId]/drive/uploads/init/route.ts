import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { initDriveObjectUpload } from "@/app/lib/drive-core/store";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = { params: Promise<{ projectId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 }); }
  try {
    const result = await initDriveObjectUpload({
      projectId,
      body,
      actorUserId: access.actor.userId,
      clientId: request.headers.get("x-dimpro-drive-client-id"),
    });
    return NextResponse.json(result, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
