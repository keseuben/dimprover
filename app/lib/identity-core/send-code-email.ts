import { sendDimproMail } from "@/app/lib/license/mail-profiles";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function featureLabels(input: {
  canUseStandardSend: boolean;
  canUseQuickImageSend: boolean;
  canUseProjectDrop: boolean;
}) {
  return [
    input.canUseStandardSend ? "Normál Send" : null,
    input.canUseQuickImageSend ? "Gyors KépSend" : null,
    input.canUseProjectDrop ? "Projekt Beérkező Drop" : null,
  ].filter((item): item is string => Boolean(item));
}

export async function sendDimproSendCodeEmail(input: {
  recipientName: string;
  recipientEmail: string;
  organizationName?: string | null;
  sendCode: string;
  expiresAt?: string | null;
  canUseStandardSend: boolean;
  canUseQuickImageSend: boolean;
  canUseProjectDrop: boolean;
}, dependencies: { sendMail?: typeof sendDimproMail } = {}) {
  const organization = input.organizationName?.trim() || "DIMPRO";
  const expires = input.expiresAt
    ? new Date(input.expiresAt).toLocaleString("hu-HU", { dateStyle: "long", timeStyle: "short" })
    : "nincs külön lejárat megadva";
  const features = featureLabels(input);
  const featureText = features.length ? features.join(", ") : "DIMPRO Send";
  const sendUrl = "https://drop.dimpro.hu/send";
  const subject = `Saját DIMPRO Send-kód – ${organization}`;
  const text = [
    `Kedves ${input.recipientName}!`,
    "",
    `Elkészült a(z) ${organization} szervezethez tartozó saját DIMPRO Send-kódja.`,
    "",
    `Saját DIMPRO Send-kód: ${input.sendCode}`,
    `Engedélyezett funkciók: ${featureText}`,
    `Érvényesség: ${expires}`,
    "",
    `DIMPRO Send megnyitása: ${sendUrl}`,
    "",
    "A Send-kód személyes hozzáférési adat. Ne továbbítsa másnak. Ha új kódot kap, a korábbi kód érvényét veszti.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;background:#f4f7fb;padding:28px;color:#0f172a">
      <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #dbe4ef;border-radius:18px;padding:28px">
        <div style="font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0e7490">DIMPRO Send hozzáférés</div>
        <h1 style="font-size:24px;margin:10px 0 18px">Saját DIMPRO Send-kód</h1>
        <p>Kedves <strong>${escapeHtml(input.recipientName)}</strong>!</p>
        <p>Elkészült a(z) <strong>${escapeHtml(organization)}</strong> szervezethez tartozó DIMPRO Send-hozzáférése.</p>
        <div style="margin:22px 0;border:1px solid #a5f3fc;background:#ecfeff;border-radius:14px;padding:18px;text-align:center">
          <div style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#155e75">Saját DIMPRO Send-kód</div>
          <div style="margin-top:8px;font-family:Consolas,Monaco,monospace;font-size:28px;font-weight:900;letter-spacing:.12em;color:#0f172a">${escapeHtml(input.sendCode)}</div>
        </div>
        <p><strong>Engedélyezett funkciók:</strong> ${escapeHtml(featureText)}<br/>
        <strong>Érvényesség:</strong> ${escapeHtml(expires)}</p>
        <p style="margin:26px 0"><a href="${sendUrl}" style="display:inline-block;background:#0e7490;color:#fff;text-decoration:none;font-weight:800;padding:14px 20px;border-radius:12px">DIMPRO Send megnyitása</a></p>
        <p style="font-size:13px;color:#475569">A Send-kód személyes hozzáférési adat. Ne továbbítsa másnak. Új kód kiadásakor a korábbi kód automatikusan érvényét veszti.</p>
      </div>
    </div>`;
  const sendMail = dependencies.sendMail || sendDimproMail;
  return sendMail({
    profileId: "noreply",
    to: [input.recipientEmail],
    subject,
    text,
    html,
  });
}
