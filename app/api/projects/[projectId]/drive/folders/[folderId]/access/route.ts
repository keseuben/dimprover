import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { projectCoreErrorResponse } from "@/app/lib/project-core/api";
import { ProjectCoreRepositoryError } from "@/app/lib/project-core/errors";
import { listProjectMemberships } from "@/app/lib/project-core/store";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { DriveCoreRepositoryError } from "@/app/lib/drive-core/errors";
import { getDriveFolderAclConfiguration, requireDriveFolderAccess, setDriveFolderAclConfiguration } from "@/app/lib/drive-core/store";

type RouteContext = { params: Promise<{ projectId: string; folderId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId, folderId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "project.manage_members");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    await requireDriveFolderAccess(projectId, folderId, access.access);
    const [config, memberships] = await Promise.all([
      getDriveFolderAclConfiguration(projectId, folderId),
      listProjectMemberships(projectId),
    ]);
    const active = memberships.filter((membership) => membership.status === "ACTIVE");
    const requiredMembershipIds = [...new Set([
      access.access.membership.id,
      ...active.filter((membership) => membership.role === "OWNER").map((membership) => membership.id),
    ])];
    return NextResponse.json({
      ok: true,
      aclInherit: config.aclInherit,
      allowedMembershipIds: config.entries.filter((entry) => entry.principalType === "USER" && entry.effect === "ALLOW" && entry.membershipId).map((entry) => entry.membershipId),
      requiredMembershipIds,
      memberships: active,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ProjectCoreRepositoryError) return projectCoreErrorResponse(error);
    return driveCoreErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { projectId, folderId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "project.manage_members");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const body = await request.json().catch(() => null) as { aclInherit?: unknown; allowedMembershipIds?: unknown } | null;
  const aclInherit = body?.aclInherit !== false;
  const requested = Array.isArray(body?.allowedMembershipIds)
    ? body.allowedMembershipIds.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean)
    : [];
  try {
    await requireDriveFolderAccess(projectId, folderId, access.access);
    const memberships = await listProjectMemberships(projectId);
    const active = memberships.filter((membership) => membership.status === "ACTIVE");
    const activeIds = new Set(active.map((membership) => membership.id));
    const required = [
      access.access.membership.id,
      ...active.filter((membership) => membership.role === "OWNER").map((membership) => membership.id),
    ];
    const allowedMembershipIds = aclInherit
      ? []
      : [...new Set([...requested.filter((id) => activeIds.has(id)), ...required])];
    if (!aclInherit && allowedMembershipIds.length < 1) {
      return NextResponse.json({ ok: false, error: "Legalább egy projekttagot engedélyezni kell." }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    const result = await setDriveFolderAclConfiguration(projectId, folderId, aclInherit, allowedMembershipIds, access.actor.userId);
    return NextResponse.json({ ...result, requiredMembershipIds: [...new Set(required)] }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ProjectCoreRepositoryError) return projectCoreErrorResponse(error);
    if (error instanceof DriveCoreRepositoryError) return driveCoreErrorResponse(error);
    return NextResponse.json({ ok: false, error: "A mappahozzáférés mentése váratlan hibával leállt." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
