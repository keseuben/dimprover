import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { projectIssueErrorResponse } from "@/app/lib/project-core/issueApi";
import { listProjectIssueAuditEvents } from "@/app/lib/project-core/issueAuditRepository";

type RouteContext = { params: Promise<{ projectId: string; issueId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId, issueId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "issue.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const limitParam = Number(new URL(request.url).searchParams.get("limit") || 80);
  try {
    return NextResponse.json(
      await listProjectIssueAuditEvents(projectId, issueId, limitParam),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return projectIssueErrorResponse(error);
  }
}
