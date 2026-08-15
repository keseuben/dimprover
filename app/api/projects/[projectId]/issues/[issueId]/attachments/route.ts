import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { projectIssueErrorResponse } from "@/app/lib/project-core/issueApi";
import { linkProjectIssueAttachment, listProjectIssueAttachments } from "@/app/lib/project-core/issueAttachmentRepository";

type RouteContext = { params: Promise<{ projectId: string; issueId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId, issueId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "issue.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    return NextResponse.json(await listProjectIssueAttachments(projectId, issueId), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return projectIssueErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId, issueId } = await context.params;
  const issueAccess = await requireProjectPermission(request, projectId, "issue.write");
  if (!issueAccess.ok) return NextResponse.json({ ok: false, error: issueAccess.error }, { status: issueAccess.status });
  const documentAccess = await requireProjectPermission(request, projectId, "document.read");
  if (!documentAccess.ok) return NextResponse.json({ ok: false, error: documentAccess.error }, { status: documentAccess.status });
  let input: Record<string, unknown>;
  try { input = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 }); }
  try {
    const result = await linkProjectIssueAttachment(projectId, issueId, input, issueAccess.actor.userId, issueAccess.actor.displayName || issueAccess.actor.userId);
    return NextResponse.json(result, { status: result.created ? 201 : 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return projectIssueErrorResponse(error);
  }
}
