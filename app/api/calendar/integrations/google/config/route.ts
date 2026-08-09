import { NextRequest, NextResponse } from "next/server";

import {
  getGoogleOAuthConfigStatusFromStorage,
  saveGoogleOAuthConfig,
} from "@/app/lib/calendar/oauth-config";
import { DEFAULT_GOOGLE_REDIRECT_URI } from "@/app/lib/calendar/integrations";

export async function GET() {
  const status = await getGoogleOAuthConfigStatusFromStorage();
  return NextResponse.json({ ok: true, google: status });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    const clientSecret =
      typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";
    const redirectUri =
      typeof body.redirectUri === "string" && body.redirectUri.trim()
        ? body.redirectUri.trim()
        : DEFAULT_GOOGLE_REDIRECT_URI;

    if (!clientId) {
      return NextResponse.json(
        { ok: false, error: "A Google Client ID megadása kötelező." },
        { status: 400 },
      );
    }

    const status = await saveGoogleOAuthConfig({
      clientId,
      clientSecret: clientSecret || undefined,
      redirectUri,
    });

    return NextResponse.json({ ok: true, google: status });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Google OAuth konfiguráció mentése sikertelen.",
      },
      { status: 500 },
    );
  }
}
