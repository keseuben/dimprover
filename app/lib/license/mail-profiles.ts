import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
export type MailProfileId =
  | "system"
  | "notifications"
  | "drive"
  | "drop"
  | "noreply"
  | "billing"
  | "admin"
  | "info";
export type MailProfileRecord = {
  id: MailProfileId;
  label: string;
  address: string;
  displayName?: string;
  purpose: string;
  enabled: boolean;
  password?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
};
export type MailProfilesStorage = {
  version: 1;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  sharedPassword?: string;
  testRecipients: string[];
  licenseActivationRecipients: string[];
  licenseReplyTo: string;
  profiles: MailProfileRecord[];
};

export type MailProfileSettingsInput = {
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  sharedPassword?: string;
  clearSharedPassword?: boolean;
  testRecipients?: string[] | string;
  licenseActivationRecipients?: string[] | string;
  licenseReplyTo?: string;
  profiles?: Array<{
    id: MailProfileId;
    address?: string;
    displayName?: string;
    purpose?: string;
    enabled?: boolean;
    password?: string;
    clearPassword?: boolean;
  }>;
};
export type SafeMailProfile = Omit<MailProfileRecord, "password" | "smtpHost" | "smtpPort" | "smtpSecure"> & {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  hasPassword: boolean;
  smtpConfigured: boolean;
};
export type MailProfilesSafeConfig = {
  ok: true;
  configFile: string;
  testLogFile: string;
  storageExists: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  testRecipients: string[];
  licenseActivationRecipients: string[];
  licenseReplyTo: string;
  profileCount: number;
  enabledProfileCount: number;
  profiles: SafeMailProfile[];
};
export type MailProfileTestResult = {
  id: string;
  profileId: MailProfileId;
  profileAddress: string | null;
  createdAt: string;
  attempted: boolean;
  sent: boolean;
  reason: string;
  to: string[];
  smtpConfigured: boolean;
  error?: string;
  friendlyError?: string;
};
type ResolvedMailProfile = {
  id: MailProfileId;
  label: string;
  address: string;
  displayName?: string;
  purpose: string;
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  password: string;
};
export type DimproMailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
  cid?: string;
  contentDisposition?: "inline" | "attachment";
};

type NodemailerModule = {
  createTransport: (options: Record<string, unknown>) => {
    sendMail: (options: {
      from: string;
      to: string;
      replyTo?: string;
      subject: string;
      text: string;
      html: string;
      attachments?: DimproMailAttachment[];
    }) => Promise<{ messageId?: string }>;
  };
};
function resolveProjectRoot() {
  const cwd = process.cwd();
  const standaloneSuffix = `${path.sep}.next${path.sep}standalone`;
  if (cwd.endsWith(standaloneSuffix)) return cwd.slice(0, -standaloneSuffix.length);
  return cwd;
}
const projectRoot = process.env.DIMPRO_PROJECT_ROOT ?? resolveProjectRoot();
const mailDir = path.join(projectRoot, ".dimprover", "mail");
const mailProfilesFile = path.join(mailDir, "mail-profiles.json");
const mailTestLogFile = path.join(mailDir, "mail-test-history.jsonl");
const defaultProfiles: MailProfileRecord[] = [
  {
    id: "system",
    label: "DIMPRO System",
    address: "system@dimpro.hu",
    displayName: "DIMPRO rendszerüzenet",
    purpose: "Szerverőr, rendszerhiba, technikai állapotriasztás és licencértesítések.",
    enabled: true,
  },
  {
    id: "notifications",
    label: "DIMPRO Értesítések",
    address: "ertesites@dimpro.hu",
    displayName: "DIMPRO Értesítések",
    purpose: "Általános alkalmazásértesítések, projektértesítések, határidők.",
    enabled: true,
  },
  {
    id: "drive",
    label: "DIMPRO Drive Értesítések",
    address: "ertesites.drive@dimpro.hu",
    displayName: "DIMPRO Drive",
    purpose: "Fájlfeltöltés, megosztás, Drive Desktop és Projektkapu események.",
    enabled: true,
  },
  {
    id: "drop",
    label: "DIMPRO Drop Értesítések",
    address: "ertesites.drop@dimpro.hu",
    displayName: "DIMPRO Drop",
    purpose: "DIMPRO Drop meghívók, Send-, Beküldőkapu-, KépSend- és letöltési értesítések.",
    enabled: true,
  },
  {
    id: "noreply",
    label: "DIMPRO No Reply",
    address: "noreply@dimpro.hu",
    displayName: "DIMPRO No Reply",
    purpose: "Nem válaszolható automatikus rendszerlevelek.",
    enabled: true,
  },
  {
    id: "billing",
    label: "DIMPRO Számlázás",
    address: "szamlazas@dimpro.hu",
    displayName: "DIMPRO Számlázás",
    purpose: "Előfizetés, számlázási és pénzügyi értesítések.",
    enabled: true,
  },
  {
    id: "admin",
    label: "DIMPRO Admin",
    address: "admin@dimpro.hu",
    displayName: "DIMPRO Admin",
    purpose: "Licencadmin, belső adminisztrációs üzenetek.",
    enabled: true,
  },
  {
    id: "info",
    label: "DIMPRO Info",
    address: "info@dimpro.hu",
    displayName: "DIMPRO Info",
    purpose: "Általános kapcsolati cím, kézi ügyfélkommunikációhoz is használható.",
    enabled: false,
  },
];
async function ensureMailDir() {
  await fs.mkdir(mailDir, { recursive: true });
}
async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
function cleanRecipients(raw: string[] | string | undefined) {
  const values = Array.isArray(raw) ? raw : (raw ?? "").split(",");
  return values.map((item) => item.trim()).filter((item) => item.includes("@"));
}

