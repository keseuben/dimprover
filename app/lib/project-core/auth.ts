import type { NextRequest } from "next/server";
import { resolveNotificationAuth } from "@/app/lib/notifications/notificationAuth";
import { getProjectAccess } from "./store";
import { normalizeProjectCoreError } from "./errors";
import type { ProjectPermission } from "./types";

export async function resolveProjectCoreAuth(request: NextRequest) {
  const auth = await resolveNotificationAuth(request);
  if (!auth.ok) {
    return {
      ok: false as const,
      status: 401,
      error: auth.error || "Nincs aktív DIMPRO munkamenet.",
    };
  }

  return {
    ok: true as const,
    auth,
    actor: {
      userId: auth.userId,
      userAliases: auth.userAliases,
      displayName: auth.displayName,
      email: auth.email,
    },
  };
}

export async function requireProjectPermission(
  request: NextRequest,
  projectId: string,
  permission: ProjectPermission,
) {
  const authResult = await resolveProjectCoreAuth(request);
  if (!authResult.ok) return authResult;

  let access;
  try {
    access = await getProjectAccess(projectId, authResult.actor.userAliases);
  } catch (error) {
    const normalized = normalizeProjectCoreError(error);
    return {
      ok: false as const,
      status: normalized.status,
      error: normalized.body.error,
      code: normalized.body.code,
    };
  }
  if (!access) {
    return {
      ok: false as const,
      status: 404,
      error: "A projekt nem található vagy nincs hozzáférésed.",
    };
  }

  if (!access.permissions.includes(permission)) {
    return {
      ok: false as const,
      status: 403,
      error: "Ehhez a művelethez nincs megfelelő projektjogosultságod.",
    };
  }

  return {
    ok: true as const,
    auth: authResult.auth,
    actor: authResult.actor,
    access,
  };
}
