import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { generateDimproLicenseKey, readLicenseStore, writeLicenseStore } from "./store";
import { sendLicenseChangeEmail } from "./change-email";
import type {
  BillingInterval,
  BillingStatus,
  HageAiFeatureId,
  LicenseAiUserAccess,
  LicenseAdditionalContact,
  LicenseDeviceStatus,
  LicenseRecord,
  LicenseStore,
  StoredLicenseStatus,
} from "./types";

const allowedStatuses: StoredLicenseStatus[] = [
  "active",
  "expired",
  "blocked",
  "trial",
  "pending",
  "archived",
];

const allowedBillingIntervals: BillingInterval[] = ["none", "monthly", "yearly", "manual"];
const allowedBillingStatuses: BillingStatus[] = ["none", "active", "past_due", "canceled", "trialing", "manual"];
const allowedAiFeatures: HageAiFeatureId[] = [
  "daily_plan",
  "next_step",
  "task_breakdown",
  "waiting_email",
  "meeting_agenda",
  "weekly_summary",
  "decision_support",
  "document_extract",
];
const allowedAiScopes: Array<"personal" | "hage"> = ["personal", "hage"];
const licenseDataRoot = process.env.DIMPRO_LICENSE_DATA_ROOT?.trim() || path.join(process.cwd(), ".dimprover");
const auditLogFile = path.join(licenseDataRoot, "data", "license-audit.log");