function normalizeMailProfileStorage(storage: MailProfilesStorage): MailProfilesStorage {
  const smtpHost = storage.smtpHost || process.env.DIMPRO_MAIL_SMTP_HOST || process.env.DIMPRO_SMTP_HOST || "vuhzuqtm.loginssl.com";
  const smtpPort = Number(storage.smtpPort || process.env.DIMPRO_MAIL_SMTP_PORT || process.env.DIMPRO_SMTP_PORT || 465);
  const smtpSecure = typeof storage.smtpSecure === "boolean" ? storage.smtpSecure : smtpPort === 465;
  const profileMap = new Map<MailProfileId, MailProfileRecord>();
  for (const profile of defaultProfiles) profileMap.set(profile.id, { ...profile });
  for (const profile of storage.profiles ?? []) {
    if (!profile?.id) continue;
    const current = profileMap.get(profile.id);
    profileMap.set(profile.id, { ...(current ?? profile), ...profile } as MailProfileRecord);
  }
  return {
    version: 1,
    smtpHost,
    smtpPort: Number.isFinite(smtpPort) ? smtpPort : 465,
    smtpSecure,
    sharedPassword: storage.sharedPassword,
    testRecipients: cleanRecipients(storage.testRecipients),
    licenseActivationRecipients: cleanRecipients(
      storage.licenseActivationRecipients?.length
        ? storage.licenseActivationRecipients
        : process.env.DIMPRO_LICENSE_ACTIVATION_ADMIN_TO || "admin@dimpro.hu,info@dimpro.hu",
    ),
    licenseReplyTo:
      cleanRecipients(storage.licenseReplyTo || process.env.DIMPRO_LICENSE_REPLY_TO || "info@dimpro.hu")[0] ||
      "info@dimpro.hu",
    profiles: [...profileMap.values()],
  };
}
function parseStorage(raw: string): MailProfilesStorage {
  const parsed = JSON.parse(raw) as Partial<MailProfilesStorage>;
  const smtpHost = parsed.smtpHost || process.env.DIMPRO_MAIL_SMTP_HOST || process.env.DIMPRO_SMTP_HOST || "vuhzuqtm.loginssl.com";
  const smtpPort = Number(parsed.smtpPort || process.env.DIMPRO_MAIL_SMTP_PORT || process.env.DIMPRO_SMTP_PORT || 465);
  const smtpSecure = typeof parsed.smtpSecure === "boolean" ? parsed.smtpSecure : smtpPort === 465;
  const profileMap = new Map<MailProfileId, MailProfileRecord>();
  for (const profile of defaultProfiles) profileMap.set(profile.id, { ...profile });
  for (const profile of parsed.profiles ?? []) {
    if (!profile?.id) continue;
    const current = profileMap.get(profile.id);
    profileMap.set(profile.id, { ...(current ?? profile), ...profile } as MailProfileRecord);
  }
  return {
    version: 1,
    smtpHost,
    smtpPort: Number.isFinite(smtpPort) ? smtpPort : 465,
    smtpSecure,
    sharedPassword: parsed.sharedPassword || process.env.DIMPRO_MAIL_SHARED_PASS || process.env.DIMPRO_SMTP_PASS,
    testRecipients: cleanRecipients(parsed.testRecipients?.length ? parsed.testRecipients : process.env.DIMPRO_MAIL_TEST_TO || process.env.DIMPRO_SERVER_MONITOR_EMAIL_TO || process.env.DIMPRO_ADMIN_EMAIL || "keseruben90@gmail.com"),
    licenseActivationRecipients: cleanRecipients(
      parsed.licenseActivationRecipients?.length
        ? parsed.licenseActivationRecipients
        : process.env.DIMPRO_LICENSE_ACTIVATION_ADMIN_TO || "admin@dimpro.hu,info@dimpro.hu",
    ),
    licenseReplyTo:
      cleanRecipients(parsed.licenseReplyTo || process.env.DIMPRO_LICENSE_REPLY_TO || "info@dimpro.hu")[0] ||
      "info@dimpro.hu",
    profiles: [...profileMap.values()],
  };
}
async function loadMailProfilesStorage(): Promise<{ storage: MailProfilesStorage; storageExists: boolean }> {
  const storageExists = await pathExists(mailProfilesFile);
  if (storageExists) {
    const raw = await fs.readFile(mailProfilesFile, "utf8");
    return { storage: parseStorage(raw), storageExists };
  }
  const smtpHost = process.env.DIMPRO_MAIL_SMTP_HOST || process.env.DIMPRO_SMTP_HOST || "vuhzuqtm.loginssl.com";
  const smtpPort = Number(process.env.DIMPRO_MAIL_SMTP_PORT || process.env.DIMPRO_SMTP_PORT || 465);
  return {
    storageExists,
    storage: {
      version: 1,
      smtpHost,
      smtpPort: Number.isFinite(smtpPort) ? smtpPort : 465,
      smtpSecure: smtpPort === 465,
      sharedPassword: process.env.DIMPRO_MAIL_SHARED_PASS || process.env.DIMPRO_SMTP_PASS,
      testRecipients: cleanRecipients(process.env.DIMPRO_MAIL_TEST_TO || process.env.DIMPRO_SERVER_MONITOR_EMAIL_TO || process.env.DIMPRO_ADMIN_EMAIL || "keseruben90@gmail.com"),
      licenseActivationRecipients: cleanRecipients(
        process.env.DIMPRO_LICENSE_ACTIVATION_ADMIN_TO || "admin@dimpro.hu,info@dimpro.hu",
      ),
      licenseReplyTo:
        cleanRecipients(process.env.DIMPRO_LICENSE_REPLY_TO || "info@dimpro.hu")[0] || "info@dimpro.hu",
      profiles: defaultProfiles,
    },
  };
}
function profilePasswordEnvNames(id: MailProfileId) {
  const envPrefix = id.toUpperCase();
  return [
    `DIMPRO_${envPrefix}_MAIL_PASS`,
    `DIMPRO_MAIL_${envPrefix}_PASS`,
    id === "system" ? "DIMPRO_SMTP_PASS" : "",
  ].filter(Boolean);
}
function profileAddressEnvNames(id: MailProfileId) {
  const envPrefix = id.toUpperCase();
  return [
    `DIMPRO_${envPrefix}_MAIL_USER`,
    `DIMPRO_MAIL_${envPrefix}_USER`,
    id === "system" ? "DIMPRO_SMTP_USER" : "",
  ].filter(Boolean);
}
function getEnvValue(names: string[]) {
  return names.map((name) => process.env[name]).find((value) => Boolean(value));
}
async function resolveMailProfile(profileId: MailProfileId): Promise<ResolvedMailProfile | null> {
  const { storage } = await loadMailProfilesStorage();
  const profile = storage.profiles.find((item) => item.id === profileId);
  if (!profile || !profile.enabled) return null;
  const address = getEnvValue(profileAddressEnvNames(profile.id)) || profile.address;
  const password = getEnvValue(profilePasswordEnvNames(profile.id)) || profile.password || storage.sharedPassword;
  const smtpHost = profile.smtpHost || storage.smtpHost || process.env.DIMPRO_MAIL_SMTP_HOST || process.env.DIMPRO_SMTP_HOST || "vuhzuqtm.loginssl.com";
  const smtpPort = Number(profile.smtpPort || storage.smtpPort || process.env.DIMPRO_MAIL_SMTP_PORT || process.env.DIMPRO_SMTP_PORT || 465);
  const smtpSecure = typeof profile.smtpSecure === "boolean" ? profile.smtpSecure : (typeof storage.smtpSecure === "boolean" ? storage.smtpSecure : smtpPort === 465);
  if (!address || !password || !smtpHost || !smtpPort) return null;
  return {
    id: profile.id,
    label: profile.label,
    address,
    displayName: profile.displayName,
    purpose: profile.purpose,
    enabled: profile.enabled,
    password,
    smtpHost,
    smtpPort: Number.isFinite(smtpPort) ? smtpPort : 465,
    smtpSecure,
  };
}
function formatFrom(profile: ResolvedMailProfile) {
  if (!profile.displayName) return profile.address;
  return `"${profile.displayName.replaceAll("\"", "'")}" <${profile.address}>`;
}

function getSmtpFriendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();

  if (lower.includes("not on the whitelist") || lower.includes("recipient rejected")) {
    return [
      "A DotRoll SMTP szerver elutasította a küldést. Valószínűleg a VPS IP-címet külön SMTP whitelist / relay engedélyezési listára kell felvenni.",
      "Ellenőrizendő VPS IP: 213.160.68.24.",
      "A Thunderbirdes sikeres küldés csak azt igazolja, hogy a postafiók és a jelszó jó; a VPS-ről történő szerveres küldéshez külön DotRoll engedélyezés kellhet.",
    ].join(" ");
  }

  if (lower.includes("authentication") || lower.includes("invalid login") || lower.includes("auth")) {
    return "SMTP hitelesítési hiba. Ellenőrizd a teljes e-mail címet, a postafiók jelszavát és hogy a jelszó mentve lett-e a DIMPRO e-mail beállításoknál.";
  }

  if (lower.includes("econnrefused") || lower.includes("etimedout") || lower.includes("timeout") || lower.includes("enotfound")) {
    return "SMTP kapcsolódási hiba. Ellenőrizd az SMTP hostot, portot, SSL/TLS beállítást és hogy a VPS eléri-e a levelezőszervert.";
  }

  if (lower.includes("self signed") || lower.includes("certificate") || lower.includes("tls") || lower.includes("ssl")) {
    return "SSL/TLS kapcsolati hiba. Ellenőrizd, hogy 465 portnál be van-e kapcsolva az SSL/TLS, illetve 587 portnál a szolgáltató milyen titkosítást vár.";
  }

  return "Ismeretlen SMTP küldési hiba. A részletes technikai hibaüzenet alapján kell tovább vizsgálni a levelezőszerver vagy a DIMPRO SMTP beállítását.";
}
export async function getMailProfilesSafeConfig(): Promise<MailProfilesSafeConfig> {
  const { storage, storageExists } = await loadMailProfilesStorage();
  const profiles = await Promise.all(storage.profiles.map(async (profile): Promise<SafeMailProfile> => {
    const resolved = await resolveMailProfile(profile.id);
    const smtpHost = profile.smtpHost || storage.smtpHost || process.env.DIMPRO_MAIL_SMTP_HOST || process.env.DIMPRO_SMTP_HOST || null;
    const smtpPort = Number(profile.smtpPort || storage.smtpPort || process.env.DIMPRO_MAIL_SMTP_PORT || process.env.DIMPRO_SMTP_PORT || 0) || null;
    const profilePassword = getEnvValue(profilePasswordEnvNames(profile.id)) || profile.password || storage.sharedPassword;
    const safeProfile = { ...profile };
    delete safeProfile.password;
    return {
      ...safeProfile,
      smtpHost,
      smtpPort,
      smtpSecure: typeof profile.smtpSecure === "boolean" ? profile.smtpSecure : storage.smtpSecure,
      hasPassword: Boolean(profilePassword),
      smtpConfigured: Boolean(resolved),
    };
  }));
  return {
    ok: true,
    configFile: mailProfilesFile,
    testLogFile: mailTestLogFile,
    storageExists,
    smtpHost: storage.smtpHost || process.env.DIMPRO_MAIL_SMTP_HOST || process.env.DIMPRO_SMTP_HOST || null,
    smtpPort: Number(storage.smtpPort || process.env.DIMPRO_MAIL_SMTP_PORT || process.env.DIMPRO_SMTP_PORT || 0) || null,
    smtpSecure: storage.smtpSecure,
    testRecipients: storage.testRecipients,
    licenseActivationRecipients: storage.licenseActivationRecipients,
    licenseReplyTo: storage.licenseReplyTo,
    profileCount: profiles.length,
    enabledProfileCount: profiles.filter((profile) => profile.enabled).length,
    profiles,
  };
}
export async function saveMailProfileSettings(input: MailProfileSettingsInput) {
  const { storage } = await loadMailProfilesStorage();
  const current = normalizeMailProfileStorage(storage);
  const profileMap = new Map<MailProfileId, MailProfileRecord>();
  for (const profile of current.profiles) profileMap.set(profile.id, { ...profile });

  for (const patch of input.profiles ?? []) {
    if (!patch.id || !profileMap.has(patch.id)) continue;
    const currentProfile = profileMap.get(patch.id)!;
    const nextProfile: MailProfileRecord = {
      ...currentProfile,
      address: patch.address?.trim() || currentProfile.address,
      displayName: patch.displayName?.trim() || currentProfile.displayName,
      purpose: patch.purpose?.trim() || currentProfile.purpose,
      enabled: typeof patch.enabled === "boolean" ? patch.enabled : currentProfile.enabled,
      password: patch.clearPassword ? undefined : (patch.password && patch.password.length > 0 ? patch.password : currentProfile.password),
    };
    profileMap.set(patch.id, nextProfile);
  }

  const smtpPort = Number(input.smtpPort || current.smtpPort || 465);
  const nextStorage: MailProfilesStorage = {
    version: 1,
    smtpHost: input.smtpHost?.trim() || current.smtpHost || "vuhzuqtm.loginssl.com",
    smtpPort: Number.isFinite(smtpPort) ? smtpPort : 465,
    smtpSecure: typeof input.smtpSecure === "boolean" ? input.smtpSecure : current.smtpSecure,
    sharedPassword: input.clearSharedPassword ? undefined : (input.sharedPassword && input.sharedPassword.length > 0 ? input.sharedPassword : current.sharedPassword),
    testRecipients: cleanRecipients(input.testRecipients ?? current.testRecipients),
    licenseActivationRecipients: cleanRecipients(
      input.licenseActivationRecipients ?? current.licenseActivationRecipients,
    ),
    licenseReplyTo:
      cleanRecipients(input.licenseReplyTo ?? current.licenseReplyTo)[0] || current.licenseReplyTo || "info@dimpro.hu",
    profiles: [...profileMap.values()],
  };

  await ensureMailDir();
  await fs.writeFile(mailProfilesFile, `${JSON.stringify(nextStorage, null, 2)}
`, "utf8");
  try {
    await fs.chmod(mailProfilesFile, 0o600);
  } catch {
    // Jogosultság állítás nem kritikus.
  }

  return getMailProfilesSafeConfig();
}

