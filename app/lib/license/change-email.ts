import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getLicenseActivationMailSettings,
  sendDimproMail,
} from "./mail-profiles";
import type {
  LicenseDeviceRecord,
  LicenseRecord,
  StoredLicenseStatus,
} from "./types";
import {
  getContactGreetingName,
  getLicenseContacts,
  getLicenseEmailContacts,
} from "./contacts";

export type LicenseChangeAction =
  | "createLicense"
  | "updateLicense"
  | "archiveLicense"
  | "removeLicense"
  | "removeDevice"
  | "updateDeviceMeta"
  | "setDeviceStatus";

export type LicenseChangeEmailContext = {
  action: LicenseChangeAction;
  licenseBefore?: LicenseRecord;
  licenseAfter?: LicenseRecord;
  deviceBefore?: LicenseDeviceRecord;
  deviceAfter?: LicenseDeviceRecord;
  activeDeviceCount: number;
  changedFields?: string[];
};

export type LicenseChangeEmailResult = {
  attempted: boolean;
  sent: boolean;
  to: string[];
  createdAt: string;
  error?: string;
};

function resolveProjectRoot() {
  const cwd = process.cwd();
  const standaloneSuffix = `${path.sep}.next${path.sep}standalone`;
  if (cwd.endsWith(standaloneSuffix)) return cwd.slice(0, -standaloneSuffix.length);
  return cwd;
}

const projectRoot = process.env.DIMPRO_PROJECT_ROOT ?? resolveProjectRoot();
const changeMailLogFile = path.join(
  projectRoot,
  ".dimprover",
  "mail",
  "license-change-email-history.jsonl",
);