type AuditEntry = {
  id: string;
  createdAt: string;
  action: string;
  licenseId?: string;
  deviceId?: string;
  companyName?: string;
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(payload: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function requiredString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

function stringArray(value: unknown) {
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function positiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeAiUserId(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function optionalIsoDateString(value: unknown) {
  const text = optionalString(value);
  if (!text) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function aiUsersValue(value: unknown, fallback: LicenseAiUserAccess[] = []): LicenseAiUserAccess[] {
  if (!Array.isArray(value)) return fallback;
  const nowIso = new Date().toISOString();
  const result: LicenseAiUserAccess[] = [];

  for (const rawItem of value) {
    if (!isRecord(rawItem)) continue;
    const displayName = requiredString(rawItem.displayName) ?? requiredString(rawItem.userName);
    if (!displayName) continue;
    const requestedUserId = requiredString(rawItem.userId) ?? normalizeAiUserId(displayName);
    const userId = normalizeAiUserId(requestedUserId) || `user-${randomUUID().slice(0, 8)}`;
    const allowedFeatures = stringArray(rawItem.allowedFeatures)
      .filter((feature): feature is HageAiFeatureId => allowedAiFeatures.includes(feature as HageAiFeatureId));
    const allowedScopes = stringArray(rawItem.allowedScopes)
      .filter((scope): scope is "personal" | "hage" => allowedAiScopes.includes(scope as "personal" | "hage"));

    result.push({
      id: requiredString(rawItem.id) ?? `ai-user-${randomUUID()}`,
      userId,
      displayName,
      enabled: booleanValue(rawItem.enabled, true),
      allowedFeatures: allowedFeatures.length ? allowedFeatures : [...allowedAiFeatures],
      allowedScopes: allowedScopes.length ? allowedScopes : [...allowedAiScopes],
      maxRequestsPerDay: nonNegativeNumber(rawItem.maxRequestsPerDay, 20),
      maxRequestsPerMonth: nonNegativeNumber(rawItem.maxRequestsPerMonth, 300),
      monthlyBudgetHuf: nonNegativeNumber(rawItem.monthlyBudgetHuf, 5000),
      accessExpiresAt: optionalIsoDateString(rawItem.accessExpiresAt),
      createdAt: isoDateString(rawItem.createdAt, nowIso),
      updatedAt: nowIso,
    });
  }

  return result;
}

function additionalContactsValue(
  value: unknown,
  fallback: LicenseAdditionalContact[] = [],
): LicenseAdditionalContact[] {
  if (!Array.isArray(value)) return fallback;
  const nowIso = new Date().toISOString();
  const contacts: LicenseAdditionalContact[] = [];

  for (const rawItem of value) {
    if (!isRecord(rawItem)) continue;
    const name = optionalString(rawItem.name) ?? "";
    const email = optionalString(rawItem.email) ?? "";
    const phone = optionalString(rawItem.phone) ?? "";
    const role = optionalString(rawItem.role) ?? "";
    if (!name && !email && !phone && !role) continue;
    contacts.push({
      id: requiredString(rawItem.id) ?? `contact-${randomUUID()}`,
      name,
      role,
      email,
      phone,
      receiveEmail: booleanValue(rawItem.receiveEmail, true),
      createdAt: isoDateString(rawItem.createdAt, nowIso),
      updatedAt: nowIso,
    });
  }

  return contacts;
}

function booleanValue(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "1";
  return fallback;
}

function isoDateString(value: unknown, fallback: string) {
  const text = optionalString(value);
  if (!text) return fallback;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function statusValue(value: unknown, fallback: StoredLicenseStatus) {
  return allowedStatuses.includes(value as StoredLicenseStatus) ? (value as StoredLicenseStatus) : fallback;
}

function billingIntervalValue(value: unknown, fallback: BillingInterval) {
  return allowedBillingIntervals.includes(value as BillingInterval) ? (value as BillingInterval) : fallback;
}

function billingStatusValue(value: unknown, fallback: BillingStatus) {
  return allowedBillingStatuses.includes(value as BillingStatus) ? (value as BillingStatus) : fallback;
}

async function appendAudit(entry: Omit<AuditEntry, "id" | "createdAt">) {
  const record: AuditEntry = { id: `audit-${randomUUID()}`, createdAt: new Date().toISOString(), ...entry };
  await appendFile(auditLogFile, `${JSON.stringify(record)}\n`, "utf8").catch(() => undefined);
}

async function readAuditEntries(limit = 80): Promise<AuditEntry[]> {
  try {
    const raw = await readFile(auditLogFile, "utf8");
    return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line) as AuditEntry).reverse().slice(0, limit);
  } catch {
    return [];
  }
}

function toAdminStore(store: LicenseStore, auditEntries: AuditEntry[] = []) {
  return {
    licenses: store.licenses.map((license) => ({
      ...license,
      deviceCount: store.devices.filter((device) => device.licenseId === license.id && device.status === "active").length,
      devices: store.devices.filter((device) => device.licenseId === license.id),
    })),
    devices: store.devices,
    auditEntries,
  };
}

export async function getLicenseAdminStore() {
  return toAdminStore(await readLicenseStore(), await readAuditEntries());
}

function publicContactSummary(license: LicenseRecord) {
  return {
    legacyLicenseId: license.id,
    companyName: license.companyName,
    contactName: license.contactName ?? "",
    contactEmail: license.contactEmail ?? "",
    contactPhone: license.contactPhone ?? "",
    secondaryContactName: license.secondaryContactName ?? "",
    secondaryContactEmail: license.secondaryContactEmail ?? "",
    secondaryContactPhone: license.secondaryContactPhone ?? "",
    additionalContacts: (license.additionalContacts ?? []).map((contact) => ({
      id: contact.id,
      name: contact.name,
      role: contact.role ?? "",
      email: contact.email,
      phone: contact.phone ?? "",
      receiveEmail: contact.receiveEmail,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    })),
    updatedAt: license.updatedAt,
  };
}

export async function getLicenseContactSummaries() {
  const store = await readLicenseStore();
  return store.licenses.map(publicContactSummary);
}

export async function updateLicenseContactsAdmin(legacyLicenseId: string, payload: Record<string, unknown>) {
  const store = await readLicenseStore();
  const index = store.licenses.findIndex((license) => license.id === legacyLicenseId);
  if (index === -1) return { ok: false as const, error: "A legacy licencrekord nem található." };

  const previous = store.licenses[index];
  const nowIso = new Date().toISOString();
  const next: LicenseRecord = {
    ...previous,
    contactName: optionalString(payload.contactName) ?? previous.contactName ?? "",
    contactEmail: optionalString(payload.contactEmail) ?? previous.contactEmail ?? "",
    contactPhone: optionalString(payload.contactPhone) ?? previous.contactPhone ?? "",
    secondaryContactName: optionalString(payload.secondaryContactName) ?? previous.secondaryContactName ?? "",
    secondaryContactEmail: optionalString(payload.secondaryContactEmail) ?? previous.secondaryContactEmail ?? "",
    secondaryContactPhone: optionalString(payload.secondaryContactPhone) ?? previous.secondaryContactPhone ?? "",
    additionalContacts: hasOwn(payload, "additionalContacts")
      ? additionalContactsValue(payload.additionalContacts, previous.additionalContacts ?? [])
      : previous.additionalContacts ?? [],
    updatedAt: nowIso,
  };
  store.licenses[index] = next;
  await writeLicenseStore(store);
  await appendAudit({
    action: "updateLicenseContacts",
    licenseId: next.id,
    companyName: next.companyName,
    message: `Kapcsolattartók módosítva: ${next.companyName}`,
  });
  return { ok: true as const, contact: publicContactSummary(next) };
}

function activeDeviceCount(store: LicenseStore, licenseId: string) {
  return store.devices.filter(
    (device) => device.licenseId === licenseId && device.status === "active",
  ).length;
}

function statusLabel(status: StoredLicenseStatus) {
  const labels: Record<StoredLicenseStatus, string> = {
    active: "Aktív",
    expired: "Lejárt",
    blocked: "Tiltott",
    trial: "Próba",
    pending: "Függőben",
    archived: "Archivált",
  };
  return labels[status];
}

function formatDateForChange(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("hu-HU", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function summarizeLicenseChanges(before: LicenseRecord, after: LicenseRecord) {
  const changes: string[] = [];
  if (before.companyName !== after.companyName) changes.push(`Cégnév: ${before.companyName} → ${after.companyName}`);
  if (before.status !== after.status) changes.push(`Licencállapot: ${statusLabel(before.status)} → ${statusLabel(after.status)}`);
  if (before.startsAt !== after.startsAt) changes.push(`Kezdés: ${formatDateForChange(before.startsAt)} → ${formatDateForChange(after.startsAt)}`);
  if (before.expiresAt !== after.expiresAt) changes.push(`Lejárat: ${formatDateForChange(before.expiresAt)} → ${formatDateForChange(after.expiresAt)}`);
  if ((before.currentPeriodEnd ?? "") !== (after.currentPeriodEnd ?? "")) changes.push(`Fordulónap / időszak vége: ${formatDateForChange(before.currentPeriodEnd)} → ${formatDateForChange(after.currentPeriodEnd)}`);
  if (before.maxDevices !== after.maxDevices) changes.push(`Maximális gépszám: ${before.maxDevices} → ${after.maxDevices}`);
  if ((before.planCode ?? "") !== (after.planCode ?? "")) changes.push(`Csomag: ${before.planCode || "-"} → ${after.planCode || "-"}`);
  if ((before.billingInterval ?? "") !== (after.billingInterval ?? "")) changes.push(`Számlázási ciklus: ${before.billingInterval || "-"} → ${after.billingInterval || "-"}`);
  if ((before.billingStatus ?? "") !== (after.billingStatus ?? "")) changes.push(`Fizetési állapot: ${before.billingStatus || "-"} → ${after.billingStatus || "-"}`);
  if (before.enabledModules.join("|") !== after.enabledModules.join("|")) changes.push("Moduljogosultságok módosultak");
  if ((before.contactName ?? "") !== (after.contactName ?? "")) changes.push("Kapcsolattartó neve módosult");
  if ((before.contactEmail ?? "") !== (after.contactEmail ?? "")) changes.push("Kapcsolattartó e-mail címe módosult");
  if ((before.contactPhone ?? "") !== (after.contactPhone ?? "")) changes.push("Első kapcsolattartó telefonszáma módosult");
  if ((before.secondaryContactName ?? "") !== (after.secondaryContactName ?? "")) changes.push("Második kapcsolattartó neve módosult");
  if ((before.secondaryContactEmail ?? "") !== (after.secondaryContactEmail ?? "")) changes.push("Második kapcsolattartó e-mail címe módosult");
  if ((before.secondaryContactPhone ?? "") !== (after.secondaryContactPhone ?? "")) changes.push("Második kapcsolattartó telefonszáma módosult");
  if (JSON.stringify(before.additionalContacts ?? []) !== JSON.stringify(after.additionalContacts ?? [])) changes.push("További értesítési kapcsolattartók módosultak");
  if (before.licenseKey !== after.licenseKey) changes.push("Licenckulcs módosult");
  if ((before.adminNote ?? "") !== (after.adminNote ?? "")) changes.push("Adminisztrációs adat módosult");
  if (changes.length === 0) changes.push("A licencrekord mentésre került");
  return changes;
}

function createLicenseFromPayload(payload: Record<string, unknown>): LicenseRecord {
  const now = new Date();
  const nowIso = now.toISOString();
  const startsAt = isoDateString(payload.startsAt, nowIso);
  const expiresAt = isoDateString(payload.expiresAt, addMonths(now, 6).toISOString());
  const companyName = requiredString(payload.companyName) ?? "Új ügyfél";
  const normalizedCompanyId = companyName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const companyId = requiredString(payload.companyId) ?? (normalizedCompanyId || `client-${randomUUID().slice(0, 8)}`);
  const companyCode = requiredString(payload.companyCode) ?? companyId;
  const licenseKey = requiredString(payload.licenseKey) ?? generateDimproLicenseKey(companyCode, 6);
  const maxDevices = positiveNumber(payload.maxDevices, 3);

  return {
    id: `lic-${randomUUID()}`,
    licenseKey,
    companyId,
    companyName,
    status: statusValue(payload.status, "active"),
    startsAt,
    expiresAt,
    maxDevices,
    enabledModules: stringArray(payload.enabledModules),
    aiUsers: aiUsersValue(payload.aiUsers),
    aiMonthlyBudgetHuf: nonNegativeNumber(payload.aiMonthlyBudgetHuf, 15000),
    aiMaxSingleRequestHuf: nonNegativeNumber(payload.aiMaxSingleRequestHuf, 100),
    createdAt: nowIso,
    updatedAt: nowIso,
    adminNote: optionalString(payload.adminNote) ?? "",
    contactName: optionalString(payload.contactName) ?? "",
    contactEmail: optionalString(payload.contactEmail) ?? "",
    contactPhone: optionalString(payload.contactPhone) ?? "",
    secondaryContactName: optionalString(payload.secondaryContactName) ?? "",
    secondaryContactEmail: optionalString(payload.secondaryContactEmail) ?? "",
    secondaryContactPhone: optionalString(payload.secondaryContactPhone) ?? "",
    additionalContacts: additionalContactsValue(payload.additionalContacts),
    licenseEmailSentAt: optionalString(payload.licenseEmailSentAt) ?? "",
    planCode: optionalString(payload.planCode) ?? "manual",
    billingInterval: billingIntervalValue(payload.billingInterval, "manual"),
    billingStatus: billingStatusValue(payload.billingStatus, "manual"),
    subscriptionQuantity: positiveNumber(payload.subscriptionQuantity, maxDevices),
    stripeCustomerId: optionalString(payload.stripeCustomerId) ?? "",
    stripeSubscriptionId: optionalString(payload.stripeSubscriptionId) ?? "",
    currentPeriodEnd: isoDateString(payload.currentPeriodEnd, expiresAt),
    autoReleaseInactiveDevices: booleanValue(payload.autoReleaseInactiveDevices, false),
    inactiveReleaseDays: positiveNumber(payload.inactiveReleaseDays, 90),
  };
}

function updateLicenseFromPayload(license: LicenseRecord, payload: Record<string, unknown>): LicenseRecord {
  const expiresAt = isoDateString(payload.expiresAt, license.expiresAt);
  return {
    ...license,
    licenseKey: requiredString(payload.licenseKey) ?? license.licenseKey,
    companyId: requiredString(payload.companyId) ?? license.companyId,
    companyName: requiredString(payload.companyName) ?? license.companyName,
    status: statusValue(payload.status, license.status),
    startsAt: isoDateString(payload.startsAt, license.startsAt),
    expiresAt,
    maxDevices: positiveNumber(payload.maxDevices, license.maxDevices),
    enabledModules: hasOwn(payload, "enabledModules") ? stringArray(payload.enabledModules) : license.enabledModules,
    aiUsers: hasOwn(payload, "aiUsers") ? aiUsersValue(payload.aiUsers, license.aiUsers ?? []) : license.aiUsers ?? [],
    aiMonthlyBudgetHuf: hasOwn(payload, "aiMonthlyBudgetHuf")
      ? nonNegativeNumber(payload.aiMonthlyBudgetHuf, license.aiMonthlyBudgetHuf ?? 15000)
      : license.aiMonthlyBudgetHuf ?? 15000,
    aiMaxSingleRequestHuf: hasOwn(payload, "aiMaxSingleRequestHuf")
      ? nonNegativeNumber(payload.aiMaxSingleRequestHuf, license.aiMaxSingleRequestHuf ?? 100)
      : license.aiMaxSingleRequestHuf ?? 100,
    adminNote: optionalString(payload.adminNote) ?? license.adminNote ?? "",
    contactName: optionalString(payload.contactName) ?? license.contactName ?? "",
    contactEmail: optionalString(payload.contactEmail) ?? license.contactEmail ?? "",
    contactPhone: optionalString(payload.contactPhone) ?? license.contactPhone ?? "",
    secondaryContactName: optionalString(payload.secondaryContactName) ?? license.secondaryContactName ?? "",
    secondaryContactEmail: optionalString(payload.secondaryContactEmail) ?? license.secondaryContactEmail ?? "",
    secondaryContactPhone: optionalString(payload.secondaryContactPhone) ?? license.secondaryContactPhone ?? "",
    additionalContacts: hasOwn(payload, "additionalContacts")
      ? additionalContactsValue(payload.additionalContacts, license.additionalContacts ?? [])
      : license.additionalContacts ?? [],
    licenseEmailSentAt: optionalString(payload.licenseEmailSentAt) ?? license.licenseEmailSentAt ?? "",
    planCode: optionalString(payload.planCode) ?? license.planCode ?? "manual",
    billingInterval: billingIntervalValue(payload.billingInterval, license.billingInterval ?? "manual"),
    billingStatus: billingStatusValue(payload.billingStatus, license.billingStatus ?? "manual"),
    subscriptionQuantity: positiveNumber(payload.subscriptionQuantity, license.subscriptionQuantity ?? license.maxDevices),
    stripeCustomerId: optionalString(payload.stripeCustomerId) ?? license.stripeCustomerId ?? "",
    stripeSubscriptionId: optionalString(payload.stripeSubscriptionId) ?? license.stripeSubscriptionId ?? "",
    currentPeriodEnd: isoDateString(payload.currentPeriodEnd, license.currentPeriodEnd ?? expiresAt),
    autoReleaseInactiveDevices: booleanValue(payload.autoReleaseInactiveDevices, license.autoReleaseInactiveDevices ?? false),
    inactiveReleaseDays: positiveNumber(payload.inactiveReleaseDays, license.inactiveReleaseDays ?? 90),
    updatedAt: new Date().toISOString(),
  };
}

export async function applyLicenseAdminAction(payload: unknown) {
  if (!isRecord(payload)) return { ok: false, error: "Érvénytelen admin kérés." };
  const action = requiredString(payload.action);
  const store = await readLicenseStore();

  if (action === "createLicense") {
    const license = createLicenseFromPayload(payload);
    if (store.licenses.some((item) => item.licenseKey === license.licenseKey)) return { ok: false, error: "Ez a licenckulcs már létezik." };
    store.licenses.unshift(license);
    await writeLicenseStore(store);
    await appendAudit({ action, licenseId: license.id, companyName: license.companyName, message: `Licenc létrehozva: ${license.companyName}` });
    const emailNotification = await sendLicenseChangeEmail({
      action,
      licenseAfter: license,
      activeDeviceCount: 0,
      changedFields: ["Új DIMPRO licenc létrehozva"],
    });
    return { ok: true, store: toAdminStore(store, await readAuditEntries()), emailNotification };
  }

  if (action === "updateLicense") {
    const licenseId = requiredString(payload.licenseId);
    if (!licenseId) return { ok: false, error: "Hiányzó licencazonosító." };
    const index = store.licenses.findIndex((license) => license.id === licenseId);
    if (index === -1) return { ok: false, error: "A licenc nem található." };
    const previousLicense = { ...store.licenses[index], enabledModules: [...store.licenses[index].enabledModules] };
    const nextLicense = updateLicenseFromPayload(store.licenses[index], payload);
    const duplicate = store.licenses.some((license) => license.id !== nextLicense.id && license.licenseKey === nextLicense.licenseKey);
    if (duplicate) return { ok: false, error: "Ez a licenckulcs már másik rekordhoz tartozik." };
    store.licenses[index] = nextLicense;
    await writeLicenseStore(store);
    await appendAudit({ action, licenseId, companyName: nextLicense.companyName, message: `Licenc módosítva: ${nextLicense.companyName} · AI felhasználók: ${(nextLicense.aiUsers ?? []).filter((user) => user.enabled).length}/${(nextLicense.aiUsers ?? []).length}` });
    const emailNotification = await sendLicenseChangeEmail({
      action,
      licenseBefore: previousLicense,
      licenseAfter: nextLicense,
      activeDeviceCount: activeDeviceCount(store, licenseId),
      changedFields: summarizeLicenseChanges(previousLicense, nextLicense),
    });
    return { ok: true, store: toAdminStore(store, await readAuditEntries()), emailNotification };
  }

  if (action === "archiveLicense") {
    const licenseId = requiredString(payload.licenseId);
    if (!licenseId) return { ok: false, error: "Hiányzó licencazonosító." };
    const index = store.licenses.findIndex((license) => license.id === licenseId);
    if (index === -1) return { ok: false, error: "A licenc nem található." };
    const previousLicense = { ...store.licenses[index] };
    store.licenses[index] = { ...store.licenses[index], status: "archived", updatedAt: new Date().toISOString() };
    await writeLicenseStore(store);
    await appendAudit({ action, licenseId, companyName: store.licenses[index].companyName, message: `Licenc archiválva: ${store.licenses[index].companyName}` });
    const emailNotification = await sendLicenseChangeEmail({
      action,
      licenseBefore: previousLicense,
      licenseAfter: store.licenses[index],
      activeDeviceCount: activeDeviceCount(store, licenseId),
      changedFields: [`Licencállapot: ${statusLabel(previousLicense.status)} → Archivált`],
    });
    return { ok: true, store: toAdminStore(store, await readAuditEntries()), emailNotification };
  }

  if (action === "removeLicense") {
    const licenseId = requiredString(payload.licenseId);
    if (!licenseId) return { ok: false, error: "Hiányzó licencazonosító." };
    const removedLicense = store.licenses.find((license) => license.id === licenseId);
    const removedActiveDeviceCount = removedLicense ? activeDeviceCount(store, removedLicense.id) : 0;
    const before = store.licenses.length;
    store.licenses = store.licenses.filter((license) => license.id !== licenseId);
    if (store.licenses.length === before) return { ok: false, error: "A licenc nem található." };
    store.devices = store.devices.filter((device) => device.licenseId !== licenseId);
    await writeLicenseStore(store);
    await appendAudit({ action, licenseId, companyName: removedLicense?.companyName, message: `Licenc törölve: ${removedLicense?.companyName ?? licenseId}` });
    const emailNotification = removedLicense
      ? await sendLicenseChangeEmail({
          action,
          licenseBefore: removedLicense,
          activeDeviceCount: removedActiveDeviceCount,
          changedFields: ["A licenc és a hozzá kapcsolódó gépaktiválások törlésre kerültek"],
        })
      : undefined;
    return { ok: true, store: toAdminStore(store, await readAuditEntries()), emailNotification };
  }

  if (action === "removeDevice") {
    const deviceId = requiredString(payload.deviceId);
    if (!deviceId) return { ok: false, error: "Hiányzó gépazonosító." };
    const removedDevice = store.devices.find((device) => device.id === deviceId);
    const relatedLicense = removedDevice
      ? store.licenses.find((license) => license.id === removedDevice.licenseId)
      : undefined;
    const before = store.devices.length;
    store.devices = store.devices.filter((device) => device.id !== deviceId);
    if (store.devices.length === before) return { ok: false, error: "A gépazonosító nem található." };
    await writeLicenseStore(store);
    await appendAudit({ action, licenseId: removedDevice?.licenseId, deviceId, message: `Gép törölve: ${removedDevice?.appId ?? deviceId}` });
    const emailNotification = relatedLicense && removedDevice
      ? await sendLicenseChangeEmail({
          action,
          licenseAfter: relatedLicense,
          deviceBefore: removedDevice,
          activeDeviceCount: activeDeviceCount(store, relatedLicense.id),
          changedFields: [`Aktivált gép eltávolítva: ${removedDevice.userName || removedDevice.appId}`],
        })
      : undefined;
    return { ok: true, store: toAdminStore(store, await readAuditEntries()), emailNotification };
  }

  if (action === "updateDeviceMeta") {
    const deviceId = requiredString(payload.deviceId);
    if (!deviceId) return { ok: false, error: "Hiányzó gépazonosító." };
    const index = store.devices.findIndex((device) => device.id === deviceId);
    if (index === -1) return { ok: false, error: "A gépazonosító nem található." };
    const previousDevice = { ...store.devices[index] };
    store.devices[index] = {
      ...store.devices[index],
      userName: optionalString(payload.userName) ?? "",
      organizationUnit: optionalString(payload.organizationUnit) ?? "",
      note: optionalString(payload.note) ?? "",
      updatedAt: new Date().toISOString(),
    };
    await writeLicenseStore(store);
    await appendAudit({
      action,
      licenseId: store.devices[index].licenseId,
      deviceId,
      message: `Gép adatai módosítva: ${store.devices[index].appId}`,
    });
    const relatedLicense = store.licenses.find((license) => license.id === store.devices[index].licenseId);
    const metaChanges: string[] = [];
    if ((previousDevice.userName ?? "") !== (store.devices[index].userName ?? "")) metaChanges.push(`Gép használója: ${previousDevice.userName || "-"} → ${store.devices[index].userName || "-"}`);
    if ((previousDevice.organizationUnit ?? "") !== (store.devices[index].organizationUnit ?? "")) metaChanges.push(`Szervezeti egység: ${previousDevice.organizationUnit || "-"} → ${store.devices[index].organizationUnit || "-"}`);
    if ((previousDevice.note ?? "") !== (store.devices[index].note ?? "")) metaChanges.push("Gép megjegyzése módosult");
    const emailNotification = relatedLicense
      ? await sendLicenseChangeEmail({
          action,
          licenseAfter: relatedLicense,
          deviceBefore: previousDevice,
          deviceAfter: store.devices[index],
          activeDeviceCount: activeDeviceCount(store, relatedLicense.id),
          changedFields: metaChanges.length ? metaChanges : ["A gépadatok mentésre kerültek"],
        })
      : undefined;
    return { ok: true, store: toAdminStore(store, await readAuditEntries()), emailNotification };
  }

  if (action === "setDeviceStatus") {
    const deviceId = requiredString(payload.deviceId);
    if (!deviceId) return { ok: false, error: "Hiányzó gépazonosító." };
    const status: LicenseDeviceStatus = payload.status === "blocked" ? "blocked" : "active";
    const index = store.devices.findIndex((device) => device.id === deviceId);
    if (index === -1) return { ok: false, error: "A gépazonosító nem található." };
    const previousDevice = { ...store.devices[index] };
    store.devices[index] = { ...store.devices[index], status, updatedAt: new Date().toISOString() };
    await writeLicenseStore(store);
    await appendAudit({ action, licenseId: store.devices[index].licenseId, deviceId, message: `Gép státusz módosítva: ${status === "blocked" ? "tiltott" : "aktív"}` });
    const relatedLicense = store.licenses.find((license) => license.id === store.devices[index].licenseId);
    const emailNotification = relatedLicense
      ? await sendLicenseChangeEmail({
          action,
          licenseAfter: relatedLicense,
          deviceBefore: previousDevice,
          deviceAfter: store.devices[index],
          activeDeviceCount: activeDeviceCount(store, relatedLicense.id),
          changedFields: [`Gép státusza: ${previousDevice.status === "blocked" ? "Tiltott" : "Aktív"} → ${status === "blocked" ? "Tiltott" : "Aktív"}`],
        })
      : undefined;
    return { ok: true, store: toAdminStore(store, await readAuditEntries()), emailNotification };
  }

  return { ok: false, error: "Ismeretlen admin művelet." };
}
