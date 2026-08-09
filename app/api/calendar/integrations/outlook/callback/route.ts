import { NextRequest, NextResponse } from "next/server";

import {
  createMicrosoftCredentialRef,
  exchangeMicrosoftAuthorizationCode,
  fetchMicrosoftGraphUser,
  getTokenExpiryIso,
  MICROSOFT_REQUIRED_SCOPES,
  OUTLOOK_OAUTH_STATE_COOKIE,
} from "@/app/lib/calendar/integrations";
import { createClient } from "@/app/lib/supabase/server";

function buildRedirect(request: NextRequest, status: "success" | "error", message?: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/naptar";
  url.search = "";
  url.searchParams.set("outlook", status);

  if (message) {
    url.searchParams.set("message", message);
  }

  return url;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const microsoftError = request.nextUrl.searchParams.get("error");
  const storedState = request.cookies.get(OUTLOOK_OAUTH_STATE_COOKIE)?.value;

  const clearStateCookie = (response: NextResponse) => {
    response.cookies.set(OUTLOOK_OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 0,
      path: "/api/calendar/integrations/outlook",
    });
    return response;
  };

  if (microsoftError) {
    return clearStateCookie(
      NextResponse.redirect(
        buildRedirect(request, "error", "A Microsoft engedélyezés megszakadt vagy hibára futott."),
      ),
    );
  }

  if (!code || !state || !storedState || state !== storedState) {
    return clearStateCookie(
      NextResponse.redirect(
        buildRedirect(request, "error", "Érvénytelen Outlook OAuth válasz."),
      ),
    );
  }

  try {
    const tokenPayload = await exchangeMicrosoftAuthorizationCode(code);

    if (!tokenPayload.access_token) {
      throw new Error("A Microsoft nem adott vissza access tokent.");
    }

    const graphUser = await fetchMicrosoftGraphUser(tokenPayload.access_token);
    const accountEmail = graphUser.mail || graphUser.userPrincipalName || "outlook-account";
    const displayName = graphUser.displayName || accountEmail;
    const externalUserId = graphUser.id || null;
    const credentialRef = createMicrosoftCredentialRef(externalUserId);
    const credentialExpiresAt = getTokenExpiryIso(tokenPayload.expires_in);
    const supabase = await createClient();

    const { error } = await supabase.from("calendar_integrations").upsert(
      {
        provider: "outlook",
        display_name: displayName,
        account_email: accountEmail,
        tenant_id: process.env.MICROSOFT_TENANT_ID?.trim() || null,
        external_user_id: externalUserId,
        credential_ref: credentialRef,
        credential_expires_at: credentialExpiresAt,
        scopes: [...MICROSOFT_REQUIRED_SCOPES],
        sync_direction: "read_only",
        sync_enabled: true,
        last_sync_status: "not_started",
        last_sync_error: null,
      },
      {
        onConflict: "provider,account_email",
      },
    );

    if (error) {
      throw new Error(error.message);
    }

    return clearStateCookie(
      NextResponse.redirect(buildRedirect(request, "success")),
    );
  } catch (error) {
    return clearStateCookie(
      NextResponse.redirect(
        buildRedirect(
          request,
          "error",
          error instanceof Error ? error.message : "Outlook OAuth callback sikertelen.",
        ),
      ),
    );
  }
}
