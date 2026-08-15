import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { convertCompareFindingToIssue } from "@/app/lib/project-core/issueRepository";
import { projectIssueErrorResponse } from "@/app/lib/project-core/issueApi";

type RouteContext = { params: Promise<{ projectId: string; findingId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId, findingId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "issue.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    const result = await convertCompareFindingToIssue(projectId, findingId, access.actor.userId, access.actor.displayName || access.actor.userId);
    return NextResponse.json(result, { status: result.created ? 201 : 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return projectIssueErrorResponse(error);
  }
}
