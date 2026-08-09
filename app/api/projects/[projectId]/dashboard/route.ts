import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { projectCoreErrorResponse } from "@/app/lib/project-core/api";
import { listProjectAuditEvents, listProjectMemberships } from "@/app/lib/project-core/store";
import { D6_MODULES } from "@/app/lib/project-gate/d6Modules";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const accessResult = await requireProjectPermission(request, projectId, "project.read");
  if (!accessResult.ok) return NextResponse.json({ ok: false, error: accessResult.error }, { status: accessResult.status });
  try {
    const [memberships, auditEvents] = await Promise.all([listProjectMemberships(projectId), listProjectAuditEvents(projectId, 8)]);
    const activeMembers = memberships.filter((membership) => membership.status === "ACTIVE");
    const invitedMembers = memberships.filter((membership) => membership.status === "INVITED");
    return NextResponse.json({
      ok: true,
      project: accessResult.access.project,
      membership: accessResult.access.membership,
      permissions: accessResult.access.permissions,
      metrics: {
        activeMemberCount: activeMembers.length,
        invitedMemberCount: invitedMembers.length,
        moduleCount: D6_MODULES.length,
        preparedModuleCount: D6_MODULES.filter((item) => item.state !== "external-development").length,
      },
      modules: D6_MODULES.map((item) => ({ id: item.id, order: item.order, brandName: item.brandName, hungarianName: item.hungarianName, state: item.state })),
      recentAuditEvents: auditEvents,
    });
  } catch (error) {
    return projectCoreErrorResponse(error);
  }
}
