import { sendDimproMail } from "@/app/lib/license/mail-profiles";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function sendDimproOrganizationInvitationEmail(input: {
  recipientName: string;
  recipientEmail: string;
  organizationName: string;
  roleLabel: string;
  invitationUrl: string;
  expiresAt: string;
  moduleCodes: string[];
}) {
  const expires = new Date(input.expiresAt).toLocaleString("hu-HU");
  const services = input.moduleCodes.length ? input.moduleCodes.join(", ") : "A szervezeti licenc alapértelmezett szolgáltatásai";
  const subject = `DIMPRO meghívó – ${input.organizationName}`;
  const text = [
    `Kedves ${input.recipientName}!`,
    "",
    `Meghívást kapott a(z) ${input.organizationName} DIMPRO szervezeti munkaterületére.`,
    `Szerepkör: ${input.roleLabel}`,
    `Engedélyezett szolgáltatások: ${services}`,
    "",
    `Meghívó elfogadása: ${input.invitationUrl}`,
    `A meghívó lejárata: ${expires}`,
    "",
    "A meghívó egyszer használható. Elfogadás után a DIMPRO központi belépési oldalon e-mailben kapott egyszer használatos kóddal tud belépni.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;background:#f4f7fb;padding:28px;color:#0f172a">
      <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #dbe4ef;border-radius:18px;padding:28px">
        <div style="font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0f766e">DIMPRO szervezeti meghívó</div>
        <h1 style="font-size:24px;margin:10px 0 18px">${escapeHtml(input.organizationName)}</h1>
        <p>Kedves <strong>${escapeHtml(input.recipientName)}</strong>!</p>
        <p>Meghívást kapott a DIMPRO szervezeti munkaterületére.</p>
        <p><strong>Szerepkör:</strong> ${escapeHtml(input.roleLabel)}<br/>
        <strong>Engedélyezett szolgáltatások:</strong> ${escapeHtml(services)}</p>
        <p style="margin:26px 0"><a href="${escapeHtml(input.invitationUrl)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;font-weight:800;padding:14px 20px;border-radius:12px">Meghívás elfogadása</a></p>
        <p style="font-size:13px;color:#475569">A meghívó egyszer használható, és ${escapeHtml(expires)} időpontig érvényes. Elfogadás után e-mailben kapott egyszer használatos kóddal tud belépni a DIMPRO rendszerbe.</p>
      </div>
    </div>`;
  return sendDimproMail({
    profileId: "noreply",
    to: [input.recipientEmail],
    subject,
    text,
    html,
  });
}
