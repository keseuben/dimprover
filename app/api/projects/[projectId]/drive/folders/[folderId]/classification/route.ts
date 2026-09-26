import { NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { setDriveFolderClassification } from "@/app/lib/drive-core/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: Request, context: { params: Promise<{ projectId: string; folderId: string }> }) {
  const { projectId, folderId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return access.response;
  const input = await request.json().catch(() => ({})) as { discipline?: string; topic?: string };
  const result = await setDriveFolderClassification(projectId, folderId, input.discipline || "", input.topic || "", access.actor.userId);
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
