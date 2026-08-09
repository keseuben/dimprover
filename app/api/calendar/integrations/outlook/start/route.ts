import { NextResponse } from "next/server";

import {
  buildMicrosoftAuthorizationUrl,
  createMicrosoftOAuthState,
  OUTLOOK_OAUTH_STATE_COOKIE,
} from "@/app/lib/calendar/integrations";

export async function GET() {
  try {
    const state = createMicrosoftOAuthState();
    const authorizationUrl = buildMicrosoftAuthorizationUrl(state);
    const response = NextResponse.redirect(authorizationUrl);

    response.cookies.set(OUTLOOK_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 10 * 60,
      path: "/api/calendar/integrations/outlook",
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Outlook OAuth indítás sikertelen",
      },
      { status: 400 },
    );
  }
}
