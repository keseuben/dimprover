import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sendDimproMail, type DimproMailAttachment } from "@/app/lib/license/mail-profiles";
import { createDropPublicEmailThumbnail } from "../public/dropPublicEmailPreview";
import type { DropPublicEmailPreviewBundle } from "../public/dropPublicEmailPreview";
import {
  buildDropPublicDeliveryEmailContent,
  type DropPublicMailFile,
} from "../public/dropPublicEmailTemplate";

export const DROP_EMAIL_VALIDATION_CLIENTS = [
  { id: "gmail_web", label: "Gmail · webes felület" },
  { id: "gmail_mobile", label: "Gmail · mobilalkalmazás" },
  { id: "thunderbird", label: "Mozilla Thunderbird" },
  { id: "outlook_desktop", label: "Microsoft Outlook · asztali" },
  { id: "outlook_mobile", label: "Microsoft Outlook · mobil" },
  { id: "ios_mail", label: "Apple Mail · iPhone/iPad" },
  { id: "android_mail", label: "Android rendszer-levelező" },
  { id: "other", label: "Más levelezőprogram" },
] as const;

export type DropEmailValidationClientId = typeof DROP_EMAIL_VALIDATION_CLIENTS[number]["id"];
export type DropEmailValidationReviewStatus = "pending" | "passed" | "failed";

export type DropEmailValidationRecord = {
  id: string;
  createdAt: string;
  recipientEmail: string;
  clientId: DropEmailValidationClientId;
  clientLabel: string;
  notes: string;
  sent: boolean;
  messageId?: string;
  sendError?: string;
  previewCount: number;
  previewBytes: number;
  reviewStatus: DropEmailValidationReviewStatus;
  reviewedAt?: string;
  reviewNotes?: string;
};

type ValidationState = {
  version: 1;
  updatedAt: string;
  records: DropEmailValidationRecord[];
};

function resolveProjectRoot() {
  const configured = process.env.DIMPRO_PROJECT_ROOT?.trim();
  if (configured) return path.resolve(configured);
  const cwd = process.cwd();
  const standaloneSuffix = `${path.sep}.next${path.sep}standalone`;
  return cwd.endsWith(standaloneSuffix) ? cwd.slice(0, -standaloneSuffix.length) : cwd;
}

const validationDir = path.join(resolveProjectRoot(), ".dimprover", "mail");
const validationFile = path.join(validationDir, "drop-email-client-validation.json");
const MAX_HISTORY = 500;
const MAX_DAILY_SENDS = 20;
const SAME_RECIPIENT_COOLDOWN_MS = 60_000;

function clientById(value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  return DROP_EMAIL_VALIDATION_CLIENTS.find((client) => client.id === id) || null;
}

function cleanEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) return "";
  return email;
}

function cleanText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

async function ensureValidationDir() {
  await mkdir(validationDir, { recursive: true, mode: 0o700 });
}

async function loadState(): Promise<ValidationState> {
  await ensureValidationDir();
  try {
    const parsed = JSON.parse(await readFile(validationFile, "utf8")) as ValidationState;
    if (parsed.version !== 1 || !Array.isArray(parsed.records)) throw new Error("invalid-state");
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
      records: parsed.records.filter((record) => record && typeof record.id === "string").slice(0, MAX_HISTORY),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { version: 1, updatedAt: new Date(0).toISOString(), records: [] };
    }
    throw Object.assign(new Error("Az e-mail kliensvalidációs napló nem olvasható biztonságosan."), { code: "DROP_EMAIL_VALIDATION_STATE_INVALID" });
  }
}

async function saveState(state: ValidationState) {
  await ensureValidationDir();
  const normalized: ValidationState = {
    version: 1,
    updatedAt: new Date().toISOString(),
    records: state.records.slice(0, MAX_HISTORY),
  };
  const temporary = `${validationFile}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(temporary, JSON.stringify(normalized, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  await rename(temporary, validationFile);
}

function sampleSvg(title: string, subtitle: string, accent: string, background: string) {
  const safeTitle = title.replace(/[&<>"']/g, "");
  const safeSubtitle = subtitle.replace(/[&<>"']/g, "");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
    <rect width="900" height="600" rx="48" fill="${background}"/>
    <path d="M105 420 L250 260 L365 355 L535 165 L795 420 Z" fill="${accent}" opacity="0.82"/>
    <circle cx="690" cy="150" r="58" fill="#ffffff" opacity="0.88"/>
    <rect x="74" y="458" width="752" height="92" rx="22" fill="#071d2b" opacity="0.94"/>
    <text x="105" y="500" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff">${safeTitle}</text>
    <text x="105" y="532" font-family="Arial, sans-serif" font-size="20" fill="#a5f3fc">${safeSubtitle}</text>
  </svg>`);
}

