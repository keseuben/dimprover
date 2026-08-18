import { randomBytes } from "node:crypto";
import {
  DROP_REQUIRED_TABLES,
  DROP_SCHEMA_VERSION,
  getDropSchemaSelect,
  type DropRequiredTable,
} from "./dropSchemaContract";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createDropCapabilityToken,
  generateDropPin,
  hashDropPin,
  hashDropToken,
} from "./dropCrypto";
import type {
  DropAccessPurpose,
  DropAccessTokenRecord,
  DropCapabilityLinks,
  DropCreatePackageInput,
  DropCreatedPackage,
  DropFileRecord,
  DropPackageListItem,
  DropPackageRecord,
  DropRawTokens,
  DropRecipientRecord,
} from "./dropTypes";

export class DropRepositoryError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code = "DROP_REPOSITORY_ERROR", status = 500, details?: unknown) {
    super(message);
    this.name = "DropRepositoryError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type DropActor = {
  userId: string;
  organizationId?: string;
  name?: string;
  email?: string;
};

type AccessAttemptInput = {
  packageId?: string | null;
  accessTokenId?: string | null;
  attemptType: "pin" | "token";
  purpose?: DropAccessPurpose | null;
  ipHash: string;
  tokenFingerprint?: string | null;
  success: boolean;
  failureCode?: string | null;
  userAgentSummary?: string | null;
};

export function getDropSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey || serviceKey.includes("<") || serviceKey.includes(">")) {
    throw new DropRepositoryError(
      "A Drop szerveroldali Supabase-kapcsolata nincs beállítva.",
      "DROP_DATABASE_NOT_CONFIGURED",
      503,
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-drop/0.3.3" } },
  });
}

function databaseError(message: string, error: unknown, status = 500): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const missingSchema = candidate?.code === "PGRST205" || candidate?.code === "42P01";
  throw new DropRepositoryError(
    missingSchema
      ? "A DIMPRO Drop ideiglenes Supabase-sémája még nincs alkalmazva."
      : message,
    missingSchema ? "DROP_SCHEMA_NOT_READY" : candidate?.code || "DROP_DATABASE_ERROR",
    missingSchema ? 503 : status,
    candidate ? { message: candidate.message, details: candidate.details, hint: candidate.hint } : undefined,
  );
}

export async function getDropSchemaHealth() {
  try {
    const client = getDropSupabaseClient();
    const checks = await Promise.all(
      DROP_REQUIRED_TABLES.map(async (table) => {
        const { error } = await client
          .from(table)
          .select(getDropSchemaSelect(table as DropRequiredTable))
          .limit(0);
        return {
          table,
          ready: !error,
          errorCode: error?.code || null,
          errorMessage: error?.message || null,
        };
      }),
    );
    const tables = Object.fromEntries(checks.map((check) => [check.table, check.ready])) as Record<DropRequiredTable, boolean>;
    const metaTableReady = tables.drop_schema_meta;
    let schemaVersion = {
      expected: DROP_SCHEMA_VERSION as string,
      actual: null as string | null,
      migrationCount: null as number | null,
      bootstrapId: null as string | null,
      ready: false,
      errorCode: metaTableReady ? null as string | null : "DROP_SCHEMA_VERSION_MARKER_MISSING",
    };

    if (metaTableReady) {
      const { data: marker, error: markerError } = await client
        .from("drop_schema_meta")
        .select("schema_version,migration_count,bootstrap_id")
        .eq("component", "drop-core")
        .maybeSingle();
      if (markerError) {
        schemaVersion = {
          ...schemaVersion,
          errorCode: markerError.code || "DROP_SCHEMA_VERSION_CHECK_FAILED",
        };
      } else {
        const actual = marker?.schema_version ? String(marker.schema_version) : null;
        const migrationCount = marker?.migration_count == null ? null : Number(marker.migration_count);
        const bootstrapId = marker?.bootstrap_id ? String(marker.bootstrap_id) : null;
        const versionReady = actual === DROP_SCHEMA_VERSION && migrationCount === 6;
        schemaVersion = {
          expected: DROP_SCHEMA_VERSION,
          actual,
          migrationCount,
          bootstrapId,
          ready: versionReady,
          errorCode: versionReady ? null : "DROP_SCHEMA_VERSION_MISMATCH",
        };
      }
    }

    const firstError = checks.find((check) => !check.ready);
    const tablesReady = checks.every((check) => check.ready);
    return {
      configured: true,
      ready: tablesReady && schemaVersion.ready,
      tables,
      checks,
      schemaVersion,
      missingTables: checks.filter((check) => !check.ready).map((check) => check.table),
      errorCode: firstError?.errorCode || schemaVersion.errorCode || null,
    };
  } catch (error) {
    const configured = !(error instanceof DropRepositoryError && error.code === "DROP_DATABASE_NOT_CONFIGURED");
    const tables = Object.fromEntries(DROP_REQUIRED_TABLES.map((table) => [table, false])) as Record<DropRequiredTable, boolean>;
    return {
      configured,
      ready: false,
      tables,
      checks: DROP_REQUIRED_TABLES.map((table) => ({
        table,
        ready: false,
        errorCode: error instanceof DropRepositoryError ? error.code : "DROP_DATABASE_ERROR",
        errorMessage: null,
      })),
      schemaVersion: {
        expected: DROP_SCHEMA_VERSION,
        actual: null,
        migrationCount: null,
        bootstrapId: null,
        ready: false,
        errorCode: error instanceof DropRepositoryError ? error.code : "DROP_DATABASE_ERROR",
      },
      missingTables: [...DROP_REQUIRED_TABLES],
      errorCode: error instanceof DropRepositoryError ? error.code : "DROP_DATABASE_ERROR",
    };
  }
}

