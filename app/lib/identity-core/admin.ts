import { randomInt } from "node:crypto";
import { getDimproIdentitySupabaseClient } from "./repository";
import {
  hashDimproSendCode,
  normalizeDimproSendCode,
  normalizeUuid,
} from "./security";
import { DimproIdentityError } from "./types";
import { getDimproOrganizationSeatSummary } from "./invitations";

type DbRow = Record<string, unknown>;
type DbError = { code?: string | null; message?: string | null; details?: string | null } | null;

function text(value: unknown, max = 500) {
  return typeof value === "string"
    ? value.normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}
function email(value: unknown) {
  const valueNormalized = text(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valueNormalized) ? valueNormalized : "";
}
function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}
function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
function optionalInteger(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : null;
}
function dbError(message: string, error: DbError, status = 500): never {
  const source = `${error?.message || ""} ${error?.details || ""}`;
  const known = source.match(/(?:DIMPRO|DROP)_[A-Z0-9_]+/)?.[0];
  throw new DimproIdentityError(message, known || error?.code || "DIMPRO_IDENTITY_ADMIN_DATABASE_ERROR", status);
}
function codeHint(code: string) {
  return `••••-•••-${code.slice(-3)}`;
}
function normalizeRecipientMode(value: unknown) {
  return value === "locked_default" || value === "free_entry" ? value : "approved_list";
}
function normalizeRecipients(value: unknown, maxRecipients: number) {
  if (!Array.isArray(value)) return [];
  const result: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const recipientEmail = email(row.email);
    const name = text(row.name, 160);
    if (!recipientEmail || name.length < 2 || seen.has(recipientEmail)) continue;
    seen.add(recipientEmail);
    result.push({
      name,
      email: recipientEmail,
      organizationName: text(row.organizationName, 180) || null,
      label: text(row.label, 160) || null,
      isDefault: row.isDefault === true,
      locked: row.locked === true,
    });
    if (result.length >= maxRecipients) break;
  }
  return result;
}

export async function getDimproSendAdminOverview() {
  const client = getDimproIdentitySupabaseClient();
  const [users, organizations, memberships, licenses, modules, entitlements, recipients, legacyCodes] = await Promise.all([
    client.from("dimpro_users")
      .select("id,public_user_code,full_name,email,phone,status,email_verified_at")
      .order("full_name", { ascending: true }),
    client.from("dimpro_organizations")
      .select("id,public_organization_code,display_name,legal_name,status")
      .order("display_name", { ascending: true }),
    client.from("dimpro_organization_memberships")
      .select("id,user_id,organization_id,role_code,status,access_ends_at,is_primary")
      .eq("status", "active"),
    client.from("dimpro_licenses")
      .select("id,public_license_code,owner_type,owner_user_id,owner_organization_id,product_code,plan_code,status,activated_at,expires_at")
      .order("created_at", { ascending: false }),
    client.from("dimpro_license_modules")
      .select("id,license_id,module_code,enabled,valid_from,valid_until"),
    client.from("dimpro_send_entitlements")
      .select("id,user_id,license_id,organization_id,code_hint,status,valid_from,expires_at,can_use_standard_send,can_use_quick_image_send,can_use_image_groups,can_use_file_comments,can_use_project_drop,recipient_mode,default_recipient_id,max_recipients,max_saved_contacts,upload_rules_acceptance_count,upload_rules_version,upload_rules_last_accepted_at,max_package_size_bytes,monthly_send_limit,current_month_send_count,send_count_month,last_used_at,created_at,updated_at")
      .order("created_at", { ascending: false }),
    client.from("dimpro_send_recipients")
      .select("id,entitlement_id,recipient_name,recipient_email,organization_name,label,is_default,is_locked,active,created_at")
      .order("created_at", { ascending: true }),
    client.from("drop_public_send_codes")
      .select("id,label,code_hint,status,expires_at,created_at,dimpro_send_entitlement_id")
      .order("created_at", { ascending: false }),
  ]);
  for (const result of [users, organizations, memberships, licenses, modules, entitlements, recipients, legacyCodes]) {
    if (result.error) dbError("A Send adminisztrációs adatok betöltése sikertelen.", result.error);
  }
  return {
    users: users.data || [],
    organizations: organizations.data || [],
    organizationMemberships: memberships.data || [],
    licenses: licenses.data || [],
    licenseModules: modules.data || [],
    entitlements: entitlements.data || [],
    recipients: recipients.data || [],
    legacySendCodes: legacyCodes.data || [],
  };
}


