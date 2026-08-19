import { resolveCommercePermissions } from "./permissions";
import { createCommerceAdminClient } from "./server-db";
import type { CommerceContext, CommercePermission } from "./types";

type Row = Record<string, unknown>;

export class CommerceServiceContextError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "CommerceServiceContextError";
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function uuid(value: unknown) {
  const normalized = text(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized) ? normalized : "";
}

export async function resolveCommerceServiceActorContext(input: {
  organizationId: unknown;
  userId: unknown;
  requiredPermissions?: readonly CommercePermission[];
}): Promise<CommerceContext> {
  const organizationId = uuid(input.organizationId);
  const userId = uuid(input.userId);
  if (!organizationId) throw new CommerceServiceContextError("A worker organization azonosítója hiányzik vagy hibás.", "COMMERCE_SERVICE_ORGANIZATION_INVALID");
  if (!userId) throw new CommerceServiceContextError("A worker actor DIMPRO user azonosítója hiányzik vagy hibás.", "COMMERCE_SERVICE_ACTOR_INVALID");

  const admin = createCommerceAdminClient();
  const [userResult, organizationResult, membershipResult] = await Promise.all([
    admin.from("dimpro_users").select("id,status").eq("id", userId).eq("status", "active").maybeSingle(),
    admin.from("dimpro_organizations").select("id,display_name,legal_name,status").eq("id", organizationId).eq("status", "active").maybeSingle(),
    admin.from("dimpro_organization_memberships")
      .select("id,organization_id,user_id,role_code,status,access_ends_at")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (userResult.error) throw new CommerceServiceContextError("A worker actor nem ellenőrizhető.", "COMMERCE_SERVICE_ACTOR_LOOKUP_FAILED");
  if (!userResult.data) throw new CommerceServiceContextError("A worker actor nem aktív DIMPRO felhasználó.", "COMMERCE_SERVICE_ACTOR_NOT_ACTIVE");
  if (organizationResult.error) throw new CommerceServiceContextError("A worker szervezet nem ellenőrizhető.", "COMMERCE_SERVICE_ORGANIZATION_LOOKUP_FAILED");
  if (!organizationResult.data) throw new CommerceServiceContextError("A worker szervezet nem aktív.", "COMMERCE_SERVICE_ORGANIZATION_NOT_ACTIVE");
  if (membershipResult.error) throw new CommerceServiceContextError("A worker szervezeti tagsága nem ellenőrizhető.", "COMMERCE_SERVICE_MEMBERSHIP_LOOKUP_FAILED");
  if (!membershipResult.data) throw new CommerceServiceContextError("A worker actorhoz nincs aktív szervezeti tagság.", "COMMERCE_SERVICE_MEMBERSHIP_REQUIRED");

  const membership = membershipResult.data as Row;
  const accessEndsAt = text(membership.access_ends_at);
  if (accessEndsAt && (!Number.isFinite(Date.parse(accessEndsAt)) || Date.parse(accessEndsAt) < Date.now())) {
    throw new CommerceServiceContextError("A worker actor szervezeti hozzáférése lejárt.", "COMMERCE_SERVICE_MEMBERSHIP_EXPIRED");
  }

  const roleCode = text(membership.role_code) || "MEMBER";
  const permissions = resolveCommercePermissions(roleCode);
  const missing = (input.requiredPermissions || []).filter((permission) => !permissions.includes(permission));
  if (missing.length) {
    throw new CommerceServiceContextError(
      `A worker actor jogosultsága hiányos: ${missing.join(", ")}`,
      "COMMERCE_SERVICE_PERMISSION_DENIED",
    );
  }

  const organization = organizationResult.data as Row;
  return {
    userId,
    organizationId,
    organizationName: text(organization.display_name) || text(organization.legal_name) || "DIMPRO szervezet",
    roleCode,
    permissions,
    storefrontId: null,
    warehouseId: null,
  };
}
