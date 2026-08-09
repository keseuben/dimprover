import type { LicenseRecord } from "./types";
import {
  getContactGreetingName,
  getLicenseContacts,
  getLicenseEmailContacts,
} from "./contacts";
import {
  getLicenseActivationMailSettings,
  sendDimproMail,
} from "./mail-profiles";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("hu-HU", { timeZone: "Europe/Budapest" });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

export function buildLicenseEmailText(
  license: LicenseRecord,
  recipientName?: string,
) {
  const contactName = recipientName?.trim() || license.companyName;
  const customerUrl = process.env.DIMPRO_CUSTOMER_PORTAL_URL ?? "https://license.dimpro.hu/customer";
  const downloadUrl = process.env.DIMPRO_LICENSE_DOWNLOAD_URL ?? "";
  const modules = license.enabledModules.length ? license.enabledModules.join(", ") : "nincs külön modul megadva";

  return {
    subject: `DIMPRO licenckulcs - ${license.companyName}`,
    text: [
      `Tisztelt ${contactName}!`,
      "",
      "A DIMPRO licenckulcsa elkészült.",
      "",
      `Cég / ügyfél: ${license.companyName}`,
      ...contactTextLines(license),
      `Licenckulcs: ${license.licenseKey}`,
      `Engedélyezett gépszám: ${license.maxDevices}`,
      `Lejárat: ${formatDate(license.expiresAt)}`,
      `Moduljogosultságok: ${modules}`,
      "",
      downloadUrl ? `Letöltési link: ${downloadUrl}` : "A program letöltési linkjét külön üzenetben vagy a DIMPRO adminisztrátortól kapja meg.",
      `Licenc állapot lekérdezése: ${customerUrl}`,
      "",
      "Az első indításkor a fenti licenckulcsot kell megadni az aktiváló ablakban.",
      "Internetkapcsolat szükséges az első aktiváláshoz.",
      "",
      "Üdvözlettel:",
      "DIMPRO licenckezelő",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a">
        <h2 style="margin:0 0 12px;color:#0891b2">DIMPRO licenckulcs</h2>
        <p>Tisztelt ${escapeHtml(contactName)}!</p>
        <p>A DIMPRO licenckulcsa elkészült.</p>
        ${contactHtml(license)}
        <div style="border:1px solid #bae6fd;background:#f0f9ff;border-radius:12px;padding:16px;margin:16px 0">
          <p><strong>Cég / ügyfél:</strong> ${escapeHtml(license.companyName)}</p>
          <p><strong>Licenckulcs:</strong><br><span style="font-size:18px;font-weight:700;color:#0e7490">${escapeHtml(license.licenseKey)}</span></p>
          <p><strong>Engedélyezett gépszám:</strong> ${license.maxDevices}</p>
          <p><strong>Lejárat:</strong> ${escapeHtml(formatDate(license.expiresAt))}</p>
          <p><strong>Moduljogosultságok:</strong> ${escapeHtml(modules)}</p>
        </div>
        ${downloadUrl ? `<p><strong>Letöltési link:</strong> <a href="${escapeHtml(downloadUrl)}">${escapeHtml(downloadUrl)}</a></p>` : `<p>A program letöltési linkjét külön üzenetben vagy a DIMPRO adminisztrátortól kapja meg.</p>`}
        <p><strong>Licenc állapot lekérdezése:</strong> <a href="${escapeHtml(customerUrl)}">${escapeHtml(customerUrl)}</a></p>
        <p>Az első indításkor a fenti licenckulcsot kell megadni az aktiváló ablakban. Internetkapcsolat szükséges az első aktiváláshoz.</p>
        <p>Üdvözlettel:<br>DIMPRO licenckezelő</p>
      </div>
    `,
  };
}

export async function sendLicenseEmail(license: LicenseRecord) {
  const emailContacts = getLicenseEmailContacts(license);
  if (!emailContacts.length) {
    return { ok: false, error: "A licencnél nincs érvényes kapcsolattartói e-mail cím megadva." };
  }

  try {
    const settings = await getLicenseActivationMailSettings();
    const settled = await Promise.allSettled(
      emailContacts.map((contact) => {
        const body = buildLicenseEmailText(
          license,
          getContactGreetingName(contact, license),
        );
        return sendDimproMail({
          profileId: "system",
          to: [contact.email],
          replyTo: settings.replyTo,
          subject: body.subject,
          text: body.text,
          html: body.html,
        });
      }),
    );
    const failed = settled.filter(
      (item): item is PromiseRejectedResult => item.status === "rejected",
    );
    if (failed.length) {
      return {
        ok: false,
        error: failed
          .map((item) =>
            item.reason instanceof Error
              ? item.reason.message
              : String(item.reason),
          )
          .join("; "),
      };
    }
    return { ok: true, recipients: emailContacts.map((contact) => contact.email) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ismeretlen SMTP küldési hiba.",
    };
  }
}