async function appendMailTestHistory(result: MailProfileTestResult) {
  await ensureMailDir();
  await fs.appendFile(mailTestLogFile, `${JSON.stringify(result)}\n`, "utf8");
  try {
    await fs.chmod(mailTestLogFile, 0o600);
  } catch {
    // Jogosultság állítás nem kritikus.
  }
  try {
    const raw = await fs.readFile(mailTestLogFile, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    if (lines.length > 300) {
      await fs.writeFile(mailTestLogFile, `${lines.slice(-300).join("\n")}\n`, "utf8");
    }
  } catch {
    // Napló ritkítása nem kritikus.
  }
}
export async function loadMailProfileTestHistory(limit = 40): Promise<MailProfileTestResult[]> {
  try {
    const raw = await fs.readFile(mailTestLogFile, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line) as MailProfileTestResult)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  } catch {
    return [];
  }
}
export async function getLicenseActivationMailSettings() {
  const { storage } = await loadMailProfilesStorage();
  return {
    adminRecipients: cleanRecipients(storage.licenseActivationRecipients),
    replyTo: cleanRecipients(storage.licenseReplyTo)[0] || "info@dimpro.hu",
  };
}

export async function sendDimproMail(input: {
  profileId: MailProfileId;
  to: string[];
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  attachments?: DimproMailAttachment[];
}) {
  const profile = await resolveMailProfile(input.profileId);
  const to = cleanRecipients(input.to);
  if (!profile) throw new Error(`A(z) ${input.profileId} e-mail profil nincs teljesen beállítva.`);
  if (to.length === 0) throw new Error("Nincs e-mail címzett beállítva.");
  const nodemailer = require("nodemailer") as NodemailerModule;
  const transporter = nodemailer.createTransport({
    host: profile.smtpHost,
    port: profile.smtpPort,
    secure: profile.smtpSecure,
    auth: {
      user: profile.address,
      pass: profile.password,
    },
  });
  const replyTo = cleanRecipients(input.replyTo)[0];
  const result = await transporter.sendMail({
    from: formatFrom(profile),
    to: to.join(","),
    replyTo,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments,
  });
  return { messageId: result.messageId || "", profileId: profile.id, from: profile.address };
}
export async function sendMailProfileTestEmail(profileId: MailProfileId): Promise<MailProfileTestResult> {
  const createdAt = new Date().toISOString();
  const { storage } = await loadMailProfilesStorage();
  const profile = await resolveMailProfile(profileId);
  const to = storage.testRecipients;
  const base: MailProfileTestResult = {
    id: `mailprofile_${createdAt.replaceAll("-", "").replaceAll(":", "").replaceAll(".", "").replaceAll("T", "").replaceAll("Z", "")}_${Math.random().toString(36).slice(2, 8)}`,
    profileId,
    profileAddress: profile?.address ?? storage.profiles.find((item) => item.id === profileId)?.address ?? null,
    createdAt,
    attempted: false,
    sent: false,
    reason: "",
    to,
    smtpConfigured: Boolean(profile),
  };
  if (!profile) {
    const result = { ...base, reason: "Az e-mail profil nincs teljesen beállítva, ezért a teszt nem indult el." };
    await appendMailTestHistory(result);
    return result;
  }
  if (to.length === 0) {
    const result = { ...base, reason: "Nincs teszt címzett beállítva." };
    await appendMailTestHistory(result);
    return result;
  }
  const subject = `DIMPRO e-mail profil teszt: ${profile.label}`;
  const text = [
    "DIMPRO e-mail profil teszt",
    "",
    `Profil: ${profile.label}`,
    `Feladó: ${profile.address}`,
    `Időpont: ${createdAt}`,
    `Szerver: ${os.hostname()}`,
    "",
    "Ha ezt megkaptad, az adott DIMPRO automatikus e-mail profil működik.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a">
      <h2 style="margin:0 0 12px;color:#0891b2">DIMPRO e-mail profil teszt</h2>
      <p><strong>Profil:</strong> ${profile.label}</p>
      <p><strong>Feladó:</strong> ${profile.address}</p>
      <p><strong>Időpont:</strong> ${createdAt}</p>
      <p><strong>Szerver:</strong> ${os.hostname()}</p>
      <p style="color:#64748b">Ha ezt megkaptad, az adott DIMPRO automatikus e-mail profil működik.</p>
    </div>
  `;
  try {
    await sendDimproMail({ profileId, to, subject, text, html });
    const result = { ...base, attempted: true, sent: true, reason: "Teszt e-mail sikeresen elküldve." };
    await appendMailTestHistory(result);
    return result;
  } catch (error) {
    const result = {
      ...base,
      attempted: true,
      sent: false,
      reason: "Teszt e-mail küldési hiba.",
      error: error instanceof Error ? error.message : "Ismeretlen SMTP hiba",
      friendlyError: getSmtpFriendlyError(error),
    };
    await appendMailTestHistory(result);
    return result;
  }
}
export async function sendAllEnabledMailProfileTests() {
  const safeConfig = await getMailProfilesSafeConfig();
  const enabledProfileIds = safeConfig.profiles
    .filter((profile) => profile.enabled)
    .map((profile) => profile.id);
  const results: MailProfileTestResult[] = [];
  for (const profileId of enabledProfileIds) {
    results.push(await sendMailProfileTestEmail(profileId));
  }
  return results;
}
