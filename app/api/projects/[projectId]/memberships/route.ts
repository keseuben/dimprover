import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { projectCoreErrorResponse } from "@/app/lib/project-core/api";
import { addProjectMembership, listProjectMemberships } from "@/app/lib/project-core/store";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const accessResult = await requireProjectPermission(request, projectId, "project.read");
  if (!accessResult.ok) {
    return NextResponse.json({ ok: false, error: accessResult.error }, { status: accessResult.status });
  }
  try {
    const memberships = await listProjectMemberships(projectId);
    return NextResponse.json({ ok: true, memberships });
  } catch (error) {
    return projectCoreErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const accessResult = await requireProjectPermission(request, projectId, "project.manage_members");
  if (!accessResult.ok) {
    return NextResponse.json({ ok: false, error: accessResult.error }, { status: accessResult.status });
  }
  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  }
  try {
    const result = await addProjectMembership(projectId, input, accessResult.actor.userId);
    if (!result.ok) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return projectCoreErrorResponse(error);
  }
}
