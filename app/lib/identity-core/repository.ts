import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  DimproIdentitySchemaHealth,
  DimproProjectCodeVerificationResult,
  DimproSendEntitlement,
  DimproSendProject,
  DimproSendRecipient,
  DimproSendUser,
  DimproSendVerificationResult,
} from "./types";
import { DimproIdentityError } from "./types";
import {
  hashDimproRequestIp,
  hashDimproSendCode,
  isIdentityCoreEnabled,
  normalizeDimproProjectCode,
  normalizeUuid,
  summarizeUserAgent,
} from "./security";

const EXPECTED_SCHEMA = {
  component: "dimpro-identity-core",
  schemaVersion: "0.2.1",
  migrationCount: 5,
  bootstrapId: "dimpro-identity-project-drive-v021-20260816",
} as const;

const REQUIRED_TABLE_CHECKS = [
  "dimpro_users",
  "dimpro_organizations",
  "dimpro_organization_memberships",
  "dimpro_licenses",
  "dimpro_license_modules",
  "dimpro_membership_modules",
  "dimpro_organization_invitations",
  "dimpro_projects",
  "dimpro_project_memberships",
  "dimpro_project_drop_settings",
  "dimpro_send_entitlements",
  "dimpro_send_recipients",
  "dimpro_access_audit_logs",
  "dimpro_access_rate_limits",
] as const;

type DbError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null;

type DbRow = Record<string, unknown>;

let cachedClient: SupabaseClient | null = null;

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableText(value: unknown) {
  const result = text(value).trim();
  return result || null;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as DbRow
    : {};
}

function objectArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is DbRow => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey || serviceRoleKey.includes("<") || serviceRoleKey.includes(">")) {
    throw new DimproIdentityError(
      "A DIMPRO központi adatbázis szerverkapcsolata nincs beállítva.",
      "DIMPRO_IDENTITY_DATABASE_CONFIG_MISSING",
      503,
    );
  }
  return { url, serviceRoleKey };
}

export function getDimproIdentitySupabaseClient() {
  if (cachedClient) return cachedClient;
  const { url, serviceRoleKey } = getSupabaseConfig();
  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "x-client-info": "dimpro-identity-core/0.1.0",
      },
    },
  });
  return cachedClient;
}

function databaseError(message: string, error: DbError): never {
  const source = `${error?.message || ""} ${error?.details || ""}`;
  const known = source.match(/DIMPRO_[A-Z0-9_]+/)?.[0];
  if (known === "DIMPRO_SEND_MONTHLY_LIMIT") {
    throw new DimproIdentityError("A havi küldési keret elfogyott.", known, 429);
  }
  if (known === "DIMPRO_SEND_PACKAGE_SIZE_LIMIT") {
    throw new DimproIdentityError("A küldemény meghaladja az engedélyezett méretet.", known, 413);
  }
  if (known === "DIMPRO_SEND_RECIPIENT_LIMIT") {
    throw new DimproIdentityError("A címzettek száma meghaladja az engedélyezett keretet.", known, 400);
  }
  if (known === "DIMPRO_PROJECT_DROP_NOT_ALLOWED" || error?.code === "42501") {
    throw new DimproIdentityError("A projektkód nem használható.", known || "DIMPRO_ACCESS_DENIED", 403);
  }
  throw new DimproIdentityError(
    message,
    known || error?.code || "DIMPRO_IDENTITY_DATABASE_ERROR",
    500,
  );
}

function assertEnabled() {
  if (!isIdentityCoreEnabled()) {
    throw new DimproIdentityError(
      "A központi DIMPRO azonosító- és licencmag még nincs aktiválva.",
      "DIMPRO_IDENTITY_CORE_DISABLED",
      503,
    );
  }
}

function mapSendProject(row: DbRow): DimproSendProject {
  return {
    id: text(row.id),
    publicCode: text(row.publicCode ?? row.public_code),
    name: text(row.name),
    canUploadToDrop: booleanValue(row.canUploadToDrop ?? row.can_upload_to_drop),
  };
}

