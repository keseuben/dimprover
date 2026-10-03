import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { projectCoreErrorResponse } from "@/app/lib/project-core/api";
import {
  addProjectMembership,
  listProjectMemberships,
  revokeProjectMembership,
  updateProjectMembershipRole,
} from "@/app/lib/project-core/store";
import type { ProjectMembershipRole } from "@/app/lib/project-core/types";
import { getProjectDriveProvisioningState, provisionProjectDrive } from "@/app/lib/drive-core/projectProvisioning";
import { provisionProjectIdentityBridge } from "@/app/lib/identity-core/projectProvisioning";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import {
  getAuthProjectScopeByExternalId,
  registerAuthProjectScope,
} from "@/app/lib/dimpro-auth/repository";
import {
  revokeProjectAccess,
  setProjectAccessRole,
  type DimproProjectInvitationRole,
} from "@/app/lib/dimpro-auth/invitations";

type RouteContext = { params: Promise<{ projectId: string }> };

type IdentitySyncFailure = {
  ok: false;
  version: "1.0.0";
  projectId: string;
  ready: false;
  retryRequired: true;
  error: string;
  code: string;
};

const editableRoles: ProjectMembershipRole[] = ["PROJECT_MANAGER", "CONTRIBUTOR", "REVIEWER", "VIEWER"];

