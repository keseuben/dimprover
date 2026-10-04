import { NextRequest, NextResponse } from "next/server";
import { resolveDriveSsoConfig } from "@/app/lib/dimpro-auth/client-config";
import { sendDimproProjectInvitationEmail } from "@/app/lib/dimpro-auth/email";
import {
  createProjectInvitation,
  listProjectInvitationsByExternalProject,
  revokeProjectInvitation,
  type DimproProjectInvitationRole,
} from "@/app/lib/dimpro-auth/invitations";
import {
  getAppSessionByToken,
  recordAuthAuditEvent,
  registerAuthProjectScope,
} from "@/app/lib/dimpro-auth/repository";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import {
  addProjectMembership,
  listProjectMemberships,
  revokeProjectMembership,
} from "@/app/lib/project-core/store";
import type { ProjectMembershipRole } from "@/app/lib/project-core/types";
import {
  getDimproAuthRequestIp,
  getDimproAuthUserAgent,
  newDimproAuthCorrelationId,
  validateSameOriginMutation,
} from "@/app/lib/dimpro-auth/security";
import { DIMPRO_APP_SESSION_COOKIE } from "@/app/lib/dimpro-auth/sso";
import { DimproAuthError } from "@/app/lib/dimpro-auth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InviteRole = Exclude<ProjectMembershipRole, "OWNER">;

function externalProjectId(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length >= 1 && text.length <= 200 && !/[\u0000-\u001f\u007f]/.test(text) ? text : "";
}

function uuid(value: unknown) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text) ? text : "";
}

function projectCoreRole(value: unknown): InviteRole {
  switch (value) {
    case "manager":
    case "DRIVE_PROJECT_MANAGER":
    case "PROJECT_MANAGER":
      return "PROJECT_MANAGER";
    case "CONTRIBUTOR":
    case "contributor":
      return "CONTRIBUTOR";
    case "REVIEWER":
    case "reviewer":
      return "REVIEWER";
    case "VIEWER":
    case "viewer":
    case "member":
    case "DRIVE_PROJECT_MEMBER":
    default:
      return "VIEWER";
  }
}

function authRole(role: InviteRole): DimproProjectInvitationRole {
  return role === "PROJECT_MANAGER" ? "DRIVE_PROJECT_MANAGER" : "DRIVE_PROJECT_MEMBER";
}

async function driveSession(request: NextRequest) {
  const config = resolveDriveSsoConfig(request.headers.get("host"));
  if (!config) return null;
  const token = request.cookies.get(DIMPRO_APP_SESSION_COOKIE)?.value?.trim() || "";
  const session = token ? await getAppSessionByToken(token, config.clientId, true) : null;
  return session ? { config, session } : null;
}

