import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getContactGreetingName, getLicenseContacts, getLicenseEmailContacts } from "./contacts";
import { getLicenseActivationMailSettings, sendDimproMail } from "./mail-profiles";
import { readLicenseStore } from "./store";
import type { LicenseContact } from "./contacts";
import type { LicenseRecord } from "./types";

export type LicenseExpiryReminderStage = "30d" | "7d" | "1d" | "expired";
export type LicenseExpiryReminderSource = "cron" | "manual" | "api";
export type LicenseExpiryReminderAudience = "contact" | "admin";

export type LicenseExpiryReminderDelivery = {
  id: string;
  createdAt: string;
  licenseId: string;
  companyName: string;
  expiresAt: string;
  stage: LicenseExpiryReminderStage;
  daysRemaining: number;
  audience: LicenseExpiryReminderAudience;
  email: string;
  sent: boolean;
  error?: string;
};

export type LicenseExpiryReminderRunItem = {
  licenseId: string;
  companyName: string;
  expiresAt: string;
  daysRemaining: number;
  stage: LicenseExpiryReminderStage;
  intendedRecipients: string[];
  sentRecipients: string[];
  alreadySentRecipients: string[];
  failedRecipients: Array<{ email: string; error: string }>;
};

export type LicenseExpiryReminderRun = {
  id: string;
  createdAt: string;
  source: LicenseExpiryReminderSource;
  dryRun: boolean;
  scannedLicenses: number;
  eligibleLicenses: number;
  stageCandidates: number;
  intendedEmails: number;
  sentEmails: number;
  alreadySentEmails: number;
  failedEmails: number;
  items: LicenseExpiryReminderRunItem[];
};

function resolveProjectRoot() {
  const cwd = process.cwd();
  const standaloneSuffix = `${path.sep}.next${path.sep}standalone`;
  if (cwd.endsWith(standaloneSuffix)) return cwd.slice(0, -standaloneSuffix.length);
  return cwd;
}

const projectRoot = process.env.DIMPRO_PROJECT_ROOT ?? resolveProjectRoot();
const reminderDir = path.join(projectRoot, ".dimprover", "mail");
const deliveryHistoryFile = path.join(reminderDir, "license-expiry-reminder-history.jsonl");
const runHistoryFile = path.join(reminderDir, "license-expiry-reminder-runs.jsonl");
const lockFile = path.join(reminderDir, "license-expiry-reminder.lock");
const customerPortalUrl = process.env.DIMPRO_CUSTOMER_PORTAL_URL ?? "https://license.dimpro.hu/customer";

