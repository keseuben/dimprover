import { type NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import { bootstrapProjectCoreState, getProjectCoreDatabaseHealth } from "@/app/lib/project-core/databaseRepository";
import { getProjectCoreState as getFileProjectCoreState } from "@/app/lib/project-core/fileRepository";
import { normalizeProjectCoreError } from "@/app/lib/project-core/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) {
    return NextResponse.json({ ok: false, error: "Nincs licencadmin-jogosultság a Project Core migrációhoz." }, { status: 401 });
  }

  try {
    const health = await getProjectCoreDatabaseHealth();
    if (!health.ready) {
      return NextResponse.json({
        ok: false,
        error: "A Project Core PostgreSQL-séma még nem áll készen.",
        code: health.errorCode || "PROJECT_CORE_SCHEMA_NOT_READY",
        health,
      }, { status: 503 });
    }

    const state = await getFileProjectCoreState();
    const result = await bootstrapProjectCoreState(state, "license-admin");
    return NextResponse.json({
      ok: true,
      source: "file-backed-project-core",
      target: "supabase",
      result,
      sourceCounts: {
        projects: state.projects.length,
        memberships: state.memberships.length,
        auditEvents: state.auditEvents.length,
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const normalized = normalizeProjectCoreError(error);
    return NextResponse.json(normalized.body, { status: normalized.status });
  }
}
