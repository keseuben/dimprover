import { sendDimproMail } from "@/app/lib/license/mail-profiles";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export async function sendDimproAuthOtpEmail(input: { email: string; displayName?: string | null; code: string; expiresMinutes: number }) {
  const name = input.displayName?.trim() || "DIMPRO felhasználó";
  const subject = `DIMPRO belépési kód: ${input.code}`;
  const text = [
    `Kedves ${name}!`,
    "",
    `A DIMPRO belépési kódod: ${input.code}`,
    `A kód ${input.expiresMinutes} percig érvényes, és csak egyszer használható.`,
    "",
    "Ha nem te kérted a kódot, hagyd figyelmen kívül ezt az üzenetet.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;background:#f4faf8;padding:28px;color:#0f172a">
      <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #ccfbf1;border-radius:18px;padding:28px">
        <div style="font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0f766e">DIMPRO biztonságos belépés</div>
        <h1 style="font-size:24px;margin:10px 0 18px">Egyszer használatos belépési kód</h1>
        <p>Kedves <strong>${escapeHtml(name)}</strong>!</p>
        <p>A DIMPRO-fiókodhoz tartozó egyszer használatos kód:</p>
        <div style="margin:22px 0;border:1px solid #99f6e4;background:#f0fdfa;border-radius:14px;padding:18px;text-align:center">
          <div style="font-family:Consolas,Monaco,monospace;font-size:34px;font-weight:900;letter-spacing:.18em;color:#0f172a">${escapeHtml(input.code)}</div>
        </div>
        <p>A kód <strong>${input.expiresMinutes} percig</strong> érvényes, és csak egyszer használható.</p>
        <p style="font-size:13px;color:#475569">Ha nem te kérted a kódot, hagyd figyelmen kívül ezt az üzenetet.</p>
      </div>
    </div>`;
  return sendDimproMail({ profileId: "noreply", to: [input.email], subject, text, html });
}

export async function sendDimproProjectInvitationEmail(input: {
  to: string;
  inviteeName?: string | null;
  projectName: string;
  invitationUrl: string;
  expiresAt: string;
}) {
  const recipientName = input.inviteeName?.trim() || "Meghívott";
  const expires = new Intl.DateTimeFormat("hu-HU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Budapest",
  }).format(new Date(input.expiresAt));
  const subject = `DIMPRO projektmeghívás: ${input.projectName}`;
  const text = [
    `Kedves ${recipientName}!`,
    "",
    `Meghívást kaptál a(z) ${input.projectName} projekthez a DIMPRO rendszerben.`,
    `Meghívás elfogadása: ${input.invitationUrl}`,
    `A meghívó lejárata: ${expires}`,
    "",
    "A belépés a központi DIMPRO AUTH felületen, e-mailben küldött egyszer használatos kóddal történik.",
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f5f7fa;color:#172033;padding:24px"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #dfe5ec;border-radius:14px;padding:28px"><div style="font-size:13px;font-weight:800;letter-spacing:.12em;color:#697586">DIMPRO</div><h1 style="font-size:24px;margin:10px 0 18px">Projektmeghívás</h1><p>Kedves ${escapeHtml(recipientName)}!</p><p>Meghívást kaptál a(z) <strong>${escapeHtml(input.projectName)}</strong> projekthez a DIMPRO rendszerben.</p><p style="margin:28px 0"><a href="${escapeHtml(input.invitationUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;font-weight:800;padding:14px 20px;border-radius:10px">Meghívás elfogadása</a></p><p style="font-size:13px;color:#697586">A meghívó lejárata: ${escapeHtml(expires)}</p><p style="font-size:13px;color:#697586">A belépés a központi DIMPRO AUTH felületen, e-mailben küldött egyszer használatos kóddal történik.</p></div></body></html>`;
  await sendDimproMail({
    profileId: "noreply",
    to: [input.to],
    subject,
    text,
    html,
  });
}
