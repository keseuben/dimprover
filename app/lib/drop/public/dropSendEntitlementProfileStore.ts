import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { readLicenseStore } from "@/app/lib/license/store";
import type {
  DropPublicRecipient,
  DropSendEntitlementProfile,
  DropSendRecipientMode,
} from "./dropPublicTypes";

const STORE_VERSION = "DROP_SEND_ENTITLEMENTS_V101" as const;
function projectRoot() {
  const configured = process.env.DIMPRO_PROJECT_ROOT?.trim();
  if (configured) return path.resolve(configured);
  const cwd = process.cwd();
  const standaloneSuffix = path.join(".next", "standalone");
  return cwd.endsWith(standaloneSuffix) ? path.resolve(cwd, "..", "..") : cwd;
}
const dataRoot = process.env.DROP_SEND_ENTITLEMENT_DATA_DIR?.trim()
  ? path.resolve(process.env.DROP_SEND_ENTITLEMENT_DATA_DIR.trim())
  : path.join(projectRoot(), ".data", "dimpro-drop-send-entitlements-v101");
const storePath = path.join(dataRoot, "profiles.json");

type EntitlementStore = {
  version: typeof STORE_VERSION;
  profiles: DropSendEntitlementProfile[];
  updatedAt: string;
};

let mutationQueue: Promise<unknown> = Promise.resolve();

function nowIso() { return new Date().toISOString(); }
function cleanText(value: unknown, max: number) {
  return typeof value === "string"
    ? value.normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}
function cleanEmail(value: unknown) {
  const email = cleanText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}
function recipientMode(value: unknown): DropSendRecipientMode {
  return value === "approved_list" || value === "free_entry" ? value : "locked_default";
}
function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}
function licenseHint(value: string) {
  const compact = value.replace(/\s+/g, "");
  return compact.length > 8 ? `••••-${compact.slice(-4)}` : "••••";
}
function normalizeRecipient(value: unknown, fallbackLabel = "Címzett"): DropPublicRecipient | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const email = cleanEmail(raw.email);
  if (!email) return null;
  return {
    id: cleanText(raw.id, 100) || `recipient_${randomUUID().slice(0, 12)}`,
    name: cleanText(raw.name, 160) || fallbackLabel,
    email,
    label: cleanText(raw.label, 160) || undefined,
    company: cleanText(raw.company, 160) || undefined,
    projectRole: cleanText(raw.projectRole, 160) || undefined,
  };
}
function normalizeRecipients(value: unknown, max = 20) {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, DropPublicRecipient>();
  for (const item of value.slice(0, max * 2)) {
    const recipient = normalizeRecipient(item);
    if (!recipient || unique.has(recipient.email)) continue;
    unique.set(recipient.email, recipient);
    if (unique.size >= max) break;
  }
  return [...unique.values()];
}

