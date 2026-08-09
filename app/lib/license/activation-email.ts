import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getLicenseActivationMailSettings,
  sendDimproMail,
} from "./mail-profiles";
import type {
  ActivateLicenseRequest,
  LicenseDeviceRecord,
  LicenseRecord,
} from "./types";
import {
  getContactGreetingName,
  getLicenseContacts,
  getLicenseEmailContacts,
} from "./contacts";

export type LicenseActivationEmailContext = {
  license: LicenseRecord;
  device: LicenseDeviceRecord;
  request: ActivateLicenseRequest;
  activeDeviceCount: number;
  ipAddress?: string;
};

type DeliveryResult = {
  attempted: boolean;
  sent: boolean;
  to: string[];
  error?: string;
};

export type LicenseActivationEmailResult = {
  createdAt: string;
  admin: DeliveryResult;
  contact: DeliveryResult;
};

function resolveProjectRoot() {
  const cwd = process.cwd();
  const standaloneSuffix = `${path.sep}.next${path.sep}standalone`;
  if (cwd.endsWith(standaloneSuffix)) return cwd.slice(0, -standaloneSuffix.length);
  return cwd;
}

const projectRoot = process.env.DIMPRO_PROJECT_ROOT ?? resolveProjectRoot();
const activationMailLogFile = path.join(
  projectRoot,
  ".dimprover",
  "mail",
  "license-activation-email-history.jsonl",
);

function escapeHtml(value: string | undefined | null) {
  return String(value ?? "")
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
    second: "2-digit",
  });
}


function formatStatus(status: LicenseRecord["status"]) {
  const labels: Record<LicenseRecord["status"], string> = {
    active: "Aktív",
    expired: "Lejárt",
    blocked: "Tiltott",
    trial: "Próba",
    pending: "Függőben",
    archived: "Archivált",
  };
  return labels[status];
}

function formatBillingInterval(value: LicenseRecord["billingInterval"]) {
  switch (value) {
    case "monthly": return "Havi";
    case "yearly": return "Éves";
    case "manual": return "Kézi";
    case "none": return "Nincs";
    default: return "-";
  }
}

