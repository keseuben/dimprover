import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { resolveCommercePermissions } from "./permissions";
import { createCommerceAdminClient } from "./server-db";
import type { CommerceContext } from "./types";
import { CommerceContextError } from "./errors";
export { CommerceContextError } from "./errors";

type Row = Record<string, unknown>;

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function createCommerceSessionClient() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    throw new CommerceContextError("A Supabase session konfiguráció hiányzik.", "COMMERCE_SESSION_CONFIG_MISSING", 503);
  }
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(items) {
        try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* Server Component / immutable cookie context. */ }
      },
    },
  });
}


export async function resolveCommerceContext(requestedOrganizationId?: string | null): Promise<CommerceContext> {
  const sessionClient = await createCommerceSessionClient();
  const { data: authData, error: authError } = await sessionClient.auth.getUser();
  const authUser = authData.user;
  if (authError || !authUser) {
    throw new CommerceContextError("Nincs aktív DIMPRO munkamenet.", "COMMERCE_AUTH_REQUIRED", 401);
  }

  const admin = createCommerceAdminClient();
  const userResult = await admin
    .from("dimpro_users")
    .select("id,status")
    .eq("auth_user_id", authUser.id)
    .eq("status", "active")
    .maybeSingle();
  if (userResult.error) {
    throw new CommerceContextError("A DIMPRO felhasználó nem ellenőrizhető.", "COMMERCE_USER_LOOKUP_FAILED", 503);
  }
  const user = userResult.data as Row | null;
  const userId = text(user?.id);
  if (!userId) {
    throw new CommerceContextError("A munkamenethez nincs aktív DIMPRO felhasználó.", "COMMERCE_USER_NOT_ACTIVE", 403);
  }

  const membershipResult = await admin
    .from("dimpro_organization_memberships")
    .select("id,organization_id,role_code,status,access_ends_at,is_primary,created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (membershipResult.error) {
    throw new CommerceContextError("A szervezeti tagság nem ellenőrizhető.", "COMMERCE_MEMBERSHIP_LOOKUP_FAILED", 503);
  }

  const now = Date.now();
  const memberships = ((membershipResult.data || []) as Row[]).filter((row) => {
    const endsAt = text(row.access_ends_at);
    return !endsAt || Date.parse(endsAt) >= now;
  });
  const requested = text(requestedOrganizationId);
  const membership = requested
    ? memberships.find((row) => text(row.organization_id) === requested)
    : memberships[0];
  if (!membership) {
    throw new CommerceContextError(
      requested ? "A kiválasztott szervezethez nincs aktív hozzáférés." : "Nincs aktív DIMPRO szervezeti tagság.",
      requested ? "COMMERCE_ORGANIZATION_ACCESS_DENIED" : "COMMERCE_ORGANIZATION_REQUIRED",
      403,
    );
  }

  const organizationId = text(membership.organization_id);
  const organizationResult = await admin
    .from("dimpro_organizations")
    .select("id,display_name,legal_name,status")
    .eq("id", organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (organizationResult.error) {
    throw new CommerceContextError("A szervezet nem ellenőrizhető.", "COMMERCE_ORGANIZATION_LOOKUP_FAILED", 503);
  }
  const organization = organizationResult.data as Row | null;
  if (!organization) {
    throw new CommerceContextError("A szervezet nem aktív.", "COMMERCE_ORGANIZATION_NOT_ACTIVE", 403);
  }

  const roleCode = text(membership.role_code) || "MEMBER";
  return {
    userId,
    organizationId,
    organizationName: text(organization.display_name) || text(organization.legal_name) || "DIMPRO szervezet",
    roleCode,
    permissions: resolveCommercePermissions(roleCode),
    storefrontId: null,
    warehouseId: null,
  };
}
