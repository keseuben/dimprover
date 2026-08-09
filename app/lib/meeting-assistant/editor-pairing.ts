import { createHash, randomInt, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { MEETING_DATA_ROOT, sanitizeMeetingId } from "./store";

const EDITOR_PAIRING_ROOT = path.join(MEETING_DATA_ROOT, "editor-pairings");
const EDITOR_PAIRING_TTL_SECONDS = Math.max(
  300,
  Math.min(1800, Number(process.env.MEETING_EDITOR_PAIRING_TTL_SECONDS || 600)),
);
const EDITOR_ACCESS_TTL_SECONDS = Math.max(
  3600,
  Math.min(24 * 3600, Number(process.env.MEETING_EDITOR_ACCESS_TTL_SECONDS || 12 * 3600)),
);
const MAX_ATTEMPTS = Math.max(3, Math.min(10, Number(process.env.MEETING_EDITOR_PAIRING_MAX_ATTEMPTS || 5)));

export type MeetingEditorPairingRecord = {
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

function pairingFile(meetingId: string) {
  return path.join(EDITOR_PAIRING_ROOT, `${sanitizeMeetingId(meetingId)}.json`);
}

function normalizeCode(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

function hashCode(meetingId: string, code: string) {
  return createHash("sha256").update(`${sanitizeMeetingId(meetingId)}:${code}`).digest("hex");
}

async function atomicWriteJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, file);
}

async function readRecord(meetingId: string) {
  try {
    return JSON.parse(await readFile(pairingFile(meetingId), "utf8")) as MeetingEditorPairingRecord;
  } catch {
    return null;
  }
}

export function editorAccessTtlSeconds() {
  return EDITOR_ACCESS_TTL_SECONDS;
}

export async function createMeetingEditorPairingCode(input: {
  meetingId: string;
  issuedBy: string;
  recipientName?: string;
  recipientEmail?: string;
}) {
  const meetingId = sanitizeMeetingId(input.meetingId);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EDITOR_PAIRING_TTL_SECONDS * 1000);
  const record: MeetingEditorPairingRecord = {
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
    expiresAt: expiresAt.toISOString(),
    consumedAt: "",
    revokedAt: "",
    grantId: "",
  };
  await atomicWriteJson(pairingFile(meetingId), record);
  return {
    code,
    formattedCode: `${code.slice(0, 3)}-${code.slice(3)}`,
    expiresAt: record.expiresAt,
    expiresInSeconds: EDITOR_PAIRING_TTL_SECONDS,
    recipientName: record.recipientName,
    recipientEmail: record.recipientEmail,
  };
}

export async function consumeMeetingEditorPairingCode(input: {
  meetingId: string;
  code: string;
  editorName?: string;
  editorEmail?: string;
}) {
  const meetingId = sanitizeMeetingId(input.meetingId);
  const code = normalizeCode(input.code);
  if (code.length !== 6) return { ok: false as const, error: "A szerkesztői kód 6 számjegyű." };

  const record = await readRecord(meetingId);
  if (!record || record.version !== 1 || record.meetingId !== meetingId) {
    return { ok: false as const, error: "Nincs aktív szerkesztői párosítás ehhez az értekezlethez." };
  }

  const now = new Date();
  if (record.status === "consumed") return { ok: false as const, error: "Ezt a szerkesztői kódot már felhasználták." };
  if (record.status === "revoked") return { ok: false as const, error: "A szerkesztői kódot a szervező visszavonta." };
  if (record.status === "locked") return { ok: false as const, error: "Túl sok hibás próbálkozás történt. Kérj új kódot a szervezőtől." };
  if (record.status !== "pending" || new Date(record.expiresAt).getTime() <= now.getTime()) {
    const expired = { ...record, status: "expired" as const };
    await atomicWriteJson(pairingFile(meetingId), expired);
    return { ok: false as const, error: "A szerkesztői kód lejárt. Kérj új kódot a szervezőtől." };
  }

  if (record.codeHash !== hashCode(meetingId, code)) {
    const attempts = record.attempts + 1;
    const failed: MeetingEditorPairingRecord = {
      ...record,
      attempts,
      status: attempts >= record.maxAttempts ? "locked" : "pending",
    };
    await atomicWriteJson(pairingFile(meetingId), failed);
    return {
      ok: false as const,
      error: attempts >= record.maxAttempts
        ? "Túl sok hibás próbálkozás történt. Kérj új kódot a szervezőtől."
        : `Hibás szerkesztői kód. Még ${record.maxAttempts - attempts} próbálkozás maradt.`,
    };
  }

  const suppliedEmail = String(input.editorEmail || "").trim().toLowerCase().slice(0, 240);
  if (record.recipientEmail && !suppliedEmail) {
    return { ok: false as const, error: "Ehhez a szerkesztői kódhoz a szervező által kijelölt e-mail-cím megadása kötelező." };
  }
  if (record.recipientEmail && record.recipientEmail !== suppliedEmail) {
    return { ok: false as const, error: "A megadott e-mail-cím nem egyezik a szervező által kijelölt címmel." };
  }

  const grantId = randomUUID();
  const consumed: MeetingEditorPairingRecord = {
    ...record,
    status: "consumed",
    consumedAt: now.toISOString(),
    grantId,
  };
  await atomicWriteJson(pairingFile(meetingId), consumed);

  const editorName = String(input.editorName || record.recipientName || "Jegyzőkönyv-szerkesztő").trim().slice(0, 160);
  const editorEmail = suppliedEmail || record.recipientEmail;
  return {
    ok: true as const,
    record: consumed,
    grantId,
    editorName,
    editorEmail,
    accessExpiresAt: new Date(now.getTime() + EDITOR_ACCESS_TTL_SECONDS * 1000).toISOString(),
  };
}

export async function revokeMeetingEditorPairingCode(meetingId: string) {
  const safeMeetingId = sanitizeMeetingId(meetingId);
  const record = await readRecord(safeMeetingId);
  if (!record) return null;
  if (["revoked", "expired"].includes(record.status)) return record;
  const revoked: MeetingEditorPairingRecord = {
    ...record,
    status: "revoked",
    revokedAt: new Date().toISOString(),
  };
  await atomicWriteJson(pairingFile(safeMeetingId), revoked);
  return revoked;
}
