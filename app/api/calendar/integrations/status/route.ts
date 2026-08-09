import { NextResponse } from "next/server";

import { getMicrosoftOAuthConfigStatus } from "@/app/lib/calendar/integrations";
import { getGoogleOAuthConfigStatusFromStorage } from "@/app/lib/calendar/oauth-config";
import { createClient } from "@/app/lib/supabase/server";

async function checkIntegrationTable() {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("calendar_integrations")
      .select("id", { count: "exact", head: true });

    if (error) {
      return {
        ok: false,
        count: null,
        error: {
          code: error.code ?? "unknown",
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      count: count ?? 0,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      count: null,
      error: {
        code: "exception",
        message:
          error instanceof Error
            ? error.message
            : "Ismeretlen integrációs adatbázis hiba",
      },
    };
  }
}

export async function GET() {
  const microsoft = getMicrosoftOAuthConfigStatus();
  const google = await getGoogleOAuthConfigStatusFromStorage();
  const integrationTable = await checkIntegrationTable();

  return NextResponse.json({
    ok: integrationTable.ok,
    database: {
      calendarIntegrationsTable: integrationTable,
    },
    providers: {
      outlook: {
        oauthConfigured: microsoft.ready,
        missingConfig: microsoft.missing,
        requiredScopes: microsoft.requiredScopes,
        redirectUri: microsoft.redirectUri,
        startUrl: "/api/calendar/integrations/outlook/start",
        callbackUrl: "/api/calendar/integrations/outlook/callback",
        mode: "read_only",
      },
      google: {
        oauthConfigured: google.ready,
        missingConfig: google.missing,
        requiredScopes: google.requiredScopes,
        redirectUri: google.redirectUri,
        source: google.source,
        clientIdMasked: google.clientIdMasked,
        clientSecretSet: google.clientSecretSet,
        configUrl: "/api/calendar/integrations/google/config",
        startUrl: "/api/calendar/integrations/google/start",
        callbackUrl: "/api/calendar/integrations/google/callback",
        mode: "read_only",
      },
    },
  });
}