function escapeHtml(value: string | number | undefined | null) {
  return String(value ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value?: string) {
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

function formatStatus(status?: StoredLicenseStatus) {
  const labels: Record<StoredLicenseStatus, string> = {
    active: "Aktív",
    expired: "Lejárt",
    blocked: "Tiltott",
    trial: "Próba",
    pending: "Függőben",
    archived: "Archivált",
  };
  return status ? labels[status] : "-";
}

function formatBillingInterval(value?: LicenseRecord["billingInterval"]) {
  switch (value) {
    case "monthly":
      return "Havi";
    case "yearly":
      return "Éves";
    case "manual":
      return "Kézi";
    case "none":
      return "Nincs";
    default:
      return "-";
  }
}

function actionLabel(action: LicenseChangeAction) {
  const labels: Record<LicenseChangeAction, string> = {
    createLicense: "Licenc létrehozása",
    updateLicense: "Licencadatok módosítása",
    archiveLicense: "Licenc archiválása",
    removeLicense: "Licenc törlése",
    removeDevice: "Aktivált gép eltávolítása",
    updateDeviceMeta: "Gépadatok módosítása",
    setDeviceStatus: "Gép státuszának módosítása",
  };
  return labels[action];
}

function getLicense(context: LicenseChangeEmailContext) {
  return context.licenseAfter ?? context.licenseBefore;
}

function getDevice(context: LicenseChangeEmailContext) {
  return context.deviceAfter ?? context.deviceBefore;
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
      ${contacts.map((contact) => `
        <div style="padding:8px 0;${contact.order === 1 ? "" : "border-top:1px solid #e2e8f0;"}">
          <strong>${contact.order}. ${escapeHtml(contact.name || "Név nincs megadva")}</strong><br>
          <span style="color:#475569">Szerepkör: ${escapeHtml(contact.role || "-")}</span><br>
          <span style="color:#475569">E-mail: ${escapeHtml(contact.email || "-")} · Telefon: ${escapeHtml(contact.phone || "-")}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function buildMail(context: LicenseChangeEmailContext, recipientName: string) {
  const license = getLicense(context);
  if (!license) throw new Error("Hiányzó licencadat a változásértesítéshez.");

  const device = getDevice(context);
  const customerUrl =
    process.env.DIMPRO_CUSTOMER_PORTAL_URL ??
    "https://license.dimpro.hu/customer";
  const changes = context.changedFields?.length
    ? context.changedFields
    : [actionLabel(context.action)];
  const changeLines = changes.map((item) => `- ${item}`);
  const modules = license.enabledModules.length
    ? license.enabledModules.join(", ")
    : "nincs külön modul megadva";

  const beforeExpiry = context.licenseBefore ? new Date(context.licenseBefore.expiresAt) : null;
  const afterExpiry = context.licenseAfter ? new Date(context.licenseAfter.expiresAt) : null;
  const isRenewal = context.action === "updateLicense"
    && beforeExpiry
    && afterExpiry
    && !Number.isNaN(beforeExpiry.getTime())
    && !Number.isNaN(afterExpiry.getTime())
    && afterExpiry.getTime() > beforeExpiry.getTime();
  const subject = isRenewal
    ? `DIMPRO licenc meghosszabbítva – ${license.companyName}`
    : `DIMPRO licencváltozás – ${license.companyName}`;
  const heading = isRenewal ? "A DIMPRO licenc meghosszabbítása megtörtént" : "Licencváltozás történt";
  const introduction = isRenewal
    ? "A DIMPRO licenc új lejárati dátummal meghosszabbításra került. A licenckulcs és a meglévő gépaktiválások változatlanul használhatók."
    : "A DIMPRO licencéhez kapcsolódó adatok megváltoztak.";
  const text = [
    `Tisztelt ${recipientName}!`,
    "",
    introduction,
    "",
    `Művelet: ${actionLabel(context.action)}`,
    ...changeLines,
    "",
    `Cég / ügyfél: ${license.companyName}`,
    ...contactTextLines(license),
    `Licenc állapota: ${formatStatus(license.status)}`,
    `Kezdés: ${formatDate(license.startsAt)}`,
    `Lejárat: ${formatDate(license.expiresAt)}`,
    `Fordulónap / aktuális időszak vége: ${formatDate(license.currentPeriodEnd)}`,
    `Számlázási ciklus: ${formatBillingInterval(license.billingInterval)}`,
    `Aktív gépszám: ${context.activeDeviceCount} / ${license.maxDevices}`,
    `Moduljogosultságok: ${modules}`,
    device ? `Érintett alkalmazás: ${device.appId}` : "",
    device ? `Érintett gép státusza: ${device.status === "blocked" ? "Tiltott" : "Aktív"}` : "",
    device?.userName ? `Gép használója: ${device.userName}` : "",
    "",
    context.action === "removeLicense"
      ? "A licencet a DIMPRO licenckezelő rendszerből eltávolították."
      : `Licenc állapotának megtekintése: ${customerUrl}`,
    "",
    "Amennyiben a változtatás a szervezetük számára nem ismert vagy nem engedélyezett, kérjük, válaszoljon erre az üzenetre.",
    "",
    "Üdvözlettel:",
    "DIMPRO rendszerüzenet",
  ].filter(Boolean).join("\n");

  const changeItems = changes
    .map((item) => `<li style="margin:4px 0">${escapeHtml(item)}</li>`)
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:720px">
      <p>Tisztelt ${escapeHtml(recipientName)}!</p>
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0891b2">DIMPRO rendszerüzenet</p>
      <h2 style="margin:0 0 12px;color:#0e7490">${escapeHtml(heading)}</h2>
      <p>${escapeHtml(introduction)}</p>
      ${contactHtml(license)}
      <div style="border:1px solid #bae6fd;background:#f0f9ff;border-radius:14px;padding:16px;margin:16px 0">
        <p style="margin-top:0"><strong>Művelet:</strong> ${escapeHtml(actionLabel(context.action))}</p>
        <ul style="padding-left:20px;margin-bottom:0">${changeItems}</ul>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #e2e8f0">
        <tbody>
          <tr><td style="padding:8px;color:#64748b">Cég / ügyfél</td><td style="padding:8px;font-weight:700">${escapeHtml(license.companyName)}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Licenc állapota</td><td style="padding:8px;font-weight:700">${escapeHtml(formatStatus(license.status))}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Kezdés</td><td style="padding:8px;font-weight:700">${escapeHtml(formatDate(license.startsAt))}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Lejárat</td><td style="padding:8px;font-weight:700">${escapeHtml(formatDate(license.expiresAt))}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Fordulónap / időszak vége</td><td style="padding:8px;font-weight:700">${escapeHtml(formatDate(license.currentPeriodEnd))}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Számlázási ciklus</td><td style="padding:8px;font-weight:700">${escapeHtml(formatBillingInterval(license.billingInterval))}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Aktív / maximális gépszám</td><td style="padding:8px;font-weight:700">${context.activeDeviceCount} / ${license.maxDevices}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Moduljogosultságok</td><td style="padding:8px;font-weight:700">${escapeHtml(modules)}</td></tr>
          ${device ? `<tr><td style="padding:8px;color:#64748b">Érintett alkalmazás</td><td style="padding:8px;font-weight:700">${escapeHtml(device.appId)}</td></tr>` : ""}
          ${device ? `<tr><td style="padding:8px;color:#64748b">Gép státusza</td><td style="padding:8px;font-weight:700">${device.status === "blocked" ? "Tiltott" : "Aktív"}</td></tr>` : ""}
          ${device?.userName ? `<tr><td style="padding:8px;color:#64748b">Gép használója</td><td style="padding:8px;font-weight:700">${escapeHtml(device.userName)}</td></tr>` : ""}
        </tbody>
      </table>
      ${context.action === "removeLicense"
        ? `<p style="margin-top:18px;font-weight:700;color:#b91c1c">A licencet a DIMPRO licenckezelő rendszerből eltávolították.</p>`
        : `<p style="margin-top:18px"><a href="${escapeHtml(customerUrl)}" style="display:inline-block;border-radius:10px;background:#0891b2;color:white;text-decoration:none;padding:10px 14px;font-weight:700">Licenc állapotának megtekintése</a></p>`}
      <p style="margin-top:18px">Amennyiben a változtatás a szervezetük számára nem ismert vagy nem engedélyezett, kérjük, válaszoljon erre az üzenetre.</p>
      <p>Üdvözlettel:<br><strong>DIMPRO rendszerüzenet</strong></p>
    </div>
  `;

  return { subject, text, html };
}

async function appendLog(
  context: LicenseChangeEmailContext,
  result: LicenseChangeEmailResult,
) {
  try {
    const license = getLicense(context);
    await fs.mkdir(path.dirname(changeMailLogFile), { recursive: true });
    await fs.appendFile(
      changeMailLogFile,
      `${JSON.stringify({
        createdAt: result.createdAt,
        action: context.action,
        licenseId: license?.id,
        companyName: license?.companyName,
        deviceId: getDevice(context)?.id,
        changedFields: context.changedFields ?? [],
        activeDeviceCount: context.activeDeviceCount,
        result,
      })}\n`,
      "utf8",
    );
    const raw = await fs.readFile(changeMailLogFile, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    if (lines.length > 500) {
      await fs.writeFile(
        changeMailLogFile,
        `${lines.slice(-500).join("\n")}\n`,
        "utf8",
      );
    }
  } catch (error) {
    console.error("DIMPRO licencváltozás e-mail naplózási hiba", error);
  }
}

export async function sendLicenseChangeEmail(
  context: LicenseChangeEmailContext,
): Promise<LicenseChangeEmailResult> {
  const createdAt = new Date().toISOString();
  const license = getLicense(context);
  const emailContacts = license ? getLicenseEmailContacts(license) : [];

  if (!license || emailContacts.length === 0) {
    const result: LicenseChangeEmailResult = {
      attempted: false,
      sent: false,
      to: [],
      createdAt,
      error: "A licencnél nincs érvényes kapcsolattartói e-mail cím.",
    };
    await appendLog(context, result);
    return result;
  }

  try {
    const settings = await getLicenseActivationMailSettings();
    const settled = await Promise.allSettled(
      emailContacts.map((contact) =>
        sendDimproMail({
          profileId: "system",
          to: [contact.email],
          replyTo: settings.replyTo,
          ...buildMail(context, getContactGreetingName(contact, license)),
        }),
      ),
    );
    const failed = settled.filter(
      (item): item is PromiseRejectedResult => item.status === "rejected",
    );
    const result: LicenseChangeEmailResult = {
      attempted: true,
      sent: failed.length === 0,
      to: emailContacts.map((contact) => contact.email),
      createdAt,
      ...(failed.length
        ? {
            error: failed
              .map((item) =>
                item.reason instanceof Error
                  ? item.reason.message
                  : String(item.reason),
              )
              .join("; "),
          }
        : {}),
    };
    await appendLog(context, result);
    return result;
  } catch (error) {
    const result: LicenseChangeEmailResult = {
      attempted: true,
      sent: false,
      to: emailContacts.map((contact) => contact.email),
      createdAt,
      error: error instanceof Error ? error.message : String(error),
    };
    await appendLog(context, result);
    return result;
  }
}
