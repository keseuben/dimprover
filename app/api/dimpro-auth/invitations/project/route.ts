import { NextRequest, NextResponse } from "next/server";
import { resolveDriveSsoConfig } from "@/app/lib/dimpro-auth/client-config";
import { sendDimproProjectInvitationEmail } from "@/app/lib/dimpro-auth/email";
import { createProjectInvitation, revokeProjectInvitation, type DimproProjectInvitationRole } from "@/app/lib/dimpro-auth/invitations";
import { getAppSessionByToken, recordAuthAuditEvent } from "@/app/lib/dimpro-auth/repository";
import { getDimproAuthRequestIp, getDimproAuthUserAgent, newDimproAuthCorrelationId, validateSameOriginMutation } from "@/app/lib/dimpro-auth/security";
import { DIMPRO_APP_SESSION_COOKIE } from "@/app/lib/dimpro-auth/sso";
import { DimproAuthError } from "@/app/lib/dimpro-auth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function uuid(value: unknown) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text) ? text : "";
}

function role(value: unknown): DimproProjectInvitationRole {
  return value === "manager" || value === "DRIVE_PROJECT_MANAGER" ? "DRIVE_PROJECT_MANAGER" : "DRIVE_PROJECT_MEMBER";
}

async function driveSession(request: NextRequest) {
  const config = resolveDriveSsoConfig(request.headers.get("host"));
  if (!config) return null;
  const token = request.cookies.get(DIMPRO_APP_SESSION_COOKIE)?.value?.trim() || "";
  const session = token ? await getAppSessionByToken(token, config.clientId, true) : null;
  return session ? { config, session } : null;
}

export async function POST(request: NextRequest) {
  const correlationId = newDimproAuthCorrelationId(request.headers);
  if (!validateSameOriginMutation(request.headers)) {
    return NextResponse.json({ ok: false, error: "AUTH_ORIGIN_DENIED", correlationId }, { status: 403, headers: { "cache-control": "no-store" } });
  }
  const auth = await driveSession(request).catch(() => null);
  if (!auth) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED", correlationId }, { status: 401, headers: { "cache-control": "no-store" } });

  const body = await request.json().catch(() => null) as { email?: unknown; displayName?: unknown; projectId?: unknown; role?: unknown; expiresInDays?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const projectId = uuid(body?.projectId);
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim().slice(0, 160) : "";
  const expiresInDays = typeof body?.expiresInDays === "number" ? body.expiresInDays : undefined;
  if (!email || !projectId) return NextResponse.json({ ok: false, error: "AUTH_INVITATION_INPUT_INVALID", correlationId }, { status: 400, headers: { "cache-control": "no-store" } });

  try {
    const created = await createProjectInvitation({
      inviterUserId: auth.session.user.id,
      email,
      displayName,
      projectId,
      roleCode: role(body?.role),
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
        metadata: { invitationId: created.invitation.id, projectId, roleCode: created.invitation.roleCode, delivery: "SUCCESS" },
      });
    } catch (error) {
      await revokeProjectInvitation(auth.session.user.id, created.invitation.id).catch(() => false);
      await recordAuthAuditEvent({
        eventType: "PROJECT_INVITATION_CREATE",
        userId: auth.session.user.id,
        email: created.invitation.email,
        method: "DIMPRO_AUTH_INVITATION",
        result: "DELIVERY_FAILURE",
        ip: getDimproAuthRequestIp(request.headers),
        userAgent: getDimproAuthUserAgent(request.headers),
        correlationId,
        metadata: { invitationId: created.invitation.id, projectId, errorClass: error instanceof Error ? error.name : "UnknownError" },
      }).catch(() => undefined);
      return NextResponse.json({ ok: false, error: "AUTH_INVITATION_DELIVERY_FAILED", correlationId }, { status: 502, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ ok: true, invitation: created.invitation, correlationId }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DimproAuthError) return NextResponse.json({ ok: false, error: error.code, message: error.publicMessage, correlationId }, { status: error.status, headers: { "cache-control": "no-store" } });
    console.error("DIMPRO project invitation create failed", correlationId, error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ ok: false, error: "AUTH_INVITATION_FAILED", correlationId }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

export async function DELETE(request: NextRequest) {
  const correlationId = newDimproAuthCorrelationId(request.headers);
  if (!validateSameOriginMutation(request.headers)) return NextResponse.json({ ok: false, error: "AUTH_ORIGIN_DENIED", correlationId }, { status: 403, headers: { "cache-control": "no-store" } });
  const auth = await driveSession(request).catch(() => null);
  if (!auth) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED", correlationId }, { status: 401, headers: { "cache-control": "no-store" } });
  const body = await request.json().catch(() => null) as { invitationId?: unknown } | null;
  const invitationId = uuid(body?.invitationId);
  if (!invitationId) return NextResponse.json({ ok: false, error: "AUTH_INVITATION_ID_INVALID", correlationId }, { status: 400, headers: { "cache-control": "no-store" } });
  try {
    const revoked = await revokeProjectInvitation(auth.session.user.id, invitationId);
    await recordAuthAuditEvent({ eventType: "PROJECT_INVITATION_REVOKE", userId: auth.session.user.id, method: "DIMPRO_AUTH_INVITATION", result: revoked ? "SUCCESS" : "NOOP", correlationId, metadata: { invitationId } });
    return NextResponse.json({ ok: true, revoked, correlationId }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DimproAuthError) return NextResponse.json({ ok: false, error: error.code, message: error.publicMessage, correlationId }, { status: error.status, headers: { "cache-control": "no-store" } });
    return NextResponse.json({ ok: false, error: "AUTH_INVITATION_REVOKE_FAILED", correlationId }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
