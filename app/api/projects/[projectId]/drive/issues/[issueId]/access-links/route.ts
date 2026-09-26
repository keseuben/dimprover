import { type NextRequest, NextResponse } from "next/server";
import { createDriveIssueAccessLinks } from "@/app/lib/drive-core/issueAccess";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = {
  params: Promise<{ projectId: string; issueId: string }>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId, issueId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.approve");
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }
  try {
    const result = await createDriveIssueAccessLinks({
      projectId,
      issueId,
      origin: request.nextUrl.origin,
    });
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