function escapeHtml(value: string | number | undefined | null) {
  return String(value ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: string) {
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

function getBudapestDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateKeyToUtcTime(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function getCalendarDaysUntilExpiry(expiresAt: string, now = new Date()) {
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return null;
  const expiryKey = getBudapestDateKey(expiry);
  const nowKey = getBudapestDateKey(now);
  return Math.round((dateKeyToUtcTime(expiryKey) - dateKeyToUtcTime(nowKey)) / 86_400_000);
}

export function getLicenseExpiryReminderStage(daysRemaining: number): LicenseExpiryReminderStage | null {
  if (daysRemaining <= 0) return "expired";
  if (daysRemaining <= 1) return "1d";
  if (daysRemaining <= 7) return "7d";
  if (daysRemaining <= 30) return "30d";
  return null;
}

function stageTitle(stage: LicenseExpiryReminderStage, daysRemaining: number) {
  if (stage === "expired") {
    return daysRemaining === 0
      ? "A DIMPRO licenc a mai napon lejár"
      : `A DIMPRO licenc ${Math.abs(daysRemaining)} napja lejárt`;
  }
  if (stage === "1d") return "A DIMPRO licenc holnap lejár";
  return `A DIMPRO licenc ${daysRemaining} nap múlva lejár`;
}

function stageSubject(stage: LicenseExpiryReminderStage, daysRemaining: number) {
  if (stage === "expired") {
    return daysRemaining === 0
      ? "DIMPRO licenc lejárati értesítő – a licenc ma lejár"
      : "DIMPRO licenc lejárt – intézkedés szükséges";
  }
  if (stage === "1d") return "DIMPRO licenc lejárati értesítő – 1 nap van hátra";
  return `DIMPRO licenc lejárati értesítő – ${daysRemaining} nap van hátra`;
}

function contactTextLines(license: LicenseRecord) {
  const contacts = getLicenseContacts(license);
  if (!contacts.length) return ["Kapcsolattartók: nincs megadva"];
  return [
    "Kapcsolattartók:",
    ...contacts.map((contact) =>
      `${contact.order}. ${contact.name || "Név nincs megadva"} · ${contact.role || "szerepkör nincs megadva"} · ${contact.email || "e-mail nincs megadva"} · ${contact.phone || "telefon nincs megadva"}`,
    ),
  ];
}

function contactHtml(license: LicenseRecord) {
  const contacts = getLicenseContacts(license);
  if (!contacts.length) return "<p><strong>Kapcsolattartók:</strong> nincs megadva</p>";
  return `
    <div style="margin:14px 0;padding:14px;border:1px solid #cbd5e1;border-radius:12px;background:#ffffff">
      <p style="margin:0 0 8px;font-weight:700;color:#334155">Kapcsolattartók</p>
      ${contacts.map((contact, index) => `
        <div style="padding:8px 0;${index === 0 ? "" : "border-top:1px solid #e2e8f0;"}">
          <strong>${contact.order}. ${escapeHtml(contact.name || "Név nincs megadva")}</strong><br>
          <span style="color:#475569">Szerepkör: ${escapeHtml(contact.role || "-")}</span><br>
          <span style="color:#475569">E-mail: ${escapeHtml(contact.email || "-")} · Telefon: ${escapeHtml(contact.phone || "-")}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function buildCustomerMail(params: {
  license: LicenseRecord;
  recipient: LicenseContact;
  stage: LicenseExpiryReminderStage;
  daysRemaining: number;
  activeDeviceCount: number;
}) {
  const { license, recipient, stage, daysRemaining, activeDeviceCount } = params;
  const recipientName = getContactGreetingName(recipient, license);
  const title = stageTitle(stage, daysRemaining);
  const modules = license.enabledModules.length ? license.enabledModules.join(", ") : "nincs külön modul megadva";
  const instruction = stage === "expired"
    ? "A licenc további használatához kérjük, egyeztessenek a hosszabbításról a DIMPRO kapcsolattartójával."
    : "Amennyiben a licencet továbbra is használni szeretnék, kérjük, időben egyeztessenek a hosszabbításról a DIMPRO kapcsolattartójával.";
  const text = [
    `Tisztelt ${recipientName}!`,
    "",
    title,
    "",
    `Cég / ügyfél: ${license.companyName}`,
    `Csomag: ${license.planCode || "manual"}`,
    `Lejárat: ${formatDate(license.expiresAt)}`,
    `Hátralévő napok: ${Math.max(daysRemaining, 0)}`,
    `Aktív / maximális gépszám: ${activeDeviceCount} / ${license.maxDevices}`,
    `Moduljogosultságok: ${modules}`,
    ...contactTextLines(license),
    "",
    instruction,
    `Licenc állapotának megtekintése: ${customerPortalUrl}`,
    "",
    "Ha a licenc hosszabbítása időközben megtörtént, ez az üzenet figyelmen kívül hagyható.",
    "",
    "Üdvözlettel:",
    "DIMPRO rendszer",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:700px">
      <p>Tisztelt ${escapeHtml(recipientName)}!</p>
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0891b2">DIMPRO licencértesítés</p>
      <h2 style="margin:0 0 12px;color:${stage === "expired" ? "#b91c1c" : "#0e7490"}">${escapeHtml(title)}</h2>
      <div style="border:1px solid ${stage === "expired" ? "#fecaca" : "#bae6fd"};background:${stage === "expired" ? "#fef2f2" : "#f0f9ff"};border-radius:14px;padding:16px;margin:16px 0">
        <p><strong>Cég / ügyfél:</strong> ${escapeHtml(license.companyName)}</p>
        <p><strong>Csomag:</strong> ${escapeHtml(license.planCode || "manual")}</p>
        <p><strong>Lejárat:</strong> ${escapeHtml(formatDate(license.expiresAt))}</p>
        <p><strong>Hátralévő napok:</strong> ${Math.max(daysRemaining, 0)}</p>
        <p><strong>Aktív / maximális gépszám:</strong> ${activeDeviceCount} / ${license.maxDevices}</p>
        <p><strong>Moduljogosultságok:</strong> ${escapeHtml(modules)}</p>
      </div>
      ${contactHtml(license)}
      <p>${escapeHtml(instruction)}</p>
      <p><a href="${escapeHtml(customerPortalUrl)}" style="display:inline-block;border-radius:10px;background:#0891b2;color:white;text-decoration:none;padding:10px 14px;font-weight:700">Licenc állapotának megtekintése</a></p>
      <p style="margin-top:18px;color:#475569">Ha a licenc hosszabbítása időközben megtörtént, ez az üzenet figyelmen kívül hagyható.</p>
      <p>Üdvözlettel:<br><strong>DIMPRO rendszer</strong></p>
    </div>
  `;

  return { subject: stageSubject(stage, daysRemaining), text, html };
}

function buildAdminMail(params: {
  license: LicenseRecord;
  stage: LicenseExpiryReminderStage;
  daysRemaining: number;
  activeDeviceCount: number;
  customerRecipients: string[];
}) {
  const { license, stage, daysRemaining, activeDeviceCount, customerRecipients } = params;
  const title = stageTitle(stage, daysRemaining);
  const modules = license.enabledModules.length ? license.enabledModules.join(", ") : "nincs külön modul megadva";
  const subject = `[DIMPRO Admin] ${license.companyName} – ${stageSubject(stage, daysRemaining)}`;
  const text = [
    "DIMPRO licenclejárati admin értesítés",
    "",
    title,
    "",
    `Cég / ügyfél: ${license.companyName}`,
    `Csomag: ${license.planCode || "manual"}`,
    `Lejárat: ${formatDate(license.expiresAt)}`,
    `Hátralévő napok: ${daysRemaining}`,
    `Aktív / maximális gépszám: ${activeDeviceCount} / ${license.maxDevices}`,
    `Moduljogosultságok: ${modules}`,
    `Ügyfélcímzettek: ${customerRecipients.length ? customerRecipients.join(", ") : "nincs érvényes ügyfélcímzett"}`,
    ...contactTextLines(license),
    "",
    "Adminfelület: https://license.dimpro.hu/admin",
    "",
    "Ez automatikus DIMPRO rendszerüzenet.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:720px">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0891b2">DIMPRO admin rendszerüzenet</p>
      <h2 style="margin:0 0 12px;color:${stage === "expired" ? "#b91c1c" : "#0e7490"}">${escapeHtml(title)}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #e2e8f0">
        <tbody>
          <tr><td style="padding:8px;color:#64748b">Cég / ügyfél</td><td style="padding:8px;font-weight:700">${escapeHtml(license.companyName)}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Csomag</td><td style="padding:8px;font-weight:700">${escapeHtml(license.planCode || "manual")}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Lejárat</td><td style="padding:8px;font-weight:700">${escapeHtml(formatDate(license.expiresAt))}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Hátralévő napok</td><td style="padding:8px;font-weight:700">${daysRemaining}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Aktív / maximális gépszám</td><td style="padding:8px;font-weight:700">${activeDeviceCount} / ${license.maxDevices}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Moduljogosultságok</td><td style="padding:8px;font-weight:700">${escapeHtml(modules)}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Ügyfélcímzettek</td><td style="padding:8px;font-weight:700">${escapeHtml(customerRecipients.length ? customerRecipients.join(", ") : "nincs érvényes ügyfélcímzett")}</td></tr>
        </tbody>
      </table>
      ${contactHtml(license)}
      <p><a href="https://license.dimpro.hu/admin" style="display:inline-block;border-radius:10px;background:#0f172a;color:white;text-decoration:none;padding:10px 14px;font-weight:700">Licencadmin megnyitása</a></p>
      <p style="margin-top:14px;font-size:12px;color:#64748b">Ez automatikus DIMPRO rendszerüzenet.</p>
    </div>
  `;

  return { subject, text, html };
}

function deliveryKey(params: {
  licenseId: string;
  expiresAt: string;
  stage: LicenseExpiryReminderStage;
  email: string;
}) {
  return `${params.licenseId}|${params.expiresAt}|${params.stage}|${params.email.trim().toLowerCase()}`;
}

async function readDeliveries(limit = 5000): Promise<LicenseExpiryReminderDelivery[]> {
  try {
    const raw = await fs.readFile(deliveryHistoryFile, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line) as LicenseExpiryReminderDelivery);
  } catch {
    return [];
  }
}

async function appendDelivery(delivery: LicenseExpiryReminderDelivery) {
  await fs.mkdir(reminderDir, { recursive: true });
  await fs.appendFile(deliveryHistoryFile, `${JSON.stringify(delivery)}\n`, "utf8");
}

async function appendRun(run: LicenseExpiryReminderRun) {
  await fs.mkdir(reminderDir, { recursive: true });
  await fs.appendFile(runHistoryFile, `${JSON.stringify(run)}\n`, "utf8");
  try {
    const raw = await fs.readFile(runHistoryFile, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    if (lines.length > 500) {
      await fs.writeFile(runHistoryFile, `${lines.slice(-500).join("\n")}\n`, "utf8");
    }
  } catch {
    // A futás naplózása nem akadályozhatja az értesítések működését.
  }
}

async function acquireLock() {
  await fs.mkdir(reminderDir, { recursive: true });
  try {
    const handle = await fs.open(lockFile, "wx", 0o600);
    await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`, "utf8");
    return handle;
  } catch (error) {
    try {
      const stat = await fs.stat(lockFile);
      if (Date.now() - stat.mtimeMs > 30 * 60 * 1000) {
        await fs.unlink(lockFile);
        const handle = await fs.open(lockFile, "wx", 0o600);
        await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`, "utf8");
        return handle;
      }
    } catch {
      // A részletes hibát az eredeti kivétel alapján adjuk vissza.
    }
    throw new Error(`A licenclejárati ellenőrzés már fut: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function releaseLock(handle: fs.FileHandle) {
  await handle.close().catch(() => undefined);
  await fs.unlink(lockFile).catch(() => undefined);
}

function normalizeUniqueEmails(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const email = raw.trim();
    const normalized = email.toLowerCase();
    if (!email.includes("@") || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(email);
  }
  return result;
}

export async function runLicenseExpiryReminders(
  source: LicenseExpiryReminderSource,
  options: { dryRun?: boolean; now?: Date } = {},
): Promise<LicenseExpiryReminderRun> {
  const lock = await acquireLock();
  try {
    const dryRun = Boolean(options.dryRun);
    const now = options.now ?? new Date();
    const store = await readLicenseStore();
    const settings = await getLicenseActivationMailSettings();
    const history = await readDeliveries();
    const successfulKeys = new Set(
      history
        .filter((delivery) => delivery.sent)
        .map((delivery) => deliveryKey(delivery)),
    );

    const items: LicenseExpiryReminderRunItem[] = [];
    let eligibleLicenses = 0;
    let stageCandidates = 0;
    let intendedEmails = 0;
    let sentEmails = 0;
    let alreadySentEmails = 0;
    let failedEmails = 0;

    for (const license of store.licenses) {
      if (!(["active", "trial"] as const).includes(license.status as "active" | "trial")) continue;
      eligibleLicenses += 1;
      const daysRemaining = getCalendarDaysUntilExpiry(license.expiresAt, now);
      if (daysRemaining === null) continue;
      const stage = getLicenseExpiryReminderStage(daysRemaining);
      if (!stage) continue;
      stageCandidates += 1;

      const activeDeviceCount = store.devices.filter(
        (device) => device.licenseId === license.id && device.status === "active",
      ).length;
      const customerContacts = getLicenseEmailContacts(license);
      const customerEmails = normalizeUniqueEmails(customerContacts.map((contact) => contact.email));
      const customerEmailSet = new Set(customerEmails.map((email) => email.toLowerCase()));
      const adminEmails = normalizeUniqueEmails(settings.adminRecipients).filter(
        (email) => !customerEmailSet.has(email.toLowerCase()),
      );
      const intendedRecipients = [...customerEmails, ...adminEmails];
      intendedEmails += intendedRecipients.length;

      const item: LicenseExpiryReminderRunItem = {
        licenseId: license.id,
        companyName: license.companyName,
        expiresAt: license.expiresAt,
        daysRemaining,
        stage,
        intendedRecipients,
        sentRecipients: [],
        alreadySentRecipients: [],
        failedRecipients: [],
      };

      const customerContactByEmail = new Map(
        customerContacts.map((contact) => [contact.email.toLowerCase(), contact]),
      );

      for (const email of intendedRecipients) {
        const key = deliveryKey({
          licenseId: license.id,
          expiresAt: license.expiresAt,
          stage,
          email,
        });
        if (successfulKeys.has(key)) {
          item.alreadySentRecipients.push(email);
          alreadySentEmails += 1;
          continue;
        }

        if (dryRun) {
          item.sentRecipients.push(email);
          sentEmails += 1;
          continue;
        }

        const audience: LicenseExpiryReminderAudience = customerEmailSet.has(email.toLowerCase())
          ? "contact"
          : "admin";
        const mail = audience === "contact"
          ? buildCustomerMail({
              license,
              recipient: customerContactByEmail.get(email.toLowerCase())!,
              stage,
              daysRemaining,
              activeDeviceCount,
            })
          : buildAdminMail({
              license,
              stage,
              daysRemaining,
              activeDeviceCount,
              customerRecipients: customerEmails,
            });

        try {
          await sendDimproMail({
            profileId: "system",
            to: [email],
            replyTo: settings.replyTo,
            ...mail,
          });
          const delivery: LicenseExpiryReminderDelivery = {
            id: `expiry-delivery-${randomUUID()}`,
            createdAt: new Date().toISOString(),
            licenseId: license.id,
            companyName: license.companyName,
            expiresAt: license.expiresAt,
            stage,
            daysRemaining,
            audience,
            email,
            sent: true,
          };
          await appendDelivery(delivery);
          successfulKeys.add(key);
          item.sentRecipients.push(email);
          sentEmails += 1;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const delivery: LicenseExpiryReminderDelivery = {
            id: `expiry-delivery-${randomUUID()}`,
            createdAt: new Date().toISOString(),
            licenseId: license.id,
            companyName: license.companyName,
            expiresAt: license.expiresAt,
            stage,
            daysRemaining,
            audience,
            email,
            sent: false,
            error: errorMessage,
          };
          await appendDelivery(delivery);
          item.failedRecipients.push({ email, error: errorMessage });
          failedEmails += 1;
        }
      }

      items.push(item);
    }

    const run: LicenseExpiryReminderRun = {
      id: `expiry-run-${randomUUID()}`,
      createdAt: new Date().toISOString(),
      source,
      dryRun,
      scannedLicenses: store.licenses.length,
      eligibleLicenses,
      stageCandidates,
      intendedEmails,
      sentEmails,
      alreadySentEmails,
      failedEmails,
      items,
    };
    await appendRun(run);
    return run;
  } finally {
    await releaseLock(lock);
  }
}

export async function getLicenseExpiryReminderStatus(limit = 50) {
  const deliveries = await readDeliveries(Math.max(limit * 10, 500));
  let runs: LicenseExpiryReminderRun[] = [];
  try {
    const raw = await fs.readFile(runHistoryFile, "utf8");
    runs = raw
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line) as LicenseExpiryReminderRun)
      .reverse();
  } catch {
    runs = [];
  }
  return {
    ok: true,
    thresholds: [30, 7, 1, 0],
    timezone: "Europe/Budapest",
    recommendedCron: "CRON_TZ=Europe/Budapest\n0 8 * * * /bin/bash /root/dimprover/scripts/run-license-expiry-reminders.sh",
    deliveryHistoryFile,
    runHistoryFile,
    latestRuns: runs,
    latestDeliveries: deliveries.slice(-limit).reverse(),
  };
}
