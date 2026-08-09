import { type NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import { normalizeDriveCoreError } from "@/app/lib/drive-core/errors";
import { bootstrapDriveProject, getDriveCoreDatabaseHealth } from "@/app/lib/drive-core/store";
import { getProjectCoreState } from "@/app/lib/project-core/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) {
    return NextResponse.json({ ok: false, error: "Nincs licencadmin-jogosultság a DRIVE Core inicializálásához." }, { status: 401 });
  }
  try {
    const health = await getDriveCoreDatabaseHealth();
    if (!health.ready) {
      return NextResponse.json({ ok: false, error: "A DRIVE Core PostgreSQL-séma még nem áll készen.", code: health.errorCode, health }, { status: 503 });
    }
    const state = await getProjectCoreState();
    const projects = state.projects.filter((project) => project.status !== "DELETED");
    const results = [];
    for (const project of projects) results.push(await bootstrapDriveProject(project.id, "license-admin"));
    return NextResponse.json({ ok: true, projectCount: projects.length, results }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const normalized = normalizeDriveCoreError(error);
    return NextResponse.json(normalized.body, { status: normalized.status });
  }
}