export async function createDimproSendUserAdmin(input: Record<string, unknown>) {
  const fullName = text(input.fullName, 160);
  const userEmail = email(input.email);
  const phone = text(input.phone, 60);
  const organizationName = text(input.organizationName, 180);
  const emailVerified = input.emailVerified === true;
  if (fullName.length < 2) {
    throw new DimproIdentityError("A felhasználó teljes neve kötelező.", "DIMPRO_SEND_USER_NAME_REQUIRED", 400);
  }
  if (!userEmail) {
    throw new DimproIdentityError("Érvényes, egyedi e-mail-cím szükséges.", "DIMPRO_SEND_USER_EMAIL_INVALID", 400);
  }
  if (!emailVerified) {
    throw new DimproIdentityError(
      "Send-felhasználó csak adminisztratívan ellenőrzött e-mail-címmel aktiválható.",
      "DIMPRO_SEND_USER_EMAIL_VERIFICATION_REQUIRED",
      400,
    );
  }

  const client = getDimproIdentitySupabaseClient();
  const existing = await client.from("dimpro_users")
    .select("id,public_user_code,full_name,email,phone,status,email_verified_at")
    .eq("email_normalized", userEmail)
    .maybeSingle();
  if (existing.error) dbError("A felhasználó e-mail-címe nem ellenőrizhető.", existing.error);
  let createdUserId = "";
  let createdOrganizationId = "";
  let createdNewOrganization = false;
  const existingUserId = normalizeUuid(existing.data?.id);
  const userPreexisting = Boolean(existingUserId);
  try {
    if (existingUserId) {
      createdUserId = existingUserId;
    } else {
      const userCreated = await client.rpc("dimpro_create_user", {
        p_full_name: fullName,
        p_email: userEmail,
        p_auth_user_id: null,
        p_phone: phone || null,
        p_created_by: null,
      });
      if (userCreated.error || !userCreated.data) {
        const source = `${userCreated.error?.message || ""} ${userCreated.error?.details || ""}`;
        if (userCreated.error?.code === "23505" || source.includes("email_normalized")) {
          throw new DimproIdentityError(
            "Ezzel az e-mail-címmel már létezik központi DIMPRO felhasználó.",
            "DIMPRO_SEND_USER_EMAIL_ALREADY_EXISTS",
            409,
          );
        }
        dbError("A központi DIMPRO felhasználó létrehozása sikertelen.", userCreated.error);
      }
      const userRow = userCreated.data as DbRow;
      createdUserId = normalizeUuid(userRow.id);
      if (!createdUserId) throw new DimproIdentityError("A létrehozott felhasználó azonosítója hiányzik.", "DIMPRO_SEND_USER_CREATE_RESPONSE_INVALID", 500);
    }

    const activated = await client.from("dimpro_users").update({
      full_name: fullName,
      status: "active",
      email_verified_at: new Date().toISOString(),
      phone: phone || null,
      updated_at: new Date().toISOString(),
    }).eq("id", createdUserId)
      .select("id,public_user_code,full_name,email,phone,status,email_verified_at")
      .single();
    if (activated.error) dbError("A központi felhasználó aktiválása sikertelen.", activated.error);

    let organization: DbRow | null = null;
    if (organizationName) {
      const organizations = await client.from("dimpro_organizations")
        .select("id,public_organization_code,display_name,legal_name,status")
        .in("status", ["active", "pending"]);
      if (organizations.error) dbError("A szervezeti adatok nem tölthetők be.", organizations.error);
      const normalizedOrganizationName = organizationName.normalize("NFKC").trim().toLocaleLowerCase("hu-HU");
      organization = ((organizations.data || []).find((row) => {
        const display = text(row.display_name, 180).normalize("NFKC").trim().toLocaleLowerCase("hu-HU");
        const legal = text(row.legal_name, 180).normalize("NFKC").trim().toLocaleLowerCase("hu-HU");
        return display === normalizedOrganizationName || legal === normalizedOrganizationName;
      }) || null) as DbRow | null;
      if (!organization) {
        const organizationCreated = await client.rpc("dimpro_create_organization", {
          p_legal_name: organizationName,
          p_display_name: organizationName,
          p_tax_number: null,
          p_registration_number: null,
          p_email: null,
          p_phone: null,
        });
        if (organizationCreated.error || !organizationCreated.data) dbError("A központi szervezet létrehozása sikertelen.", organizationCreated.error);
        organization = organizationCreated.data as DbRow;
        createdNewOrganization = true;
      }
      createdOrganizationId = normalizeUuid(organization.id);
      if (!createdOrganizationId) throw new DimproIdentityError("A szervezet azonosítója hiányzik.", "DIMPRO_SEND_ORGANIZATION_CREATE_RESPONSE_INVALID", 500);
      const memberships = await client.from("dimpro_organization_memberships")
        .select("id,organization_id,status,is_primary")
        .eq("user_id", createdUserId)
        .neq("status", "revoked");
      if (memberships.error) dbError("A felhasználó szervezeti tagságai nem ellenőrizhetők.", memberships.error);
      const alreadyLinked = (memberships.data || []).some((membership) => membership.organization_id === createdOrganizationId && membership.status === "active");
      if (!alreadyLinked) {
        const hasPrimary = (memberships.data || []).some((membership) => membership.status === "active" && membership.is_primary === true);
        const membership = await client.from("dimpro_organization_memberships").insert({
          user_id: createdUserId,
          organization_id: createdOrganizationId,
          role_code: "send_user",
          role_label: "DIMPRO Send felhasználó",
          status: "active",
          joined_at: new Date().toISOString(),
          is_primary: !hasPrimary,
        });
        if (membership.error) dbError("A felhasználó szervezeti hozzárendelése sikertelen.", membership.error);
      }
    }

    const audit = await client.from("dimpro_access_audit_logs").insert({
      user_id: createdUserId,
      organization_id: createdOrganizationId || null,
      event_type: "send_user_created",
      success: true,
      metadata: {
        source: "identity-send-admin",
        emailVerifiedByAdmin: true,
        organizationLinked: Boolean(createdOrganizationId),
        phoneProvided: Boolean(phone),
        existingUserUpdated: userPreexisting,
      },
    });
    if (audit.error) dbError("A felhasználólétrehozás auditnaplója nem írható.", audit.error);

    return {
      user: activated.data as DbRow,
      organization: organization ? {
        id: createdOrganizationId,
        public_organization_code: organization.public_organization_code,
        display_name: organization.display_name,
        legal_name: organization.legal_name,
      } : null,
    };
  } catch (error) {
    if (createdUserId && !userPreexisting) {
      try { await client.from("dimpro_organization_memberships").delete().eq("user_id", createdUserId); } catch {}
      try { await client.from("dimpro_access_audit_logs").delete().eq("user_id", createdUserId).eq("event_type", "send_user_created"); } catch {}
      try { await client.from("dimpro_users").delete().eq("id", createdUserId); } catch {}
    }
    if (createdNewOrganization && createdOrganizationId) {
      try { await client.from("dimpro_organizations").delete().eq("id", createdOrganizationId); } catch {}
    }
    throw error;
  }
}