async function buildSyntheticPreviewBundle(): Promise<{
  files: DropPublicMailFile[];
  previewBundle: DropPublicEmailPreviewBundle;
}> {
  const definitions = [
    { id: "sample-jpeg", name: "helyszini-foto.jpg", mimeType: "image/jpeg", title: "JPEG helyszíni fotó", subtitle: "CID előnézet · 180 × 120 px", accent: "#0f766e", background: "#dff7f3" },
    { id: "sample-png", name: "tervreszlet.png", mimeType: "image/png", title: "PNG tervrészlet", subtitle: "Átlátszóság után JPEG előnézet", accent: "#0369a1", background: "#e0f2fe" },
    { id: "sample-heic", name: "iphone-foto.heic", mimeType: "image/heic", title: "HEIC kamerakép", subtitle: "E-mailben kompatibilis JPEG", accent: "#7c3aed", background: "#ede9fe" },
  ];
  const previews = [];
  let totalBytes = 0;
  for (const [index, definition] of definitions.entries()) {
    const thumbnail = await createDropPublicEmailThumbnail(sampleSvg(definition.title, definition.subtitle, definition.accent, definition.background));
    const cid = `dimpro-drop-validation-${definition.id}@dimpro.hu`;
    previews.push({
      fileId: definition.id,
      cid,
      filename: `dimpro-drop-validation-${String(index + 1).padStart(2, "0")}.jpg`,
      content: thumbnail.content,
      contentType: thumbnail.contentType,
      width: thumbnail.width,
      height: thumbnail.height,
      sizeBytes: thumbnail.sizeBytes,
    });
    totalBytes += thumbnail.sizeBytes;
  }
  const attachments: DimproMailAttachment[] = previews.map((preview) => ({
    filename: preview.filename,
    content: preview.content,
    contentType: preview.contentType,
    cid: preview.cid,
    contentDisposition: "inline",
  }));
  const files: DropPublicMailFile[] = [
    ...definitions.map((definition, index) => ({
      id: definition.id,
      name: definition.name,
      sizeBytes: [2_840_000, 1_420_000, 3_760_000][index],
      comments: index === 0 ? ["Mobil kamerával készített mintafotó."] : index === 2 ? ["A HEIC forrásból az e-mailhez JPEG bélyegkép készül."] : [],
      mimeType: definition.mimeType,
      isImage: true,
      storageKey: "validation-only",
      storageBucket: null,
    })),
    {
      id: "sample-pdf",
      name: "muszaki-tervcsomag.pdf",
      sizeBytes: 8_920_000,
      comments: ["Nem képfájl: rendezett PDF fájlkártyaként jelenik meg."],
      mimeType: "application/pdf",
      isImage: false,
      storageKey: "validation-only",
      storageBucket: null,
    },
    {
      id: "sample-zip",
      name: "dokumentumcsomag.zip",
      sizeBytes: 24_700_000,
      comments: [],
      mimeType: "application/zip",
      isImage: false,
      storageKey: "validation-only",
      storageBucket: null,
    },
  ];
  return {
    files,
    previewBundle: {
      previews,
      attachments,
      eligibleCount: definitions.length,
      attemptedCount: definitions.length,
      skippedCount: 0,
      errors: [],
      totalBytes,
    },
  };
}

export async function buildDropEmailValidationPreview(clientId: DropEmailValidationClientId = "gmail_web") {
  const client = clientById(clientId) || DROP_EMAIL_VALIDATION_CLIENTS[0];
  const { files, previewBundle } = await buildSyntheticPreviewBundle();
  const content = buildDropPublicDeliveryEmailContent({
    recipientName: "DIMPRO tesztcímzett",
    uploaderName: "DIMPRO Drop validáció",
    uploaderEmail: "ertesites.drop@dimpro.hu",
    subject: "Képelőnézet és fájlkártya kompatibilitási próba",
    senderMessage: "Ez a levél a tényleges DIMPRO Drop címzetti sablont ellenőrzi. Vizsgálja meg, hogy a három képelőnézet, a fájlnevek, a megjegyzések és a gomb megfelelően látható-e.",
    packageNote: "NEM VALÓDI KÜLDEMÉNY. A tesztlink nem biztosít fájlhozzáférést.",
    expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    files,
    downloadUrl: "https://drop.dimpro.hu/?email-client-validation=1",
    downloadPin: "123456",
    previewBundle,
    testMode: true,
    testClientLabel: client.label,
  });
  let browserHtml = content.html;
  for (const preview of previewBundle.previews) {
    const dataUrl = `data:${preview.contentType};base64,${preview.content.toString("base64")}`;
    browserHtml = browserHtml.replaceAll(`cid:${preview.cid}`, dataUrl);
  }
  return {
    subject: "[TESZT – NEM VALÓDI KÜLDEMÉNY] DIMPRO Drop képelőnézet",
    text: content.text,
    html: content.html,
    browserHtml,
    attachments: previewBundle.attachments,
    files: files.map((file) => ({ id: file.id, name: file.name, sizeBytes: file.sizeBytes, isImage: file.isImage })),
    previewCount: content.previewCount,
    previewBytes: content.previewBytes,
    client,
  };
}

export async function listDropEmailValidationHistory(limit = 30) {
  const state = await loadState();
  return state.records.slice(0, Math.max(1, Math.min(100, limit)));
}

