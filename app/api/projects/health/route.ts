import { type NextRequest, NextResponse } from "next/server";
import { resolveProjectCoreAuth } from "@/app/lib/project-core/auth";
import { getProjectCoreDatabaseHealth } from "@/app/lib/project-core/databaseRepository";
import { getProjectCoreState as getFileProjectCoreState } from "@/app/lib/project-core/fileRepository";
import { getConfiguredProjectCoreProvider } from "@/app/lib/project-core/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authResult = await resolveProjectCoreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json({ ok: false, error: authResult.error }, { status: authResult.status });
  }

  const [database, fileState] = await Promise.all([
    getProjectCoreDatabaseHealth(),
    getFileProjectCoreState(),
  ]);

  return NextResponse.json({
    ok: true,
    component: "project-core",
    configuredProvider: getConfiguredProjectCoreProvider(),
    database,
    fileFallback: {
      ready: true,
      projectCount: fileState.projects.length,
      membershipCount: fileState.memberships.length,
      auditEventCount: fileState.auditEvents.length,
      updatedAt: fileState.updatedAt,
    },
    activationSafe: database.ready && fileState.projects.length > 0,
  }, { headers: { "cache-control": "no-store" } });
}