export async function createDimproSendEntitlementAdmin(input: Record<string, unknown>) {
  const userId = normalizeUuid(input.userId);
  const licenseId = normalizeUuid(input.licenseId);
  if (!userId || !licenseId) {
    throw new DimproIdentityError("Felhasználó és licenc kiválasztása kötelező.", "DIMPRO_SEND_ADMIN_OWNER_REQUIRED", 400);
  }
  const recipientMode = normalizeRecipientMode(input.recipientMode);
  const maxRecipients = integer(input.maxRecipients, recipientMode === "free_entry" ? 10 : 3, 1, 100);
  const recipients = normalizeRecipients(input.recipients, maxRecipients);
  if (recipientMode === "locked_default" && recipients.length < 1) {
    throw new DimproIdentityError("Zárolt címzettmódhoz alapértelmezett címzett szükséges.", "DIMPRO_SEND_DEFAULT_RECIPIENT_REQUIRED", 400);
  }
  if (recipientMode === "approved_list" && recipients.length < 1) {
    throw new DimproIdentityError("Jóváhagyott címzettmódhoz legalább egy címzett szükséges.", "DIMPRO_SEND_APPROVED_RECIPIENT_REQUIRED", 400);
  }
  if (recipientMode === "locked_default") {
    recipients.forEach((recipient, index) => {
      recipient.isDefault = index === 0;
      recipient.locked = index === 0;
    });
  } else if (recipients.length && !recipients.some((recipient) => recipient.isDefault === true)) {
    recipients[0].isDefault = true;
  }

  const expiresAtRaw = text(input.expiresAt, 80);
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : new Date(Date.now() + 180 * 86_400_000);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw new DimproIdentityError("A Send-jogosultság lejárata csak jövőbeli lehet.", "DIMPRO_SEND_EXPIRY_INVALID", 400);
  }

  const canUseStandardSend = booleanValue(input.canUseStandardSend, true);
  const canUseQuickImageSend = booleanValue(input.canUseQuickImageSend, true);
  const canUseProjectDrop = booleanValue(input.canUseProjectDrop, false);
  if (!canUseStandardSend && !canUseQuickImageSend && !canUseProjectDrop) {
    throw new DimproIdentityError("Legalább egy Send-funkció engedélyezése szükséges.", "DIMPRO_SEND_MODULE_REQUIRED", 400);
  }

  const rawCode = normalizeDimproSendCode(input.sendCode);
  if (!rawCode || !/^[A-Z]{4}-\d{3}-\d{3}$/.test(rawCode)) {
    throw new DimproIdentityError(
      "A Send-kód megadása kötelező, formátuma például: HAGE-123-456.",
      "DIMPRO_SEND_CODE_REQUIRED",
      400,
    );
  }

  const client = getDimproIdentitySupabaseClient();
  const licenseOwner = await client.from("dimpro_licenses")
    .select("owner_type,owner_organization_id")
    .eq("id", licenseId)
    .maybeSingle();
  if (licenseOwner.error) dbError("A Send-licenc tulajdonosa nem ellenőrizhető.", licenseOwner.error);
  const ownerOrganizationId = normalizeUuid((licenseOwner.data as DbRow | null)?.owner_organization_id);
  if ((licenseOwner.data as DbRow | null)?.owner_type === "organization" && ownerOrganizationId) {
    const membership = await client.from("dimpro_organization_memberships")
      .select("id,status,access_ends_at")
      .eq("organization_id", ownerOrganizationId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (membership.error) dbError("A szervezeti tagság nem ellenőrizhető.", membership.error);
    const membershipId = normalizeUuid((membership.data as DbRow | null)?.id);
    const accessEndsAt = (membership.data as DbRow | null)?.access_ends_at;
    if (!membershipId || (accessEndsAt && Date.parse(String(accessEndsAt)) < Date.now())) {
      throw new DimproIdentityError("A felhasználó nem aktív tagja a licenctulajdonos szervezetnek.", "DIMPRO_SEND_ORGANIZATION_MEMBERSHIP_REQUIRED", 403);
    }
    const requestedMembershipModules = [
      canUseStandardSend ? "DROP_SEND" : null,
      canUseQuickImageSend ? "DROP_QUICK_IMAGE_SEND" : null,
      canUseProjectDrop ? "DROP_PROJECT_INBOX" : null,
    ].filter((item): item is string => Boolean(item));
    if (input.grantMembershipModules === true && requestedMembershipModules.length) {
      const licensedModules = await client.from("dimpro_license_modules")
        .select("module_code,enabled,valid_from,valid_until")
        .eq("license_id", licenseId)
        .in("module_code", requestedMembershipModules)
        .eq("enabled", true);
      if (licensedModules.error) dbError("A licenc Send-moduljai nem ellenőrizhetők.", licensedModules.error);
      const nowMs = Date.now();
      const licensed = new Set(((licensedModules.data || []) as DbRow[]).filter((row) => {
        const from = row.valid_from ? Date.parse(String(row.valid_from)) : 0;
        const until = row.valid_until ? Date.parse(String(row.valid_until)) : Number.POSITIVE_INFINITY;
        return (!Number.isFinite(from) || from <= nowMs) && (!Number.isFinite(until) || until >= nowMs);
      }).map((row) => String(row.module_code || "").toUpperCase()));
      const missingFromLicense = requestedMembershipModules.filter((moduleCode) => !licensed.has(moduleCode));
      if (missingFromLicense.length) {
        throw new DimproIdentityError(
          `A szervezeti licenc nem tartalmazza a kért Send-modult: ${missingFromLicense.join(", ")}.`,
          "DIMPRO_SEND_MODULE_NOT_LICENSED",
          403,
        );
      }
      const granted = await client.from("dimpro_membership_modules").upsert(
        requestedMembershipModules.map((moduleCode) => ({
          membership_id: membershipId,
          module_code: moduleCode,
          enabled: true,
          limits: {},
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "membership_id,module_code" },
      );
      if (granted.error) dbError("A kiválasztott Send-modulok nem rendelhetők a felhasználóhoz.", granted.error);
    }
    const membershipModules = await client.from("dimpro_membership_modules")
      .select("module_code")
      .eq("membership_id", membershipId)
      .eq("enabled", true);
    if (membershipModules.error) dbError("A felhasználó szolgáltatásjogai nem ellenőrizhetők.", membershipModules.error);
    const assigned = new Set(((membershipModules.data || []) as DbRow[]).map((row) => String(row.module_code || "").toUpperCase()));
    if (assigned.size > 0) {
      if (canUseStandardSend && !assigned.has("DROP_SEND")) throw new DimproIdentityError("A felhasználó nem kapott DIMPRO Send jogosultságot.", "DIMPRO_MEMBERSHIP_DROP_SEND_NOT_ALLOWED", 403);
      if (canUseQuickImageSend && !assigned.has("DROP_QUICK_IMAGE_SEND")) throw new DimproIdentityError("A felhasználó nem kapott Gyors KépSend jogosultságot.", "DIMPRO_MEMBERSHIP_QUICK_SEND_NOT_ALLOWED", 403);
      if (canUseProjectDrop && !assigned.has("DROP_PROJECT_INBOX")) throw new DimproIdentityError("A felhasználó nem kapott Projekt Drop jogosultságot.", "DIMPRO_MEMBERSHIP_PROJECT_DROP_NOT_ALLOWED", 403);
    }
  }
  const result = await client.rpc("dimpro_admin_create_send_entitlement", {
    p_user_id: userId,
    p_license_id: licenseId,
    p_code_hash: hashDimproSendCode(rawCode),
    p_code_hint: codeHint(rawCode),
    p_expires_at: expiresAt.toISOString(),
    p_recipient_mode: recipientMode,
    p_recipients: recipients,
    p_can_use_standard_send: canUseStandardSend,
    p_can_use_quick_image_send: canUseQuickImageSend,
    p_can_use_image_groups: booleanValue(input.canUseImageGroups, true),
    p_can_use_file_comments: booleanValue(input.canUseFileComments, true),
    p_can_use_project_drop: canUseProjectDrop,
    p_max_recipients: maxRecipients,
    p_max_package_size_bytes: integer(input.maxPackageSizeBytes, 262_144_000, 1, 5_368_709_120),
    p_monthly_send_limit: optionalInteger(input.monthlySendLimit, 1, 1_000_000),
  });
  if (result.error) {
    const source = `${result.error.message || ""} ${result.error.details || ""}`;
    if (result.error.code === "23505" || source.includes("code_hash")) {
      throw new DimproIdentityError(
        "Ez a Send-kód már használatban van. Adjon meg másik kódot.",
        "DIMPRO_SEND_CODE_ALREADY_IN_USE",
        409,
      );
    }
    dbError("A központi Send-jogosultság létrehozása sikertelen.", result.error, result.error.code === "42501" ? 403 : 400);
  }
  const resultRow = result.data as Record<string, unknown>;
  const createdEntitlementId = normalizeUuid(resultRow.entitlementId ?? resultRow.entitlement_id ?? resultRow.id);
  if (createdEntitlementId) {
    const updated = await client.from("dimpro_send_entitlements").update({
      max_saved_contacts: integer(input.maxSavedContacts, 10, 0, 100),
      updated_at: new Date().toISOString(),
    }).eq("id", createdEntitlementId);
    if (updated.error) dbError("A Send-címjegyzék licenckorlátja nem menthető.", updated.error);
  }
  return {
    result: resultRow,
    entitlementId: createdEntitlementId,
    userId,
    licenseId,
    expiresAt: expiresAt.toISOString(),
    rawCode,
    formattedCode: rawCode,
    warning: "A teljes Send-kódot az admin adta meg. Az adatbázis kizárólag HMAC hash-t tárol, a nyers kódot nem.",
  };
}

function sendCodePrefix(value: string) {
  const letters = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
  return (letters || "DIMP").padEnd(4, "X").slice(0, 4);
}

function generateSendCode(prefix: string) {
  const digits = randomInt(0, 1_000_000).toString().padStart(6, "0");
  return `${prefix}-${digits.slice(0, 3)}-${digits.slice(3)}`;
}

export async function getDimproSendCodeDeliveryContextAdmin(entitlementIdInput: unknown) {
  const entitlementId = normalizeUuid(entitlementIdInput);
  if (!entitlementId) throw new DimproIdentityError("A Send entitlement azonosítója hiányzik.", "DIMPRO_SEND_ENTITLEMENT_REQUIRED", 400);
  const client = getDimproIdentitySupabaseClient();
  const entitlement = await client.from("dimpro_send_entitlements")
    .select("id,user_id,license_id,status,expires_at,can_use_standard_send,can_use_quick_image_send,can_use_project_drop")
    .eq("id", entitlementId)
    .maybeSingle();
  if (entitlement.error) dbError("A Send entitlement nem tölthető be.", entitlement.error);
  if (!entitlement.data) throw new DimproIdentityError("A Send entitlement nem található.", "DIMPRO_SEND_ENTITLEMENT_NOT_FOUND", 404);
  const row = entitlement.data as DbRow;
  const userId = normalizeUuid(row.user_id);
  const licenseId = normalizeUuid(row.license_id);
  if (!userId || !licenseId) throw new DimproIdentityError("A Send entitlement tulajdonosi adatai hiányosak.", "DIMPRO_SEND_ENTITLEMENT_OWNER_INVALID", 500);
  const [userResult, licenseResult] = await Promise.all([
    client.from("dimpro_users").select("id,full_name,email,status,email_verified_at").eq("id", userId).maybeSingle(),
    client.from("dimpro_licenses").select("id,public_license_code,owner_type,owner_organization_id").eq("id", licenseId).maybeSingle(),
  ]);
  if (userResult.error) dbError("A Send felhasználó nem tölthető be.", userResult.error);
  if (licenseResult.error) dbError("A Send licenc nem tölthető be.", licenseResult.error);
  const user = userResult.data as DbRow | null;
  const license = licenseResult.data as DbRow | null;
  const recipientEmail = email(user?.email);
  const recipientName = text(user?.full_name, 160);
  if (!user || !recipientEmail || recipientName.length < 2) throw new DimproIdentityError("A Send felhasználó e-mail adata hiányos.", "DIMPRO_SEND_EMAIL_RECIPIENT_INVALID", 409);
  let organizationName = "";
  const organizationId = normalizeUuid(license?.owner_organization_id);
  if (organizationId) {
    const organization = await client.from("dimpro_organizations")
      .select("display_name,legal_name")
      .eq("id", organizationId)
      .maybeSingle();
    if (organization.error) dbError("A Send szervezet neve nem tölthető be.", organization.error);
    organizationName = text((organization.data as DbRow | null)?.display_name, 180) || text((organization.data as DbRow | null)?.legal_name, 180);
  }
  return {
    entitlementId,
    userId,
    licenseId,
    status: String(row.status || ""),
    recipientName,
    recipientEmail,
    organizationName: organizationName || String(license?.public_license_code || "DIMPRO"),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    canUseStandardSend: row.can_use_standard_send === true,
    canUseQuickImageSend: row.can_use_quick_image_send === true,
    canUseProjectDrop: row.can_use_project_drop === true,
  };
}

export async function recordDimproSendCodeDeliveryAuditAdmin(input: {
  entitlementId: string; userId: string; licenseId: string; sent: boolean; messageId?: string; error?: string; trigger: "created" | "rotated";
}) {
  const result = await getDimproIdentitySupabaseClient().from("dimpro_access_audit_logs").insert({
    user_id: input.userId,
    license_id: input.licenseId,
    entitlement_id: input.entitlementId,
    event_type: input.sent ? "send_code_email_sent" : "send_code_email_failed",
    success: input.sent,
    metadata: {
      source: "identity-send-admin",
      trigger: input.trigger,
      messageId: input.messageId || null,
      error: input.error ? input.error.slice(0, 500) : null,
    },
  });
  if (result.error) dbError("A Send-kód e-mail auditnaplója nem írható.", result.error);
}

export async function rotateDimproSendEntitlementCodeAdmin(input: Record<string, unknown>) {
  const entitlementId = normalizeUuid(input.entitlementId);
  if (!entitlementId) throw new DimproIdentityError("A Send entitlement kiválasztása kötelező.", "DIMPRO_SEND_ENTITLEMENT_REQUIRED", 400);
  const context = await getDimproSendCodeDeliveryContextAdmin(entitlementId);
  if (context.status === "revoked") throw new DimproIdentityError("Visszavont Send entitlementhez nem adható új kód.", "DIMPRO_SEND_ENTITLEMENT_REVOKED", 409);
  const client = getDimproIdentitySupabaseClient();
  const prefix = sendCodePrefix(context.organizationName);
  let rawCode = "";
  let updatedRow: DbRow | null = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    rawCode = generateSendCode(prefix);
    const updated = await client.from("dimpro_send_entitlements").update({
      code_hash: hashDimproSendCode(rawCode),
      code_hint: codeHint(rawCode),
      updated_at: new Date().toISOString(),
    }).eq("id", entitlementId).select("id,user_id,license_id,code_hint,status,updated_at").maybeSingle();
    if (!updated.error && updated.data) { updatedRow = updated.data as DbRow; break; }
    const source = `${updated.error?.message || ""} ${updated.error?.details || ""}`;
    if (updated.error?.code === "23505" || source.includes("code_hash")) continue;
    dbError("Az új Send-kód nem menthető.", updated.error);
  }
  if (!updatedRow || !rawCode) throw new DimproIdentityError("Nem sikerült egyedi új Send-kódot létrehozni.", "DIMPRO_SEND_CODE_GENERATION_FAILED", 500);
  const audit = await client.from("dimpro_access_audit_logs").insert({
    user_id: context.userId,
    license_id: context.licenseId,
    entitlement_id: entitlementId,
    event_type: "send_entitlement_code_rotated",
    success: true,
    metadata: { source: "identity-send-admin", codeHint: codeHint(rawCode) },
  });
  if (audit.error) dbError("A Send-kód cseréjének auditnaplója nem írható.", audit.error);
  return {
    ...context,
    result: updatedRow,
    rawCode,
    formattedCode: rawCode,
    warning: "Az előző Send-kód érvényét vesztette. Az adatbázis az új kódból is kizárólag HMAC-lenyomatot tárol.",
  };
}

export async function linkLegacySendCodeAdmin(input: Record<string, unknown>) {
  const legacySendCodeId = text(input.legacySendCodeId, 160);
  const entitlementId = normalizeUuid(input.entitlementId);
  if (!legacySendCodeId || !entitlementId) {
    throw new DimproIdentityError("A legacy Send-kód és a központi entitlement kiválasztása kötelező.", "DIMPRO_LEGACY_LINK_INPUT_INVALID", 400);
  }
  const result = await getDimproIdentitySupabaseClient().rpc("dimpro_admin_link_legacy_send_code", {
    p_legacy_send_code_id: legacySendCodeId,
    p_entitlement_id: entitlementId,
    p_revoke_legacy: input.revokeLegacy !== false,
    p_actor: text(input.actor, 160) || "DIMPRO licencadmin",
  });
  if (result.error) dbError("A legacy Send-kód auditált átvezetése sikertelen.", result.error, 409);
  return result.data as Record<string, unknown>;
}

export async function setDimproSendEntitlementStatusAdmin(input: Record<string, unknown>) {
  const entitlementId = normalizeUuid(input.entitlementId);
  const status = input.status === "active" || input.status === "suspended" || input.status === "revoked"
    ? input.status
    : null;
  if (!entitlementId || !status) {
    throw new DimproIdentityError("Az entitlement és az új állapot kötelező.", "DIMPRO_SEND_STATUS_INPUT_INVALID", 400);
  }
  const now = new Date().toISOString();
  const result = await getDimproIdentitySupabaseClient()
    .from("dimpro_send_entitlements")
    .update({
      status,
      revoked_at: status === "revoked" ? now : null,
      updated_at: now,
    })
    .eq("id", entitlementId)
    .select("id,user_id,license_id,status,updated_at")
    .maybeSingle();
  if (result.error) dbError("A Send-jogosultság állapota nem módosítható.", result.error);
  if (!result.data) throw new DimproIdentityError("A Send-jogosultság nem található.", "DIMPRO_SEND_ENTITLEMENT_NOT_FOUND", 404);
  const row = result.data as DbRow;
  const audit = await getDimproIdentitySupabaseClient().from("dimpro_access_audit_logs").insert({
    user_id: row.user_id,
    license_id: row.license_id,
    entitlement_id: row.id,
    event_type: `send_entitlement_${status}`,
    success: true,
    metadata: { source: "identity-admin-api" },
  });
  if (audit.error) dbError("A Send-jogosultság auditnaplója nem írható.", audit.error);
  return row;
}

const LICENSE_STATUS_VALUES = new Set(["pending", "trial", "active", "expired", "suspended", "revoked"]);
const LICENSE_OWNER_TYPES = new Set(["user", "organization"]);

function normalizeLicenseStatus(value: unknown, fallback = "pending") {
  const normalized = text(value, 40).toLowerCase();
  return LICENSE_STATUS_VALUES.has(normalized) ? normalized : fallback;
}
function normalizePublicLicenseCode(value: unknown) {
  const normalized = text(value, 40).toUpperCase().replace(/\s+/g, "");
  if (!/^LIC-[0-9]{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/.test(normalized)) {
    throw new DimproIdentityError(
      "A licenckód formátuma: LIC-ÉÉ-XXXX-XXXX. Engedélyezett karakterek: 2–9 és A–Z az I, L, O betűk nélkül.",
      "DIMPRO_LICENSE_PUBLIC_CODE_INVALID",
      400,
    );
  }
  return normalized;
}
function normalizeOwnerType(value: unknown) {
  const normalized = text(value, 40).toLowerCase();
  return LICENSE_OWNER_TYPES.has(normalized) ? normalized : "";
}
function optionalIso(value: unknown) {
  const raw = text(value, 80);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new DimproIdentityError("Érvénytelen dátum.", "DIMPRO_LICENSE_DATE_INVALID", 400);
  }
  return parsed.toISOString();
}
function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function normalizeModuleCode(value: unknown) {
  const normalized = text(value, 80).toUpperCase().replace(/[^A-Z0-9_:-]/g, "_");
  return /^[A-Z0-9][A-Z0-9_:-]{1,79}$/.test(normalized) ? normalized : "";
}
function normalizeLicenseModules(value: unknown) {
  if (!Array.isArray(value)) return [] as Array<{
    moduleCode: string;
    enabled: boolean;
    limits: Record<string, unknown>;
    featureFlags: Record<string, unknown>;
    validFrom: string | null;
    validUntil: string | null;
  }>;
  const seen = new Set<string>();
  const result = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const moduleCode = normalizeModuleCode(row.moduleCode ?? row.module_code);
    if (!moduleCode || seen.has(moduleCode)) continue;
    seen.add(moduleCode);
    result.push({
      moduleCode,
      enabled: row.enabled !== false,
      limits: objectValue(row.limits),
      featureFlags: objectValue(row.featureFlags ?? row.feature_flags),
      validFrom: optionalIso(row.validFrom ?? row.valid_from),
      validUntil: optionalIso(row.validUntil ?? row.valid_until),
    });
  }
  return result;
}