function normalizeSendVerification(value: unknown): DimproSendVerificationResult {
  const payload = objectValue(value);
  if (payload.ok !== true) {
    return {
      ok: false,
      error: text(payload.error, "A küldési jogosultságkód nem használható."),
    };
  }

  const user = objectValue(payload.user);
  const entitlement = objectValue(payload.entitlement);
  const defaultRecipientRaw = payload.defaultRecipient ?? payload.default_recipient;
  const defaultRecipient = defaultRecipientRaw ? objectValue(defaultRecipientRaw) : null;
  const projects = objectArray(payload.projects).map(mapSendProject);
  const entitlementId = normalizeUuid(entitlement.id);
  const userId = normalizeUuid(user.id);
  if (!entitlementId || !userId || !text(user.publicCode) || !text(user.fullName) || !text(user.email)) {
    throw new DimproIdentityError(
      "A központi Send-jogosultság válasza hiányos.",
      "DIMPRO_SEND_RESPONSE_INVALID",
      500,
    );
  }

  const recipientMode = text(entitlement.recipientMode);
  if (!["locked_default", "approved_list", "free_entry"].includes(recipientMode)) {
    throw new DimproIdentityError(
      "A központi Send-jogosultság címzettmódja érvénytelen.",
      "DIMPRO_SEND_RECIPIENT_MODE_INVALID",
      500,
    );
  }

  return {
    ok: true,
    user: {
      id: userId,
      publicCode: text(user.publicCode),
      fullName: text(user.fullName),
      email: text(user.email),
      organizationName: nullableText(user.organizationName),
    },
    entitlement: {
      id: entitlementId,
      canUseStandardSend: booleanValue(entitlement.canUseStandardSend),
      canUseQuickImageSend: booleanValue(entitlement.canUseQuickImageSend),
      canUseImageGroups: booleanValue(entitlement.canUseImageGroups),
      canUseFileComments: booleanValue(entitlement.canUseFileComments),
      canUseProjectDrop: booleanValue(entitlement.canUseProjectDrop),
      canUseQuickVoiceNote: false,
      maxQuickVoiceSecondsPerNote: 60,
      recipientMode: recipientMode as "locked_default" | "approved_list" | "free_entry",
      maxRecipients: numberValue(entitlement.maxRecipients, 1),
      maxSavedContacts: numberValue(entitlement.maxSavedContacts, 10),
      uploadRulesAcceptanceCount: numberValue(entitlement.uploadRulesAcceptanceCount, 0),
      uploadRulesVersion: nullableText(entitlement.uploadRulesVersion),
      uploadRulesLastAcceptedAt: nullableText(entitlement.uploadRulesLastAcceptedAt),
      maxPackageSizeBytes: numberValue(entitlement.maxPackageSizeBytes),
      monthlySendLimit: entitlement.monthlySendLimit == null ? null : numberValue(entitlement.monthlySendLimit),
      currentMonthSendCount: numberValue(entitlement.currentMonthSendCount),
    },
    defaultRecipient: defaultRecipient ? {
      id: text(defaultRecipient.id),
      name: text(defaultRecipient.name),
      email: text(defaultRecipient.email),
      organizationName: nullableText(defaultRecipient.organizationName),
      label: nullableText(defaultRecipient.label),
      locked: booleanValue(defaultRecipient.locked),
    } : null,
    projects,
  };
}


function mapSendRecipientRow(row: DbRow): DimproSendRecipient {
  return {
    id: text(row.id),
    name: text(row.recipient_name),
    email: text(row.recipient_email),
    organizationName: nullableText(row.organization_name),
    label: nullableText(row.label),
    locked: booleanValue(row.is_locked),
  };
}

