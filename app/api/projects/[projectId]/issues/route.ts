import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { createProjectIssue, listProjectIssues } from "@/app/lib/project-core/issueRepository";
import { projectIssueErrorResponse } from "@/app/lib/project-core/issueApi";

type RouteContext = { params: Promise<{ projectId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "issue.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    return NextResponse.json(await listProjectIssues(projectId), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return projectIssueErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "issue.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  }
  try {
    const result = await createProjectIssue(projectId, input, access.actor.userId, access.actor.displayName || access.actor.userId);
    return NextResponse.json(result, { status: result.created ? 201 : 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return projectIssueErrorResponse(error);
  }
}