async function replaceDimproLicenseModulesAdmin(licenseId: string, modulesInput: unknown) {
  const modules = normalizeLicenseModules(modulesInput);
  const client = getDimproIdentitySupabaseClient();
  const current = await client.from("dimpro_license_modules").select("id,module_code").eq("license_id", licenseId);
  if (current.error) dbError("A licenc moduljai nem tölthetők be.", current.error);
  const requested = new Set(modules.map((module) => module.moduleCode));
  const toDelete = (current.data || []).filter((row) => !requested.has(String(row.module_code))).map((row) => String(row.id));
  if (toDelete.length) {
    const removed = await client.from("dimpro_license_modules").delete().in("id", toDelete);
    if (removed.error) dbError("A licenc moduljainak frissítése sikertelen.", removed.error);
  }
  if (modules.length) {
    const rows = modules.map((module) => ({
      license_id: licenseId,
      module_code: module.moduleCode,
      enabled: module.enabled,
      limits: module.moduleCode === "AI_ASSISTANT"
        ? { ...module.limits, policyVersion: 1, managedBy: "identity-license-center" }
        : module.limits,
      feature_flags: module.featureFlags,
      valid_from: module.validFrom,
      valid_until: module.validUntil,
      updated_at: new Date().toISOString(),
    }));
    const upserted = await client.from("dimpro_license_modules").upsert(rows, { onConflict: "license_id,module_code" });
    if (upserted.error) dbError("A licenc moduljainak mentése sikertelen.", upserted.error);
  }
  return modules;
}


