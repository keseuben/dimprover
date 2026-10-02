import { sendDimproMail } from "@/app/lib/license/mail-profiles";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export async function sendDimproAuthOtpEmail(input: { email: string; displayName?: string | null; code: string; expiresMinutes: number }) {
  const name = input.displayName?.trim() || "DIMPRO felhasználó";
  const subject = "DIMPRO belépési kód";
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