export async function GET(request: NextRequest) {
  const correlationId = newDimproAuthCorrelationId(request.headers);
  const auth = await driveSession(request).catch(() => null);
  if (!auth) {
    return NextResponse.json(
      { ok: false, error: "AUTH_REQUIRED", correlationId },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  const projectId = externalProjectId(request.nextUrl.searchParams.get("projectId"));
  if (!projectId) {
    return NextResponse.json(
      { ok: false, error: "AUTH_INVITATION_INPUT_INVALID", correlationId },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  const projectAccess = await requireProjectPermission(request, projectId, "project.manage_members");
  if (!projectAccess.ok) {
    return NextResponse.json(
      { ok: false, error: ("code" in projectAccess && projectAccess.code) || "AUTH_PROJECT_PERMISSION_DENIED", message: projectAccess.error, correlationId },
      { status: projectAccess.status, headers: { "cache-control": "no-store" } },
    );
  }
  try {
    const invitations = await listProjectInvitationsByExternalProject(projectId);
    return NextResponse.json(
      { ok: true, projectId, invitations, correlationId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof DimproAuthError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.publicMessage, correlationId },
        { status: error.status, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, error: "AUTH_INVITATION_LIST_FAILED", correlationId },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

export async function POST(request: NextRequest) {
  const correlationId = newDimproAuthCorrelationId(request.headers);
  if (!validateSameOriginMutation(request.headers)) {
    return NextResponse.json(
      { ok: false, error: "AUTH_ORIGIN_DENIED", correlationId },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }
  const auth = await driveSession(request).catch(() => null);
  if (!auth) {
    return NextResponse.json(
      { ok: false, error: "AUTH_REQUIRED", correlationId },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const body = await request.json().catch(() => null) as {
    email?: unknown;
    displayName?: unknown;
    organizationName?: unknown;
    projectId?: unknown;
    role?: unknown;
    expiresInDays?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const projectId = externalProjectId(body?.projectId);
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim().slice(0, 160) : "";
  const organizationName = typeof body?.organizationName === "string" ? body.organizationName.trim().slice(0, 160) : "";
  const expiresInDays = typeof body?.expiresInDays === "number" ? body.expiresInDays : undefined;
  const memberRole = projectCoreRole(body?.role);
  if (!email || !projectId || !organizationName) {
    return NextResponse.json(
      { ok: false, error: "AUTH_INVITATION_INPUT_INVALID", message: "E-mail-cím, szervezet és projekt szükséges.", correlationId },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const projectAccess = await requireProjectPermission(request, projectId, "project.manage_members");
    if (!projectAccess.ok) {
      return NextResponse.json(
        { ok: false, error: ("code" in projectAccess && projectAccess.code) || "AUTH_PROJECT_PERMISSION_DENIED", message: projectAccess.error, correlationId },
        { status: projectAccess.status, headers: { "cache-control": "no-store" } },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const memberships = await listProjectMemberships(projectId);
    const existingMembership = memberships.find((item) =>
      item.status !== "REVOKED"
      && (item.email?.toLowerCase() === normalizedEmail || item.userId.toLowerCase() === normalizedEmail)
    );
    if (existingMembership?.status === "ACTIVE") {
      return NextResponse.json(
        { ok: false, error: "AUTH_PROJECT_MEMBER_ALREADY_ACTIVE", message: "Ez a felhasználó már aktív tagja a projektnek.", correlationId },
        { status: 409, headers: { "cache-control": "no-store" } },
      );
    }
    if (existingMembership?.status === "INVITED" && existingMembership.role !== memberRole) {
      return NextResponse.json(
        { ok: false, error: "AUTH_PROJECT_INVITATION_ROLE_CONFLICT", message: "Ehhez az e-mail-címhez már más szerepkörű függő meghívás tartozik. Előbb vond vissza.", correlationId },
        { status: 409, headers: { "cache-control": "no-store" } },
      );
    }

    let createdMembershipId: string | null = null;
    if (!existingMembership) {
      const membershipResult = await addProjectMembership(projectId, {
        email: normalizedEmail,
        displayName: displayName || normalizedEmail,
        organizationName,
        role: memberRole,
        activateImmediately: false,
      }, auth.session.user.id);
      if (!membershipResult.ok) {
        return NextResponse.json(
          { ok: false, error: "AUTH_PROJECT_MEMBERSHIP_CREATE_FAILED", message: membershipResult.error, correlationId },
          { status: 409, headers: { "cache-control": "no-store" } },
        );
      }
      createdMembershipId = membershipResult.membership.id;
    }

    const authProjectId = await registerAuthProjectScope({
      actorUserId: auth.session.user.id,
      externalProjectId: projectId,
      projectName: projectAccess.access.project.name,
    });
    const created = await createProjectInvitation({
      inviterUserId: auth.session.user.id,
      email: normalizedEmail,
      displayName,
      projectId: authProjectId,
      roleCode: authRole(memberRole),
      expiresInDays,
    });
    const invitationUrl = `${auth.config.authOrigin}/auth-invite/${encodeURIComponent(created.rawToken)}`;
    try {
      await sendDimproProjectInvitationEmail({
        to: created.invitation.email,
        inviteeName: displayName || null,
        projectName: created.invitation.projectName,
        invitationUrl,
        expiresAt: created.invitation.expiresAt,
      });
      await recordAuthAuditEvent({
        eventType: "PROJECT_INVITATION_CREATE",
        userId: auth.session.user.id,
        email: created.invitation.email,
        method: "DIMPRO_AUTH_INVITATION",
        result: "SUCCESS",
        ip: getDimproAuthRequestIp(request.headers),
        userAgent: getDimproAuthUserAgent(request.headers),
        correlationId,
        metadata: {
          invitationId: created.invitation.id,
          externalProjectId: projectId,
          authProjectId,
          roleCode: created.invitation.roleCode,
          projectCoreRole: memberRole,
          delivery: "SUCCESS",
        },
      });
    } catch (error) {
      await revokeProjectInvitation(auth.session.user.id, created.invitation.id).catch(() => false);
      if (createdMembershipId) {
        await revokeProjectMembership(projectId, createdMembershipId, auth.session.user.id).catch(() => undefined);
      }
      await recordAuthAuditEvent({
        eventType: "PROJECT_INVITATION_CREATE",
        userId: auth.session.user.id,
        email: created.invitation.email,
        method: "DIMPRO_AUTH_INVITATION",
        result: "DELIVERY_FAILURE",
        ip: getDimproAuthRequestIp(request.headers),
        userAgent: getDimproAuthUserAgent(request.headers),
        correlationId,
        metadata: { invitationId: created.invitation.id, externalProjectId: projectId, authProjectId, errorClass: error instanceof Error ? error.name : "UnknownError" },
      }).catch(() => undefined);
      return NextResponse.json(
        { ok: false, error: "AUTH_INVITATION_DELIVERY_FAILED", correlationId },
        { status: 502, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true, projectId, projectCoreRole: memberRole, invitation: created.invitation, correlationId },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof DimproAuthError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.publicMessage, correlationId },
        { status: error.status, headers: { "cache-control": "no-store" } },
      );
    }
    console.error("DIMPRO project invitation create failed", correlationId, error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json(
      { ok: false, error: "AUTH_INVITATION_FAILED", correlationId },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const correlationId = newDimproAuthCorrelationId(request.headers);
  if (!validateSameOriginMutation(request.headers)) {
    return NextResponse.json(
      { ok: false, error: "AUTH_ORIGIN_DENIED", correlationId },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }
  const auth = await driveSession(request).catch(() => null);
  if (!auth) {
    return NextResponse.json(
      { ok: false, error: "AUTH_REQUIRED", correlationId },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  const body = await request.json().catch(() => null) as { invitationId?: unknown; projectId?: unknown } | null;
  const invitationId = uuid(body?.invitationId);
  const projectId = externalProjectId(body?.projectId);
  if (!invitationId || !projectId) {
    return NextResponse.json(
      { ok: false, error: "AUTH_INVITATION_ID_INVALID", correlationId },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  try {
    const projectAccess = await requireProjectPermission(request, projectId, "project.manage_members");
    if (!projectAccess.ok) {
      return NextResponse.json(
        { ok: false, error: ("code" in projectAccess && projectAccess.code) || "AUTH_PROJECT_PERMISSION_DENIED", message: projectAccess.error, correlationId },
        { status: projectAccess.status, headers: { "cache-control": "no-store" } },
      );
    }
    const invitations = await listProjectInvitationsByExternalProject(projectId);
    const invitation = invitations.find((item) => item.id === invitationId);
    if (!invitation) {
      return NextResponse.json(
        { ok: false, error: "AUTH_INVITATION_NOT_FOUND", correlationId },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }
    const revoked = await revokeProjectInvitation(auth.session.user.id, invitationId);
    const memberships = await listProjectMemberships(projectId);
    const pendingMembership = memberships.find((item) =>
      item.status === "INVITED"
      && item.email?.toLowerCase() === invitation.email.toLowerCase()
    );
    if (pendingMembership) {
      await revokeProjectMembership(projectId, pendingMembership.id, auth.session.user.id);
    }
    await recordAuthAuditEvent({
      eventType: "PROJECT_INVITATION_REVOKE",
      userId: auth.session.user.id,
      method: "DIMPRO_AUTH_INVITATION",
      result: revoked ? "SUCCESS" : "NOOP",
      correlationId,
      metadata: { invitationId, externalProjectId: projectId },
    });
    return NextResponse.json(
      { ok: true, revoked, correlationId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof DimproAuthError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.publicMessage, correlationId },
        { status: error.status, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, error: "AUTH_INVITATION_REVOKE_FAILED", correlationId },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
