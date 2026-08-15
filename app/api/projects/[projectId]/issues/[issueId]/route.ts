import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { projectIssueErrorResponse } from "@/app/lib/project-core/issueApi";
import { updateProjectIssue } from "@/app/lib/project-core/issueRepository";

type RouteContext = { params: Promise<{ projectId: string; issueId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { projectId, issueId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "issue.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await updateProjectIssue(projectId, issueId, input, access.actor.userId, access.actor.displayName || access.actor.userId),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return projectIssueErrorResponse(error);
  }
}
