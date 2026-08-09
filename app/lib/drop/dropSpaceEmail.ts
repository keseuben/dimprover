import {
  getMailProfilesSafeConfig,
  sendDimproMail,
} from "@/app/lib/license/mail-profiles";
import type { DropSpaceMembershipRole } from "./dropSpaceTypes";

const ROLE_LABELS: Record<DropSpaceMembershipRole, string> = {
  owner: "Térgazda",
  space_admin: "Téradminisztrátor",
  contributor: "Közreműködő – saját csomagot készíthet",
  uploader: "Feltöltő – kijelölt csomagokba tölthet",
  viewer: "Megtekintő",
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("hu-HU", { timeZone: "Europe/Budapest" });
}

export async function sendDropSpaceInvitationEmail(input: {
  spaceName: string;
  spaceCode: string;
  recipientName: string;
  recipientEmail: string;
  recipientRole: DropSpaceMembershipRole;
  invitationLink: string;
  invitationExpiresAt: string;
  accessEndsAt: string;
  ownerName: string;
  ownerEmail?: string | null;
  projectNames?: string[];
}) {
  const config = await getMailProfilesSafeConfig();
  const dropProfile = config.profiles.find((profile) => profile.id === "drop");
  if (!dropProfile?.enabled || !dropProfile.smtpConfigured) {
    throw new Error("A DIMPRO Drop SMTP-profil nincs teljesen beállítva.");
  }

  const roleLabel = ROLE_LABELS[input.recipientRole];
  const projects = (input.projectNames || []).filter(Boolean);
  const subject = `DIMPRO Drop tér meghívó – ${input.spaceName}`;
  const text = [
    `Tisztelt ${input.recipientName}!`,
    "",
    `${input.ownerName} meghívta Önt egy DIMPRO Drop hozzáférési térbe.`,
    "",
    `Drop tér: ${input.spaceName}`,
    `Térkód: ${input.spaceCode}`,
    `Szerepkör: ${roleLabel}`,
    ...(projects.length ? [`Kapcsolódó projekt: ${projects.join(", ")}`] : []),
    `Hozzáférés vége: ${formatDate(input.accessEndsAt)}`,
    `A meghívólink lejárata: ${formatDate(input.invitationExpiresAt)}`,
    "",
    `Meghívás elfogadása: ${input.invitationLink}`,
    "",
    "A meghívott külső tagként külön fizetős licenc nélkül, a térgazda licenckeretében használhatja a számára engedélyezett funkciókat.",
    "A meghívólink egyszer használható. Ne továbbítsa más személynek.",
    "",
    "Üdvözlettel:",
    "DIMPRO Drop",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:720px;margin:auto">
      <div style="border:1px solid #99f6e4;background:#f0fdfa;border-radius:20px;padding:26px">
        <p style="margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0f766e">DIMPRO Drop hozzáférési tér</p>
        <h1 style="margin:0;font-size:26px;color:#0f172a">${escapeHtml(input.spaceName)}</h1>
        <p>Tisztelt ${escapeHtml(input.recipientName)}!</p>
        <p><strong>${escapeHtml(input.ownerName)}</strong> meghívta Önt egy DIMPRO Drop hozzáférési térbe.</p>
        <div style="margin:18px 0;border:1px solid #ccfbf1;background:#ffffff;border-radius:14px;padding:16px">
          <p style="margin:0 0 8px"><strong>Térkód:</strong> ${escapeHtml(input.spaceCode)}</p>
          <p style="margin:0 0 8px"><strong>Szerepkör:</strong> ${escapeHtml(roleLabel)}</p>
          ${projects.length ? `<p style="margin:0 0 8px"><strong>Projekt:</strong> ${escapeHtml(projects.join(", "))}</p>` : ""}
          <p style="margin:0 0 8px"><strong>Hozzáférés vége:</strong> ${escapeHtml(formatDate(input.accessEndsAt))}</p>
          <p style="margin:0"><strong>Meghívólink lejárata:</strong> ${escapeHtml(formatDate(input.invitationExpiresAt))}</p>
        </div>
        <p><a href="${escapeHtml(input.invitationLink)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;font-weight:800;padding:13px 19px;border-radius:11px">Meghívás elfogadása</a></p>
        <p style="font-size:13px;color:#475569">Külön fizetős licenc nem szükséges: a hozzáférés a térgazda licenckeretében működik. A link egyszer használható és nem továbbítható.</p>
      </div>
      <p style="font-size:12px;color:#64748b">Automatikus DIMPRO Drop rendszerüzenet.</p>
    </div>
  `;

  return sendDimproMail({
    profileId: "drop",
    to: [input.recipientEmail],
    replyTo: input.ownerEmail || "info@dimpro.hu",
    subject,
    text,
    html,
  });
}

export function getDropSpaceRoleLabel(role: DropSpaceMembershipRole) {
  return ROLE_LABELS[role];
}


async function assertDriveMailReady() {
  const config = await getMailProfilesSafeConfig();
  const dropProfile = config.profiles.find((profile) => profile.id === "drop");
  if (!dropProfile?.enabled || !dropProfile.smtpConfigured) {
    throw new Error("A DIMPRO Drop SMTP-profil nincs teljesen beállítva.");
  }
}

export async function sendDropSpaceAcceptanceEmail(input: {
  spaceName: string;
  spaceCode: string;
  recipientName: string;
  recipientEmail: string;
  recipientRole: DropSpaceMembershipRole;
  accessEndsAt: string;
  spaceUrl: string;
  ownerEmail?: string | null;
  projectNames?: string[];
}) {
  await assertDriveMailReady();
  const roleLabel = ROLE_LABELS[input.recipientRole];
  const projects = (input.projectNames || []).filter(Boolean);
  const subject = `DIMPRO Drop hozzáférés aktiválva – ${input.spaceName} – ${input.spaceCode}`;
  const text = [
    `Tisztelt ${input.recipientName}!`,
    "",
    "A DIMPRO Drop térmeghívás elfogadása sikeres.",
    "",
    `Drop tér: ${input.spaceName}`,
    `Térkód: ${input.spaceCode}`,
    `Szerepkör: ${roleLabel}`,
    ...(projects.length ? [`Kapcsolódó projekt: ${projects.join(", ")}`] : []),
    `Hozzáférés vége: ${formatDate(input.accessEndsAt)}`,
    "",
    `Tér megnyitása: ${input.spaceUrl}`,
    "",
    "A konkrét csomagok kódját és hatjegyű PIN-jét külön csomagmeghívó e-mailben küldi a rendszer.",
    "Ha később nem emlékszik a PIN-re, a csomagbelépő oldalon kérhet új kódot.",
    "",
    "Üdvözlettel:",
    "DIMPRO Drop",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:720px;margin:auto">
      <div style="border:1px solid #86efac;background:#f0fdf4;border-radius:20px;padding:26px">
        <p style="margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#047857">DIMPRO Drop hozzáférés aktiválva</p>
        <h1 style="margin:0;font-size:26px;color:#0f172a">${escapeHtml(input.spaceName)}</h1>
        <p>Tisztelt ${escapeHtml(input.recipientName)}!</p>
        <p>A térmeghívás elfogadása sikeres. A hozzáférése aktív.</p>
        <div style="margin:18px 0;border:1px solid #bbf7d0;background:#ffffff;border-radius:14px;padding:16px">
          <p style="margin:0 0 8px"><strong>Térkód:</strong> <span style="font-size:18px;font-weight:900;letter-spacing:.06em;color:#047857">${escapeHtml(input.spaceCode)}</span></p>
          <p style="margin:0 0 8px"><strong>Szerepkör:</strong> ${escapeHtml(roleLabel)}</p>
          ${projects.length ? `<p style="margin:0 0 8px"><strong>Projekt:</strong> ${escapeHtml(projects.join(", "))}</p>` : ""}
          <p style="margin:0"><strong>Hozzáférés vége:</strong> ${escapeHtml(formatDate(input.accessEndsAt))}</p>
        </div>
        <p><a href="${escapeHtml(input.spaceUrl)}" style="display:inline-block;background:#047857;color:#fff;text-decoration:none;font-weight:800;padding:13px 19px;border-radius:11px">Drop tér megnyitása</a></p>
        <p style="font-size:13px;color:#475569">A konkrét csomagok kódját és hatjegyű PIN-jét külön csomagmeghívó e-mailben küldi a rendszer. Elfelejtett PIN esetén a csomagbelépő oldalon új kód kérhető.</p>
      </div>
      <p style="font-size:12px;color:#64748b">Automatikus DIMPRO Drop rendszerüzenet.</p>
    </div>
  `;
  return sendDimproMail({
    profileId: "drop",
    to: [input.recipientEmail],
    replyTo: input.ownerEmail || "info@dimpro.hu",
    subject,
    text,
    html,
  });
}

export async function sendDropSpaceRecoveryEmail(input: {
  spaceName: string;
  spaceCode: string;
  recipientName: string;
  recipientEmail: string;
  accessEndsAt: string;
  recoveryLink: string;
  linkExpiresAt: string;
}) {
  await assertDriveMailReady();
  const subject = `DIMPRO Drop térbelépés – ${input.spaceCode} – ${input.spaceName}`;
  const text = [
    `Tisztelt ${input.recipientName}!`,
    "",
    "Térbelépési helyreállítást kért a DIMPRO Drop rendszerben.",
    `Drop tér: ${input.spaceName}`,
    `Térkód: ${input.spaceCode}`,
    `Hozzáférés vége: ${formatDate(input.accessEndsAt)}`,
    `A helyreállító link lejárata: ${formatDate(input.linkExpiresAt)}`,
    "",
    `Belépés: ${input.recoveryLink}`,
    "",
    "Ha nem Ön kérte ezt az e-mailt, hagyja figyelmen kívül.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:720px;margin:auto">
      <div style="border:1px solid #99f6e4;background:#f0fdfa;border-radius:20px;padding:26px">
        <p style="margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0f766e">DIMPRO Drop térbelépés</p>
        <h1 style="margin:0;font-size:26px">${escapeHtml(input.spaceName)}</h1>
        <p>Tisztelt ${escapeHtml(input.recipientName)}!</p>
        <p>Térbelépési helyreállítást kért.</p>
        <div style="margin:18px 0;border:1px solid #ccfbf1;background:#fff;border-radius:14px;padding:16px">
          <p style="margin:0 0 8px"><strong>Térkód:</strong> <span style="font-size:20px;font-weight:900;letter-spacing:.06em;color:#0f766e">${escapeHtml(input.spaceCode)}</span></p>
          <p style="margin:0 0 8px"><strong>Hozzáférés vége:</strong> ${escapeHtml(formatDate(input.accessEndsAt))}</p>
          <p style="margin:0"><strong>Link lejárata:</strong> ${escapeHtml(formatDate(input.linkExpiresAt))}</p>
        </div>
        <p><a href="${escapeHtml(input.recoveryLink)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;font-weight:800;padding:13px 19px;border-radius:11px">Belépés a Drop térbe</a></p>
        <p style="font-size:13px;color:#475569">Ha nem Ön kérte ezt az e-mailt, hagyja figyelmen kívül.</p>
      </div>
    </div>
  `;
  return sendDimproMail({ profileId: "drop", to: [input.recipientEmail], subject, text, html });
}