async function ensureRoot() {
  await mkdir(dataRoot, { recursive: true, mode: 0o700 });
  await chmod(dataRoot, 0o700).catch(() => undefined);
}
async function readStore(): Promise<EntitlementStore> {
  await ensureRoot();
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8")) as Partial<EntitlementStore>;
    if (parsed.version !== STORE_VERSION || !Array.isArray(parsed.profiles)) throw new Error("store version mismatch");
    return { version: STORE_VERSION, profiles: parsed.profiles, updatedAt: parsed.updatedAt || nowIso() };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
    return { version: STORE_VERSION, profiles: [], updatedAt: nowIso() };
  }
}
async function writeStore(store: EntitlementStore) {
  await ensureRoot();
  store.updatedAt = nowIso();
  const temporary = `${storePath}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, storePath);
  await chmod(storePath, 0o600).catch(() => undefined);
}
async function mutate<T>(work: (store: EntitlementStore) => Promise<T> | T): Promise<T> {
  const next = mutationQueue.then(async () => {
    const store = await readStore();
    const result = await work(store);
    await writeStore(store);
    return result;
  });
  mutationQueue = next.catch(() => undefined);
  return next;
}

export async function normalizeDropSendEntitlementProfileInput(sendCodeId: string, input: Record<string, unknown>) {
  const licenseId = cleanText(input.licenseId, 120);
  const licenseStore = await readLicenseStore();
  const license = licenseStore.licenses.find((item) => item.id === licenseId);
  if (!license) throw Object.assign(new Error("A kiválasztott DIMPRO licenc nem található."), { code: "DROP_SEND_LICENSE_NOT_FOUND", status: 400 });
  const active = (license.status === "active" || license.status === "trial") && Date.parse(license.expiresAt) > Date.now();
  if (!active) throw Object.assign(new Error("A kiválasztott DIMPRO licenc nem aktív."), { code: "DROP_SEND_LICENSE_INACTIVE", status: 409 });

  const userFullName = cleanText(input.userFullName, 160);
  const userEmail = cleanEmail(input.userEmail);
  if (userFullName.length < 2) throw Object.assign(new Error("A Send-felhasználó neve kötelező."), { code: "DROP_SEND_USER_NAME_REQUIRED", status: 400 });
  if (!userEmail) throw Object.assign(new Error("Érvényes regisztrációs e-mail-cím szükséges."), { code: "DROP_SEND_USER_EMAIL_REQUIRED", status: 400 });

  const mode = recipientMode(input.recipientMode);
  const defaultRecipient = normalizeRecipient(input.defaultRecipient, "Alapértelmezett címzett");
  const approvedRecipients = normalizeRecipients(input.approvedRecipients);
  if (mode === "locked_default" && !defaultRecipient) {
    throw Object.assign(new Error("Zárolt címzettkezeléshez alapértelmezett címzett szükséges."), { code: "DROP_SEND_DEFAULT_RECIPIENT_REQUIRED", status: 400 });
  }
  if (mode === "approved_list" && !approvedRecipients.length && !defaultRecipient) {
    throw Object.assign(new Error("Jóváhagyott listás működéshez legalább egy címzett szükséges."), { code: "DROP_SEND_APPROVED_RECIPIENT_REQUIRED", status: 400 });
  }

  const now = nowIso();
  const profile: DropSendEntitlementProfile = {
    sendCodeId,
    licenseId: license.id,
    licenseKeyHint: licenseHint(license.licenseKey),
    userFullName,
    userEmail,
    organizationName: cleanText(input.organizationName, 180) || license.companyName || null,
    phone: cleanText(input.phone, 60) || null,
    recipientMode: mode,
    defaultRecipient,
    approvedRecipients: defaultRecipient && !approvedRecipients.some((item) => item.email === defaultRecipient.email)
      ? [defaultRecipient, ...approvedRecipients]
      : approvedRecipients,
    canUseStandardSend: booleanValue(input.canUseStandardSend, true),
    canUseQuickImageSend: booleanValue(input.canUseQuickImageSend, true),
    canUseImageGroups: booleanValue(input.canUseImageGroups, true),
    canUseFileComments: booleanValue(input.canUseFileComments, true),
    canUseProjectDrop: booleanValue(input.canUseProjectDrop, false),
    createdAt: now,
    updatedAt: now,
  };
  return profile;
}

export async function saveDropSendEntitlementProfile(profile: DropSendEntitlementProfile) {
  return mutate((store) => {
    const index = store.profiles.findIndex((item) => item.sendCodeId === profile.sendCodeId);
    if (index >= 0) {
      profile.createdAt = store.profiles[index].createdAt;
      profile.updatedAt = nowIso();
      store.profiles[index] = profile;
    } else {
      store.profiles.unshift(profile);
    }
    return profile;
  });
}

export async function getDropSendEntitlementProfile(sendCodeId: string) {
  const store = await readStore();
  return store.profiles.find((item) => item.sendCodeId === sendCodeId) || null;
}

export async function listDropSendEntitlementProfiles() {
  const store = await readStore();
  return store.profiles;
}

export async function removeDropSendEntitlementProfile(sendCodeId: string) {
  return mutate((store) => {
    const before = store.profiles.length;
    store.profiles = store.profiles.filter((item) => item.sendCodeId !== sendCodeId);
    return before !== store.profiles.length;
  });
}

export function getDropSendEntitlementStoreInfo() {
  return { version: STORE_VERSION, dataRoot, storePath };
}
