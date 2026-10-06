import { NextRequest, NextResponse } from "next/server";
import { appSessionCookieOptions, decodeSsoFlowCookie, DIMPRO_APP_SESSION_COOKIE, DIMPRO_SSO_FLOW_COOKIE, transientSsoCookieOptions } from "@/app/lib/dimpro-auth/sso";
import { resolveDriveSsoConfig } from "@/app/lib/dimpro-auth/client-config";
import { getAuthProjectScopeByExternalId, listAuthPermissions, listAuthorizedExternalProjectIds } from "@/app/lib/dimpro-auth/repository";
import { dimproSessionCookieMaxAge } from "@/app/lib/dimpro-auth/session-policy";
import { activateProjectMembership, addProjectMembership, listProjectMemberships } from "@/app/lib/project-core/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";


async function syncAuthorizedProjectMemberships(input: {
  userId: string;
  email: string;
  displayName: string | null;
}) {
  const projectIds = await listAuthorizedExternalProjectIds(input.userId, "DRIVE");
  if (!projectIds.length) return;
  const permissions = await listAuthPermissions(input.userId);

  for (const projectId of projectIds) {
    const activated = await activateProjectMembership(projectId, input.email, input.userId);
    if (activated) continue;

    const authProject = await getAuthProjectScopeByExternalId(projectId);
    if (!authProject || authProject.status !== "ACTIVE") continue;
    const exactManagerGrant = permissions.some((permission) =>
      permission.productCode === "DRIVE"
      && permission.projectId === authProject.id
      && permission.roleCode === "DRIVE_PROJECT_MANAGER"
      && permission.permissionCode === "project.members.invite"
    );
    if (!exactManagerGrant) continue;

    const memberships = await listProjectMemberships(projectId);
    const alreadyLinked = memberships.some((membership) =>
      membership.status !== "REVOKED"
      && (membership.userId.toLowerCase() === input.userId.toLowerCase()
        || membership.userId.toLowerCase() === input.email
        || membership.email?.toLowerCase() === input.email)
    );
    if (alreadyLinked) continue;
    const legacyOwner = memberships.find((membership) =>
      membership.status === "ACTIVE"
      && membership.role === "OWNER"
      && membership.userId === "dev-web-user"
    );
    if (!legacyOwner) continue;

    const created = await addProjectMembership(projectId, {
      userId: input.userId,
      email: input.email,
      displayName: input.displayName?.trim() || input.email,
      role: "PROJECT_MANAGER",
      activateImmediately: true,
    }, input.userId);
    if (!created.ok) throw new Error(`LEGACY_PROJECT_MANAGER_SYNC_FAILED:${projectId}:${created.error}`);
  }
}

function noLeak(response: NextResponse) {
  response.headers.set("cache-control", "no-store, max-age=0");
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("x-content-type-options", "nosniff");
  return response;
}

export async function GET(request: NextRequest) {
  const config = resolveDriveSsoConfig(request.headers.get("host"));
  if (!config) return noLeak(NextResponse.json({ ok: false, error: "AUTH_SSO_HOST_NOT_ALLOWED" }, { status: 404 }));
  const flow = decodeSsoFlowCookie(request.cookies.get(DIMPRO_SSO_FLOW_COOKIE)?.value || "");
  const code = request.nextUrl.searchParams.get("code")?.trim() || "";
  const state = request.nextUrl.searchParams.get("state")?.trim() || "";
  if (!flow || flow.clientId !== config.clientId || flow.state !== state || !code) {
    const response = noLeak(NextResponse.json({ ok: false, error: "AUTH_SSO_STATE_INVALID" }, { status: 400 }));
    response.cookies.set(DIMPRO_SSO_FLOW_COOKIE, "", transientSsoCookieOptions(0));
    return response;
  }

  const tokenResponse = await fetch(new URL("/api/dimpro-auth/token", config.authOrigin), {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": request.headers.get("user-agent") || "DIMPRO Drive SSO" },
    body: JSON.stringify({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      code,
      code_verifier: flow.verifier,
    }),
    cache: "no-store",
  });
  const payload = await tokenResponse.json().catch(() => null) as {
    ok?: boolean;
    app_session_token?: string;
    absolute_expires_at?: string;
    error?: string;
    user?: { id?: string; email?: string; displayName?: string | null };
  } | null;
  if (!tokenResponse.ok || !payload?.ok || !payload.app_session_token || !payload.absolute_expires_at) {
    const response = noLeak(NextResponse.json({ ok: false, error: payload?.error || "AUTH_SSO_EXCHANGE_FAILED" }, { status: 400 }));
    response.cookies.set(DIMPRO_SSO_FLOW_COOKIE, "", transientSsoCookieOptions(0));
    return response;
  }

  const userId = payload.user?.id?.trim() || "";
  const email = payload.user?.email?.trim().toLowerCase() || "";
  if (userId && email) {
    try {
      await syncAuthorizedProjectMemberships({
        userId,
        email,
        displayName: payload.user?.displayName?.trim() || null,
      });
    } catch (error) {
      console.warn("DIMPRO project membership SSO sync hiba:", error instanceof Error ? error.message : "Ismeretlen sync hiba");
    }
  }
  const driveOrigin = new URL(config.redirectUri).origin;
  const target = new URL(flow.returnTo, driveOrigin);
  const response = noLeak(NextResponse.redirect(target));
  response.cookies.set(
    DIMPRO_APP_SESSION_COOKIE,
    payload.app_session_token,
    appSessionCookieOptions(dimproSessionCookieMaxAge(payload.absolute_expires_at)),
  );
  response.cookies.set(DIMPRO_SSO_FLOW_COOKIE, "", transientSsoCookieOptions(0));
  return response;
}
