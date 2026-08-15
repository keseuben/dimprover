import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { listProjectIssues } from "@/app/lib/project-core/issueRepository";
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
