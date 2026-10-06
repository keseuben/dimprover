import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DriveCoreRepositoryError } from "@/app/lib/drive-core/errors";

const OPEN_TICKET_SCHEMA_VERSION = 1;
const DEFAULT_TTL_MS = 90_000;
const MAX_TTL_MS = 180_000;
const CLEANUP_INTERVAL_MS = 5 * 60_000;
const CONSUMED_RETENTION_MS = 15 * 60_000;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export type DriveOpenTicketRecord = {
  schemaVersion: 1;
  projectId: string;
  projectCode: string;
  projectName: string;
  documentId: string;
  versionId: string;
  actorUserId: string;
  mode: "WORKFILE";
  issuedAt: string;
  expiresAt: string;
};

let lastCleanupAt = 0;

function ticketRoot() {
  const configured = process.env.DIMPRO_DRIVE_OPEN_TICKET_ROOT?.trim();
  return configured || path.join(tmpdir(), "dimpro-drive-open-tickets-v1");
}

function activeRoot() {
  return path.join(ticketRoot(), "active");
}

function consumedRoot() {
  return path.join(ticketRoot(), "consumed");
}

function tokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function ticketPath(root: string, hash: string) {
  return path.join(root, `${hash}.json`);
}

async function ensureRoots() {
  await mkdir(activeRoot(), { recursive: true, mode: 0o700 });
  await mkdir(consumedRoot(), { recursive: true, mode: 0o700 });
}

function normalizeText(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function cleanupDirectory(root: string, cutoffMs: number) {
  const names = await readdir(root).catch(() => [] as string[]);
  await Promise.all(names.filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).map(async (name) => {
    const target = path.join(root, name);
    const info = await stat(target).catch(() => null);
    if (!info || info.mtimeMs >= cutoffMs) return;
    await rm(target, { force: true }).catch(() => undefined);
  }));
}

async function cleanupIfDue(nowMs = Date.now()) {
  if (nowMs - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = nowMs;
  await ensureRoots();
  await Promise.all([
    cleanupDirectory(activeRoot(), nowMs - MAX_TTL_MS - CLEANUP_INTERVAL_MS),
    cleanupDirectory(consumedRoot(), nowMs - CONSUMED_RETENTION_MS),
  ]);
}

export async function issueDriveOpenTicket(input: {
  projectId: string;
  projectCode?: string | null;
  projectName?: string | null;
  documentId: string;
  versionId: string;
  actorUserId: string;
  ttlMs?: number;
}) {
  await cleanupIfDue();
  await ensureRoots();

  const projectId = normalizeText(input.projectId, 160);
  const documentId = normalizeText(input.documentId, 160);
  const versionId = normalizeText(input.versionId, 160);
  const actorUserId = normalizeText(input.actorUserId, 240);
  if (!projectId || !documentId || !versionId || !actorUserId) {
    throw new DriveCoreRepositoryError("A Windows megnyitási jegy adatai hiányosak.", "DRIVE_OPEN_TICKET_INPUT_INVALID", 400);
  }

  const ttlMs = Math.max(30_000, Math.min(MAX_TTL_MS, Number(input.ttlMs || DEFAULT_TTL_MS)));
  const issuedAtMs = Date.now();
  const token = randomBytes(32).toString("base64url");
  const hash = tokenHash(token);
  const record: DriveOpenTicketRecord = {
    schemaVersion: OPEN_TICKET_SCHEMA_VERSION,
    projectId,
    projectCode: normalizeText(input.projectCode, 80),
    projectName: normalizeText(input.projectName, 240),
    documentId,
    versionId,
    actorUserId,
    mode: "WORKFILE",
    issuedAt: new Date(issuedAtMs).toISOString(),
    expiresAt: new Date(issuedAtMs + ttlMs).toISOString(),
  };

  await writeFile(ticketPath(activeRoot(), hash), JSON.stringify(record), { encoding: "utf8", mode: 0o600, flag: "wx" });
  return { token, expiresAt: record.expiresAt, mode: record.mode } as const;
}

export async function consumeDriveOpenTicket(rawToken: unknown): Promise<DriveOpenTicketRecord> {
  await cleanupIfDue();
  await ensureRoots();

  const token = normalizeText(rawToken, 100);
  if (!TOKEN_RE.test(token)) {
    throw new DriveCoreRepositoryError("A Windows megnyitási jegy érvénytelen.", "DRIVE_OPEN_TICKET_INVALID", 400);
  }

  const hash = tokenHash(token);
  const active = ticketPath(activeRoot(), hash);
  const consumed = ticketPath(consumedRoot(), hash);
  try {
    await rename(active, consumed);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === "ENOENT") {
      throw new DriveCoreRepositoryError(
        "A Windows megnyitási jegy már felhasználásra került, lejárt vagy nem létezik.",
        "DRIVE_OPEN_TICKET_UNAVAILABLE",
        410,
      );
    }
    throw error;
  }

  let record: DriveOpenTicketRecord;
  try {
    record = JSON.parse(await readFile(consumed, "utf8")) as DriveOpenTicketRecord;
  } catch {
    throw new DriveCoreRepositoryError("A Windows megnyitási jegy sérült.", "DRIVE_OPEN_TICKET_CORRUPT", 410);
  }

  if (record.schemaVersion !== OPEN_TICKET_SCHEMA_VERSION || record.mode !== "WORKFILE") {
    throw new DriveCoreRepositoryError("A Windows megnyitási jegy verziója nem támogatott.", "DRIVE_OPEN_TICKET_SCHEMA_UNSUPPORTED", 410);
  }
  if (!record.projectId || !record.documentId || !record.versionId || !record.actorUserId) {
    throw new DriveCoreRepositoryError("A Windows megnyitási jegy hiányos.", "DRIVE_OPEN_TICKET_CORRUPT", 410);
  }
  if (!Number.isFinite(Date.parse(record.expiresAt)) || Date.parse(record.expiresAt) <= Date.now()) {
    throw new DriveCoreRepositoryError("A Windows megnyitási jegy lejárt.", "DRIVE_OPEN_TICKET_EXPIRED", 410);
  }

  return record;
}
