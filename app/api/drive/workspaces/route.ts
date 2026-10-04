import { NextRequest, NextResponse } from "next/server";
import { hasPersonalDriveAccess } from "@/app/lib/dimpro-auth/repository";
import { resolveProjectCoreAuth } from "@/app/lib/project-core/auth";
import { listAccessibleProjects } from "@/app/lib/project-core/store";
import { normalizeProjectCoreError } from "@/app/lib/project-core/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await resolveProjectCoreAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status, headers: { "cache-control": "no-store" } });
  try {
    const [projects, personalDrive] = await Promise.all([
      listAccessibleProjects(auth.actor.userAliases),
      hasPersonalDriveAccess(auth.actor.userId),
    ]);
    const workspaces = [
      ...(personalDrive ? [{
        id: `personal:${auth.actor.userId}`,
        type: "PERSONAL" as const,
        name: "Saját Drive",
        code: null,
        ownerUserId: auth.actor.userId,
        projectId: null,
        status: "ACTIVE" as const,
        access: "OWNER" as const,
        storageScope: "USER_ROOT" as const,
        browsing: "LIMITED_ROOT" as const,
        capabilities: { userRootContent: true, folderTree: false, projectFeatures: false },
      }] : []),
      ...projects.map((project) => ({
        id: `project:${project.id}`,
        type: "PROJECT" as const,
        name: project.name,
        code: project.code || null,
        ownerUserId: null,
        projectId: project.id,
        status: project.status,
        access: project.membership.role,
        storageScope: "PROJECT" as const,
        browsing: "FULL" as const,
        capabilities: { userRootContent: false, folderTree: true, projectFeatures: true },
        permissions: project.permissions,
      })),
    ];
    return NextResponse.json({ ok: true, user: { id: auth.actor.userId, email: auth.actor.email || null }, personalDrive, workspaces }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const normalized = normalizeProjectCoreError(error);
    return NextResponse.json({ ok: false, error: normalized.body.error, code: normalized.body.code }, { status: normalized.status, headers: { "cache-control": "no-store" } });
  }
}