export async function sendDropEmailValidationTest(input: {
  recipientEmail: unknown;
  clientId: unknown;
  notes?: unknown;
  confirmation?: unknown;
}, dependencies: { sendMail?: typeof sendDimproMail } = {}) {
  const recipientEmail = cleanEmail(input.recipientEmail);
  const client = clientById(input.clientId);
  const notes = cleanText(input.notes, 500);
  const confirmation = cleanText(input.confirmation, 20).toUpperCase();
  if (!recipientEmail) throw Object.assign(new Error("Érvényes tesztcímzett e-mail-cím szükséges."), { code: "DROP_EMAIL_VALIDATION_RECIPIENT_INVALID" });
  if (!client) throw Object.assign(new Error("A vizsgált levelezőprogram kiválasztása kötelező."), { code: "DROP_EMAIL_VALIDATION_CLIENT_INVALID" });
  if (confirmation !== "TESZT") throw Object.assign(new Error("A küldéshez írja be pontosan: TESZT"), { code: "DROP_EMAIL_VALIDATION_CONFIRMATION_REQUIRED" });

  const state = await loadState();
  const now = Date.now();
  const sameRecipientRecent = state.records.find((record) => record.recipientEmail === recipientEmail && now - new Date(record.createdAt).getTime() < SAME_RECIPIENT_COOLDOWN_MS);
  if (sameRecipientRecent) {
    throw Object.assign(new Error("Erre a címre egy percen belül már indult tesztküldés."), { code: "DROP_EMAIL_VALIDATION_RATE_LIMIT" });
  }
  const today = new Date().toISOString().slice(0, 10);
  const dailyCount = state.records.filter((record) => record.createdAt.startsWith(today)).length;
  if (dailyCount >= MAX_DAILY_SENDS) {
    throw Object.assign(new Error("A napi e-mail kliensvalidációs tesztküldési limit elérte a 20 levelet."), { code: "DROP_EMAIL_VALIDATION_DAILY_LIMIT" });
  }

  const preview = await buildDropEmailValidationPreview(client.id);
  const baseRecord: DropEmailValidationRecord = {
    id: `dropmail_${randomUUID()}`,
    createdAt: new Date().toISOString(),
    recipientEmail,
    clientId: client.id,
    clientLabel: client.label,
    notes,
    sent: false,
    previewCount: preview.previewCount,
    previewBytes: preview.previewBytes,
    reviewStatus: "pending",
  };

  try {
    const sendMail = dependencies.sendMail || sendDimproMail;
    const sent = await sendMail({
      profileId: "drop",
      to: [recipientEmail],
      subject: preview.subject,
      text: preview.text,
      html: preview.html,
      attachments: preview.attachments,
    });
    const record: DropEmailValidationRecord = { ...baseRecord, sent: true, messageId: sent.messageId };
    state.records.unshift(record);
    await saveState(state);
    return record;
  } catch (error) {
    const record: DropEmailValidationRecord = {
      ...baseRecord,
      sendError: error instanceof Error ? error.message.slice(0, 500) : "Ismeretlen e-mail küldési hiba",
    };
    state.records.unshift(record);
    await saveState(state);
    throw Object.assign(new Error(record.sendError), { code: "DROP_EMAIL_VALIDATION_SEND_FAILED", record });
  }
}

export async function reviewDropEmailValidation(input: {
  id: unknown;
  reviewStatus: unknown;
  reviewNotes?: unknown;
}) {
  const id = cleanText(input.id, 120);
  const reviewStatus = input.reviewStatus === "passed" || input.reviewStatus === "failed" || input.reviewStatus === "pending"
    ? input.reviewStatus
    : null;
  const reviewNotes = cleanText(input.reviewNotes, 500);
  if (!id || !reviewStatus) throw Object.assign(new Error("Érvénytelen kliensvalidációs értékelés."), { code: "DROP_EMAIL_VALIDATION_REVIEW_INVALID" });
  const state = await loadState();
  const record = state.records.find((item) => item.id === id);
  if (!record) throw Object.assign(new Error("A tesztküldési rekord nem található."), { code: "DROP_EMAIL_VALIDATION_NOT_FOUND" });
  record.reviewStatus = reviewStatus;
  record.reviewNotes = reviewNotes || undefined;
  record.reviewedAt = reviewStatus === "pending" ? undefined : new Date().toISOString();
  await saveState(state);
  return record;
}

export function getDropEmailValidationSafety() {
  return {
    version: "DROP 1.2.11",
    adminOnly: true,
    explicitRecipientRequired: true,
    confirmationPhrase: "TESZT",
    sameRecipientCooldownSeconds: SAME_RECIPIENT_COOLDOWN_MS / 1000,
    maximumDailyTestEmails: MAX_DAILY_SENDS,
    usesProductionTemplate: true,
    usesCidInlineAttachments: true,
    originalFilesAttached: false,
    realPackageAccessGranted: false,
    publicEndpoint: false,
  };
}
