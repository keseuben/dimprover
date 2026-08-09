import { NextRequest, NextResponse } from "next/server";

import {
  createGoogleCredentialRef,
  fetchGoogleUserInfo,
  getTokenExpiryIso,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_REQUIRED_SCOPES,
} from "@/app/lib/calendar/integrations";
import {
  encryptCalendarSecret,
  exchangeStoredGoogleAuthorizationCode,
} from "@/app/lib/calendar/oauth-config";
import { createClient } from "@/app/lib/supabase/server";

const PUBLIC_APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://dimprover.hu";

function buildRedirect(status: "success" | "error", message?: string) {
  const url = new URL("/naptar", PUBLIC_APP_ORIGIN);
  url.searchParams.set("google", status);

  if (message) {
    url.searchParams.set("message", message);
  }

  return url;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const googleError = request.nextUrl.searchParams.get("error");
  const storedState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;

  const clearStateCookie = (response: NextResponse) => {
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 0,
      path: "/api/calendar/integrations/google",
    });
    return response;
  };

  if (googleError) {
    return clearStateCookie(
      NextResponse.redirect(
        buildRedirect("error", "A Google engedélyezés megszakadt vagy hibára futott."),
      ),
    );
  }

  if (!code || !state || !storedState || state !== storedState) {
    return clearStateCookie(
      NextResponse.redirect(
        buildRedirect("error", "Érvénytelen Google OAuth válasz."),
      ),
    );
  }

  try {
    const tokenPayload = await exchangeStoredGoogleAuthorizationCode(code);

    if (!tokenPayload.access_token) {
      throw new Error("A Google nem adott vissza access tokent.");
    }

    const googleUser = await fetchGoogleUserInfo(tokenPayload.access_token);
    const accountEmail = googleUser.email || "google-account";
    const displayName = googleUser.name || accountEmail;
    const externalUserId = googleUser.sub || null;
    const credentialRef = createGoogleCredentialRef(externalUserId);
    const credentialExpiresAt = getTokenExpiryIso(tokenPayload.expires_in);
    const supabase = await createClient();
    const encryptedPayload = {
      accessToken: encryptCalendarSecret(tokenPayload.access_token),
      refreshToken: tokenPayload.refresh_token
        ? encryptCalendarSecret(tokenPayload.refresh_token)
        : undefined,
      tokenType: tokenPayload.token_type ?? "Bearer",
      scope: tokenPayload.scope ?? GOOGLE_REQUIRED_SCOPES.join(" "),
      updatedAt: new Date().toISOString(),
    };

    const { error } = await supabase.from("calendar_integrations").upsert(
      {
        provider: "google",
        display_name: displayName,
        account_email: accountEmail,
        tenant_id: null,
        external_user_id: externalUserId,
        credential_ref: credentialRef,
        encrypted_payload: encryptedPayload,
        credential_expires_at: credentialExpiresAt,
        scopes: [...GOOGLE_REQUIRED_SCOPES],
        sync_direction: "read_only",
        sync_enabled: true,
        last_sync_status: "not_started",
        last_sync_error: null,
      },
      { onConflict: "provider,account_email" },
    );

    if (error) {
      throw new Error(error.message);
    }

    return clearStateCookie(NextResponse.redirect(buildRedirect("success")));
  } catch (error) {
    return clearStateCookie(
      NextResponse.redirect(
        buildRedirect(
          "error",
          error instanceof Error ? error.message : "Google OAuth callback sikertelen.",
        ),
      ),
    );
  }
}