function maskLicenseKey(value: string) {
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

function shortenMachineId(value: string) {
  if (value.length <= 20) return value;
  return `${value.slice(0, 12)}…${value.slice(-6)}`;
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

function buildAdminMail(context: LicenseActivationEmailContext) {
  const { license, device, request } = context;
  const modules = license.enabledModules.length
    ? license.enabledModules.join(", ")
    : "nincs külön modul megadva";

  const subject = `DIMPRO licenc aktiválva – ${license.companyName}`;
  const text = [
    "Új DIMPRO licencaktiválás történt.",
    "",
    `Cég / ügyfél: ${license.companyName}`,
    ...contactTextLines(license),
    `Licenc: ${maskLicenseKey(license.licenseKey)}`,
    `Alkalmazás: ${request.appId}`,
    `Alkalmazásverzió: ${request.appVersion}`,
    `Gépazonosító: ${shortenMachineId(device.machineIdHash)}`,
    `Aktiválás időpontja: ${formatDate(device.firstActivatedAt)}`,
    `Licenc állapota: ${formatStatus(license.status)}`,
    `Licenc kezdete: ${formatDate(license.startsAt)}`,
    `Licenc lejárata: ${formatDate(license.expiresAt)}`,
    `Fordulónap / aktuális időszak vége: ${formatDate(license.currentPeriodEnd ?? license.expiresAt)}`,
    `Számlázási ciklus: ${formatBillingInterval(license.billingInterval)}`,
    `Aktív / maximális gépszám: ${context.activeDeviceCount} / ${license.maxDevices}`,
    `Modulok: ${modules}`,
    context.ipAddress ? `IP-cím: ${context.ipAddress}` : "",
    "",
    "Ez automatikus DIMPRO rendszerüzenet.",
  ].filter(Boolean).join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:720px">
      <div style="border:1px solid #bae6fd;background:#f0f9ff;border-radius:16px;padding:20px">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0891b2">DIMPRO rendszerüzenet</p>
        <h2 style="margin:0 0 16px;color:#0e7490">Új licencaktiválás történt</h2>
        ${contactHtml(license)}
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tbody>
            <tr><td style="padding:7px 8px;color:#64748b">Cég / ügyfél</td><td style="padding:7px 8px;font-weight:700">${escapeHtml(license.companyName)}</td></tr>
            <tr><td style="padding:7px 8px;color:#64748b">Licenc</td><td style="padding:7px 8px;font-family:monospace;font-weight:700">${escapeHtml(maskLicenseKey(license.licenseKey))}</td></tr>
            <tr><td style="padding:7px 8px;color:#64748b">Alkalmazás</td><td style="padding:7px 8px;font-weight:700">${escapeHtml(request.appId)}</td></tr>
            <tr><td style="padding:7px 8px;color:#64748b">Verzió</td><td style="padding:7px 8px;font-weight:700">${escapeHtml(request.appVersion)}</td></tr>
            <tr><td style="padding:7px 8px;color:#64748b">Gépazonosító</td><td style="padding:7px 8px;font-family:monospace;font-weight:700">${escapeHtml(shortenMachineId(device.machineIdHash))}</td></tr>
            <tr><td style="padding:7px 8px;color:#64748b">Aktiválás</td><td style="padding:7px 8px;font-weight:700">${escapeHtml(formatDate(device.firstActivatedAt))}</td></tr>
            <tr><td style="padding:7px 8px;color:#64748b">Licenc állapota</td><td style="padding:7px 8px;font-weight:700">${escapeHtml(formatStatus(license.status))}</td></tr>
            <tr><td style="padding:7px 8px;color:#64748b">Kezdés</td><td style="padding:7px 8px;font-weight:700">${escapeHtml(formatDate(license.startsAt))}</td></tr>
            <tr><td style="padding:7px 8px;color:#64748b">Lejárat</td><td style="padding:7px 8px;font-weight:700">${escapeHtml(formatDate(license.expiresAt))}</td></tr>
            <tr><td style="padding:7px 8px;color:#64748b">Fordulónap / időszak vége</td><td style="padding:7px 8px;font-weight:700">${escapeHtml(formatDate(license.currentPeriodEnd ?? license.expiresAt))}</td></tr>
            <tr><td style="padding:7px 8px;color:#64748b">Számlázási ciklus</td><td style="padding:7px 8px;font-weight:700">${escapeHtml(formatBillingInterval(license.billingInterval))}</td></tr>
            <tr><td style="padding:7px 8px;color:#64748b">Aktív / maximális gépszám</td><td style="padding:7px 8px;font-weight:700">${context.activeDeviceCount} / ${license.maxDevices}</td></tr>
            <tr><td style="padding:7px 8px;color:#64748b">Modulok</td><td style="padding:7px 8px;font-weight:700">${escapeHtml(modules)}</td></tr>
            ${context.ipAddress ? `<tr><td style="padding:7px 8px;color:#64748b">IP-cím</td><td style="padding:7px 8px;font-weight:700">${escapeHtml(context.ipAddress)}</td></tr>` : ""}
          </tbody>
        </table>
      </div>
      <p style="margin-top:14px;font-size:12px;color:#64748b">Ez automatikus DIMPRO rendszerüzenet.</p>
    </div>
  `;

  return { subject, text, html };
}

function buildContactMail(context: LicenseActivationEmailContext, recipientName: string) {
  const { license, device, request } = context;
  const customerUrl =
    process.env.DIMPRO_CUSTOMER_PORTAL_URL ??
    "https://license.dimpro.hu/customer";

  const subject = "Sikeres DIMPRO licencaktiválás";
  const text = [
    `Tisztelt ${recipientName}!`,
    "",
    "A DIMPRO licenc aktiválása sikeresen megtörtént.",
    "",
    `Cég / ügyfél: ${license.companyName}`,
    ...contactTextLines(license),
    `Alkalmazás: ${request.appId}`,
    `Alkalmazásverzió: ${request.appVersion}`,
    `Aktiválás időpontja: ${formatDate(device.firstActivatedAt)}`,
    `Licenc állapota: ${formatStatus(license.status)}`,
    `Licenc kezdete: ${formatDate(license.startsAt)}`,
    `Licenc lejárata: ${formatDate(license.expiresAt)}`,
    `Fordulónap / aktuális időszak vége: ${formatDate(license.currentPeriodEnd ?? license.expiresAt)}`,
    `Aktív / maximális gépszám: ${context.activeDeviceCount} / ${license.maxDevices}`,
    `Licenc állapot lekérdezése: ${customerUrl}`,
    "",
    "Amennyiben az aktiválás a szervezetük számára nem ismert vagy nem engedélyezett, kérjük, válaszoljon erre az üzenetre.",
    "",
    "Üdvözlettel:",
    "DIMPRO rendszer",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:680px">
      <p>Tisztelt ${escapeHtml(recipientName)}!</p>
      <h2 style="color:#0e7490;margin-bottom:10px">Sikeres DIMPRO licencaktiválás</h2>
      <p>A DIMPRO licenc aktiválása sikeresen megtörtént.</p>
      ${contactHtml(license)}
      <div style="border:1px solid #bae6fd;background:#f0f9ff;border-radius:14px;padding:16px;margin:16px 0">
        <p><strong>Cég / ügyfél:</strong> ${escapeHtml(license.companyName)}</p>
        <p><strong>Alkalmazás:</strong> ${escapeHtml(request.appId)}</p>
        <p><strong>Alkalmazásverzió:</strong> ${escapeHtml(request.appVersion)}</p>
        <p><strong>Aktiválás időpontja:</strong> ${escapeHtml(formatDate(device.firstActivatedAt))}</p>
        <p><strong>Licenc állapota:</strong> ${escapeHtml(formatStatus(license.status))}</p>
        <p><strong>Licenc kezdete:</strong> ${escapeHtml(formatDate(license.startsAt))}</p>
        <p><strong>Licenc lejárata:</strong> ${escapeHtml(formatDate(license.expiresAt))}</p>
        <p><strong>Fordulónap / időszak vége:</strong> ${escapeHtml(formatDate(license.currentPeriodEnd ?? license.expiresAt))}</p>
        <p><strong>Aktív / maximális gépszám:</strong> ${context.activeDeviceCount} / ${license.maxDevices}</p>
      </div>
      <p><a href="${escapeHtml(customerUrl)}" style="display:inline-block;border-radius:10px;background:#0891b2;color:white;text-decoration:none;padding:10px 14px;font-weight:700">Licenc állapotának megtekintése</a></p>
      <p style="margin-top:18px">Amennyiben az aktiválás a szervezetük számára nem ismert vagy nem engedélyezett, kérjük, válaszoljon erre az üzenetre.</p>
      <p>Üdvözlettel:<br><strong>DIMPRO rendszer</strong></p>
    </div>
  `;

  return { subject, text, html };
}

async function appendActivationMailLog(
  context: LicenseActivationEmailContext,
  result: LicenseActivationEmailResult,
) {
  try {
    await fs.mkdir(path.dirname(activationMailLogFile), { recursive: true });
    const record = {
      createdAt: result.createdAt,
      licenseKeyMasked: maskLicenseKey(context.license.licenseKey),
      companyId: context.license.companyId,
      companyName: context.license.companyName,
      appId: context.request.appId,
      appVersion: context.request.appVersion,
      machineIdHash: shortenMachineId(context.device.machineIdHash),
      admin: result.admin,
      contact: result.contact,
    };
    await fs.appendFile(
      activationMailLogFile,
      `${JSON.stringify(record)}\n`,
      "utf8",
    );
    const raw = await fs.readFile(activationMailLogFile, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    if (lines.length > 500) {
      await fs.writeFile(
        activationMailLogFile,
        `${lines.slice(-500).join("\n")}\n`,
        "utf8",
      );
    }
  } catch (error) {
    console.error("DIMPRO licencaktiválási e-mail naplózási hiba", error);
  }
}

export async function sendLicenseActivationEmails(
  context: LicenseActivationEmailContext,
): Promise<LicenseActivationEmailResult> {
  const settings = await getLicenseActivationMailSettings();
  const adminMail = buildAdminMail(context);
  const emailContacts = getLicenseEmailContacts(context.license);

  const adminPromise = settings.adminRecipients.length
    ? sendDimproMail({
        profileId: "system",
        to: settings.adminRecipients,
        replyTo: settings.replyTo,
        ...adminMail,
      })
    : Promise.reject(new Error("Nincs licencaktiválási admin címzett beállítva."));

  const contactPromises = emailContacts.map((contact) =>
    sendDimproMail({
      profileId: "system",
      to: [contact.email],
      replyTo: settings.replyTo,
      ...buildContactMail(
        context,
        getContactGreetingName(contact, context.license),
      ),
    }),
  );

  const [adminSettled, contactSettled] = await Promise.all([
    adminPromise.then(
      () => ({ status: "fulfilled" as const }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    ),
    Promise.allSettled(contactPromises),
  ]);

  const failedContacts = contactSettled.filter(
    (item): item is PromiseRejectedResult => item.status === "rejected",
  );
  const contactError = failedContacts.length
    ? failedContacts
        .map((item) =>
          item.reason instanceof Error ? item.reason.message : String(item.reason),
        )
        .join("; ")
    : undefined;

  const result: LicenseActivationEmailResult = {
    createdAt: new Date().toISOString(),
    admin: {
      attempted: settings.adminRecipients.length > 0,
      sent: adminSettled.status === "fulfilled",
      to: settings.adminRecipients,
      ...(adminSettled.status === "rejected"
        ? {
            error:
              adminSettled.reason instanceof Error
                ? adminSettled.reason.message
                : String(adminSettled.reason),
          }
        : {}),
    },
    contact: {
      attempted: emailContacts.length > 0,
      sent: emailContacts.length > 0 && failedContacts.length === 0,
      to: emailContacts.map((contact) => contact.email),
      ...(contactError ? { error: contactError } : {}),
    },
  };

  await appendActivationMailLog(context, result);
  return result;
}
