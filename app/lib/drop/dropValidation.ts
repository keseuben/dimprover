import {
  DROP_ACCESS_PURPOSES,
  DROP_PACKAGE_MODES,
  DROP_PACKAGE_STATUSES,
  type DropAccessPurpose,
  type DropCreatePackageInput,
  type DropGroupInput,
  type DropPackageMode,
  type DropPackageStatus,
  type DropRecipientInput,
  type DropRecipientRole,
} from "./dropTypes";
import { normalizeDropPin } from "./dropCrypto";

export class DropInputError extends Error {
  code = "DROP_INVALID_INPUT";
  status = 400;

  constructor(message: string) {
    super(message);
    this.name = "DropInputError";
  }
}

function text(value: unknown, maxLength: number, fallback = "") {
  return String(value ?? fallback).trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function multilineText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().replace(/\r\n/g, "\n").slice(0, maxLength);
}

function optionalText(value: unknown, maxLength: number) {
  const normalized = text(value, maxLength);
  return normalized || undefined;
}

function positiveInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeEmail(value: unknown) {
  const email = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new DropInputError(`Érvénytelen e-mail-cím: ${email || "üres érték"}`);
  }
  return email;
}

function normalizeMode(value: unknown): DropPackageMode {
  if (DROP_PACKAGE_MODES.includes(value as DropPackageMode)) return value as DropPackageMode;
  throw new DropInputError("Érvénytelen Drop csomagmód.");
}

function normalizeRecipientRole(value: unknown): DropRecipientRole {
  if (value === "uploader" || value === "viewer" || value === "commenter") return value;
  return "invitee";
}

function normalizeRecipient(value: unknown, index: number): DropRecipientInput {
  if (!value || typeof value !== "object") throw new DropInputError(`A(z) ${index + 1}. címzett hibás.`);
  const row = value as Record<string, unknown>;
  const name = text(row.name, 120);
  if (!name) throw new DropInputError(`A(z) ${index + 1}. címzett neve kötelező.`);
  return {
    name,
    email: normalizeEmail(row.email),
    company: optionalText(row.company, 160),
    role: normalizeRecipientRole(row.role),
    receiveInvitation: row.receiveInvitation !== false,
    receiveActivityNotifications: row.receiveActivityNotifications !== false,
    receiveFinalReport: row.receiveFinalReport !== false,
  };
}

function slugifyGroupCode(value: string, fallbackIndex: number) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || `group-${fallbackIndex + 1}`;
}

function normalizeGroup(value: unknown, index: number): DropGroupInput {
  if (!value || typeof value !== "object") throw new DropInputError(`A(z) ${index + 1}. csoport hibás.`);
  const row = value as Record<string, unknown>;
  const name = text(row.name, 120);
  if (!name) throw new DropInputError(`A(z) ${index + 1}. csoport neve kötelező.`);
  return {
    name,
    code: slugifyGroupCode(text(row.code, 60) || name, index),
    description: optionalText(row.description, 500),
    sortOrder: positiveInteger(row.sortOrder, index, 0, 10_000),
    fileNamePrefix: optionalText(row.fileNamePrefix, 80),
    sequenceStart: positiveInteger(row.sequenceStart, 1, 0, 1_000_000),
  };
}

export function parseDropCreatePackageInput(value: unknown): DropCreatePackageInput {
  if (!value || typeof value !== "object") throw new DropInputError("Hiányzó csomagadatok.");
  const input = value as Record<string, unknown>;
  const title = text(input.title, 160);
  const uploaderName = text(input.uploaderName, 120);
  if (!title) throw new DropInputError("A csomag címe kötelező.");
  if (!uploaderName) throw new DropInputError("A feltöltő neve kötelező.");

  const recipientRows = Array.isArray(input.recipients) ? input.recipients : [];
  if (recipientRows.length > 100) throw new DropInputError("Legfeljebb 100 címzett adható meg.");
  const recipients = recipientRows.map(normalizeRecipient);
  const recipientEmails = new Set<string>();
  for (const recipient of recipients) {
    if (recipientEmails.has(recipient.email)) throw new DropInputError(`A(z) ${recipient.email} címzett többször szerepel.`);
    recipientEmails.add(recipient.email);
  }

  const groupRows = Array.isArray(input.groups) ? input.groups : [];
  if (groupRows.length > 100) throw new DropInputError("Legfeljebb 100 csoport adható meg.");
  const groups = groupRows.map(normalizeGroup);
  const groupCodes = new Set<string>();
  for (const group of groups) {
    const code = group.code || "";
    if (groupCodes.has(code)) throw new DropInputError(`A(z) ${code} csoportkód többször szerepel.`);
    groupCodes.add(code);
  }

  const suppliedPin = normalizeDropPin(input.pin);
  if (suppliedPin && suppliedPin.length !== 6) throw new DropInputError("A PIN pontosan hat számjegyből állhat.");

  return {
    mode: normalizeMode(input.mode),
    title,
    description: multilineText(input.description, 2_000),
    projectId: optionalText(input.projectId, 160),
    projectName: optionalText(input.projectName, 240),
    organizationId: optionalText(input.organizationId, 160),
    uploaderName,
    uploaderEmail: normalizeEmail(input.uploaderEmail),
    retentionDays: positiveInteger(input.retentionDays, 7, 1, 30),
    pin: suppliedPin || undefined,
    recipients,
    groups,
    maxFileCount: positiveInteger(input.maxFileCount, 500, 1, 10_000),
    maxFileSizeBytes: positiveInteger(input.maxFileSizeBytes, 262_144_000, 1_048_576, 5_368_709_120),
    maxTotalSizeBytes: positiveInteger(input.maxTotalSizeBytes, 2_147_483_648, 1_048_576, 53_687_091_200),
  };
}

export function normalizeDropPublicCode(value: unknown) {
  return text(value, 40).toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

export function parseDropAccessPurpose(value: unknown, fallback: DropAccessPurpose = "view") {
  return DROP_ACCESS_PURPOSES.includes(value as DropAccessPurpose) ? (value as DropAccessPurpose) : fallback;
}
export function parseDropAccessPurposeStrict(value: unknown) {
  if (!DROP_ACCESS_PURPOSES.includes(value as DropAccessPurpose)) {
    throw new DropInputError("Érvénytelen Drop hozzáférési cél.");
  }
  return value as DropAccessPurpose;
}

export function parseDropPackageStatus(value: unknown) {
  if (!DROP_PACKAGE_STATUSES.includes(value as DropPackageStatus)) {
    throw new DropInputError("Érvénytelen Drop csomagállapot.");
  }
  return value as DropPackageStatus;
}

export function parseDropPackageId(value: unknown) {
  const id = text(value, 80);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new DropInputError("Érvénytelen Drop csomagazonosító.");
  }
  return id;
}
export function parseDropTokenId(value: unknown) {
  const id = text(value, 80);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new DropInputError("Érvénytelen Drop tokenazonosító.");
  }
  return id;
}
