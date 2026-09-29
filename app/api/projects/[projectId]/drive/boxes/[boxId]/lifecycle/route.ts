import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { setDriveBoxLifecycle } from "@/app/lib/drive-core/store";
import type { DriveBoxLifecycleStatus } from "@/app/lib/drive-core/workspaceRepository";

type RouteContext = { params: Promise<{ projectId: string; boxId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowed = new Set<DriveBoxLifecycleStatus>(["DRAFT", "READY", "SENT", "ARCHIVED"]);

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId, boxId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  const input = await request.json().catch(() => null) as { nextStatus?: string } | null;
  const nextStatus = String(input?.nextStatus || "").trim().toUpperCase() as DriveBoxLifecycleStatus;
  if (!allowed.has(nextStatus)) {
    return NextResponse.json({ ok: false, error: "Érvénytelen CsomagBOX állapot." }, { status: 400 });
  }

  try {
    const result = await setDriveBoxLifecycle(projectId, boxId, nextStatus, access.actor.userId);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
