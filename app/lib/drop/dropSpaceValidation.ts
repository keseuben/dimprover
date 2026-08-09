import {
  DROP_SPACE_ACCESS_EXPIRY_MODES,
  type DropCreateSpaceInput,
  type DropSpace,
} from "./dropSpaceTypes";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseIsoDate(value: unknown, fieldName: string, required = false) {
  const clean = cleanText(value, 64);
  if (!clean) {
    if (required) throw new Error(`${fieldName}: kötelező dátum.`);
    return null;
  }
  const date = new Date(clean);
  if (Number.isNaN(date.getTime())) throw new Error(`${fieldName}: érvénytelen dátum.`);
  return date.toISOString();
}

function parsePositiveInteger(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(numberValue)));
}

function createPublicCode() {
  const year = new Date().getUTCFullYear().toString().slice(-2);
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `DSP-${year}-${random}`;
}

export type NormalizedDropCreateSpaceInput = {
  name: string;
  description: string;
  organizationId: string | null;
  ownerLicenseId: string;
  ownerUserId: string | null;
  licenseEndsAt: string;
  accessExpiryMode: DropSpace["accessExpiryMode"];
  accessEndsAt: string | null;
  projectEndsAt: string | null;
  graceEndsAt: string | null;
  maxMembers: number;
  maxPackages: number;
  storageQuotaBytes: number;
  allowGuestPackageCreation: boolean;
  allowGuestInvites: boolean;
};

export function parseDropCreateSpaceInput(input: DropCreateSpaceInput): NormalizedDropCreateSpaceInput {
  const name = cleanText(input.name, 160);
  const ownerLicenseId = cleanText(input.ownerLicenseId, 160);
  if (name.length < 3) throw new Error("A Drop tér neve legalább 3 karakter legyen.");
  if (!ownerLicenseId) throw new Error("A Drop térhez fizető licencet kell rendelni.");

  const mode = cleanText(input.accessExpiryMode, 24) || "license";
  if (!DROP_SPACE_ACCESS_EXPIRY_MODES.includes(mode as DropSpace["accessExpiryMode"])) {
    throw new Error("Ismeretlen Drop tér lejárati mód.");
  }
  const accessExpiryMode = mode as DropSpace["accessExpiryMode"];
  const licenseEndsAt = parseIsoDate(input.licenseEndsAt, "Licenc lejárata", true) as string;
  const accessEndsAt = parseIsoDate(input.accessEndsAt, "Fix hozzáférési lejárat");
  const projectEndsAt = parseIsoDate(input.projectEndsAt, "Projekt vége");
  const graceEndsAt = parseIsoDate(input.graceEndsAt, "Türelmi idő vége");

  if (accessExpiryMode === "fixed" && !accessEndsAt) {
    throw new Error("Fix lejárati módnál hozzáférési lejárat szükséges.");
  }
  if (accessExpiryMode === "project" && !projectEndsAt) {
    throw new Error("Projekt lejárati módnál projekt vége szükséges.");
  }

  const licenseTimestamp = new Date(licenseEndsAt).getTime();
  if (accessEndsAt && new Date(accessEndsAt).getTime() > licenseTimestamp) {
    throw new Error("A Drop tér fix hozzáférése nem nyúlhat túl a fizető licenc lejáratán.");
  }

  return {
    name,
    description: cleanText(input.description, 2000),
    organizationId: cleanText(input.organizationId, 160) || null,
    ownerLicenseId,
    ownerUserId: cleanText(input.ownerUserId, 160) || null,
    licenseEndsAt,
    accessExpiryMode,
    accessEndsAt,
    projectEndsAt,
    graceEndsAt,
    maxMembers: parsePositiveInteger(input.maxMembers, 100, 1, 10_000),
    maxPackages: parsePositiveInteger(input.maxPackages, 1_000, 1, 1_000_000),
    storageQuotaBytes: parsePositiveInteger(input.storageQuotaBytes, 10 * 1024 ** 3, 1_048_576, 10 * 1024 ** 4),
    allowGuestPackageCreation: input.allowGuestPackageCreation !== false,
    allowGuestInvites: input.allowGuestInvites === true,
  };
}

export function buildDropSpacePreview(input: DropCreateSpaceInput) {
  const normalized = parseDropCreateSpaceInput(input);
  const effectiveCandidates = [
    { source: "license" as const, value: normalized.licenseEndsAt },
    ...(normalized.accessExpiryMode === "fixed" && normalized.accessEndsAt
      ? [{ source: "fixed" as const, value: normalized.accessEndsAt }]
      : []),
    ...(normalized.accessExpiryMode === "project" && normalized.projectEndsAt
      ? [{ source: "project" as const, value: normalized.projectEndsAt }]
      : []),
  ].sort((left, right) => new Date(left.value).getTime() - new Date(right.value).getTime());

  return {
    publicCode: createPublicCode(),
    ...normalized,
    effectiveEndsAt: effectiveCandidates[0].value,
    effectiveEndSource: effectiveCandidates[0].source,
    packageModel: "A csomag a Drop téren belüli átadási egység.",
    licenseModel: "A külső tag külön fizetős licenc nélkül, a térgazda licencének keretében dolgozhat.",
    databaseWritesPerformed: false,
  };
}
