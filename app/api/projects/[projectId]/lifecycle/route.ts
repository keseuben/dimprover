import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { projectCoreErrorResponse } from "@/app/lib/project-core/api";
import { changeProjectLifecycle } from "@/app/lib/project-core/store";
import type { ProjectLifecycleStatus } from "@/app/lib/project-core/types";

type RouteContext = { params: Promise<{ projectId: string }> };
const ALLOWED_STATUSES: ProjectLifecycleStatus[] = ["DRAFT","ACTIVE","CLOSING","READ_ONLY","ARCHIVED","DELETION_SCHEDULED","DELETED"];

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const accessResult = await requireProjectPermission(request, projectId, "project.manage_lifecycle");
  if (!accessResult.ok) return NextResponse.json({ ok: false, error: accessResult.error }, { status: accessResult.status });
  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  }
  const nextStatus = String(input.nextStatus || "") as ProjectLifecycleStatus;
  if (!ALLOWED_STATUSES.includes(nextStatus)) return NextResponse.json({ ok: false, error: "Érvénytelen projektállapot." }, { status: 400 });
  try {
    const result = await changeProjectLifecycle(projectId, nextStatus, accessResult.actor.userId);
    if (!result.ok) return NextResponse.json(result, { status: 409 });
    return NextResponse.json(result);
  } catch (error) {
    return projectCoreErrorResponse(error);
  }
}
