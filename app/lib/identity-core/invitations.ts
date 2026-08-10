import { getDimproIdentitySupabaseClient } from "./repository";
import {
  createDimproOrganizationInvitationToken,
  hashDimproOrganizationInvitationToken,
  normalizeUuid,
} from "./security";
import { DimproIdentityError } from "./types";

type DbRow = Record<string, unknown>;
type DbError = { code?: string | null; message?: string | null; details?: string | null } | null;

function text(value: unknown, max = 500) {
  return typeof value === "string"
    ? value.normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function email(value: unknown) {
  const normalized = text(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : "";
}

function dbError(message: string, error: DbError, status = 500): never {
  throw new DimproIdentityError(message, error?.code || "DIMPRO_ORGANIZATION_INVITATION_DATABASE_ERROR", status);
}

function activeDateRange(row: DbRow) {
  const now = Date.now();
  const activated = row.activated_at ? Date.parse(String(row.activated_at)) : 0;
  const expires = row.expires_at ? Date.parse(String(row.expires_at)) : Number.POSITIVE_INFINITY;
  return (!Number.isFinite(activated) || activated <= now)
    && (!Number.isFinite(expires) || expires >= now);
}

function normalizeModuleCodes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => text(item, 80).toUpperCase().replace(/[^A-Z0-9_:-]/g, "_"))
    .filter((item) => /^[A-Z0-9][A-Z0-9_:-]{1,79}$/.test(item))
  )].slice(0, 80);
}

function normalizeRole(value: unknown) {
  const role = text(value, 60).toLowerCase().replace(/[^a-z0-9_:-]/g, "_");
  return role || "member";
}

async function expirePendingInvitations(licenseId: string) {
  const client = getDimproIdentitySupabaseClient();
  const now = new Date().toISOString();
  const expired = await client.from("dimpro_organization_invitations")
    .select("id,membership_id")
    .eq("license_id", licenseId)
    .eq("status", "pending")
    .lt("expires_at", now);
  if (expired.error) dbError("A lejárt meghívások nem ellenőrizhetők.", expired.error);
  const rows = (expired.data || []) as DbRow[];
  if (!rows.length) return;
  const ids = rows.map((row) => String(row.id));
  const membershipIds = rows.map((row) => String(row.membership_id));
  const marked = await client.from("dimpro_organization_invitations")
    .update({ status: "expired", updated_at: now })
    .in("id", ids)
    .eq("status", "pending");
  if (marked.error) dbError("A lejárt meghívások állapota nem frissíthető.", marked.error);
  const released = await client.from("dimpro_organization_memberships")
    .update({ status: "revoked", is_primary: false, updated_at: now })
    .in("id", membershipIds)
    .eq("status", "invited");
  if (released.error) dbError("A lejárt meghívások licenchelye nem szabadítható fel.", released.error);
}

async function requireOrganizationLicense(licenseIdRaw: unknown) {
  const licenseId = normalizeUuid(licenseIdRaw);
  if (!licenseId) {
    throw new DimproIdentityError("A szervezeti licenc kiválasztása kötelező.", "DIMPRO_ORGANIZATION_LICENSE_REQUIRED", 400);
  }
  const client = getDimproIdentitySupabaseClient();
  const result = await client.from("dimpro_licenses")
    .select("id,public_license_code,owner_type,owner_organization_id,status,activated_at,expires_at,max_users,max_devices")
    .eq("id", licenseId)
    .maybeSingle();
  if (result.error) dbError("A szervezeti licenc nem tölthető be.", result.error);
  const row = result.data as DbRow | null;
  if (!row || row.owner_type !== "organization" || !normalizeUuid(row.owner_organization_id)) {
    throw new DimproIdentityError("Ehhez a művelethez szervezeti licenc szükséges.", "DIMPRO_ORGANIZATION_LICENSE_INVALID", 400);
  }
  if (!["active", "trial"].includes(String(row.status)) || !activeDateRange(row)) {
    throw new DimproIdentityError("A szervezeti licenc nem aktív.", "DIMPRO_ORGANIZATION_LICENSE_NOT_ACTIVE", 403);
  }
  return {
    row,
    licenseId,
    organizationId: normalizeUuid(row.owner_organization_id),
    maxUsers: Math.max(1, Number(row.max_users) || 1),
  };
}