async function generateUniquePublicCode(client: SupabaseClient) {
  const date = new Date();
  const prefix = `DMP-${String(date.getUTCFullYear()).slice(-2)}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const bytes = randomBytes(6);
    const suffix = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
    const publicCode = `${prefix}-${suffix}`;
    const { data, error } = await client.from("drop_packages").select("id").eq("public_code", publicCode).maybeSingle();
    if (error) databaseError("A csomagkód ellenőrzése sikertelen.", error);
    if (!data) return publicCode;
  }
  throw new DropRepositoryError("Nem sikerült egyedi Drop csomagkódot létrehozni.", "DROP_CODE_GENERATION_FAILED", 500);
}

function buildLinks(rawTokens: DropRawTokens): DropCapabilityLinks {
  const base = (process.env.DROP_PUBLIC_BASE_URL || "https://drop.dimpro.hu").replace(/\/$/, "");
  return {
    upload: `${base}/u/${encodeURIComponent(rawTokens.upload)}`,
    view: `${base}/p/${encodeURIComponent(rawTokens.view)}`,
    download: `${base}/d/${encodeURIComponent(rawTokens.download)}`,
    report: `${base}/report/${encodeURIComponent(rawTokens.report)}`,
  };
}

export async function createDropPackage(
  input: DropCreatePackageInput,
  actor: DropActor,
): Promise<DropCreatedPackage> {
  const client = getDropSupabaseClient();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.retentionDays * 86_400_000);
  const graceExpiresAt = new Date(expiresAt.getTime() + 72 * 3_600_000);
  const pin = input.pin || generateDropPin();
  const { hash: pinHash, salt: pinSalt } = hashDropPin(pin);
  const capabilities = (["upload", "view", "download", "report"] as const).map((purpose) =>
    createDropCapabilityToken(purpose, expiresAt.toISOString()),
  );
  const rawTokens = Object.fromEntries(capabilities.map((token) => [token.purpose, token.rawToken])) as DropRawTokens;

  const recipients = input.recipients.map((recipient) => ({
    name: recipient.name,
    email: recipient.email,
    company: recipient.company || null,
    role: recipient.role || "invitee",
    receive_invitation: recipient.receiveInvitation !== false,
    receive_activity_notifications: recipient.receiveActivityNotifications !== false,
    receive_final_report: recipient.receiveFinalReport !== false,
  }));
  const groups = input.groups.map((group, index) => ({
    name: group.name,
    code: group.code || `group-${index + 1}`,
    description: group.description || null,
    sort_order: group.sortOrder ?? index,
    file_name_prefix: group.fileNamePrefix || null,
    sequence_start: group.sequenceStart ?? 1,
  }));
  const tokens = capabilities.map((token) => ({
    purpose: token.purpose,
    token_hash: token.tokenHash,
    token_hint: token.tokenHint,
    expires_at: token.expiresAt,
  }));

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const publicCode = await generateUniquePublicCode(client);
    const { data, error } = await client.rpc("drop_create_package_atomic", {
      p_package: {
        public_code: publicCode,
        mode: input.mode,
        title: input.title,
        description: input.description,
        project_id: input.projectId || null,
        project_name_snapshot: input.projectName || null,
        owner_user_id: actor.userId,
        organization_id: input.organizationId || actor.organizationId || null,
        created_by_user_id: actor.userId,
        uploader_name: input.uploaderName,
        uploader_email: input.uploaderEmail,
        upload_opens_at: now.toISOString(),
        upload_closes_at: expiresAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        grace_expires_at: graceExpiresAt.toISOString(),
        retention_days: input.retentionDays,
        pin_hash: pinHash,
        pin_salt: pinSalt,
        max_file_count: input.maxFileCount ?? 500,
        max_file_size_bytes: input.maxFileSizeBytes ?? 524_288_000,
        max_total_size_bytes: input.maxTotalSizeBytes ?? 2_147_483_648,
        ...(input.spaceContext ? {
          space_id: input.spaceContext.spaceId,
          created_by_membership_id: input.spaceContext.createdByMembershipId,
          visibility: input.spaceContext.visibility,
          selected_membership_ids: input.spaceContext.selectedMembershipIds,
        } : {}),
      },
      p_recipients: recipients,
      p_groups: groups,
      p_tokens: tokens,
      p_event_payload: {
        actorUserId: actor.userId,
        actorName: actor.name || "Licencadmin",
        actorEmail: actor.email || null,
      },
    });

    if (error) {
      const message = error.message || "";
      const duplicatePublicCode = error.code === "23505"
        && (message.includes("public_code") || message.includes("drop_packages_public_code_key"));
      if (duplicatePublicCode && attempt < 3) continue;
      if (message.includes("DROP_RAW_CREDENTIAL_REJECTED")) {
        throw new DropRepositoryError(
          "A Drop csomag tranzakció nyers hozzáférési adatot utasított el.",
          "DROP_RAW_CREDENTIAL_REJECTED",
          500,
        );
      }
      if (message.includes("DROP_CAPABILITY_SET_INCOMPLETE")) {
        throw new DropRepositoryError(
          "A Drop csomag capability-token készlete hiányos.",
          "DROP_CAPABILITY_SET_INCOMPLETE",
          500,
        );
      }
      const spaceErrors: Record<string, { message: string; status: number }> = {
        DROP_SPACE_CONTEXT_INCOMPLETE: { message: "A Drop tér csomagkörnyezete hiányos.", status: 400 },
        DROP_SPACE_NOT_FOUND: { message: "A Drop tér nem található.", status: 404 },
        DROP_SPACE_NOT_WRITABLE: { message: "A Drop tér jelenleg nem írható.", status: 409 },
        DROP_SPACE_MEMBERSHIP_NOT_ACTIVE: { message: "A csomaglétrehozó tértagság nem aktív.", status: 403 },
        DROP_SPACE_PACKAGE_CREATE_FORBIDDEN: { message: "A tértagsági szerepkör nem hozhat létre csomagot.", status: 403 },
        DROP_SPACE_GUEST_PACKAGE_CREATE_DISABLED: { message: "Ebben a Drop térben a vendégek saját csomagkészítése tiltott.", status: 403 },
        DROP_SPACE_ACCESS_EXPIRED: { message: "A Drop tér vagy a tagság hozzáférése lejárt.", status: 410 },
        DROP_SPACE_PACKAGE_EXCEEDS_ACCESS_END: { message: "A csomag lejárata túlnyúlna a Drop tér hozzáférési idején.", status: 400 },
        DROP_SPACE_PACKAGE_LIMIT_REACHED: { message: "A Drop tér elérte a licenc szerinti csomaglimitet.", status: 409 },
        DROP_SPACE_PROJECT_NOT_LINKED: { message: "A kiválasztott projekt nincs ehhez a Drop térhez rendelve.", status: 403 },
        DROP_SPACE_SELECTED_MEMBER_INVALID: { message: "A kiválasztott tértag azonosítója érvénytelen.", status: 400 },
        DROP_SPACE_SELECTED_MEMBER_NOT_ACTIVE: { message: "A kiválasztott tagok között nem aktív vagy másik térhez tartozó tagság szerepel.", status: 403 },
      };
      const matchedSpaceError = Object.entries(spaceErrors).find(([code]) => message.includes(code));
      if (matchedSpaceError) {
        const [code, details] = matchedSpaceError;
        throw new DropRepositoryError(details.message, code, details.status);
      }
      databaseError("A Drop csomag atomi létrehozása sikertelen.", error);
    }

    if (!data || typeof data !== "object") {
      throw new DropRepositoryError(
        "A Drop csomag létrehozása nem adott vissza csomagadatot.",
        "DROP_PACKAGE_CREATION_EMPTY",
        500,
      );
    }

    return {
      package: data as DropPackageRecord,
      pin,
      rawTokens,
      links: buildLinks(rawTokens),
    };
  }

  throw new DropRepositoryError(
    "Nem sikerült egyedi Drop csomagkódot létrehozni.",
    "DROP_CODE_GENERATION_FAILED",
    500,
  );
}

export async function listDropPackages(limit = 50): Promise<DropPackageListItem[]> {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_packages")
    .select(
      "id,public_code,mode,title,description,project_name_snapshot,uploader_name,uploader_email,status,expires_at,retention_days,created_at,drop_recipients(id),drop_groups(id),drop_access_tokens(id,purpose,status,expires_at,use_count,token_hint)",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(100, Math.max(1, limit)));
  if (error) databaseError("A Drop csomaglista betöltése sikertelen.", error);

  return (data || []).map((row) => {
    const value = row as unknown as Record<string, unknown>;
    const recipients = Array.isArray(value.drop_recipients) ? value.drop_recipients : [];
    const groups = Array.isArray(value.drop_groups) ? value.drop_groups : [];
    const accessTokens = Array.isArray(value.drop_access_tokens) ? value.drop_access_tokens : [];
    return {
      id: String(value.id),
      public_code: String(value.public_code),
      mode: value.mode as DropPackageListItem["mode"],
      title: String(value.title),
      description: String(value.description || ""),
      project_name_snapshot: value.project_name_snapshot ? String(value.project_name_snapshot) : null,
      uploader_name: String(value.uploader_name || ""),
      uploader_email: String(value.uploader_email || ""),
      status: value.status as DropPackageListItem["status"],
      expires_at: String(value.expires_at),
      retention_days: Number(value.retention_days),
      created_at: String(value.created_at),
      recipientCount: recipients.length,
      groupCount: groups.length,
      accessTokens: accessTokens as DropPackageListItem["accessTokens"],
    };
  });
}

export async function findDropPackageByPublicCode(publicCode: string) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.from("drop_packages").select("*").eq("public_code", publicCode).maybeSingle();
  if (error) databaseError("A Drop csomag ellenőrzése sikertelen.", error);
  return (data || null) as DropPackageRecord | null;
}

export async function issueDropAccessToken(
  packageId: string,
  purpose: DropAccessPurpose,
  expiresAt: string,
  source: "package_creation" | "pin_gate" | "admin_reissue",
) {
  const client = getDropSupabaseClient();
  const capability = createDropCapabilityToken(purpose, expiresAt);
  const { data, error } = await client
    .from("drop_access_tokens")
    .insert({
      package_id: packageId,
      purpose,
      token_hash: capability.tokenHash,
      token_hint: capability.tokenHint,
      status: "active",
      expires_at: expiresAt,
      max_uses: null,
      metadata: { source },
    })
    .select("*")
    .single();
  if (error || !data) databaseError("Az ideiglenes Drop hozzáférés létrehozása sikertelen.", error);
  return { capability, record: data as DropAccessTokenRecord };
}

export async function findDropAccessToken(rawToken: string) {
  const client = getDropSupabaseClient();
  const tokenHash = hashDropToken(rawToken);
  const { data, error } = await client
    .from("drop_access_tokens")
    .select("*,drop_packages!inner(*)")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) databaseError("A Drop token ellenőrzése sikertelen.", error);
  if (!data) return null;
  const value = data as unknown as Record<string, unknown>;
  return {
    token: value as unknown as DropAccessTokenRecord,
    package: value.drop_packages as DropPackageRecord,
  };
}

export async function markDropAccessTokenUsed(token: DropAccessTokenRecord) {
  const client = getDropSupabaseClient();
  const { error } = await client.rpc("drop_mark_access_token_used", {
    p_token_id: token.id,
  });
  if (error) {
    const message = error.message || "";
    if (message.includes("DROP_TOKEN_NOT_FOUND")) {
      throw new DropRepositoryError("A Drop token nem található.", "DROP_TOKEN_NOT_FOUND", 404);
    }
    if (message.includes("DROP_TOKEN_UNAVAILABLE")) {
      throw new DropRepositoryError(
        "A Drop token lejárt, vissza lett vonva vagy elérte a használati limitet.",
        "DROP_TOKEN_UNAVAILABLE",
        410,
      );
    }
    databaseError("A Drop token használatának atomi naplózása sikertelen.", error);
  }
}

export async function recordDropAccessAttempt(input: AccessAttemptInput) {
  const client = getDropSupabaseClient();
  const { error } = await client.from("drop_access_attempts").insert({
    package_id: input.packageId || null,
    access_token_id: input.accessTokenId || null,
    attempt_type: input.attemptType,
    purpose: input.purpose || null,
    ip_hash: input.ipHash,
    token_fingerprint: input.tokenFingerprint || null,
    success: input.success,
    failure_code: input.failureCode || null,
    user_agent_summary: input.userAgentSummary || null,
  });
  if (error) databaseError("A Drop hozzáférési próbálkozás naplózása sikertelen.", error);
}

export async function countRecentFailedDropAttempts(filters: {
  ipHash: string;
  packageId?: string | null;
  tokenFingerprint?: string | null;
  attemptType?: "pin" | "token";
  windowMinutes: number;
}) {
  const client = getDropSupabaseClient();
  let query = client
    .from("drop_access_attempts")
    .select("id", { count: "exact", head: true })
    .eq("success", false)
    .eq("ip_hash", filters.ipHash)
    .gte("created_at", new Date(Date.now() - filters.windowMinutes * 60_000).toISOString());
  if (filters.packageId) query = query.eq("package_id", filters.packageId);
  if (filters.tokenFingerprint) query = query.eq("token_fingerprint", filters.tokenFingerprint);
  if (filters.attemptType) query = query.eq("attempt_type", filters.attemptType);
  const { count, error } = await query;
  if (error) databaseError("A Drop rate limit ellenőrzése sikertelen.", error);
  return count || 0;
}

export async function writeDropEvent(input: {
  packageId: string;
  fileId?: string | null;
  recipientId?: string | null;
  eventType: string;
  severity?: "info" | "warning" | "error" | "critical";
  actorName?: string | null;
  actorEmail?: string | null;
  ipHash?: string | null;
  userAgentSummary?: string | null;
  payload?: Record<string, unknown>;
}) {
  const client = getDropSupabaseClient();
  const { error } = await client.from("drop_events").insert({
    package_id: input.packageId,
    file_id: input.fileId || null,
    recipient_id: input.recipientId || null,
    event_type: input.eventType,
    severity: input.severity || "info",
    actor_name: input.actorName || null,
    actor_email: input.actorEmail || null,
    ip_hash: input.ipHash || null,
    user_agent_summary: input.userAgentSummary || null,
    payload: input.payload || {},
  });
  if (error) databaseError("A Drop eseménynapló írása sikertelen.", error);
}

export async function listDropRecipientsForPackage(packageId: string): Promise<DropRecipientRecord[]> {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_recipients")
    .select("*")
    .eq("package_id", packageId)
    .order("created_at", { ascending: true });
  if (error) databaseError("A Drop címzettek betöltése sikertelen.", error);
  return (data || []) as DropRecipientRecord[];
}


export async function listDropPackageMemberNotificationRecipients(packageId: string) {
  const client = getDropSupabaseClient();
  const { data: packageRow, error: packageError } = await client
    .from("drop_packages")
    .select("id,space_id,visibility,created_by_membership_id")
    .eq("id", packageId)
    .maybeSingle();
  if (packageError) databaseError("A Drop csomag térkapcsolata nem tölthető be.", packageError);
  if (!packageRow?.space_id) return [];

  let membershipIds: string[] | null = null;
  if (packageRow.visibility !== "space_members") {
    const { data: accessRows, error: accessError } = await client
      .from("drop_package_members")
      .select("membership_id")
      .eq("package_id", packageId)
      .eq("can_view", true);
    if (accessError) databaseError("A Drop csomag tértagi címzettjei nem tölthetők be.", accessError);
    membershipIds = [...new Set([
      ...(accessRows || []).map((row) => String(row.membership_id)),
      ...(packageRow.created_by_membership_id ? [String(packageRow.created_by_membership_id)] : []),
    ])];
    if (!membershipIds.length) return [];
  }

  let query = client
    .from("drop_space_memberships")
    .select("id,display_name,email")
    .eq("space_id", packageRow.space_id)
    .eq("status", "active");
  if (membershipIds) query = query.in("id", membershipIds);
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) databaseError("A Drop tér aktív e-mail-címzettjei nem tölthetők be.", error);
  return (data || []).map((row) => ({
    membershipId: String(row.id),
    name: String(row.display_name || "Tértag"),
    email: String(row.email || ""),
  }));
}

export async function markDropInvitationSent(input: {
  packageId: string;
  recipientId: string;
  sentAt?: string;
}) {
  const client = getDropSupabaseClient();
  const sentAt = input.sentAt || new Date().toISOString();
  const { data, error } = await client
    .from("drop_recipients")
    .update({ invitation_sent_at: sentAt, updated_at: sentAt })
    .eq("package_id", input.packageId)
    .eq("id", input.recipientId)
    .select("id,invitation_sent_at")
    .maybeSingle();
  if (error) databaseError("A Drop meghívó kiküldési állapotának mentése sikertelen.", error);
  if (!data) {
    throw new DropRepositoryError(
      "A Drop meghívó címzettje nem található.",
      "DROP_RECIPIENT_NOT_FOUND",
      404,
    );
  }
  return data as Pick<DropRecipientRecord, "id" | "invitation_sent_at">;
}

export async function findDropPackageById(packageId: string) {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_packages")
    .select("*")
    .eq("id", packageId)
    .maybeSingle();
  if (error) databaseError("A Drop csomag betöltése sikertelen.", error);
  return (data || null) as DropPackageRecord | null;
}

export async function findDropFileById(fileId: string) {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_files")
    .select("*")
    .eq("id", fileId)
    .maybeSingle();
  if (error) databaseError("A Drop fájl betöltése sikertelen.", error);
  return (data || null) as DropFileRecord | null;
}

export async function transitionDropPackageStatusAtomic(input: {
  packageId: string;
  expectedStatus: DropPackageRecord["status"];
  targetStatus: DropPackageRecord["status"];
  patch: {
    status: DropPackageRecord["status"];
    updated_at: string;
    closed_at?: string | null;
    expired_at?: string | null;
    deleted_at?: string | null;
  };
  eventPayload: Record<string, unknown>;
}) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.rpc("drop_transition_package_status", {
    p_package_id: input.packageId,
    p_expected_status: input.expectedStatus,
    p_target_status: input.targetStatus,
    p_closed_at: input.patch.closed_at || null,
    p_expired_at: input.patch.expired_at || null,
    p_deleted_at: input.patch.deleted_at || null,
    p_event_payload: input.eventPayload,
  });

  if (error) {
    const message = error.message || "";
    if (message.includes("DROP_PACKAGE_NOT_FOUND")) {
      throw new DropRepositoryError("A Drop csomag nem található.", "DROP_PACKAGE_NOT_FOUND", 404);
    }
    if (message.includes("DROP_PACKAGE_STATUS_CONFLICT")) {
      throw new DropRepositoryError(
        "A csomag állapota időközben megváltozott. Frissítse a felületet.",
        "DROP_PACKAGE_STATUS_CONFLICT",
        409,
      );
    }
    if (message.includes("DROP_INVALID_STATUS_TRANSITION")) {
      throw new DropRepositoryError(
        "A kért Drop csomagállapot-váltás nem engedélyezett.",
        "DROP_INVALID_STATUS_TRANSITION",
        409,
      );
    }
    databaseError("A Drop csomag atomi állapotváltása sikertelen.", error);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const packageValue = row?.package_row as DropPackageRecord | undefined;
  if (!packageValue) {
    throw new DropRepositoryError(
      "A Drop csomag atomi állapotváltása nem adott vissza csomagadatot.",
      "DROP_STATUS_TRANSITION_EMPTY",
      500,
    );
  }
  return {
    package: packageValue,
    revokedTokenCount: Number(row?.revoked_token_count || 0),
  };
}

export async function updateDropPackageStatus(
  packageId: string,
  expectedStatus: DropPackageRecord["status"],
  patch: {
    status: DropPackageRecord["status"];
    updated_at: string;
    closed_at?: string | null;
    expired_at?: string | null;
    deleted_at?: string | null;
  },
) {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_packages")
    .update(patch)
    .eq("id", packageId)
    .eq("status", expectedStatus)
    .select("*")
    .maybeSingle();
  if (error) databaseError("A Drop csomag állapotának módosítása sikertelen.", error);
  if (!data) {
    throw new DropRepositoryError(
      "A csomag állapota időközben megváltozott. Frissítse a felületet.",
      "DROP_PACKAGE_STATUS_CONFLICT",
      409,
    );
  }
  return data as DropPackageRecord;
}

export async function revokeActiveDropTokens(
  packageId: string,
  purpose?: DropAccessPurpose,
) {
  const client = getDropSupabaseClient();
  const now = new Date().toISOString();
  let query = client
    .from("drop_access_tokens")
    .update({ status: "revoked", revoked_at: now, updated_at: now })
    .eq("package_id", packageId)
    .eq("status", "active");
  if (purpose) query = query.eq("purpose", purpose);
  const { data, error } = await query.select("id");
  if (error) databaseError("A Drop tokenek visszavonása sikertelen.", error);
  return Array.isArray(data) ? data.length : 0;
}

export async function revokeDropToken(packageId: string, tokenId: string) {
  const client = getDropSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("drop_access_tokens")
    .update({ status: "revoked", revoked_at: now, updated_at: now })
    .eq("package_id", packageId)
    .eq("id", tokenId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error) databaseError("A Drop token visszavonása sikertelen.", error);
  return Boolean(data);
}

export async function reissueDropAccessTokenAtomic(input: {
  packageId: string;
  purpose: DropAccessPurpose;
  expiresAt: string;
  eventPayload: Record<string, unknown>;
}) {
  const client = getDropSupabaseClient();
  const capability = createDropCapabilityToken(input.purpose, input.expiresAt);
  const { data, error } = await client.rpc("drop_reissue_access_token", {
    p_package_id: input.packageId,
    p_purpose: input.purpose,
    p_token_hash: capability.tokenHash,
    p_token_hint: capability.tokenHint,
    p_expires_at: input.expiresAt,
    p_event_payload: input.eventPayload,
  });

  if (error) {
    const message = error.message || "";
    if (message.includes("DROP_PACKAGE_NOT_FOUND")) {
      throw new DropRepositoryError("A Drop csomag nem található.", "DROP_PACKAGE_NOT_FOUND", 404);
    }
    if (message.includes("DROP_INVALID_TOKEN_EXPIRY")) {
      throw new DropRepositoryError("Az új token lejárata érvénytelen.", "DROP_INVALID_TOKEN_EXPIRY", 400);
    }
    if (message.includes("DROP_TOKEN_REISSUE_NOT_ALLOWED")) {
      throw new DropRepositoryError(
        "A csomag jelenlegi állapotában ehhez a művelethez nem adható ki új link.",
        "DROP_TOKEN_REISSUE_NOT_ALLOWED",
        409,
      );
    }
    databaseError("A Drop token atomi újrakiadása sikertelen.", error);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const tokenRow = row?.token_row as DropAccessTokenRecord | undefined;
  if (!tokenRow) {
    throw new DropRepositoryError(
      "A Drop token újrakiadása nem adott vissza tokenadatot.",
      "DROP_TOKEN_REISSUE_EMPTY",
      500,
    );
  }
  return {
    capability,
    record: tokenRow,
    revokedTokenCount: Number(row?.revoked_token_count || 0),
  };
}

export async function revokeDropTokenAtomic(input: {
  packageId: string;
  tokenId: string;
  eventPayload: Record<string, unknown>;
}) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.rpc("drop_revoke_access_token", {
    p_package_id: input.packageId,
    p_token_id: input.tokenId,
    p_event_payload: input.eventPayload,
  });
  if (error) {
    const message = error.message || "";
    if (message.includes("DROP_TOKEN_NOT_ACTIVE")) {
      throw new DropRepositoryError(
        "A token nem található, már vissza lett vonva vagy nem ehhez a csomaghoz tartozik.",
        "DROP_TOKEN_NOT_ACTIVE",
        404,
      );
    }
    databaseError("A Drop token atomi visszavonása sikertelen.", error);
  }
  return Boolean(data);
}
