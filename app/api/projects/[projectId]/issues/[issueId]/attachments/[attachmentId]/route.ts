import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { projectIssueErrorResponse } from "@/app/lib/project-core/issueApi";
import { unlinkProjectIssueAttachment } from "@/app/lib/project-core/issueAttachmentRepository";

type RouteContext = { params: Promise<{ projectId: string; issueId: string; attachmentId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { projectId, issueId, attachmentId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "issue.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const input = await request.json().catch(() => ({})) as { expectedVersion?: unknown };
  try {
    return NextResponse.json(
      await unlinkProjectIssueAttachment(projectId, issueId, attachmentId, Number(input.expectedVersion), access.actor.userId, access.actor.displayName || access.actor.userId),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return projectIssueErrorResponse(error);
  }
}