async function allowedLicenseModules(licenseId: string) {
  const client = getDimproIdentitySupabaseClient();
  const result = await client.from("dimpro_license_modules")
    .select("module_code,enabled,valid_from,valid_until")
    .eq("license_id", licenseId)
    .eq("enabled", true);
  if (result.error) dbError("A licenc szolgáltatásai nem tölthetők be.", result.error);
  const now = Date.now();
  return ((result.data || []) as DbRow[])
    .filter((row) => {
      const from = row.valid_from ? Date.parse(String(row.valid_from)) : 0;
      const until = row.valid_until ? Date.parse(String(row.valid_until)) : Number.POSITIVE_INFINITY;
      return (!Number.isFinite(from) || from <= now) && (!Number.isFinite(until) || until >= now);
    })
    .map((row) => text(row.module_code, 80).toUpperCase())
    .filter(Boolean);
}

async function replaceMembershipModules(membershipId: string, moduleCodes: string[]) {
  const client = getDimproIdentitySupabaseClient();
  const removed = await client.from("dimpro_membership_modules").delete().eq("membership_id", membershipId);
  if (removed.error) dbError("A tagsági szolgáltatások nem frissíthetők.", removed.error);
  if (!moduleCodes.length) return;
  const inserted = await client.from("dimpro_membership_modules").insert(
    moduleCodes.map((moduleCode) => ({
      membership_id: membershipId,
      module_code: moduleCode,
      enabled: true,
      limits: {},
      updated_at: new Date().toISOString(),
    })),
  );
  if (inserted.error) dbError("A tagsági szolgáltatások nem menthetők.", inserted.error);
}

export async function getDimproOrganizationSeatSummary(licenseIdRaw: unknown) {
  const { licenseId, organizationId, maxUsers } = await requireOrganizationLicense(licenseIdRaw);
  await expirePendingInvitations(licenseId);
  const result = await getDimproIdentitySupabaseClient().from("dimpro_organization_memberships")
    .select("id,status,access_ends_at")
    .eq("organization_id", organizationId)
    .in("status", ["invited", "active", "suspended"]);
  if (result.error) dbError("A felhasználói licenchelyek nem számolhatók.", result.error);
  const now = Date.now();
  const used = ((result.data || []) as DbRow[]).filter((row) => {
    if (!row.access_ends_at) return true;
    const end = Date.parse(String(row.access_ends_at));
    return !Number.isFinite(end) || end >= now;
  }).length;
  return { licenseId, organizationId, maxUsers, used, available: Math.max(0, maxUsers - used) };
}

