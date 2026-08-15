import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { getProjectIssueHealth } from "@/app/lib/project-core/issueRepository";

type RouteContext = { params: Promise<{ projectId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "issue.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const health = await getProjectIssueHealth();
  return NextResponse.json({ ok: true, version: "0.4.0", databaseReady: health.ready, actualSchemaVersion: health.schemaVersion, bootstrapId: health.bootstrapId, errorCode: health.errorCode }, { status: health.ready ? 200 : 503, headers: { "cache-control": "no-store" } });
}
