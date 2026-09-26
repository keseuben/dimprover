import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { setDriveFolderClassification } from "@/app/lib/drive-core/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: NextRequest, context: { params: Promise<{ projectId: string; folderId: string }> }) {
  const { projectId, folderId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const input = await request.json().catch(() => ({})) as { discipline?: string; topic?: string };
  try {
    const result = await setDriveFolderClassification(projectId, folderId, input.discipline || "", input.topic || "", access.actor.userId);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