export async function createDimproOrganizationInvitationAdmin(input: Record<string, unknown>) {
  const { row: license, licenseId, organizationId, maxUsers } = await requireOrganizationLicense(input.licenseId);
  await expirePendingInvitations(licenseId);

  const fullName = text(input.fullName, 160);
  const inviteEmail = email(input.email);
  const roleCode = normalizeRole(input.roleCode);
  const roleLabel = text(input.roleLabel, 160) || "Szervezeti felhasználó";
  if (fullName.length < 2) {
    throw new DimproIdentityError("A meghívott neve kötelező.", "DIMPRO_ORGANIZATION_INVITATION_NAME_REQUIRED", 400);
  }
  if (!inviteEmail) {
    throw new DimproIdentityError("Érvényes e-mail-cím szükséges.", "DIMPRO_ORGANIZATION_INVITATION_EMAIL_INVALID", 400);
  }

  const client = getDimproIdentitySupabaseClient();
  const enabledModules = await allowedLicenseModules(licenseId);
  const requestedModules = normalizeModuleCodes(input.moduleCodes);
  const selectedModules = requestedModules.length
    ? requestedModules.filter((moduleCode) => enabledModules.includes(moduleCode))
    : enabledModules;
  if (requestedModules.some((moduleCode) => !enabledModules.includes(moduleCode))) {
    throw new DimproIdentityError(
      "A meghívott csak a szervezeti licencben engedélyezett szolgáltatásokat kaphatja meg.",
      "DIMPRO_MEMBERSHIP_MODULE_NOT_LICENSED",
      400,
    );
  }

  let userResult = await client.from("dimpro_users")
    .select("id,public_user_code,full_name,email,status,email_verified_at")
    .eq("email_normalized", inviteEmail)
    .maybeSingle();
  if (userResult.error) dbError("A meghívott e-mail-címe nem ellenőrizhető.", userResult.error);

  let createdUser = false;
  if (!userResult.data) {
    const created = await client.rpc("dimpro_create_user", {
      p_full_name: fullName,
      p_email: inviteEmail,
      p_auth_user_id: null,
      p_phone: null,
      p_created_by: null,
    });
    if (created.error || !created.data) dbError("A meghívott központi felhasználója nem hozható létre.", created.error, 400);
    userResult = { ...userResult, data: created.data } as typeof userResult;
    createdUser = true;
  }

  const user = userResult.data as DbRow;
  const userId = normalizeUuid(user.id);
  if (!userId) throw new DimproIdentityError("A meghívott felhasználó azonosítója hiányzik.", "DIMPRO_INVITED_USER_INVALID", 500);

  const currentMembership = await client.from("dimpro_organization_memberships")
    .select("id,status,is_primary")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .neq("status", "revoked")
    .maybeSingle();
  if (currentMembership.error) dbError("A meglévő tagság nem ellenőrizhető.", currentMembership.error);
  const current = currentMembership.data as DbRow | null;
  if (current?.status === "active") {
    throw new DimproIdentityError("Ez a felhasználó már aktív tagja a szervezetnek.", "DIMPRO_ORGANIZATION_MEMBER_ALREADY_ACTIVE", 409);
  }

  const seats = await getDimproOrganizationSeatSummary(licenseId);
  if (!current && seats.used >= maxUsers) {
    throw new DimproIdentityError(
      `A szervezeti licenc felhasználói kerete betelt (${seats.used}/${maxUsers}).`,
      "DIMPRO_ORGANIZATION_USER_SEAT_LIMIT_REACHED",
      409,
    );
  }

  const now = new Date().toISOString();
  let membershipId = current ? normalizeUuid(current.id) : "";
  try {
    if (membershipId) {
      const updated = await client.from("dimpro_organization_memberships").update({
        role_code: roleCode,
        role_label: roleLabel,
        status: "invited",
        access_ends_at: null,
        updated_at: now,
      }).eq("id", membershipId);
      if (updated.error) dbError("A szervezeti meghívott tagsága nem frissíthető.", updated.error);
    } else {
      const inserted = await client.from("dimpro_organization_memberships").insert({
        user_id: userId,
        organization_id: organizationId,
        role_code: roleCode,
        role_label: roleLabel,
        status: "invited",
        joined_at: now,
        access_ends_at: null,
        is_primary: false,
      }).select("id").single();
      if (inserted.error) dbError("A szervezeti meghívott tagsága nem hozható létre.", inserted.error);
      membershipId = normalizeUuid(inserted.data?.id);
    }
    if (!membershipId) throw new DimproIdentityError("A tagsági azonosító hiányzik.", "DIMPRO_MEMBERSHIP_ID_INVALID", 500);

    await replaceMembershipModules(membershipId, selectedModules);
    const token = createDimproOrganizationInvitationToken();
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const existingInvitation = await client.from("dimpro_organization_invitations")
      .select("id")
      .eq("membership_id", membershipId)
      .maybeSingle();
    if (existingInvitation.error) dbError("A korábbi meghívó nem ellenőrizhető.", existingInvitation.error);

    let invitation: DbRow;
    if (existingInvitation.data?.id) {
      const updated = await client.from("dimpro_organization_invitations").update({
        license_id: licenseId,
        invited_user_id: userId,
        email_normalized: inviteEmail,
        full_name: fullName,
        role_code: roleCode,
        role_label: roleLabel,
        token_hash: token.tokenHash,
        token_hint: token.tokenHint,
        status: "pending",
        expires_at: expiresAt,
        accepted_at: null,
        revoked_at: null,
        updated_at: now,
      }).eq("id", existingInvitation.data.id).select("*").single();
      if (updated.error) dbError("A szervezeti meghívó nem újítható meg.", updated.error);
      invitation = updated.data as DbRow;
    } else {
      const inserted = await client.from("dimpro_organization_invitations").insert({
        organization_id: organizationId,
        license_id: licenseId,
        membership_id: membershipId,
        invited_user_id: userId,
        email_normalized: inviteEmail,
        full_name: fullName,
        role_code: roleCode,
        role_label: roleLabel,
        token_hash: token.tokenHash,
        token_hint: token.tokenHint,
        status: "pending",
        expires_at: expiresAt,
      }).select("*").single();
      if (inserted.error) dbError("A szervezeti meghívó nem hozható létre.", inserted.error);
      invitation = inserted.data as DbRow;
    }

    const audit = await client.from("dimpro_access_audit_logs").insert({
      user_id: userId,
      organization_id: organizationId,
      license_id: licenseId,
      event_type: "organization_user_invited",
      success: true,
      metadata: {
        source: "identity-license-center",
        roleCode,
        moduleCodes: selectedModules,
        seatUsageBeforeInvite: seats.used,
        maxUsers,
        legacyLicenseRef: license.legacy_license_ref || null,
      },
    });
    if (audit.error) dbError("A meghívási auditnapló nem írható.", audit.error);

    return {
      invitation: {
        id: invitation.id,
        organizationId,
        licenseId,
        membershipId,
        userId,
        email: inviteEmail,
        fullName,
        roleCode,
        roleLabel,
        moduleCodes: selectedModules,
        status: "pending",
        expiresAt,
        tokenHint: token.tokenHint,
      },
      rawToken: token.token,
      seatUsage: { used: current ? seats.used : seats.used + 1, maxUsers },
    };
  } catch (error) {
    if (createdUser && userId) {
      try { await client.from("dimpro_organization_memberships").delete().eq("user_id", userId).eq("organization_id", organizationId); } catch {}
      try { await client.from("dimpro_users").delete().eq("id", userId).eq("status", "pending"); } catch {}
    }
    throw error;
  }
}

