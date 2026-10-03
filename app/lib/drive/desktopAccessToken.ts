import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "dpat1";
const DEFAULT_TTL_SECONDS = 600;
const MAX_TTL_SECONDS = 900;

export type DriveDesktopAccessClaims = {
  v: 1;
  deviceId: string;
  agentId: string;
  clientId: string;
  iat: number;
  exp: number;
};

export class DriveDesktopAccessTokenError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function accessSecret() {
  const secret = process.env.DIMPRO_DRIVE_DESKTOP_ACCESS_SECRET?.trim() || "";
  if (secret.length < 32) {
    throw new DriveDesktopAccessTokenError(
      "DRIVE_DESKTOP_ACCESS_SECRET_NOT_CONFIGURED",
      "DIMPRO Drive Desktop access secret nincs konfigurálva.",
    );
  }
  return secret;
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(payloadB64: string) {
  return createHmac("sha256", accessSecret()).update(`${TOKEN_PREFIX}.${payloadB64}`, "utf8").digest("base64url");
}

function safeEqualText(left: string, right: string) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function cleanId(value: string, max = 160) {
  const next = value.trim().slice(0, max);
  if (!next || !/^[A-Za-z0-9._:@-]+$/.test(next)) {
    throw new DriveDesktopAccessTokenError("DRIVE_DESKTOP_ACCESS_CLAIM_INVALID", "Érvénytelen Drive Desktop token claim.");
  }
  return next;
}

export function issueDriveDesktopAccessToken(input: {
  deviceId: string;
  agentId: string;
  clientId: string;
  ttlSeconds?: number;
}) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(60, Math.min(MAX_TTL_SECONDS, Math.floor(input.ttlSeconds || DEFAULT_TTL_SECONDS)));
  const claims: DriveDesktopAccessClaims = {
    v: 1,
    deviceId: cleanId(input.deviceId, 128),
    agentId: cleanId(input.agentId, 128),
    clientId: cleanId(input.clientId || "drive-desktop", 160),
    iat: now,
    exp: now + ttl,
  };
  const payloadB64 = base64url(JSON.stringify(claims));
  const signature = sign(payloadB64);
  return {
    token: `${TOKEN_PREFIX}.${payloadB64}.${signature}`,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    expiresInSeconds: ttl,
    claims,
  };
}

export function verifyDriveDesktopAccessToken(token: string): DriveDesktopAccessClaims {
  const parts = token.trim().split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) {
    throw new DriveDesktopAccessTokenError("DRIVE_DESKTOP_ACCESS_TOKEN_INVALID", "Érvénytelen Drive Desktop access token.");
  }
  const expected = sign(parts[1]);
  if (!safeEqualText(parts[2], expected)) {
    throw new DriveDesktopAccessTokenError("DRIVE_DESKTOP_ACCESS_TOKEN_INVALID", "Érvénytelen Drive Desktop access token aláírás.");
  }
  let claims: DriveDesktopAccessClaims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as DriveDesktopAccessClaims;
  } catch {
    throw new DriveDesktopAccessTokenError("DRIVE_DESKTOP_ACCESS_TOKEN_INVALID", "Sérült Drive Desktop access token payload.");
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims.v !== 1 || !claims.deviceId || !claims.agentId || !claims.clientId || !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)) {
    throw new DriveDesktopAccessTokenError("DRIVE_DESKTOP_ACCESS_TOKEN_INVALID", "Hiányos Drive Desktop access token claim.");
  }
  if (claims.exp <= now) {
    throw new DriveDesktopAccessTokenError("DRIVE_DESKTOP_ACCESS_TOKEN_EXPIRED", "A Drive Desktop access token lejárt.");
  }
  if (claims.iat > now + 60 || claims.exp - claims.iat > MAX_TTL_SECONDS) {
    throw new DriveDesktopAccessTokenError("DRIVE_DESKTOP_ACCESS_TOKEN_INVALID", "Érvénytelen Drive Desktop access token időablak.");
  }
  cleanId(claims.deviceId, 128);
  cleanId(claims.agentId, 128);
  cleanId(claims.clientId, 160);
  return claims;
}