const DIMPRO_AI_MEMBER_FEATURES = [
  "daily_plan",
  "next_step",
  "task_breakdown",
  "waiting_email",
  "meeting_agenda",
  "weekly_summary",
  "decision_support",
  "document_extract",
] as const;
const DIMPRO_AI_MEMBER_SCOPES = ["personal", "hage"] as const;

function normalizeAiMemberList(value: unknown, allowed: readonly string[]) {
  if (!Array.isArray(value)) return [];
  const allow = new Set(allowed);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value) {
    const item = text(raw, 80).toLowerCase();
    if (!item || !allow.has(item) || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

export async function updateDimproMembershipAiPolicyAdmin(input: Record<string, unknown>) {
  const membershipId = normalizeUuid(input.membershipId);
  const licenseId = normalizeUuid(input.licenseId);
  if (!membershipId || !licenseId) {
    throw new DimproIdentityError("A tagsági és licencazonosító kötelező.", "DIMPRO_AI_MEMBER_POLICY_ID_REQUIRED", 400);
  }

  const client = getDimproIdentitySupabaseClient();
  const [membershipResult, licenseResult, licenseAiResult, currentModuleResult] = await Promise.all([
    client.from("dimpro_organization_memberships")
      .select("id,user_id,organization_id,status,access_ends_at")
      .eq("id", membershipId)
      .maybeSingle(),
    client.from("dimpro_licenses")
      .select("id,owner_type,owner_organization_id,status")
      .eq("id", licenseId)
      .maybeSingle(),
    client.from("dimpro_license_modules")
      .select("id,enabled,limits,feature_flags,valid_from,valid_until")
      .eq("license_id", licenseId)
      .eq("module_code", "AI_ASSISTANT")
      .maybeSingle(),
    client.from("dimpro_membership_modules")
      .select("id,enabled,limits")
      .eq("membership_id", membershipId)
      .eq("module_code", "AI_ASSISTANT")
      .maybeSingle(),
  ]);
  for (const result of [membershipResult, licenseResult, licenseAiResult, currentModuleResult]) {
    if (result.error) dbError("A felhasználói AI-policy alapadatai nem tölthetők be.", result.error);
  }
  if (!membershipResult.data) throw new DimproIdentityError("A szervezeti tagság nem található.", "DIMPRO_AI_MEMBER_POLICY_MEMBERSHIP_NOT_FOUND", 404);
  if (!licenseResult.data) throw new DimproIdentityError("A licenc nem található.", "DIMPRO_AI_MEMBER_POLICY_LICENSE_NOT_FOUND", 404);

  const membership = membershipResult.data as DbRow;
  const license = licenseResult.data as DbRow;
  if (String(license.owner_type) !== "organization" || String(license.owner_organization_id || "") !== String(membership.organization_id || "")) {
    throw new DimproIdentityError("A tagság nem ehhez a szervezeti licenchez tartozik.", "DIMPRO_AI_MEMBER_POLICY_LICENSE_MISMATCH", 403);
  }
  if (String(membership.status) === "revoked") {
    throw new DimproIdentityError("Visszavont tagsághoz AI-policy nem módosítható.", "DIMPRO_AI_MEMBER_POLICY_MEMBERSHIP_REVOKED", 409);
  }
  if (!licenseAiResult.data || licenseAiResult.data.enabled === false) {
    throw new DimproIdentityError("Az AI_ASSISTANT modul nincs engedélyezve a licencen.", "DIMPRO_AI_MEMBER_POLICY_LICENSE_AI_DISABLED", 409);
  }

  const currentModule = currentModuleResult.data as DbRow | null;
  const currentLimits = objectValue(currentModule?.limits);
  const licenseFlags = objectValue(licenseAiResult.data.feature_flags);
  const licenseEnabledFeatures = DIMPRO_AI_MEMBER_FEATURES.filter((feature) => licenseFlags[feature] !== false);

  const enabled = input.enabled === undefined ? currentModule?.enabled !== false : booleanValue(input.enabled, true);
  const existingScopes = normalizeAiMemberList(currentLimits.allowedScopes, DIMPRO_AI_MEMBER_SCOPES);
  const allowedScopes = input.allowedScopes === undefined
    ? (existingScopes.length ? existingScopes : [...DIMPRO_AI_MEMBER_SCOPES])
    : normalizeAiMemberList(input.allowedScopes, DIMPRO_AI_MEMBER_SCOPES);
  const existingFeatures = normalizeAiMemberList(currentLimits.allowedFeatures, licenseEnabledFeatures);
  const allowedFeatures = input.allowedFeatures === undefined
    ? (existingFeatures.length ? existingFeatures : [...licenseEnabledFeatures])
    : normalizeAiMemberList(input.allowedFeatures, licenseEnabledFeatures);
  if (enabled && allowedScopes.length === 0) {
    throw new DimproIdentityError("Legalább egy AI munkaterületi scope engedélyezése szükséges.", "DIMPRO_AI_MEMBER_POLICY_SCOPE_REQUIRED", 400);
  }

  const accessExpiresAt = input.accessExpiresAt === undefined
    ? (typeof currentLimits.accessExpiresAt === "string" ? currentLimits.accessExpiresAt : null)
    : optionalIso(input.accessExpiresAt);
  const limits = {
    ...currentLimits,
    policyVersion: 1,
    managedBy: "identity-license-center",
    monthlyBudgetHuf: integer(input.monthlyBudgetHuf, integer(currentLimits.monthlyBudgetHuf, 0, 0, 1_000_000_000), 0, 1_000_000_000),
    maxRequestsPerDay: integer(input.maxRequestsPerDay, integer(currentLimits.maxRequestsPerDay, 0, 0, 1_000_000), 0, 1_000_000),
    maxRequestsPerMonth: integer(input.maxRequestsPerMonth, integer(currentLimits.maxRequestsPerMonth, 0, 0, 10_000_000), 0, 10_000_000),
    accessExpiresAt,
    allowedScopes,
    allowedFeatures,
  };

  const now = new Date().toISOString();
  const upserted = await client.from("dimpro_membership_modules").upsert({
    membership_id: membershipId,
    module_code: "AI_ASSISTANT",
    enabled,
    limits,
    updated_at: now,
  }, { onConflict: "membership_id,module_code" }).select("id,membership_id,module_code,enabled,limits,created_at,updated_at").single();
  if (upserted.error) dbError("A felhasználói AI-policy nem menthető.", upserted.error, 400);

  const audit = await client.from("dimpro_access_audit_logs").insert({
    user_id: membership.user_id || null,
    organization_id: membership.organization_id || null,
    license_id: licenseId,
    event_type: "membership_ai_policy_updated",
    success: true,
    metadata: {
      source: "identity-license-center",
      membershipId,
      enabled,
      scopes: allowedScopes,
      features: allowedFeatures,
      hasMonthlyBudget: Number(limits.monthlyBudgetHuf || 0) > 0,
      accessExpiresAt,
    },
  });
  if (audit.error) dbError("A felhasználói AI-policy auditnaplója nem írható.", audit.error);
  return upserted.data as DbRow;
}

export async function getDimproLicenseCenterOverview() {
  const client = getDimproIdentitySupabaseClient();
  const [users, organizations, memberships, licenses, modules, membershipModules, invitations, entitlements] = await Promise.all([
    client.from("dimpro_users").select("id,public_user_code,full_name,email,status,email_verified_at").order("full_name", { ascending: true }),
    client.from("dimpro_organizations").select("id,public_organization_code,display_name,legal_name,email,status").order("display_name", { ascending: true }),
    client.from("dimpro_organization_memberships").select("id,user_id,organization_id,role_code,role_label,status,joined_at,access_ends_at,is_primary").neq("status", "revoked").order("created_at", { ascending: true }),
    client.from("dimpro_licenses").select("id,public_license_code,owner_type,owner_user_id,owner_organization_id,product_code,plan_code,status,activated_at,expires_at,offline_grace_until,max_users,max_devices,legacy_license_ref,created_at,updated_at").order("created_at", { ascending: false }),
    client.from("dimpro_license_modules").select("id,license_id,module_code,enabled,limits,feature_flags,valid_from,valid_until,created_at,updated_at").order("module_code", { ascending: true }),
    client.from("dimpro_membership_modules").select("id,membership_id,module_code,enabled,limits,created_at,updated_at").order("module_code", { ascending: true }),
    client.from("dimpro_organization_invitations").select("id,organization_id,license_id,membership_id,invited_user_id,email_normalized,full_name,role_code,role_label,token_hint,status,expires_at,accepted_at,revoked_at,created_at,updated_at").order("created_at", { ascending: false }),
    client.from("dimpro_send_entitlements").select("id,user_id,license_id,status,code_hint,expires_at,can_use_standard_send,can_use_quick_image_send,can_use_project_drop,monthly_send_limit,current_month_send_count,last_used_at").order("created_at", { ascending: false }),
  ]);
  for (const result of [users, organizations, memberships, licenses, modules, membershipModules, invitations, entitlements]) {
    if (result.error) dbError("A központi Licencközpont adatai nem tölthetők be.", result.error);
  }
  return {
    users: users.data || [],
    organizations: organizations.data || [],
    organizationMemberships: memberships.data || [],
    licenses: licenses.data || [],
    licenseModules: modules.data || [],
    membershipModules: membershipModules.data || [],
    organizationInvitations: invitations.data || [],
    sendEntitlements: entitlements.data || [],
  };
}

export async function createDimproLicenseAdmin(input: Record<string, unknown>) {
  const ownerType = normalizeOwnerType(input.ownerType);
  const ownerUserId = ownerType === "user" ? normalizeUuid(input.ownerUserId) : "";
  const ownerOrganizationId = ownerType === "organization" ? normalizeUuid(input.ownerOrganizationId) : "";
  if (!ownerType || (ownerType === "user" && !ownerUserId) || (ownerType === "organization" && !ownerOrganizationId)) {
    throw new DimproIdentityError("A licenc tulajdonosának kiválasztása kötelező.", "DIMPRO_LICENSE_OWNER_REQUIRED", 400);
  }
  const productCode = text(input.productCode, 60).toUpperCase().replace(/[^A-Z0-9_-]/g, "_") || "DIMPRO";
  const planCode = text(input.planCode, 80) || null;
  const status = normalizeLicenseStatus(input.status, "active");
  const activatedAt = optionalIso(input.activatedAt) || (status === "active" || status === "trial" ? new Date().toISOString() : null);
  const expiresAt = optionalIso(input.expiresAt);
  if (activatedAt && expiresAt && Date.parse(expiresAt) < Date.parse(activatedAt)) {
    throw new DimproIdentityError("A licenc lejárata nem lehet korábbi az aktiválásnál.", "DIMPRO_LICENSE_DATE_ORDER_INVALID", 400);
  }
  const publicLicenseCode = normalizePublicLicenseCode(input.publicLicenseCode ?? input.public_license_code);
  const client = getDimproIdentitySupabaseClient();
  const created = await client.from("dimpro_licenses").insert({
    public_license_code: publicLicenseCode,
    owner_type: ownerType,
    owner_user_id: ownerUserId || null,
    owner_organization_id: ownerOrganizationId || null,
    product_code: productCode,
    plan_code: planCode,
    status,
    activated_at: activatedAt,
    expires_at: expiresAt,
    max_users: integer(input.maxUsers, ownerType === "organization" ? 5 : 1, 1, 10000),
    max_devices: integer(input.maxDevices, 1, 1, 10000),
    legacy_license_ref: text(input.legacyLicenseRef, 160) || null,
  }).select("*").single();
  if (created.error) {
    const source = `${created.error.message || ""} ${created.error.details || ""}`;
    if (created.error.code === "23505" || source.includes("public_license_code")) {
      throw new DimproIdentityError(
        "Ez a központi DIMPRO licenckód már használatban van. Adjon meg másik kódot.",
        "DIMPRO_LICENSE_PUBLIC_CODE_ALREADY_IN_USE",
        409,
      );
    }
    dbError("A központi licenc létrehozása sikertelen.", created.error, 400);
  }
  const row = created.data as DbRow;
  const licenseId = normalizeUuid(row.id);
  if (!licenseId) throw new DimproIdentityError("A létrehozott licenc azonosítója hiányzik.", "DIMPRO_LICENSE_CREATE_RESPONSE_INVALID", 500);
  const modules = await replaceDimproLicenseModulesAdmin(licenseId, input.modules);
  const audit = await client.from("dimpro_access_audit_logs").insert({
    user_id: ownerUserId || null,
    organization_id: ownerOrganizationId || null,
    license_id: licenseId,
    event_type: "license_created",
    success: true,
    metadata: { source: "identity-license-center", publicLicenseCode, productCode, planCode, status, modules: modules.map((module) => module.moduleCode) },
  });
  if (audit.error) dbError("A licenclétrehozás auditnaplója nem írható.", audit.error);
  return row;
}

export async function updateDimproLicenseAdmin(input: Record<string, unknown>) {
  const licenseId = normalizeUuid(input.licenseId);
  if (!licenseId) throw new DimproIdentityError("A licencazonosító kötelező.", "DIMPRO_LICENSE_ID_REQUIRED", 400);
  const currentResult = await getDimproIdentitySupabaseClient().from("dimpro_licenses").select("*").eq("id", licenseId).maybeSingle();
  if (currentResult.error) dbError("A licenc nem tölthető be.", currentResult.error);
  if (!currentResult.data) throw new DimproIdentityError("A licenc nem található.", "DIMPRO_LICENSE_NOT_FOUND", 404);
  const current = currentResult.data as DbRow;
  const activatedAt = input.activatedAt === undefined ? current.activated_at : optionalIso(input.activatedAt);
  const expiresAt = input.expiresAt === undefined ? current.expires_at : optionalIso(input.expiresAt);
  if (activatedAt && expiresAt && Date.parse(String(expiresAt)) < Date.parse(String(activatedAt))) {
    throw new DimproIdentityError("A licenc lejárata nem lehet korábbi az aktiválásnál.", "DIMPRO_LICENSE_DATE_ORDER_INVALID", 400);
  }
  const nextMaxUsers = input.maxUsers === undefined
    ? Number(current.max_users || 1)
    : integer(input.maxUsers, Number(current.max_users || 1), 1, 10000);
  if (String(current.owner_type) === "organization" && input.maxUsers !== undefined) {
    const seats = await getDimproOrganizationSeatSummary(licenseId);
    if (nextMaxUsers < seats.used) {
      throw new DimproIdentityError(
        `A felhasználói keret nem csökkenthető ${seats.used} alá, mert ennyi aktív/meghívott hely foglalt.`,
        "DIMPRO_LICENSE_USER_SEAT_LIMIT_BELOW_USAGE",
        409,
      );
    }
  }
  const patch = {
    product_code: input.productCode === undefined ? current.product_code : text(input.productCode, 60).toUpperCase().replace(/[^A-Z0-9_-]/g, "_") || "DIMPRO",
    plan_code: input.planCode === undefined ? current.plan_code : text(input.planCode, 80) || null,
    status: input.status === undefined ? current.status : normalizeLicenseStatus(input.status, String(current.status || "pending")),
    activated_at: activatedAt,
    expires_at: expiresAt,
    offline_grace_until: input.offlineGraceUntil === undefined ? current.offline_grace_until : optionalIso(input.offlineGraceUntil),
    max_users: nextMaxUsers,
    max_devices: input.maxDevices === undefined ? current.max_devices : integer(input.maxDevices, Number(current.max_devices || 1), 1, 10000),
    legacy_license_ref: input.legacyLicenseRef === undefined ? current.legacy_license_ref : text(input.legacyLicenseRef, 160) || null,
    updated_at: new Date().toISOString(),
  };
  const updated = await getDimproIdentitySupabaseClient().from("dimpro_licenses").update(patch).eq("id", licenseId).select("*").single();
  if (updated.error) dbError("A központi licenc mentése sikertelen.", updated.error, 400);
  const modules = input.modules === undefined ? null : await replaceDimproLicenseModulesAdmin(licenseId, input.modules);
  const audit = await getDimproIdentitySupabaseClient().from("dimpro_access_audit_logs").insert({
    user_id: current.owner_user_id || null,
    organization_id: current.owner_organization_id || null,
    license_id: licenseId,
    event_type: "license_updated",
    success: true,
    metadata: { source: "identity-license-center", status: patch.status, modules: modules?.map((module) => module.moduleCode) ?? undefined },
  });
  if (audit.error) dbError("A licencmódosítás auditnaplója nem írható.", audit.error);
  return updated.data as DbRow;
}