export async function listDimproSendRecipients(entitlementId: string): Promise<DimproSendRecipient[]> {
  assertEnabled();
  const normalizedId = normalizeUuid(entitlementId);
  if (!normalizedId) {
    throw new DimproIdentityError(
      "A DIMPRO Send-jogosultság nem érvényes.",
      "DIMPRO_SEND_ENTITLEMENT_INVALID",
      401,
    );
  }
  const result = await getDimproIdentitySupabaseClient()
    .from("dimpro_send_recipients")
    .select("id,recipient_name,recipient_email,organization_name,label,is_default,is_locked,active,created_at")
    .eq("entitlement_id", normalizedId)
    .eq("active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (result.error) databaseError("A Send-címzettek lekérdezése sikertelen.", result.error);
  return ((result.data || []) as DbRow[]).map(mapSendRecipientRow);
}

export async function getDimproSendContextByEntitlementId(entitlementId: string): Promise<{
  user: DimproSendUser;
  entitlement: DimproSendEntitlement;
  defaultRecipient: DimproSendRecipient | null;
  recipients: DimproSendRecipient[];
  projects: DimproSendProject[];
}> {
  assertEnabled();
  const normalizedId = normalizeUuid(entitlementId);
  if (!normalizedId) {
    throw new DimproIdentityError(
      "A DIMPRO Send-munkamenet nem érvényes.",
      "DIMPRO_SEND_SESSION_INVALID",
      401,
    );
  }

  const client = getDimproIdentitySupabaseClient();
  const entitlementResult = await client
    .from("dimpro_send_entitlements")
    .select("id,user_id,license_id,organization_id,status,valid_from,expires_at,can_use_standard_send,can_use_quick_image_send,can_use_image_groups,can_use_file_comments,can_use_project_drop,recipient_mode,default_recipient_id,max_recipients,max_saved_contacts,upload_rules_acceptance_count,upload_rules_version,upload_rules_last_accepted_at,max_package_size_bytes,monthly_send_limit,current_month_send_count,send_count_month")
    .eq("id", normalizedId)
    .maybeSingle();
  if (entitlementResult.error) databaseError("A Send-jogosultság lekérdezése sikertelen.", entitlementResult.error);
  const entitlementRow = entitlementResult.data as DbRow | null;
  if (!entitlementRow) {
    throw new DimproIdentityError("A DIMPRO Send-jogosultság nem használható.", "DIMPRO_SEND_ENTITLEMENT_NOT_ACTIVE", 403);
  }

  const userId = normalizeUuid(entitlementRow.user_id);
  const licenseId = normalizeUuid(entitlementRow.license_id);
  if (!userId || !licenseId) {
    throw new DimproIdentityError("A központi Send-jogosultság kapcsolatai hiányosak.", "DIMPRO_SEND_RESPONSE_INVALID", 500);
  }

  const [userResult, licenseResult, moduleResult, recipients, projects] = await Promise.all([
    client.from("dimpro_users")
      .select("id,public_user_code,full_name,email,status,email_verified_at")
      .eq("id", userId)
      .maybeSingle(),
    client.from("dimpro_licenses")
      .select("id,owner_organization_id,status,activated_at,expires_at")
      .eq("id", licenseId)
      .maybeSingle(),
    client.from("dimpro_license_modules")
      .select("module_code,enabled,limits,valid_from,valid_until")
      .eq("license_id", licenseId)
      .eq("enabled", true),
    listDimproSendRecipients(normalizedId),
    listDimproAllowedProjects(normalizedId),
  ]);
  if (userResult.error) databaseError("A Send-felhasználó lekérdezése sikertelen.", userResult.error);
  if (licenseResult.error) databaseError("A Send-licenc lekérdezése sikertelen.", licenseResult.error);
  if (moduleResult.error) databaseError("A Send-moduljogosultságok lekérdezése sikertelen.", moduleResult.error);

  const userRow = userResult.data as DbRow | null;
  const licenseRow = licenseResult.data as DbRow | null;
  const now = Date.now();
  const parseOr = (value: unknown, fallback: number) => {
    const parsed = Date.parse(text(value));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const activeEntitlement = text(entitlementRow.status) === "active"
    && parseOr(entitlementRow.valid_from, 0) <= now
    && parseOr(entitlementRow.expires_at, Number.POSITIVE_INFINITY) >= now;
  const activeUser = Boolean(userRow)
    && text(userRow?.status) === "active"
    && Boolean(nullableText(userRow?.email_verified_at));
  const activeLicense = Boolean(licenseRow)
    && ["active", "trial"].includes(text(licenseRow?.status))
    && parseOr(licenseRow?.activated_at, 0) <= now
    && parseOr(licenseRow?.expires_at, Number.POSITIVE_INFINITY) >= now;
  const monthStart = new Date();
  monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const countMonth = parseOr(entitlementRow.send_count_month, 0);
  const monthlyLimit = entitlementRow.monthly_send_limit == null ? null : numberValue(entitlementRow.monthly_send_limit);
  const currentMonthSendCount = countMonth < monthStart.getTime() ? 0 : numberValue(entitlementRow.current_month_send_count);
  const monthlyReady = monthlyLimit == null || currentMonthSendCount < monthlyLimit;
  if (!activeEntitlement || !activeUser || !activeLicense || !monthlyReady) {
    throw new DimproIdentityError("A DIMPRO Send-jogosultság nem használható.", "DIMPRO_SEND_ENTITLEMENT_NOT_ACTIVE", 403);
  }

  const activeModuleRows = ((moduleResult.data || []) as DbRow[])
    .filter((row) => parseOr(row.valid_from, 0) <= now && parseOr(row.valid_until, Number.POSITIVE_INFINITY) >= now);
  const activeModules = new Set(activeModuleRows.map((row) => text(row.module_code).toUpperCase()));
  const ownerOrganizationId = normalizeUuid(licenseRow?.owner_organization_id);
  if (ownerOrganizationId) {
    const membershipResult = await client.from("dimpro_organization_memberships")
      .select("id,status,access_ends_at")
      .eq("organization_id", ownerOrganizationId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (membershipResult.error) databaseError("A Send szervezeti tagsága nem ellenőrizhető.", membershipResult.error);
    const membershipRow = membershipResult.data as DbRow | null;
    const membershipId = normalizeUuid(membershipRow?.id);
    const membershipEnds = parseOr(membershipRow?.access_ends_at, Number.POSITIVE_INFINITY);
    if (!membershipId || membershipEnds < now) {
      throw new DimproIdentityError("A DIMPRO Send szervezeti tagsága nem aktív.", "DIMPRO_SEND_ORGANIZATION_MEMBERSHIP_NOT_ACTIVE", 403);
    }
    const membershipModulesResult = await client.from("dimpro_membership_modules")
      .select("module_code")
      .eq("membership_id", membershipId)
      .eq("enabled", true);
    if (membershipModulesResult.error) databaseError("A Send felhasználói moduljogai nem ellenőrizhetők.", membershipModulesResult.error);
    const assignedModules = new Set(((membershipModulesResult.data || []) as DbRow[]).map((row) => text(row.module_code).toUpperCase()));
    if (assignedModules.size > 0) {
      for (const moduleCode of [...activeModules]) if (!assignedModules.has(moduleCode)) activeModules.delete(moduleCode);
    }
  }
  const quickVoiceModule = activeModuleRows.find((row) => activeModules.has(text(row.module_code).toUpperCase()) && text(row.module_code).toUpperCase() === "DROP_QUICK_VOICE_NOTE") || null;
  const quickVoiceLimits = objectValue(quickVoiceModule?.limits);
  const quickVoiceSecondsPerNote = Math.max(10, Math.min(60, numberValue(quickVoiceLimits.maxSecondsPerNote ?? quickVoiceLimits.max_seconds_per_note, 60)));
  const recipientMode = text(entitlementRow.recipient_mode);
  if (!["locked_default", "approved_list", "free_entry"].includes(recipientMode)) {
    throw new DimproIdentityError("A központi Send-jogosultság címzettmódja érvénytelen.", "DIMPRO_SEND_RECIPIENT_MODE_INVALID", 500);
  }
  const defaultRecipientId = normalizeUuid(entitlementRow.default_recipient_id);
  const defaultRecipient = defaultRecipientId
    ? recipients.find((item) => item.id === defaultRecipientId) || null
    : recipients.find((item) => item.locked) || null;
  if (recipientMode === "locked_default" && !defaultRecipient) {
    throw new DimproIdentityError("A DIMPRO Send-jogosultság alapértelmezett címzettje hiányzik.", "DIMPRO_SEND_DEFAULT_RECIPIENT_MISSING", 409);
  }

  let organizationName: string | null = null;
  const organizationId = normalizeUuid(entitlementRow.organization_id) || ownerOrganizationId;
  if (organizationId) {
    const organizationResult = await client
      .from("dimpro_organizations")
      .select("display_name,legal_name")
      .eq("id", organizationId)
      .maybeSingle();
    if (organizationResult.error) databaseError("A Send-szervezet lekérdezése sikertelen.", organizationResult.error);
    const organizationRow = organizationResult.data as DbRow | null;
    organizationName = nullableText(organizationRow?.display_name) || nullableText(organizationRow?.legal_name);
  }

  return {
    user: {
      id: userId,
      publicCode: text(userRow?.public_user_code),
      fullName: text(userRow?.full_name),
      email: text(userRow?.email),
      organizationName,
    },
    entitlement: {
      id: normalizedId,
      canUseStandardSend: booleanValue(entitlementRow.can_use_standard_send) && activeModules.has("DROP_SEND"),
      canUseQuickImageSend: booleanValue(entitlementRow.can_use_quick_image_send) && activeModules.has("DROP_QUICK_IMAGE_SEND"),
      canUseImageGroups: booleanValue(entitlementRow.can_use_image_groups),
      canUseFileComments: booleanValue(entitlementRow.can_use_file_comments),
      canUseProjectDrop: booleanValue(entitlementRow.can_use_project_drop) && activeModules.has("DROP_PROJECT_INBOX"),
      canUseQuickVoiceNote: activeModules.has("DROP_QUICK_VOICE_NOTE"),
      maxQuickVoiceSecondsPerNote: quickVoiceSecondsPerNote,
      recipientMode: recipientMode as DimproSendEntitlement["recipientMode"],
      maxRecipients: Math.max(1, numberValue(entitlementRow.max_recipients, 1)),
      maxSavedContacts: Math.max(0, numberValue(entitlementRow.max_saved_contacts, 10)),
      uploadRulesAcceptanceCount: Math.max(0, Math.min(3, numberValue(entitlementRow.upload_rules_acceptance_count, 0))),
      uploadRulesVersion: nullableText(entitlementRow.upload_rules_version),
      uploadRulesLastAcceptedAt: nullableText(entitlementRow.upload_rules_last_accepted_at),
      maxPackageSizeBytes: Math.max(1, numberValue(entitlementRow.max_package_size_bytes, 262_144_000)),
      monthlySendLimit: monthlyLimit,
      currentMonthSendCount,
    },
    defaultRecipient,
    recipients,
    projects,
  };
}


function normalizeContactName(value: unknown) {
  return text(value).normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}
function normalizeContactEmail(value: unknown) {
  const normalized = text(value).normalize("NFKC").trim().toLowerCase().slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : "";
}

export async function upsertDimproSendContact(input: {
  entitlementId: string;
  contactId?: string | null;
  name: unknown;
  email: unknown;
  organizationName?: unknown;
  label?: unknown;
}) {
  const context = await getDimproSendContextByEntitlementId(input.entitlementId);
  if (context.entitlement.recipientMode !== "free_entry") {
    throw new DimproIdentityError("A központi címzettlista ehhez a jogosultsághoz csak olvasható.", "DIMPRO_SEND_CONTACT_BOOK_READ_ONLY", 403);
  }
  const name = normalizeContactName(input.name);
  const recipientEmail = normalizeContactEmail(input.email);
  if (name.length < 2 || !recipientEmail) {
    throw new DimproIdentityError("A címjegyzékhez név és érvényes e-mail-cím szükséges.", "DIMPRO_SEND_CONTACT_INVALID", 400);
  }
  const client = getDimproIdentitySupabaseClient();
  const existingByEmail = context.recipients.find((item) => item.email.toLowerCase() === recipientEmail);
  const requestedId = input.contactId ? normalizeUuid(input.contactId) : null;
  const targetId = requestedId || existingByEmail?.id || null;
  if (!targetId && context.recipients.length >= context.entitlement.maxSavedContacts) {
    throw new DimproIdentityError(
      `A címjegyzék elérte a licencben engedélyezett ${context.entitlement.maxSavedContacts} bejegyzéses korlátot.`,
      "DIMPRO_SEND_CONTACT_BOOK_LIMIT",
      409,
    );
  }
  const payload = {
    entitlement_id: context.entitlement.id,
    recipient_name: name,
    recipient_email: recipientEmail,
    organization_name: normalizeContactName(input.organizationName) || null,
    label: normalizeContactName(input.label) || null,
    is_default: false,
    is_locked: false,
    active: true,
    updated_at: new Date().toISOString(),
  };
  const result = targetId
    ? await client.from("dimpro_send_recipients").update(payload).eq("id", targetId).eq("entitlement_id", context.entitlement.id).select("id,recipient_name,recipient_email,organization_name,label,is_locked,active").single()
    : await client.from("dimpro_send_recipients").insert(payload).select("id,recipient_name,recipient_email,organization_name,label,is_locked,active").single();
  if (result.error) databaseError("A Send-címjegyzék bejegyzése nem menthető.", result.error);
  await client.from("dimpro_access_audit_logs").insert({
    user_id: context.user.id,
    entitlement_id: context.entitlement.id,
    event_type: targetId ? "send_contact_updated" : "send_contact_created",
    success: true,
    metadata: { contactId: result.data.id, email: recipientEmail },
  });
  return mapSendRecipientRow(result.data as DbRow);
}

export async function deactivateDimproSendContact(entitlementId: string, contactId: string) {
  const context = await getDimproSendContextByEntitlementId(entitlementId);
  if (context.entitlement.recipientMode !== "free_entry") {
    throw new DimproIdentityError("A központi címzettlista ehhez a jogosultsághoz csak olvasható.", "DIMPRO_SEND_CONTACT_BOOK_READ_ONLY", 403);
  }
  const normalizedContactId = normalizeUuid(contactId);
  if (!normalizedContactId) throw new DimproIdentityError("A címjegyzék-bejegyzés azonosítója érvénytelen.", "DIMPRO_SEND_CONTACT_ID_INVALID", 400);
  const client = getDimproIdentitySupabaseClient();
  const result = await client.from("dimpro_send_recipients")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", normalizedContactId).eq("entitlement_id", context.entitlement.id).eq("is_locked", false)
    .select("id").maybeSingle();
  if (result.error) databaseError("A címjegyzék-bejegyzés nem törölhető.", result.error);
  if (!result.data) throw new DimproIdentityError("A címjegyzék-bejegyzés nem található vagy zárolt.", "DIMPRO_SEND_CONTACT_NOT_FOUND", 404);
  await client.from("dimpro_access_audit_logs").insert({
    user_id: context.user.id,
    entitlement_id: context.entitlement.id,
    event_type: "send_contact_removed",
    success: true,
    metadata: { contactId: normalizedContactId },
  });
  return { id: normalizedContactId, active: false };
}

export async function recordDimproUploadRulesAcceptance(entitlementId: string, rulesVersion: string) {
  const context = await getDimproSendContextByEntitlementId(entitlementId);
  const normalizedVersion = rulesVersion.normalize("NFKC").trim().slice(0, 120);
  if (!normalizedVersion) throw new DimproIdentityError("A feltöltési szabályverzió hiányzik.", "DIMPRO_UPLOAD_RULES_VERSION_REQUIRED", 400);
  const sameVersion = context.entitlement.uploadRulesVersion === normalizedVersion;
  const currentCount = sameVersion ? context.entitlement.uploadRulesAcceptanceCount : 0;
  const nextCount = Math.min(3, currentCount + 1);
  const client = getDimproIdentitySupabaseClient();
  const updated = await client.from("dimpro_send_entitlements").update({
    upload_rules_acceptance_count: nextCount,
    upload_rules_version: normalizedVersion,
    upload_rules_last_accepted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", context.entitlement.id).select("id,upload_rules_acceptance_count,upload_rules_version,upload_rules_last_accepted_at").single();
  if (updated.error) databaseError("A feltöltési szabályelfogadás nem rögzíthető.", updated.error);
  await client.from("dimpro_access_audit_logs").insert({
    user_id: context.user.id,
    entitlement_id: context.entitlement.id,
    event_type: "upload_rules_accepted",
    success: true,
    metadata: { rulesVersion: normalizedVersion, acceptanceCount: nextCount, mandatoryPhaseComplete: nextCount >= 3 },
  });
  return updated.data as DbRow;
}

export async function getDimproIdentitySchemaHealth(): Promise<DimproIdentitySchemaHealth> {
  const client = getDimproIdentitySupabaseClient();
  const markerPromise = client
    .from("dimpro_identity_schema_meta")
    .select("component,schema_version,migration_count,bootstrap_id,metadata,updated_at")
    .eq("component", EXPECTED_SCHEMA.component)
    .maybeSingle();
  const tablePromises = REQUIRED_TABLE_CHECKS.map((table) =>
    // A központi táblák kulcsszerkezete nem egységes: például a
    // dimpro_access_rate_limits összetett elsődleges kulcsot használ, ezért
    // health-checkben nem feltételezhetünk mindenhol `id` oszlopot.
    client.from(table).select("*").limit(0),
  );
  const [markerResult, ...tableResults] = await Promise.all([markerPromise, ...tablePromises]);
  const checks: Record<string, boolean> = {};
  const errors: DimproIdentitySchemaHealth["errors"] = [];
  REQUIRED_TABLE_CHECKS.forEach((table, index) => {
    const result = tableResults[index];
    checks[table] = !result.error;
    if (result.error) {
      errors.push({
        source: table,
        code: result.error.code || null,
        message: result.error.message,
      });
    }
  });
  if (markerResult.error) {
    errors.push({
      source: "dimpro_identity_schema_meta",
      code: markerResult.error.code || null,
      message: markerResult.error.message,
    });
  }

  const row = markerResult.data as DbRow | null;
  const marker = row ? {
    component: text(row.component),
    schemaVersion: text(row.schema_version),
    migrationCount: numberValue(row.migration_count),
    bootstrapId: text(row.bootstrap_id),
    metadata: objectValue(row.metadata),
    updatedAt: text(row.updated_at),
  } : null;
  const ready = !markerResult.error
    && Boolean(marker)
    && marker?.component === EXPECTED_SCHEMA.component
    && marker?.schemaVersion === EXPECTED_SCHEMA.schemaVersion
    && marker?.migrationCount >= EXPECTED_SCHEMA.migrationCount
    && marker?.bootstrapId === EXPECTED_SCHEMA.bootstrapId
    && Object.values(checks).every(Boolean);

  return {
    ready,
    enabled: isIdentityCoreEnabled(),
    marker,
    checks,
    errors,
  };
}

export async function verifyDimproSendEntitlement(
  rawCode: string,
  headers: Headers,
): Promise<DimproSendVerificationResult> {
  assertEnabled();
  const client = getDimproIdentitySupabaseClient();
  const codeHash = hashDimproSendCode(rawCode);
  const ipHash = hashDimproRequestIp(
    headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || headers.get("x-real-ip")
      || headers.get("cf-connecting-ip")
      || "unknown",
  );
  const userAgent = summarizeUserAgent(headers);
  const result = await client.rpc("dimpro_verify_send_entitlement", {
    p_code_hash: codeHash,
    p_ip_hash: ipHash,
    p_user_agent: userAgent,
  });
  if (result.error) databaseError("A küldési jogosultság ellenőrzése sikertelen.", result.error);
  return normalizeSendVerification(result.data);
}

export async function listDimproAllowedProjects(entitlementId: string): Promise<DimproSendProject[]> {
  assertEnabled();
  const normalizedId = normalizeUuid(entitlementId);
  if (!normalizedId) {
    throw new DimproIdentityError(
      "A DIMPRO Send-munkamenet nem érvényes.",
      "DIMPRO_SEND_SESSION_INVALID",
      401,
    );
  }
  const result = await getDimproIdentitySupabaseClient().rpc(
    "dimpro_allowed_projects_for_entitlement",
    { p_entitlement_id: normalizedId },
  );
  if (result.error) databaseError("Az engedélyezett projektek lekérdezése sikertelen.", result.error);
  return objectArray(result.data).map(mapSendProject);
}

export async function verifyDimproProjectCode(
  entitlementId: string,
  rawProjectCode: string,
  headers: Headers,
): Promise<DimproProjectCodeVerificationResult> {
  assertEnabled();
  const normalizedId = normalizeUuid(entitlementId);
  const projectCode = normalizeDimproProjectCode(rawProjectCode);
  if (!normalizedId || !projectCode) {
    return { ok: false, error: "A projektkód nem használható." };
  }
  const ipHash = hashDimproRequestIp(
    headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || headers.get("x-real-ip")
      || headers.get("cf-connecting-ip")
      || "unknown",
  );
  const result = await getDimproIdentitySupabaseClient().rpc("dimpro_verify_project_code", {
    p_entitlement_id: normalizedId,
    p_public_project_code: projectCode,
    p_ip_hash: ipHash,
    p_user_agent: summarizeUserAgent(headers),
  });
  if (result.error) databaseError("A projektkód ellenőrzése sikertelen.", result.error);

  const payload = objectValue(result.data);
  if (payload.ok !== true) {
    return { ok: false, error: "A projektkód nem használható." };
  }
  const project = objectValue(payload.project);
  const destination = objectValue(payload.destination);
  if (!normalizeUuid(project.id) || !text(project.publicCode) || !text(project.name)) {
    throw new DimproIdentityError(
      "A projektkód-ellenőrzés válasza hiányos.",
      "DIMPRO_PROJECT_RESPONSE_INVALID",
      500,
    );
  }
  return {
    ok: true,
    project: {
      id: text(project.id),
      publicCode: text(project.publicCode),
      name: text(project.name),
    },
    destination: {
      type: "project_drop_inbox",
      label: text(destination.label, "Beérkező Drop"),
      driveFolderId: nullableText(destination.driveFolderId),
      preserveGroups: booleanValue(destination.preserveGroups, true),
      requireVirusScan: booleanValue(destination.requireVirusScan, true),
      notifyProjectAdmins: booleanValue(destination.notifyProjectAdmins, true),
    },
  };
}

export async function recordDimproSendCompleted(input: {
  entitlementId: string;
  projectId?: string | null;
  packageSizeBytes: number;
  recipientCount: number;
  metadata?: Record<string, unknown>;
}) {
  assertEnabled();
  const entitlementId = normalizeUuid(input.entitlementId);
  const projectId = input.projectId ? normalizeUuid(input.projectId) : null;
  if (!entitlementId || (input.projectId && !projectId)) {
    throw new DimproIdentityError("A Send-elszámolás azonosítója érvénytelen.", "DIMPRO_SEND_ACCOUNTING_INVALID", 400);
  }
  const result = await getDimproIdentitySupabaseClient().rpc("dimpro_record_send_completed", {
    p_entitlement_id: entitlementId,
    p_project_id: projectId,
    p_package_size_bytes: Math.max(0, Math.floor(input.packageSizeBytes)),
    p_recipient_count: Math.max(1, Math.floor(input.recipientCount)),
    p_metadata: input.metadata || {},
  });
  if (result.error) databaseError("A Send-művelet elszámolása sikertelen.", result.error);
  return objectValue(result.data);
}
