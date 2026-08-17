import { randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { createDropSecurityFingerprint, hashDropToken } from "../dropCrypto";
import { getDropSupabaseClient } from "../dropRepository";
import {
  DropPublicRepositoryError,
  formatDropPublicCode,
  getDropPublicDefaults,
  getDropPublicRequestContext,
  normalizeDropDownloadProtection,
  normalizeDropPublicCode,
} from "./dropPublicFileRepository";
import type {
  DropDownloadProtection,
  DropPackageWorkflowRecord,
  DropPublicLimits,
  DropPublicRecipient,
  DropPublicSessionRecord,
  DropPublicWorkflowType,
  DropSendCodeRecord,
  DropSendCodeSafeRecord,
  DropSubmissionGateRecord,
  DropSubmissionGateType,
} from "./dropPublicTypes";
import {
  isCompleteDropSendCode,
} from "./dropSendCodeFormat";

type DbRow = Record<string, unknown>;
type SchemaError = { code?: string | null; message?: string | null; details?: string | null; hint?: string | null } | null;

const SESSION_PREFIX = "dps_";
const SESSION_TTL_MS = 30 * 60_000;
const DEFAULT_PUBLIC_LIMITS: DropPublicLimits = {
  maxFileCount: 50,
  maxFileSizeBytes: 250 * 1024 * 1024,
  maxTotalSizeBytes: 250 * 1024 * 1024,
};
const EXPECTED_SCHEMA = {
  component: "drop-public-workflows",
  version: "DROP 0.9.5",
  migrationCount: 1,
  bootstrapId: "drop-095-public-workflow-store-20260805",
} as const;

const ERROR_MAP: Record<string, { status: number; message: string }> = {
  DROP_PUBLIC_SESSION_INVALID: { status: 401, message: "A publikus Drop munkamenet lejárt vagy nem érvényes." },
  DROP_PUBLIC_SESSION_ALREADY_BOUND: { status: 409, message: "Ezzel a munkamenettel már létrejött egy küldemény." },
  DROP_SEND_CODE_DENIED: { status: 403, message: "A küldési kód hibás, lejárt vagy vissza lett vonva." },
  DROP_SEND_CODE_DAILY_PACKAGE_LIMIT: { status: 429, message: "A küldési kód elérte a napi küldeménylimitet." },
  DROP_SEND_CODE_DAILY_BYTES_LIMIT: { status: 429, message: "A küldési kód elérte a napi adatkeretet." },
  DROP_PUBLIC_WORKFLOW_NOT_FOUND: { status: 404, message: "A küldemény workflow-adata nem található." },
  DROP_PUBLIC_FINALIZE_IN_PROGRESS: { status: 409, message: "A küldemény véglegesítése már folyamatban van." },
  DIMPRO_SEND_ENTITLEMENT_NOT_ACTIVE: { status: 403, message: "A DIMPRO Send-jogosultság már nem használható." },
  DIMPRO_SEND_PACKAGE_SIZE_LIMIT: { status: 413, message: "A küldemény meghaladja a központi Send-jogosultság méretkeretét." },
};

function nowIso() { return new Date().toISOString(); }
function text(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function nullableText(value: unknown) { const result = text(value).trim(); return result || null; }
function numberValue(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function booleanValue(value: unknown, fallback = false) { return typeof value === "boolean" ? value : fallback; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function objectArray<T>(value: unknown) { return Array.isArray(value) ? value.filter((item): item is T => Boolean(item && typeof item === "object")) : []; }
function normalizeText(value: unknown, max = 500) { return typeof value === "string" ? value.replace(/[\r\n\t]+/g, " ").trim().slice(0, max) : ""; }
function normalizeLongText(value: unknown, max: number) { return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, max) : ""; }
function normalizeEmail(value: unknown) { const email = normalizeText(value, 254).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""; }
function normalizeDate(value: unknown, fallback: string) { const parsed = new Date(String(value || "")); return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString(); }
function integer(value: unknown, fallback: number, min: number, max: number) { const parsed = Number(value); return Number.isSafeInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback; }
function codeMaterial(code: string) { return createDropSecurityFingerprint("drop-public-send-code", code); }
function hashCode(code: string, salt = randomBytes(16).toString("hex")) {
  const normalized = normalizeDropPublicCode(code);
  if (!isCompleteDropSendCode(normalized)) throw new DropPublicRepositoryError("A küldési jogosultságkód formátuma érvénytelen.", "DROP_SEND_CODE_INVALID", 400);
  const hash = scryptSync(codeMaterial(normalized), salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex");
  return { hash, salt };
}
function verifyCode(code: string, expectedHash: string, salt: string) {
  try {
    const actual = Buffer.from(hashCode(code, salt).hash, "hex");
    const expected = Buffer.from(expectedHash, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}
function generateCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const letters = Array.from(randomBytes(4), (value) => alphabet[value % alphabet.length]).join("");
  const digits = randomInt(0, 1_000_000).toString().padStart(6, "0");
  return `${letters}${digits}`;
}
function normalizeRecipients(value: unknown, maxRecipients: number): DropPublicRecipient[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, DropPublicRecipient>();
  for (const raw of value.slice(0, maxRecipients * 2)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const email = normalizeEmail(item.email);
    const name = normalizeText(item.name, 160);
    if (!email || !name || unique.has(email)) continue;
    unique.set(email, {
      id: normalizeText(item.id, 100) || `recipient_${randomUUID().slice(0, 12)}`,
      name,
      email,
      label: normalizeText(item.label, 160) || undefined,
      company: normalizeText(item.company, 160) || undefined,
      projectRole: normalizeText(item.projectRole, 160) || undefined,
    });
    if (unique.size >= maxRecipients) break;
  }
  return [...unique.values()];
}
function safeCode(row: DropSendCodeRecord): DropSendCodeSafeRecord {
  const { codeHash: _codeHash, codeSalt: _codeSalt, ...safe } = row;
  void _codeHash; void _codeSalt;
  return safe;
}
function activeStatus(status: string, expiresAt: string) { return status === "active" && Date.parse(expiresAt) > Date.now(); }
function extractKnownCode(error: SchemaError) {
  const source = `${error?.message || ""} ${error?.details || ""}`;
  return source.match(/DROP_[A-Z0-9_]+/)?.[0] || null;
}
function databaseError(message: string, error: SchemaError): never {
  const known = extractKnownCode(error);
  if (known && ERROR_MAP[known]) throw new DropPublicRepositoryError(ERROR_MAP[known].message, known, ERROR_MAP[known].status);
  if (error?.code === "23505") throw new DropPublicRepositoryError("Az adat már létezik a központi DROP workflow-tárban.", "DROP_PUBLIC_DATABASE_DUPLICATE", 409);
  throw new DropPublicRepositoryError(message, error?.code || "DROP_PUBLIC_DATABASE_ERROR", 500);
}

const OPTIONAL_WORKFLOW_COLUMNS = [
  "show_recipients_on_download",
  "export_groups_as_folders",
  "append_group_name_to_filename",
] as const;

function isOptionalWorkflowSchemaError(error: SchemaError) {
  const source = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return OPTIONAL_WORKFLOW_COLUMNS.some((column) => source.includes(column))
    && (error?.code === "42703" || error?.code === "PGRST204" || source.includes("does not exist") || source.includes("schema cache"));
}

function workflowRowForLegacySchema(row: DbRow) {
  const compatible = { ...row };
  for (const column of OPTIONAL_WORKFLOW_COLUMNS) delete compatible[column];
  return compatible;
}

function mapSendCode(row: DbRow): DropSendCodeRecord {
  return {
    id: text(row.id), label: text(row.label), codeHash: text(row.code_hash), codeSalt: text(row.code_salt), codeHint: text(row.code_hint),
    status: text(row.status) as DropSendCodeRecord["status"], expiresAt: text(row.expires_at),
    maxPackagesPerDay: numberValue(row.max_packages_per_day), maxBytesPerDay: numberValue(row.max_bytes_per_day),
    maxRecipients: numberValue(row.max_recipients), defaultRetentionDays: numberValue(row.default_retention_days),
    createdBy: text(row.created_by), createdAt: text(row.created_at), updatedAt: text(row.updated_at), revokedAt: nullableText(row.revoked_at),
  };
}
function mapGate(row: DbRow): DropSubmissionGateRecord {
  return {
    id: text(row.id), slug: text(row.slug), type: text(row.gate_type) as DropSubmissionGateType, title: text(row.title), description: text(row.description),
    status: text(row.status) as DropSubmissionGateRecord["status"], recipients: objectArray<DropPublicRecipient>(row.recipients),
    projectId: nullableText(row.project_id), projectName: nullableText(row.project_name), targetFolder: nullableText(row.target_folder),
    limits: (row.limits && typeof row.limits === "object" ? row.limits : DEFAULT_PUBLIC_LIMITS) as DropPublicLimits,
    retentionDays: numberValue(row.retention_days, 5), requireSenderEmail: booleanValue(row.require_sender_email, true),
    allowPackageComment: booleanValue(row.allow_package_comment, true), allowFileComments: booleanValue(row.allow_file_comments, true),
    downloadProtection: text(row.download_protection, "link_pin") as DropDownloadProtection, expiresAt: text(row.expires_at),
    createdBy: text(row.created_by), createdAt: text(row.created_at), updatedAt: text(row.updated_at), revokedAt: nullableText(row.revoked_at),
  };
}
function mapSession(row: DbRow): DropPublicSessionRecord {
  return {
    id: text(row.id), tokenHash: text(row.token_hash), workflowType: text(row.workflow_type) as DropPublicWorkflowType,
    sendCodeId: nullableText(row.send_code_id), dimproSendEntitlementId: nullableText(row.dimpro_send_entitlement_id), gateId: nullableText(row.gate_id), ipHash: text(row.ip_hash), userAgentSummary: text(row.user_agent_summary),
    expiresAt: text(row.expires_at), packageId: nullableText(row.package_id), createdAt: text(row.created_at), updatedAt: text(row.updated_at), usedAt: nullableText(row.used_at),
  };
}
function mapWorkflow(row: DbRow): DropPackageWorkflowRecord {
  return {
    packageId: text(row.package_id), workflowType: text(row.workflow_type) as DropPackageWorkflowRecord["workflowType"],
    subject: text(row.subject), senderMessage: text(row.sender_message), packageNote: text(row.package_note), requireDownloadPin: booleanValue(row.require_download_pin, true),
    sendCodeId: nullableText(row.send_code_id), dimproSendEntitlementId: nullableText(row.dimpro_send_entitlement_id), gateId: nullableText(row.gate_id), gateType: nullableText(row.gate_type) as DropSubmissionGateType | null,
    projectId: nullableText(row.project_id), projectName: nullableText(row.project_name), dimproProjectId: nullableText(row.dimpro_project_id), projectPublicCode: nullableText(row.project_public_code), targetFolder: nullableText(row.target_folder),
    selectedRecipientIds: stringArray(row.selected_recipient_ids), recipientEmails: stringArray(row.recipient_emails), showRecipientsOnDownload: booleanValue(row.show_recipients_on_download, true), exportGroupsAsFolders: booleanValue(row.export_groups_as_folders, false), appendGroupNameToFilename: booleanValue(row.append_group_name_to_filename, true), finalizedAt: nullableText(row.finalized_at), identityAccountedAt: nullableText(row.identity_accounted_at),
    notificationStatus: text(row.notification_status, "not_requested") as DropPackageWorkflowRecord["notificationStatus"],
    notificationDetail: nullableText(row.notification_detail), downloadLinkHint: nullableText(row.download_link_hint),
    createdAt: text(row.created_at), updatedAt: text(row.updated_at),
  };
}
function workflowRow(input: Omit<DropPackageWorkflowRecord, "createdAt" | "updatedAt"> | DropPackageWorkflowRecord) {
  return {
    package_id: input.packageId, workflow_type: input.workflowType, subject: input.subject || "", sender_message: input.senderMessage || "", package_note: input.packageNote || "",
    require_download_pin: input.requireDownloadPin, send_code_id: input.sendCodeId || null, dimpro_send_entitlement_id: input.dimproSendEntitlementId || null, gate_id: input.gateId || null, gate_type: input.gateType || null,
    project_id: input.projectId || null, project_name: input.projectName || null, dimpro_project_id: input.dimproProjectId || null, project_public_code: input.projectPublicCode || null, target_folder: input.targetFolder || null,
    selected_recipient_ids: input.selectedRecipientIds || [], recipient_emails: input.recipientEmails || [], show_recipients_on_download: input.showRecipientsOnDownload !== false, export_groups_as_folders: input.exportGroupsAsFolders === true, append_group_name_to_filename: input.appendGroupNameToFilename !== false, finalized_at: input.finalizedAt || null, identity_accounted_at: input.identityAccountedAt || null,
    notification_status: input.notificationStatus || "not_requested", notification_detail: input.notificationDetail || null, download_link_hint: input.downloadLinkHint || null,
    updated_at: nowIso(),
  };
}

export async function getDropPublicPostgresSchemaHealth() {
  const client = getDropSupabaseClient();
  const [marker, sendCodes, gates, sessions, workflows, usage] = await Promise.all([
    client.from("drop_schema_meta").select("schema_version,migration_count,bootstrap_id,metadata,updated_at").eq("component", EXPECTED_SCHEMA.component).maybeSingle(),
    client.from("drop_public_send_codes").select("id").limit(0),
    client.from("drop_public_submission_gates").select("id").limit(0),
    client.from("drop_public_sessions").select("id").limit(0),
    client.from("drop_public_package_workflows").select("package_id").limit(0),
    client.from("drop_public_usage").select("id").limit(0),
  ]);
  const errors = [marker.error, sendCodes.error, gates.error, sessions.error, workflows.error, usage.error].filter(Boolean) as SchemaError[];
  const value = marker.data as DbRow | null;
  const metadata = value?.metadata && typeof value.metadata === "object" ? value.metadata as Record<string, unknown> : {};
  const ready = errors.length === 0
    && text(value?.schema_version) === EXPECTED_SCHEMA.version
    && numberValue(value?.migration_count) === EXPECTED_SCHEMA.migrationCount
    && text(value?.bootstrap_id) === EXPECTED_SCHEMA.bootstrapId
    && metadata.postgresStore === true
    && metadata.multiInstanceReady === true;
  return {
    ready,
    marker: value ? {
      schemaVersion: text(value.schema_version),
      migrationCount: numberValue(value.migration_count),
      bootstrapId: text(value.bootstrap_id),
      metadata,
      updatedAt: text(value.updated_at),
    } : null,
    checks: {
      marker: !marker.error && Boolean(value), sendCodes: !sendCodes.error, gates: !gates.error,
      sessions: !sessions.error, workflows: !workflows.error, usage: !usage.error,
    },
    errors: errors.map((error) => ({ code: error?.code || null, message: error?.message || null })),
  };
}

async function cleanupPostgres() {
  const client = getDropSupabaseClient();
  const { error } = await client.rpc("drop_public_cleanup", { p_now: nowIso() });
  if (error) databaseError("A központi DROP workflow-tár karbantartása sikertelen.", error);
}

export async function getDropPublicPostgresStateSafe() {
  await cleanupPostgres();
  const client = getDropSupabaseClient();
  const [codes, gates, sessions, workflows, usage, schema] = await Promise.all([
    client.from("drop_public_send_codes").select("*").order("created_at", { ascending: false }),
    client.from("drop_public_submission_gates").select("*").order("created_at", { ascending: false }),
    client.from("drop_public_sessions").select("id", { count: "exact", head: true }).gt("expires_at", nowIso()),
    client.from("drop_public_package_workflows").select("package_id", { count: "exact", head: true }),
    client.from("drop_public_usage").select("id", { count: "exact", head: true }),
    getDropPublicPostgresSchemaHealth(),
  ]);
  for (const result of [codes, gates, sessions, workflows, usage]) if (result.error) databaseError("A központi DROP workflow-tár olvasása sikertelen.", result.error);
  return {
    version: "DROP_PUBLIC_V095" as const,
    sendCodes: ((codes.data || []) as DbRow[]).map(mapSendCode).map(safeCode),
    gates: ((gates.data || []) as DbRow[]).map(mapGate),
    activeSessions: sessions.count || 0,
    packageWorkflowCount: workflows.count || 0,
    usageCount: usage.count || 0,
    updatedAt: schema.marker?.updatedAt || nowIso(),
  };
}

export async function getDropPublicPostgresCounts() {
  const client = getDropSupabaseClient();
  const results = await Promise.all([
    client.from("drop_public_send_codes").select("id", { count: "exact", head: true }),
    client.from("drop_public_submission_gates").select("id", { count: "exact", head: true }),
    client.from("drop_public_sessions").select("id", { count: "exact", head: true }),
    client.from("drop_public_package_workflows").select("package_id", { count: "exact", head: true }),
    client.from("drop_public_usage").select("id", { count: "exact", head: true }),
  ]);
  for (const result of results) if (result.error) databaseError("A központi DROP workflow-tár számlálása sikertelen.", result.error);
  return { sendCodes: results[0].count || 0, gates: results[1].count || 0, sessions: results[2].count || 0, workflows: results[3].count || 0, usage: results[4].count || 0 };
}

export async function createDropSendCode(input: Record<string, unknown>, actor: string) {
  const rawCode = normalizeDropPublicCode(input.code) || generateCode();
  const label = normalizeText(input.label, 160);
  if (label.length < 2) throw new DropPublicRepositoryError("A küldési kód megnevezése legalább két karakter legyen.", "DROP_SEND_CODE_LABEL_REQUIRED", 400);
  const expiresAt = normalizeDate(input.expiresAt, new Date(Date.now() + 180 * 86_400_000).toISOString());
  if (Date.parse(expiresAt) <= Date.now()) throw new DropPublicRepositoryError("A küldési kód lejárata csak jövőbeli lehet.", "DROP_SEND_CODE_EXPIRY_INVALID", 400);
  await cleanupPostgres();
  const client = getDropSupabaseClient();
  const codeHint = `***-${rawCode.slice(-3)}`;
  const active = await client.from("drop_public_send_codes").select("code_hash,code_salt").eq("status", "active").eq("code_hint", codeHint).gt("expires_at", nowIso()).limit(50);
  if (active.error) databaseError("A küldési kódok ellenőrzése sikertelen.", active.error);
  if (((active.data || []) as DbRow[]).some((row) => verifyCode(rawCode, text(row.code_hash), text(row.code_salt)))) {
    throw new DropPublicRepositoryError("Ez a küldési kód már aktív.", "DROP_SEND_CODE_DUPLICATE", 409);
  }
  const hashed = hashCode(rawCode);
  const now = nowIso();
  const row = {
    id: `sendcode_${randomUUID().slice(0, 12)}`, label, code_hash: hashed.hash, code_salt: hashed.salt,
    code_hint: codeHint, status: "active", expires_at: expiresAt,
    max_packages_per_day: integer(input.maxPackagesPerDay, 10, 1, 100),
    max_bytes_per_day: integer(input.maxBytesPerDay, 2 * 1024 * 1024 * 1024, DEFAULT_PUBLIC_LIMITS.maxTotalSizeBytes, 50 * 1024 * 1024 * 1024),
    max_recipients: integer(input.maxRecipients, 10, 1, 20), default_retention_days: integer(input.defaultRetentionDays, 5, 1, 7),
    created_by: normalizeText(actor, 160) || "DIMPRO admin", created_at: now, updated_at: now, revoked_at: null,
  };
  const created = await client.from("drop_public_send_codes").insert(row).select("*").single();
  if (created.error) databaseError("A küldési kód központi mentése sikertelen.", created.error);
  return { record: safeCode(mapSendCode(created.data as DbRow)), rawCode, formattedCode: formatDropPublicCode(rawCode) };
}

export async function listDropSendCodes() {
  await cleanupPostgres();
  const result = await getDropSupabaseClient().from("drop_public_send_codes").select("*").order("created_at", { ascending: false });
  if (result.error) databaseError("A küldési kódok betöltése sikertelen.", result.error);
  return ((result.data || []) as DbRow[]).map(mapSendCode).map(safeCode);
}

export async function getDropSendCodeById(id: string) {
  const result = await getDropSupabaseClient().from("drop_public_send_codes").select("*").eq("id", id).maybeSingle();
  if (result.error) databaseError("A küldési jogosultság betöltése sikertelen.", result.error);
  if (!result.data) throw new DropPublicRepositoryError("A küldési jogosultság lejárt vagy vissza lett vonva.", "DROP_SEND_CODE_NOT_AVAILABLE", 403);
  const row = mapSendCode(result.data as DbRow);
  if (!activeStatus(row.status, row.expiresAt)) throw new DropPublicRepositoryError("A küldési jogosultság lejárt vagy vissza lett vonva.", "DROP_SEND_CODE_NOT_AVAILABLE", 403);
  return safeCode(row);
}

export async function setDropSendCodeStatus(id: string, status: "active" | "revoked") {
  const now = nowIso();
  const result = await getDropSupabaseClient().from("drop_public_send_codes").update({ status, updated_at: now, revoked_at: status === "revoked" ? now : null }).eq("id", id).select("*").maybeSingle();
  if (result.error) databaseError("A küldési kód módosítása sikertelen.", result.error);
  if (!result.data) throw new DropPublicRepositoryError("A küldési kód nem található.", "DROP_SEND_CODE_NOT_FOUND", 404);
  return safeCode(mapSendCode(result.data as DbRow));
}

export async function verifyDropSendCode(rawCode: unknown) {
  const code = normalizeDropPublicCode(rawCode);
  if (!isCompleteDropSendCode(code)) throw new DropPublicRepositoryError("A DIMPRO Send küldési jogosultságkód megadása kötelező.", "DROP_SEND_CODE_REQUIRED", 400);
  await cleanupPostgres();
  const client = getDropSupabaseClient();
  const codeHint = `***-${code.slice(-3)}`;
  const codes = await client.from("drop_public_send_codes").select("*").eq("status", "active").eq("code_hint", codeHint).gt("expires_at", nowIso()).limit(50);
  if (codes.error) databaseError("A küldési kód ellenőrzése sikertelen.", codes.error);
  const row = ((codes.data || []) as DbRow[]).map(mapSendCode).find((item) => verifyCode(code, item.codeHash, item.codeSalt));
  if (!row) throw new DropPublicRepositoryError("A küldési kód hibás, lejárt vagy vissza lett vonva.", "DROP_SEND_CODE_DENIED", 403);
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const usage = await client.from("drop_public_usage").select("reserved_bytes").eq("send_code_id", row.id).gte("created_at", dayStart.toISOString());
  if (usage.error) databaseError("A küldési kód napi keretének ellenőrzése sikertelen.", usage.error);
  const items = (usage.data || []) as DbRow[];
  if (items.length >= row.maxPackagesPerDay) throw new DropPublicRepositoryError("A küldési kód elérte a napi küldeménylimitet.", "DROP_SEND_CODE_DAILY_PACKAGE_LIMIT", 429);
  const usedBytes = items.reduce((sum, item) => sum + numberValue(item.reserved_bytes), 0);
  if (usedBytes + DEFAULT_PUBLIC_LIMITS.maxTotalSizeBytes > row.maxBytesPerDay) throw new DropPublicRepositoryError("A küldési kód elérte a napi adatkeretet.", "DROP_SEND_CODE_DAILY_BYTES_LIMIT", 429);
  return safeCode(row);
}

export async function createDropSubmissionGate(input: Record<string, unknown>, actor: string) {
  const type = (["personal", "project", "organization"] as const).includes(input.type as DropSubmissionGateType)
    ? input.type as DropSubmissionGateType : "personal";
  const title = normalizeText(input.title, 200);
  if (title.length < 3) throw new DropPublicRepositoryError("A Beküldőkapu címe legalább három karakter legyen.", "DROP_GATE_TITLE_REQUIRED", 400);
  const recipients = normalizeRecipients(input.recipients, 30);
  if (!recipients.length) throw new DropPublicRepositoryError("A Beküldőkapuhoz legalább egy címzett szükséges.", "DROP_GATE_RECIPIENT_REQUIRED", 400);
  if (type !== "organization" && recipients.length !== 1) throw new DropPublicRepositoryError("Személyes vagy projektkapunál pontosan egy előre rögzített címzett szükséges.", "DROP_GATE_SINGLE_RECIPIENT_REQUIRED", 400);
  const expiresAt = normalizeDate(input.expiresAt, new Date(Date.now() + 90 * 86_400_000).toISOString());
  if (Date.parse(expiresAt) <= Date.now()) throw new DropPublicRepositoryError("A Beküldőkapu lejárata csak jövőbeli lehet.", "DROP_GATE_EXPIRY_INVALID", 400);
  const requestedSlug = normalizeText(input.slug, 100).toLowerCase().replace(/[^a-z0-9áéíóöőúüű-]+/gi, "-").replace(/^-+|-+$/g, "");
  const client = getDropSupabaseClient();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? (requestedSlug || `${type}-${randomBytes(5).toString("hex")}`) : `${requestedSlug || type}-${randomBytes(3).toString("hex")}`;
    const now = nowIso();
    const result = await client.from("drop_public_submission_gates").insert({
      id: `gate_${randomUUID().slice(0, 12)}`, slug, gate_type: type, title,
      description: normalizeLongText(input.description, 2_000), status: "active", recipients,
      project_id: normalizeText(input.projectId, 160) || null, project_name: normalizeText(input.projectName, 240) || null,
      target_folder: normalizeText(input.targetFolder, 500) || null, limits: { ...DEFAULT_PUBLIC_LIMITS },
      retention_days: integer(input.retentionDays, 5, 1, 7), require_sender_email: true,
      allow_package_comment: input.allowPackageComment !== false, allow_file_comments: input.allowFileComments !== false,
      download_protection: input.downloadProtection === "link" ? "link" : "link_pin", expires_at: expiresAt,
      created_by: normalizeText(actor, 160) || "DIMPRO admin", created_at: now, updated_at: now, revoked_at: null,
    }).select("*").single();
    if (!result.error) return mapGate(result.data as DbRow);
    if (result.error.code !== "23505" || attempt === 4) databaseError("A Beküldőkapu központi mentése sikertelen.", result.error);
  }
  throw new DropPublicRepositoryError("A Beküldőkapu URL-azonosítója nem képezhető.", "DROP_GATE_SLUG_CONFLICT", 409);
}

export async function listDropSubmissionGates() {
  await cleanupPostgres();
  const result = await getDropSupabaseClient().from("drop_public_submission_gates").select("*").order("created_at", { ascending: false });
  if (result.error) databaseError("A Beküldőkapuk betöltése sikertelen.", result.error);
  return ((result.data || []) as DbRow[]).map(mapGate);
}

export async function getDropSubmissionGateBySlug(slug: string) {
  const result = await getDropSupabaseClient().from("drop_public_submission_gates").select("*").eq("slug", slug).maybeSingle();
  if (result.error) databaseError("A Beküldőkapu betöltése sikertelen.", result.error);
  if (!result.data) throw new DropPublicRepositoryError("A Beküldőkapu nem található, lejárt vagy lezárt.", "DROP_GATE_NOT_AVAILABLE", 404);
  const row = mapGate(result.data as DbRow);
  if (!activeStatus(row.status, row.expiresAt)) throw new DropPublicRepositoryError("A Beküldőkapu nem található, lejárt vagy lezárt.", "DROP_GATE_NOT_AVAILABLE", 404);
  return row;
}

export async function getDropSubmissionGateById(id: string) {
  const result = await getDropSupabaseClient().from("drop_public_submission_gates").select("*").eq("id", id).maybeSingle();
  if (result.error) databaseError("A Beküldőkapu betöltése sikertelen.", result.error);
  if (!result.data) throw new DropPublicRepositoryError("A Beküldőkapu lejárt vagy lezárt.", "DROP_GATE_NOT_AVAILABLE", 404);
  const row = mapGate(result.data as DbRow);
  if (!activeStatus(row.status, row.expiresAt)) throw new DropPublicRepositoryError("A Beküldőkapu lejárt vagy lezárt.", "DROP_GATE_NOT_AVAILABLE", 404);
  return row;
}

export async function setDropSubmissionGateStatus(id: string, status: "active" | "revoked") {
  const now = nowIso();
  const result = await getDropSupabaseClient().from("drop_public_submission_gates").update({ status, updated_at: now, revoked_at: status === "revoked" ? now : null }).eq("id", id).select("*").maybeSingle();
  if (result.error) databaseError("A Beküldőkapu módosítása sikertelen.", result.error);
  if (!result.data) throw new DropPublicRepositoryError("A Beküldőkapu nem található.", "DROP_GATE_NOT_FOUND", 404);
  return mapGate(result.data as DbRow);
}

export async function createDropPublicSession(input: { workflowType: DropPublicWorkflowType; sendCodeId?: string | null; dimproSendEntitlementId?: string | null; gateId?: string | null; headers: Headers }) {
  const rawToken = `${SESSION_PREFIX}${randomBytes(32).toString("base64url")}`;
  const context = getDropPublicRequestContext(input.headers);
  const now = nowIso();
  const result = await getDropSupabaseClient().from("drop_public_sessions").insert({
    id: `publicsession_${randomUUID().slice(0, 12)}`, token_hash: hashDropToken(rawToken), workflow_type: input.workflowType,
    send_code_id: input.sendCodeId || null, dimpro_send_entitlement_id: input.dimproSendEntitlementId || null, gate_id: input.gateId || null, ip_hash: context.ipHash, user_agent_summary: context.userAgentSummary,
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(), package_id: null, created_at: now, updated_at: now, used_at: null,
  }).select("*").single();
  if (result.error) databaseError("A publikus Drop munkamenet központi létrehozása sikertelen.", result.error);
  return { rawToken, record: mapSession(result.data as DbRow) };
}

export async function resolveDropPublicSession(rawToken: string, headers: Headers, expected?: DropPublicWorkflowType, allowBoundContextRebind = false) {
  if (!rawToken.startsWith(SESSION_PREFIX) || rawToken.length < 30) throw new DropPublicRepositoryError("A publikus Drop munkamenet hiányzik.", "DROP_PUBLIC_SESSION_REQUIRED", 401);
  const client = getDropSupabaseClient();
  const result = await client.from("drop_public_sessions").select("*").eq("token_hash", hashDropToken(rawToken)).gt("expires_at", nowIso()).maybeSingle();
  if (result.error) databaseError("A publikus Drop munkamenet ellenőrzése sikertelen.", result.error);
  if (!result.data) throw new DropPublicRepositoryError("A publikus Drop munkamenet lejárt vagy nem érvényes.", "DROP_PUBLIC_SESSION_INVALID", 401);
  let session = mapSession(result.data as DbRow);
  if (expected && session.workflowType !== expected) throw new DropPublicRepositoryError("A munkamenet nem ehhez a művelethez tartozik.", "DROP_PUBLIC_SESSION_PURPOSE_MISMATCH", 403);
  const context = getDropPublicRequestContext(headers);
  if (session.ipHash !== context.ipHash) {
    if (!allowBoundContextRebind || !session.packageId || session.userAgentSummary !== context.userAgentSummary) {
      throw new DropPublicRepositoryError("A publikus Drop munkamenet hálózati környezete megváltozott.", "DROP_PUBLIC_SESSION_CONTEXT_CHANGED", 401);
    }
    const rebound = await client.from("drop_public_sessions").update({ ip_hash: context.ipHash, updated_at: nowIso() }).eq("id", session.id).eq("package_id", session.packageId).select("*").single();
    if (rebound.error) databaseError("A mobil Drop munkamenet hálózati újrakötése sikertelen.", rebound.error);
    session = mapSession(rebound.data as DbRow);
  }
  return session;
}

export async function bindDropPublicSessionPackage(rawToken: string, packageId: string, reservedBytes: number) {
  const result = await getDropSupabaseClient().rpc("drop_public_bind_session_package_atomic", {
    p_token_hash: hashDropToken(rawToken), p_package_id: packageId, p_reserved_bytes: Math.max(0, Math.floor(reservedBytes)),
  });
  if (result.error) databaseError("A publikus munkamenet és a küldemény összekapcsolása sikertelen.", result.error);
  const value = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!value || typeof value !== "object") throw new DropPublicRepositoryError("A publikus munkamenet összekapcsolása nem adott eredményt.", "DROP_PUBLIC_BIND_RESULT_INVALID", 500);
  return mapSession(value as DbRow);
}

export async function saveDropPackageWorkflow(input: Omit<DropPackageWorkflowRecord, "createdAt" | "updatedAt">) {
  const now = nowIso();
  const row: DbRow = { ...workflowRow(input), created_at: now, updated_at: now };
  const client = getDropSupabaseClient();
  let result = await client.from("drop_public_package_workflows").upsert(row, { onConflict: "package_id" }).select("*").single();
  if (result.error && isOptionalWorkflowSchemaError(result.error)) {
    result = await client.from("drop_public_package_workflows").upsert(workflowRowForLegacySchema(row), { onConflict: "package_id" }).select("*").single();
  }
  if (result.error) databaseError("A küldemény workflow-adatainak központi mentése sikertelen.", result.error);
  return mapWorkflow(result.data as DbRow);
}

export async function getDropPackageWorkflow(packageId: string) {
  const result = await getDropSupabaseClient().from("drop_public_package_workflows").select("*").eq("package_id", packageId).maybeSingle();
  if (result.error) databaseError("A küldemény workflow-adatainak betöltése sikertelen.", result.error);
  return result.data ? mapWorkflow(result.data as DbRow) : null;
}

export async function updateDropPackageWorkflow(packageId: string, patch: Partial<DropPackageWorkflowRecord>) {
  const current = await getDropPackageWorkflow(packageId);
  if (!current) throw new DropPublicRepositoryError("A küldemény workflow-adata nem található.", "DROP_PUBLIC_WORKFLOW_NOT_FOUND", 404);
  const next: DropPackageWorkflowRecord = { ...current, ...patch, packageId, updatedAt: nowIso() };
  const row: DbRow = workflowRow(next);
  const client = getDropSupabaseClient();
  let result = await client.from("drop_public_package_workflows").update(row).eq("package_id", packageId).select("*").single();
  if (result.error && isOptionalWorkflowSchemaError(result.error)) {
    result = await client.from("drop_public_package_workflows").update(workflowRowForLegacySchema(row)).eq("package_id", packageId).select("*").single();
  }
  if (result.error) databaseError("A küldemény workflow-adatainak módosítása sikertelen.", result.error);
  return mapWorkflow(result.data as DbRow);
}

export async function claimDropPackageFinalization(packageId: string) {
  const result = await getDropSupabaseClient().rpc("drop_public_claim_finalization_atomic", { p_package_id: packageId });
  if (result.error) databaseError("A küldemény véglegesítési zárása sikertelen.", result.error);
  const payload = result.data as { state?: unknown; workflow?: unknown } | null;
  if (!payload || (payload.state !== "claimed" && payload.state !== "finalized") || !payload.workflow || typeof payload.workflow !== "object") {
    throw new DropPublicRepositoryError("A véglegesítési zár érvénytelen eredményt adott.", "DROP_PUBLIC_FINALIZE_RESULT_INVALID", 500);
  }
  return { state: payload.state, workflow: mapWorkflow(payload.workflow as DbRow) } as { state: "claimed" | "finalized"; workflow: DropPackageWorkflowRecord };
}

export async function recordDropIdentityAccountingAtomic(packageId: string, metadata: Record<string, unknown> = {}) {
  const result = await getDropSupabaseClient().rpc("drop_public_record_identity_accounting_atomic", {
    p_package_id: packageId,
    p_metadata: metadata,
  });
  if (result.error) databaseError("A központi DIMPRO Send-elszámolás sikertelen.", result.error);
  return result.data as Record<string, unknown>;
}

export async function importDropPublicFileStateToPostgres(state: unknown) {
  const result = await getDropSupabaseClient().rpc("drop_public_import_file_state_atomic", { p_state: state });
  if (result.error) databaseError("A fájltár központi PostgreSQL-importja sikertelen.", result.error);
  return result.data as Record<string, number>;
}

export async function activateDropPublicPostgresStore(reason: string, counts: Record<string, number>) {
  const result = await getDropSupabaseClient().rpc("drop_public_activate_postgres_store", { p_reason: reason, p_counts: counts });
  if (result.error) databaseError("A központi PostgreSQL workflow-tár aktiválása sikertelen.", result.error);
  return result.data as Record<string, unknown>;
}

export { getDropPublicDefaults, normalizeDropDownloadProtection };