export async function getDimproOrganizationInvitation(rawToken: unknown) {
  const tokenHash = hashDimproOrganizationInvitationToken(rawToken);
  const client = getDimproIdentitySupabaseClient();
  const result = await client.from("dimpro_organization_invitations")
    .select("id,organization_id,license_id,membership_id,invited_user_id,email_normalized,full_name,role_code,role_label,status,expires_at,accepted_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (result.error) dbError("A meghívó nem tölthető be.", result.error);
  const invitation = result.data as DbRow | null;
  if (!invitation) {
    throw new DimproIdentityError("A szervezeti meghívó nem található.", "DIMPRO_ORGANIZATION_INVITATION_NOT_FOUND", 404);
  }
  if (invitation.status !== "pending") {
    throw new DimproIdentityError(
      invitation.status === "accepted" ? "Ezt a meghívót már elfogadták." : "Ez a meghívó már nem aktív.",
      "DIMPRO_ORGANIZATION_INVITATION_NOT_PENDING",
      410,
    );
  }
  if (Date.parse(String(invitation.expires_at)) < Date.now()) {
    await client.from("dimpro_organization_invitations").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", invitation.id);
    await client.from("dimpro_organization_memberships").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("id", invitation.membership_id).eq("status", "invited");
    throw new DimproIdentityError("A szervezeti meghívó lejárt.", "DIMPRO_ORGANIZATION_INVITATION_EXPIRED", 410);
  }
  const [organizationResult, licenseResult, moduleResult] = await Promise.all([
    client.from("dimpro_organizations").select("id,public_organization_code,display_name,legal_name,status").eq("id", invitation.organization_id).maybeSingle(),
    client.from("dimpro_licenses").select("id,public_license_code,status,activated_at,expires_at").eq("id", invitation.license_id).maybeSingle(),
    client.from("dimpro_membership_modules").select("module_code,enabled").eq("membership_id", invitation.membership_id).eq("enabled", true),
  ]);
  if (organizationResult.error) dbError("A meghívó szervezete nem tölthető be.", organizationResult.error);
  if (licenseResult.error) dbError("A meghívó licence nem tölthető be.", licenseResult.error);
  if (moduleResult.error) dbError("A meghívó szolgáltatásai nem tölthetők be.", moduleResult.error);
  const organization = organizationResult.data as DbRow | null;
  const license = licenseResult.data as DbRow | null;
  if (!organization || organization.status !== "active" || !license || !["active", "trial"].includes(String(license.status)) || !activeDateRange(license)) {
    throw new DimproIdentityError("A meghíváshoz tartozó szervezet vagy licenc már nem aktív.", "DIMPRO_ORGANIZATION_INVITATION_LICENSE_INACTIVE", 403);
  }
  return {
    invitationId: String(invitation.id),
    email: String(invitation.email_normalized),
    fullName: String(invitation.full_name),
    roleCode: String(invitation.role_code),
    roleLabel: invitation.role_label ? String(invitation.role_label) : null,
    expiresAt: String(invitation.expires_at),
    organization: {
      id: String(organization.id),
      publicCode: String(organization.public_organization_code),
      name: String(organization.display_name || organization.legal_name),
    },
    license: {
      id: String(license.id),
      publicCode: String(license.public_license_code),
    },
    moduleCodes: ((moduleResult.data || []) as DbRow[]).map((row) => String(row.module_code)),
  };
}

export async function acceptDimproOrganizationInvitation(rawToken: unknown) {
  const preview = await getDimproOrganizationInvitation(rawToken);
  const tokenHash = hashDimproOrganizationInvitationToken(rawToken);
  const client = getDimproIdentitySupabaseClient();
  const invitationResult = await client.from("dimpro_organization_invitations")
    .select("id,membership_id,invited_user_id,organization_id,license_id,status")
    .eq("token_hash", tokenHash)
    .eq("status", "pending")
    .maybeSingle();
  if (invitationResult.error) dbError("A meghívó nem fogadható el.", invitationResult.error);
  const invitation = invitationResult.data as DbRow | null;
  if (!invitation) throw new DimproIdentityError("A meghívó időközben már nem aktív.", "DIMPRO_ORGANIZATION_INVITATION_CONSUMED", 409);

  const userId = normalizeUuid(invitation.invited_user_id);
  const membershipId = normalizeUuid(invitation.membership_id);
  if (!userId || !membershipId) throw new DimproIdentityError("A meghívó kapcsolatai hiányosak.", "DIMPRO_ORGANIZATION_INVITATION_LINK_INVALID", 500);
  const now = new Date().toISOString();

  const primaryResult = await client.from("dimpro_organization_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("is_primary", true)
    .limit(1);
  if (primaryResult.error) dbError("Az elsődleges tagság nem ellenőrizhető.", primaryResult.error);
  const userUpdate = await client.from("dimpro_users").update({
    full_name: preview.fullName,
    status: "active",
    email_verified_at: now,
    updated_at: now,
  }).eq("id", userId);
  if (userUpdate.error) dbError("A meghívott felhasználó nem aktiválható.", userUpdate.error);

  const membershipUpdate = await client.from("dimpro_organization_memberships").update({
    status: "active",
    joined_at: now,
    is_primary: !(primaryResult.data || []).length,
    updated_at: now,
  }).eq("id", membershipId).eq("status", "invited");
  if (membershipUpdate.error) dbError("A szervezeti tagság nem aktiválható.", membershipUpdate.error);

  const accepted = await client.from("dimpro_organization_invitations").update({
    status: "accepted",
    accepted_at: now,
    updated_at: now,
  }).eq("id", invitation.id).eq("status", "pending").select("id").maybeSingle();
  if (accepted.error) dbError("A meghívó elfogadása nem zárható le.", accepted.error);
  if (!accepted.data) throw new DimproIdentityError("A meghívót időközben már felhasználták.", "DIMPRO_ORGANIZATION_INVITATION_CONSUMED", 409);

  const audit = await client.from("dimpro_access_audit_logs").insert({
    user_id: userId,
    organization_id: invitation.organization_id,
    license_id: invitation.license_id,
    event_type: "organization_invitation_accepted",
    success: true,
    metadata: { source: "identity-public-invitation", emailVerifiedByInvitation: true },
  });
  if (audit.error) dbError("A meghívás elfogadásának auditnaplója nem írható.", audit.error);

  return {
    ...preview,
    status: "accepted" as const,
    acceptedAt: now,
    loginUrl: "/login",
  };
}

export async function revokeDimproOrganizationInvitationAdmin(invitationIdRaw: unknown) {
  const invitationId = normalizeUuid(invitationIdRaw);
  if (!invitationId) throw new DimproIdentityError("A meghívóazonosító kötelező.", "DIMPRO_ORGANIZATION_INVITATION_ID_REQUIRED", 400);
  const client = getDimproIdentitySupabaseClient();
  const found = await client.from("dimpro_organization_invitations")
    .select("id,membership_id,invited_user_id,organization_id,license_id,status")
    .eq("id", invitationId)
    .maybeSingle();
  if (found.error) dbError("A meghívó nem tölthető be.", found.error);
  const row = found.data as DbRow | null;
  if (!row) throw new DimproIdentityError("A meghívó nem található.", "DIMPRO_ORGANIZATION_INVITATION_NOT_FOUND", 404);
  if (row.status !== "pending") throw new DimproIdentityError("Csak függő meghívó vonható vissza.", "DIMPRO_ORGANIZATION_INVITATION_NOT_PENDING", 409);
  const now = new Date().toISOString();
  const revoked = await client.from("dimpro_organization_invitations").update({
    status: "revoked", revoked_at: now, updated_at: now,
  }).eq("id", invitationId).eq("status", "pending");
  if (revoked.error) dbError("A meghívó nem vonható vissza.", revoked.error);
  const membershipId = normalizeUuid(row.membership_id);
  if (membershipId) {
    const membership = await client.from("dimpro_organization_memberships").update({
      status: "revoked", is_primary: false, updated_at: now,
    }).eq("id", membershipId).eq("status", "invited");
    if (membership.error) dbError("A meghívott licenchelye nem szabadítható fel.", membership.error);
  }
  await client.from("dimpro_access_audit_logs").insert({
    user_id: row.invited_user_id,
    organization_id: row.organization_id,
    license_id: row.license_id,
    event_type: "organization_invitation_revoked",
    success: true,
    metadata: { source: "identity-license-center" },
  });
  return { id: invitationId, status: "revoked" as const };
}
