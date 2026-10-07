import { sendDimproMail } from "@/app/lib/license/mail-profiles";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function formatOtpCodeHtml(code: string) {
  const safe = escapeHtml(code.trim());
  return /^\d{6}$/.test(code.trim()) ? `${safe.slice(0, 3)}&nbsp;${safe.slice(3)}` : safe;
}

function buildDimproOtpEmailHtml(input: {
  eyebrow: string;
  title: string;
  name: string;
  intro: string;
  code: string;
  expiresMinutes: number;
  detailLabel?: string;
  detailValue?: string;
  note: string;
  securityNote: string;
}) {
  const detailRow = input.detailLabel && input.detailValue
    ? `<tr><td style="padding:0 0 20px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td width="150" valign="top" style="padding:9px 12px;background:#f7faf9;border:1px solid #d9e7e2;color:#667a72;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700">${escapeHtml(input.detailLabel)}</td><td valign="top" style="padding:9px 12px;background:#ffffff;border-top:1px solid #d9e7e2;border-right:1px solid #d9e7e2;border-bottom:1px solid #d9e7e2;color:#1f3a33;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700">${escapeHtml(input.detailValue)}</td></tr></table></td></tr>`
    : "";
  return `<!doctype html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef4f2">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.intro)} A kód ${input.expiresMinutes} percig érvényes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef4f2" style="width:100%;border-collapse:collapse;background-color:#eef4f2">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;border-collapse:collapse;background-color:#ffffff;border:1px solid #d8e4e0">
<tr><td bgcolor="#0f5f55" style="padding:18px 26px;background-color:#0f5f55;color:#ffffff;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:19px;font-weight:800;line-height:24px;color:#ffffff">DIMPRO</td><td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;line-height:18px;color:#cce9e1">${escapeHtml(input.eyebrow)}</td></tr></table>
</td></tr>
<tr><td style="padding:30px 30px 24px 30px;font-family:Arial,Helvetica,sans-serif;color:#213630">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
<tr><td style="padding:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;line-height:31px;color:#16342d">${escapeHtml(input.title)}</td></tr>
<tr><td style="padding:0 0 18px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#425f57">Kedves <strong style="color:#213630">${escapeHtml(input.name)}</strong>!</td></tr>
<tr><td style="padding:0 0 18px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#425f57">${escapeHtml(input.intro)}</td></tr>
<tr><td align="center" style="padding:0 0 20px 0">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td align="center" bgcolor="#edf8f5" style="padding:15px 24px;background-color:#edf8f5;border:1px solid #9dd2c5;font-family:'Courier New',Courier,monospace;font-size:31px;font-weight:700;line-height:38px;color:#153b32;mso-line-height-rule:exactly">${formatOtpCodeHtml(input.code)}</td></tr></table>
</td></tr>
${detailRow}
<tr><td style="padding:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#425f57">A kód <strong style="color:#213630">${input.expiresMinutes} percig</strong> érvényes, és csak egyszer használható.</td></tr>
<tr><td style="padding:0 0 18px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#60766f">${escapeHtml(input.note)}</td></tr>
<tr><td style="padding:14px 16px;background-color:#f7f9fa;border-left:3px solid #aab9b5;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#66756f">${escapeHtml(input.securityNote)}</td></tr>
</table>
</td></tr>
<tr><td style="padding:14px 24px;background-color:#f7faf9;border-top:1px solid #e0e9e6;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:16px;color:#7b8b85;text-align:center">Automatikus rendszerüzenet · DIMPRO</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
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
  const html = buildDimproOtpEmailHtml({
    eyebrow: "BIZTONSÁGOS BELÉPÉS",
    title: "Egyszer használatos belépési kód",
    name,
    intro: "A DIMPRO-fiókodhoz tartozó egyszer használatos belépési kód:",
    code: input.code,
    expiresMinutes: input.expiresMinutes,
    note: "A kód kizárólag ehhez a belépési kísérlethez használható.",
    securityNote: "Ha nem te kérted a kódot, hagyd figyelmen kívül ezt az üzenetet. A kódot ne add tovább másnak.",
  });
  return sendDimproMail({ profileId: "noreply", to: [input.email], subject, text, html });
}

export async function sendDimproDriveRegistrationOtpEmail(input: { email: string; displayName?: string | null; code: string; expiresMinutes: number }) {
  const name = input.displayName?.trim() || "DIMPRO felhasználó";
  const subject = "DIMPRO Saját Drive – e-mail-cím igazolása";
  const text = [
    `Kedves ${name}!`,
    "",
    `A Saját DIMPRO Drive regisztrációs kódod: ${input.code}`,
    `A kód ${input.expiresMinutes} percig érvényes, és csak egyszer használható.`,
    "",
    "A kód igazolja az e-mail-címedet, de önmagában nem aktivál tárhelyet vagy előfizetést.",
    "Ha nem te indítottad a regisztrációt, hagyd figyelmen kívül ezt az üzenetet.",
  ].join("\n");
  const html = buildDimproOtpEmailHtml({
    eyebrow: "SAJÁT DRIVE",
    title: "E-mail-cím igazolása",
    name,
    intro: "A Saját DIMPRO Drive regisztrációhoz tartozó hitelesítő kód:",
    code: input.code,
    expiresMinutes: input.expiresMinutes,
    note: "Az e-mail igazolása önmagában nem aktivál tárhelyet vagy előfizetést.",
    securityNote: "Ha nem te indítottad a Saját Drive regisztrációt, hagyd figyelmen kívül ezt az üzenetet.",
  });
  return sendDimproMail({ profileId: "noreply", to: [input.email], subject, text, html });
}

export async function sendDimproUserIdentityOtpEmail(input: { email: string; displayName?: string | null; code: string; expiresMinutes: number; organizationName?: string | null }) {
  const name = input.displayName?.trim() || "DIMPRO felhasználó";
  const organization = input.organizationName?.trim() || "";
  const subject = "DIMPRO – e-mail-cím hitelesítése";
  const text = [
    `Kedves ${name}!`,
    "",
    `A DIMPRO-fiókodhoz hozzáadott e-mail-cím hitelesítő kódja: ${input.code}`,
    organization ? `Kapcsolódó szervezet: ${organization}` : "",
    `A kód ${input.expiresMinutes} percig érvényes, és csak egyszer használható.`,
    "",
    "A hitelesítés nem hoz létre új DIMPRO-fiókot; ezt az e-mail-címet a meglévő fiókodhoz kapcsolja.",
    "Ha nem te kezdeményezted, hagyd figyelmen kívül ezt az üzenetet.",
  ].filter(Boolean).join("\n");
  const html = buildDimproOtpEmailHtml({
    eyebrow: "E-MAIL IDENTITÁS",
    title: "E-mail-cím hitelesítése",
    name,
    intro: "A DIMPRO-fiókodhoz hozzáadott e-mail-cím hitelesítő kódja:",
    code: input.code,
    expiresMinutes: input.expiresMinutes,
    detailLabel: organization ? "Szervezet" : undefined,
    detailValue: organization || undefined,
    note: "A hitelesítés nem hoz létre új DIMPRO-fiókot; ezt az e-mail-címet a meglévő fiókodhoz kapcsolja.",
    securityNote: "Ha nem te kezdeményezted ezt a műveletet, hagyd figyelmen kívül az üzenetet. A hitelesítő kódot ne add tovább másnak.",
  });
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