function normalizeRole(value: unknown): Exclude<ProjectMembershipRole, "OWNER"> | null {
  return editableRoles.includes(value as ProjectMembershipRole)
    ? value as Exclude<ProjectMembershipRole, "OWNER">
    : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function authRoleForProjectRole(role: ProjectMembershipRole): DimproProjectInvitationRole {
  return role === "PROJECT_MANAGER" ? "DRIVE_PROJECT_MANAGER" : "DRIVE_PROJECT_MEMBER";
}

async function syncIdentityMemberships(projectId: string, actorUserId: string) {
  try {
    let drive = await getProjectDriveProvisioningState(projectId);
    if (!drive.ready || !drive.incomingDropFolder) {
      const provisioned = await provisionProjectDrive(projectId, actorUserId);
      drive = {
        version: provisioned.version,
        projectId,
        ready: provisioned.ready,
        folderCount: provisioned.folderCount,
        incomingDropFolder: provisioned.incomingDropFolder,
        pilotFolder: provisioned.pilotFolder,
      };
    }
    if (!drive.ready || !drive.incomingDropFolder) {
      return {
        ok: false,
        version: "1.0.0",
        projectId,
        ready: false,
        retryRequired: true,
        error: "A canonical projekttagság szinkronhoz a Beérkező Drop Drive célmappa szükséges.",
        code: "DIMPRO_PROJECT_IDENTITY_DRIVE_PREREQUISITE",
      } satisfies IdentitySyncFailure;
    }
    return await provisionProjectIdentityBridge({
      projectId,
      actorUserId,
      driveFolderId: drive.incomingDropFolder.id,
      incomingFolderName: drive.incomingDropFolder.name,
    });
  } catch (error) {
    return {
      ok: false,
      version: "1.0.0",
      projectId,
      ready: false,
      retryRequired: true,
      error: error instanceof DimproIdentityError
        ? error.message
        : "A canonical DIMPRO projekttagság szinkron átmenetileg sikertelen.",
      code: error instanceof DimproIdentityError
        ? error.code
        : "DIMPRO_PROJECT_MEMBERSHIP_IDENTITY_SYNC_FAILED",
    } satisfies IdentitySyncFailure;
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const accessResult = await requireProjectPermission(request, projectId, "project.read");
  if (!accessResult.ok) {
    return NextResponse.json({ ok: false, error: accessResult.error }, { status: accessResult.status });
  }
  try {
    const memberships = await listProjectMemberships(projectId);
    return NextResponse.json({
      ok: true,
      memberships,
      access: {
        canManageMembers: accessResult.access.permissions.includes("project.manage_members"),
        actorRole: accessResult.access.membership.role,
        actorMembershipId: accessResult.access.membership.id,
      },
    });
  } catch (error) {
    return projectCoreErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const accessResult = await requireProjectPermission(request, projectId, "project.manage_members");
  if (!accessResult.ok) {
    return NextResponse.json({ ok: false, error: accessResult.error }, { status: accessResult.status });
  }
  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  }
  try {
    const result = await addProjectMembership(projectId, input, accessResult.actor.userId);
    if (!result.ok) return NextResponse.json(result, { status: 400 });
    const identityProvisioning = await syncIdentityMemberships(projectId, accessResult.actor.userId);
    return NextResponse.json({ ...result, identityProvisioning }, { status: 201 });
  } catch (error) {
    return projectCoreErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const accessResult = await requireProjectPermission(request, projectId, "project.manage_members");
  if (!accessResult.ok) {
    return NextResponse.json({ ok: false, error: accessResult.error }, { status: accessResult.status });
  }
  const body = await request.json().catch(() => null) as { membershipId?: unknown; role?: unknown } | null;
  const membershipId = typeof body?.membershipId === "string" ? body.membershipId.trim() : "";
  const nextRole = normalizeRole(body?.role);
  if (!membershipId || !nextRole) {
    return NextResponse.json({ ok: false, error: "Érvénytelen projekttagság vagy szerepkör." }, { status: 400 });
  }

  try {
    const memberships = await listProjectMemberships(projectId);
    const target = memberships.find((item) => item.id === membershipId);
    if (!target) return NextResponse.json({ ok: false, error: "A projekttagság nem található." }, { status: 404 });
    if (target.role === "OWNER") {
      return NextResponse.json({ ok: false, error: "A projektgazda szerepköre védett." }, { status: 409 });
    }
    if (target.status !== "ACTIVE") {
      return NextResponse.json({ ok: false, error: "Csak aktív projekttag szerepköre módosítható." }, { status: 409 });
    }

    const previousAuthRole = authRoleForProjectRole(target.role);
    const nextAuthRole = authRoleForProjectRole(nextRole);
    let authRoleChanged = false;
    let authProjectId: string | null = null;

    if (previousAuthRole !== nextAuthRole) {
      if (!isUuid(target.userId)) {
        return NextResponse.json({
          ok: false,
          error: "A projekttag központi AUTH azonosítója hiányzik; a szerepkör nem módosítható biztonságosan.",
        }, { status: 409 });
      }
      if (!isUuid(accessResult.actor.userId)) {
        return NextResponse.json({
          ok: false,
          error: "A jogosultságkezeléshez központi DIMPRO AUTH munkamenet szükséges.",
        }, { status: 409 });
      }
      await registerAuthProjectScope({
        actorUserId: accessResult.actor.userId,
        externalProjectId: projectId,
        projectName: accessResult.access.project.name,
      });
      const authProject = await getAuthProjectScopeByExternalId(projectId);
      if (!authProject || authProject.status !== "ACTIVE") {
        return NextResponse.json({ ok: false, error: "A projekt központi AUTH scope-ja nem található." }, { status: 409 });
      }
      authProjectId = authProject.id;
      await setProjectAccessRole({
        actorUserId: accessResult.actor.userId,
        targetUserId: target.userId,
        projectId: authProject.id,
        roleCode: nextAuthRole,
      });
      authRoleChanged = true;
    }

    const result = await updateProjectMembershipRole(projectId, membershipId, nextRole, accessResult.actor.userId);
    if (!result.ok) {
      if (authRoleChanged && authProjectId) {
        await setProjectAccessRole({
          actorUserId: accessResult.actor.userId,
          targetUserId: target.userId,
          projectId: authProjectId,
          roleCode: previousAuthRole,
        }).catch(() => undefined);
      }
      return NextResponse.json(result, { status: 409 });
    }

    const identityProvisioning = await syncIdentityMemberships(projectId, accessResult.actor.userId);
    return NextResponse.json({ ...result, identityProvisioning });
  } catch (error) {
    return projectCoreErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const accessResult = await requireProjectPermission(request, projectId, "project.manage_members");
  if (!accessResult.ok) {
    return NextResponse.json({ ok: false, error: accessResult.error }, { status: accessResult.status });
  }
  const body = await request.json().catch(() => null) as { membershipId?: unknown } | null;
  const membershipId = typeof body?.membershipId === "string" ? body.membershipId.trim() : "";
  if (!membershipId) {
    return NextResponse.json({ ok: false, error: "Hiányzik a projekttagság azonosítója." }, { status: 400 });
  }

  try {
    const memberships = await listProjectMemberships(projectId);
    const target = memberships.find((item) => item.id === membershipId);
    if (!target) return NextResponse.json({ ok: false, error: "A projekttagság nem található." }, { status: 404 });
    if (target.role === "OWNER") {
      return NextResponse.json({ ok: false, error: "A projektgazda hozzáférése ezen a felületen nem szüntethető meg." }, { status: 409 });
    }
    if (target.status === "INVITED") {
      return NextResponse.json({
        ok: false,
        error: "A függő meghívást a Függő meghívások résznél kell visszavonni.",
      }, { status: 409 });
    }

    let revokedAuth = false;
    let authProjectId: string | null = null;
    if (target.status === "ACTIVE" && isUuid(target.userId)) {
      if (!isUuid(accessResult.actor.userId)) {
        return NextResponse.json({
          ok: false,
          error: "A jogosultságkezeléshez központi DIMPRO AUTH munkamenet szükséges.",
        }, { status: 409 });
      }
      await registerAuthProjectScope({
        actorUserId: accessResult.actor.userId,
        externalProjectId: projectId,
        projectName: accessResult.access.project.name,
      });
      const authProject = await getAuthProjectScopeByExternalId(projectId);
      if (authProject?.status === "ACTIVE") {
        authProjectId = authProject.id;
        const revokedCount = await revokeProjectAccess(accessResult.actor.userId, target.userId, authProject.id);
        revokedAuth = revokedCount > 0;
      }
    }

    const result = await revokeProjectMembership(projectId, membershipId, accessResult.actor.userId);
    if (!result.ok) {
      if (revokedAuth && authProjectId) {
        await setProjectAccessRole({
          actorUserId: accessResult.actor.userId,
          targetUserId: target.userId,
          projectId: authProjectId,
          roleCode: authRoleForProjectRole(target.role),
        }).catch(() => undefined);
      }
      return NextResponse.json(result, { status: 409 });
    }

    const identityProvisioning = await syncIdentityMemberships(projectId, accessResult.actor.userId);
    return NextResponse.json({ ...result, identityProvisioning });
  } catch (error) {
    return projectCoreErrorResponse(error);
  }
}
