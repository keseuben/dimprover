import { createHash, randomInt, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { MEETING_DATA_ROOT, sanitizeMeetingId } from "./store";

const ROOT = path.join(MEETING_DATA_ROOT, "presentation-pairings");
const PAIRING_TTL_SECONDS = Math.max(300, Math.min(1800, Number(process.env.MEETING_PRESENTATION_PAIRING_TTL_SECONDS || 600)));
const ACCESS_TTL_SECONDS = Math.max(1800, Math.min(12 * 3600, Number(process.env.MEETING_PRESENTATION_ACCESS_TTL_SECONDS || 4 * 3600)));
const MAX_ATTEMPTS = Math.max(3, Math.min(10, Number(process.env.MEETING_PRESENTATION_PAIRING_MAX_ATTEMPTS || 5)));

export type MeetingPresentationPairingRecord = {
  version: 1;
  meetingId: string;
  codeHash: string;
  status: "pending" | "consumed" | "revoked" | "expired" | "locked";
  attempts: number;
  maxAttempts: number;
  issuedBy: string;
  recipientName: string;
  recipientEmail: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string;
  revokedAt: string;
  grantId: string;
};

function file(meetingId: string) {
  return path.join(ROOT, `${sanitizeMeetingId(meetingId)}.json`);
}

function normalizeCode(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

function hashCode(meetingId: string, code: string) {
  return createHash("sha256").update(`${sanitizeMeetingId(meetingId)}:presentation:${code}`).digest("hex");
}

async function atomicWriteJson(target: string, value: unknown) {
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, target);
}

async function readRecord(meetingId: string) {
  try {
    return JSON.parse(await readFile(file(meetingId), "utf8")) as MeetingPresentationPairingRecord;
  } catch {
    return null;
  }
}

export function presentationAccessTtlSeconds() {
  return ACCESS_TTL_SECONDS;
}

export async function createMeetingPresentationPairingCode(input: {
  meetingId: string;
  issuedBy: string;
  recipientName?: string;
  recipientEmail?: string;
}) {
  const meetingId = sanitizeMeetingId(input.meetingId);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();
  const record: MeetingPresentationPairingRecord = {
    version: 1,
    meetingId,
    codeHash: hashCode(meetingId, code),
    status: "pending",
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    issuedBy: String(input.issuedBy || "Szervező").trim().slice(0, 160),
    recipientName: String(input.recipientName || "").trim().slice(0, 160),
    recipientEmail: String(input.recipientEmail || "").trim().toLowerCase().slice(0, 240),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PAIRING_TTL_SECONDS * 1000).toISOString(),
    consumedAt: "",
    revokedAt: "",
    grantId: "",
  };
  await atomicWriteJson(file(meetingId), record);
  return {
    code,
    formattedCode: `${code.slice(0, 3)}-${code.slice(3)}`,
    expiresAt: record.expiresAt,
    expiresInSeconds: PAIRING_TTL_SECONDS,
    recipientName: record.recipientName,
    recipientEmail: record.recipientEmail,
  };
}

export async function consumeMeetingPresentationPairingCode(input: {
  meetingId: string;
  code: string;
  controllerName?: string;
  controllerEmail?: string;
}) {
  const meetingId = sanitizeMeetingId(input.meetingId);
  const code = normalizeCode(input.code);
  if (code.length !== 6) return { ok: false as const, error: "A vezérlőkód 6 számjegyű." };
  const record = await readRecord(meetingId);
  if (!record || record.version !== 1 || record.meetingId !== meetingId) return { ok: false as const, error: "Nincs aktív vezérlőkód ehhez az értekezlethez." };
  const now = new Date();
  if (record.status === "consumed") return { ok: false as const, error: "Ezt a vezérlőkódot már felhasználták." };
  if (record.status === "revoked") return { ok: false as const, error: "A vezérlőkódot visszavonták." };
  if (record.status === "locked") return { ok: false as const, error: "Túl sok hibás próbálkozás történt. Kérj új vezérlőkódot." };
  if (record.status !== "pending" || new Date(record.expiresAt).getTime() <= now.getTime()) {
    await atomicWriteJson(file(meetingId), { ...record, status: "expired" });
    return { ok: false as const, error: "A vezérlőkód lejárt. Kérj új kódot." };
  }
  if (record.codeHash !== hashCode(meetingId, code)) {
    const attempts = record.attempts + 1;
    await atomicWriteJson(file(meetingId), { ...record, attempts, status: attempts >= record.maxAttempts ? "locked" : "pending" });
    return { ok: false as const, error: attempts >= record.maxAttempts ? "Túl sok hibás próbálkozás történt. Kérj új vezérlőkódot." : `Hibás vezérlőkód. Még ${record.maxAttempts - attempts} próbálkozás maradt.` };
  }
  const suppliedEmail = String(input.controllerEmail || "").trim().toLowerCase().slice(0, 240);
  if (record.recipientEmail && !suppliedEmail) return { ok: false as const, error: "A kijelölt e-mail-cím megadása kötelező." };
  if (record.recipientEmail && record.recipientEmail !== suppliedEmail) return { ok: false as const, error: "A megadott e-mail-cím nem egyezik a kijelölt címmel." };
  const grantId = randomUUID();
  const consumed: MeetingPresentationPairingRecord = { ...record, status: "consumed", consumedAt: now.toISOString(), grantId };
  await atomicWriteJson(file(meetingId), consumed);
  const controllerName = String(input.controllerName || record.recipientName || "Előadó").trim().slice(0, 160);
  const controllerEmail = suppliedEmail || record.recipientEmail;
  return {
    ok: true as const,
    record: consumed,
    grantId,
    controllerName,
    controllerEmail,
    accessExpiresAt: new Date(now.getTime() + ACCESS_TTL_SECONDS * 1000).toISOString(),
  };
}

export async function revokeMeetingPresentationPairingCode(meetingId: string) {
  const safeMeetingId = sanitizeMeetingId(meetingId);
  const record = await readRecord(safeMeetingId);
  if (!record) return null;
  if (["revoked", "expired"].includes(record.status)) return record;
  const revoked: MeetingPresentationPairingRecord = { ...record, status: "revoked", revokedAt: new Date().toISOString() };
  await atomicWriteJson(file(safeMeetingId), revoked);
  return revoked;
}
