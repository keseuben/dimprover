import "server-only";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { DriveCoreRepositoryError } from "./errors";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const PASSWORD_PREFIX = "scrypt-v1";
const UNLOCK_TOKEN_VERSION = 1;

export type DriveFolderUnlockGrant = {
  projectId: string;
  folderId: string;
  passwordVersion: number;
  expiresAt: number;
};

function serverSecret() {
  const raw = process.env.DRIVE_FOLDER_UNLOCK_SECRET?.trim()
    || process.env.DIMPRO_ACCESS_HASH_PEPPER?.trim()
    || "";
  if (!raw || raw.includes("<") || raw.includes(">")) {
    throw new DriveCoreRepositoryError(
      "A DRIVE mappajelszó-feloldási titka nincs beállítva.",
      "DRIVE_FOLDER_PASSWORD_SECRET_NOT_CONFIGURED",
      503,
    );
  }
  return createHash("sha256").update("dimpro-drive-folder-unlock-v1\0" + raw, "utf8").digest();
}

export function validateDriveFolderPassword(password: unknown) {
  if (typeof password !== "string") {
    throw new DriveCoreRepositoryError("A mappajelszó kötelező.", "DRIVE_FOLDER_PASSWORD_REQUIRED", 400);
  }
  if (password.length < 8 || password.length > 128) {
    throw new DriveCoreRepositoryError(
      "A mappajelszó 8–128 karakter hosszú lehet.",
      "DRIVE_FOLDER_PASSWORD_LENGTH_INVALID",
      400,
    );
  }
  return password;
}

export function hashDriveFolderPassword(passwordInput: unknown) {
  const password = validateDriveFolderPassword(passwordInput);
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return [
    PASSWORD_PREFIX,
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString("base64url"),
    Buffer.from(derived).toString("base64url"),
  ].join("$");
}

export function verifyDriveFolderPassword(passwordInput: unknown, encoded: string) {
  const password = validateDriveFolderPassword(passwordInput);
  const parts = String(encoded || "").split("$");
  if (parts.length !== 6 || parts[0] !== PASSWORD_PREFIX) return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (n !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64url");
    expected = Buffer.from(parts[5], "base64url");
  } catch {
    return false;
  }
  if (salt.length !== 16 || expected.length !== SCRYPT_KEYLEN) return false;

  const actual = Buffer.from(scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: n,
    r,
    p,
    maxmem: SCRYPT_MAXMEM,
  }));
  return timingSafeEqual(actual, expected);
}

function encodePayload(grants: DriveFolderUnlockGrant[]) {
  const payload = {
    v: UNLOCK_TOKEN_VERSION,
    g: grants.map((grant) => ({
      p: grant.projectId,
      f: grant.folderId,
      v: grant.passwordVersion,
      e: grant.expiresAt,
    })),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function tokenSignature(payload: string) {
  return createHmac("sha256", serverSecret()).update(payload, "utf8").digest("base64url");
}

export function signDriveFolderUnlockToken(grants: DriveFolderUnlockGrant[]) {
  const now = Date.now();
  const normalized = grants
    .filter((grant) => (
      Boolean(grant.projectId)
      && Boolean(grant.folderId)
      && Number.isInteger(grant.passwordVersion)
      && grant.passwordVersion > 0
      && Number.isFinite(grant.expiresAt)
      && grant.expiresAt > now
    ))
    .sort((a, b) => b.expiresAt - a.expiresAt)
    .slice(0, 24);
  const payload = encodePayload(normalized);
  return payload + "." + tokenSignature(payload);
}

export function parseDriveFolderUnlockToken(token: string | null | undefined): DriveFolderUnlockGrant[] {
  const raw = String(token || "");
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return [];
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);

  const expected = Buffer.from(tokenSignature(payload), "utf8");
  const actual = Buffer.from(signature, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return [];

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      v?: number;
      g?: Array<{ p?: unknown; f?: unknown; v?: unknown; e?: unknown }>;
    };
    if (decoded.v !== UNLOCK_TOKEN_VERSION || !Array.isArray(decoded.g)) return [];
    const now = Date.now();
    return decoded.g.flatMap((item) => {
      const projectId = typeof item.p === "string" ? item.p : "";
      const folderId = typeof item.f === "string" ? item.f : "";
      const passwordVersion = Number(item.v);
      const expiresAt = Number(item.e);
      if (!projectId || !folderId || !Number.isInteger(passwordVersion) || passwordVersion <= 0 || !Number.isFinite(expiresAt) || expiresAt <= now) {
        return [];
      }
      return [{ projectId, folderId, passwordVersion, expiresAt }];
    }).slice(0, 24);
  } catch {
    return [];
  }
}

export function mergeDriveFolderUnlockGrant(
  grants: DriveFolderUnlockGrant[],
  grant: DriveFolderUnlockGrant,
) {
  const deduped = grants.filter((item) => !(item.projectId === grant.projectId && item.folderId === grant.folderId));
  return [grant, ...deduped].sort((a, b) => b.expiresAt - a.expiresAt).slice(0, 24);
}
