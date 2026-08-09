import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { isDriveApiAuthorized } from "@/app/lib/drive/driveApi";
import { DEV_DESKTOP_USER_ID, DEV_WEB_USER_ID, uniqueUserIds } from "./notificationAccess";

export type NotificationAuthContext = {
  ok: boolean;
  mode: "web-session" | "desktop-token" | "admin" | "unauthorized";
  userId: string;
  userAliases: string[];
  displayName: string;
  email?: string;
  clientId?: string;
  error?: string;
};

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
}

function headerValue(request: NextRequest, name: string) {
  return request.headers.get(name)?.trim() || "";
}

async function getWebSessionContext(): Promise<NotificationAuthContext | null> {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey) return null;

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Route handlerben nem kritikus, ha a cookie írás nem elérhető.
          }
        },
      },
    });

    const { data, error } = await supabase.auth.getUser();
    const user = data.user;
    if (error || !user) return null;

    const email = user.email || undefined;
    const fullName =
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : email || "DIMPROVER felhasználó";

    return {
      ok: true,
      mode: "web-session",
      userId: user.id,
      // MVP/dev kompatibilitás: a webes session saját rekordja mellett látja a közös dev címzést is.
      userAliases: uniqueUserIds([user.id, email, DEV_WEB_USER_ID]),
      displayName: fullName,
      email,
    };
  } catch {
    return null;
  }
}

export async function resolveNotificationAuth(request: NextRequest): Promise<NotificationAuthContext> {
  const driveAuth = await isDriveApiAuthorized(request.headers);
  if (driveAuth.ok) {
    const explicitUserId = headerValue(request, "x-dimpro-notification-user-id");
    const explicitEmail = headerValue(request, "x-dimpro-notification-email");
    const clientId = driveAuth.clientId || DEV_DESKTOP_USER_ID;
    const userId = explicitUserId || clientId || DEV_DESKTOP_USER_ID;

    return {
      ok: true,
      mode: driveAuth.mode === "admin" ? "admin" : "desktop-token",
      userId,
      userAliases: uniqueUserIds([userId, explicitEmail, clientId, DEV_WEB_USER_ID, DEV_DESKTOP_USER_ID]),
      displayName: headerValue(request, "x-dimpro-notification-user-name") || clientId,
      email: explicitEmail || undefined,
      clientId,
    };
  }

  const webSession = await getWebSessionContext();
  if (webSession) return webSession;

  return {
    ok: false,
    mode: "unauthorized",
    userId: "",
    userAliases: [],
    displayName: "",
    error: "Nincs aktív DIMPROVER session vagy érvényes DIMPRO Drive API token.",
  };
}

export function unauthorizedNotificationResponse(auth: NotificationAuthContext) {
  return {
    ok: false,
    error: auth.error || "Nincs jogosultság az Értesítési Központ API használatához.",
    authHint: "Weben Supabase session, desktop kliensnél x-dimpro-drive-dev-token vagy admin header szükséges.",
  };
}
