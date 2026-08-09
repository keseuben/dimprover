import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { sanitizeMeetingId } from "./store";

const PAIRING_TTL_SECONDS = Math.max(
  300,
  Math.min(1800, Number(process.env.MEETING_ASSISTANT_PAIRING_TTL_SECONDS || 600)),
);

function resolveProjectRoot() {
  const cwd = process.cwd();
  const standaloneMarker = `${path.sep}.next${path.sep}standalone`;
  const markerIndex = cwd.lastIndexOf(standaloneMarker);
  return markerIndex >= 0 ? cwd.slice(0, markerIndex) : cwd;
}

const PROJECT_ROOT = process.env.DIMPRO_PROJECT_ROOT?.trim() || resolveProjectRoot();
const DATA_ROOT =
  process.env.DIMPRO_MEETING_DATA_ROOT?.trim() ||
  path.join(PROJECT_ROOT, ".dimprover", "data", "meeting-assistant");
const PAIRING_ROOT = path.join(DATA_ROOT, "pairings");

export type MeetingPairingRecord = {
  version: 1;
  codeHash: string;
  createdAt: string;
  expiresAt: string;
  issuedBy: string;
  status: "active" | "consumed" | "expired";
  consumedAt: string;
  meetingId: string;
  sourceMeetingId: string;
  issuedTo: string;
};

function normalizeCode(value: string | null | undefined) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function pairingFile(code: string) {
  return path.join(PAIRING_ROOT, `${hashCode(code)}.json`);
}

async function atomicWriteJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, file);
}

function generateReadableCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(8);
  let result = "";
  for (let index = 0; index < 8; index += 1) {
    result += alphabet[bytes[index] % alphabet.length];
  }
  return result;
}

export async function createMeetingPairingCode(issuedBy: string, sourceMeetingId: string) {
  const code = generateReadableCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PAIRING_TTL_SECONDS * 1000);
  const record: MeetingPairingRecord = {
    version: 1,
    codeHash: hashCode(code),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    issuedBy: String(issuedBy || "dimpro-organizer").slice(0, 200),
    status: "active",
    consumedAt: "",
    meetingId: "",
    sourceMeetingId: sanitizeMeetingId(sourceMeetingId),
    issuedTo: "",
  };
  await atomicWriteJson(pairingFile(code), record);
  return {
    code,
    expiresAt: record.expiresAt,
    expiresInSeconds: PAIRING_TTL_SECONDS,
  };
}

export async function consumeMeetingPairingCode(
  suppliedCode: string,
  meetingId: string,
  issuedTo: string,
) {
  const code = normalizeCode(suppliedCode);
  if (code.length !== 8) {
    return { ok: false as const, error: "A párosítókód 8 karakteres." };
  }

  const file = pairingFile(code);
  let record: MeetingPairingRecord;
  try {
    record = JSON.parse(await readFile(file, "utf8")) as MeetingPairingRecord;
  } catch {
    return { ok: false as const, error: "Ismeretlen vagy már törölt párosítókód." };
  }

  const now = new Date();
  if (record.version !== 1 || record.codeHash !== hashCode(code)) {
    return { ok: false as const, error: "A párosítókód érvénytelen." };
  }
  if (record.status === "consumed") {
    return { ok: false as const, error: "Ezt a párosítókódot már felhasználták. Hozz létre újat a DIMPRO oldalon." };
  }
  if (record.status !== "active" || new Date(record.expiresAt).getTime() <= now.getTime()) {
    const expired: MeetingPairingRecord = { ...record, status: "expired" };
    await atomicWriteJson(file, expired);
    return { ok: false as const, error: "A párosítókód lejárt. Hozz létre újat a DIMPRO oldalon." };
  }

  const consumed: MeetingPairingRecord = {
    ...record,
    status: "consumed",
    consumedAt: now.toISOString(),
    meetingId: sanitizeMeetingId(meetingId),
    sourceMeetingId: sanitizeMeetingId(record.sourceMeetingId || meetingId),
    issuedTo: String(issuedTo || "teams-meeting-participants").slice(0, 200),
  };
  await atomicWriteJson(file, consumed);
  return { ok: true as const, record: consumed };
}
