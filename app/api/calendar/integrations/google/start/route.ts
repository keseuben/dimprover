import { NextResponse } from "next/server";

import {
  createGoogleOAuthState,
  GOOGLE_OAUTH_STATE_COOKIE,
} from "@/app/lib/calendar/integrations";
import { buildStoredGoogleAuthorizationUrl } from "@/app/lib/calendar/oauth-config";

export async function GET() {
  try {
    const state = createGoogleOAuthState();
    const authorizationUrl = await buildStoredGoogleAuthorizationUrl(state);
    const response = NextResponse.redirect(authorizationUrl);

    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 10 * 60,
      path: "/api/calendar/integrations/google",
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Google OAuth indítás sikertelen",
      },
      { status: 400 },
    );
  }
}
