import { createHmac, timingSafeEqual } from "node:crypto";

const INVITATION_PREFIX = "dsp_i_";
const SESSION_PREFIX = "dsp_s_";
export const DROP_SPACE_SESSION_COOKIE = "dimpro_drop_space_session";

export type DropSpaceInvitationTokenPayload = {
  v: 1;
  typ: "space_invitation";
  membershipId: string;
  spaceId: string;
  email: string;
  invitedAt: string;
  exp: number;
};

export type DropSpaceSessionTokenPayload = {
  v: 1;
  typ: "space_session";
  membershipId: string;
  spaceId: string;
  email: string;
  acceptedAt: string;
  exp: number;
};

function securityError(message: string, code: string, status: number) {
  const error = new Error(message);
  Object.assign(error, { code, status });
  return error;
}

function requireSecret(name: "DROP_TOKEN_HMAC_SECRET" | "DROP_SESSION_SECRET") {
  const value = process.env[name]?.trim();
  if (!value || value.length < 32 || value.includes("<") || value.includes(">")) {
    throw securityError(`${name} nincs biztonságosan beállítva.`, "DROP_SECURITY_NOT_READY", 503);
  }
  return value;
}

function encodePayload(payload: object) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload<T>(encoded: string): T {
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
  } catch {
    throw securityError("A Drop tér hozzáférési token formátuma érvénytelen.", "DROP_SPACE_TOKEN_INVALID", 401);
  }
}

function sign(encodedPayload: string, secretName: "DROP_TOKEN_HMAC_SECRET" | "DROP_SESSION_SECRET") {
  return createHmac("sha256", requireSecret(secretName)).update(encodedPayload, "utf8").digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function buildToken(prefix: string, payload: object, secretName: "DROP_TOKEN_HMAC_SECRET" | "DROP_SESSION_SECRET") {
  const encoded = encodePayload(payload);
  return `${prefix}${encoded}.${sign(encoded, secretName)}`;
}

function verifyToken<T extends { exp: number }>(
  rawToken: string,
  prefix: string,
  secretName: "DROP_TOKEN_HMAC_SECRET" | "DROP_SESSION_SECRET",
) {
  if (!rawToken.startsWith(prefix)) {
    throw securityError("A Drop tér hozzáférési token típusa érvénytelen.", "DROP_SPACE_TOKEN_INVALID", 401);
  }
  const body = rawToken.slice(prefix.length);
  const separatorIndex = body.lastIndexOf(".");
  if (separatorIndex < 1) {
    throw securityError("A Drop tér hozzáférési token formátuma érvénytelen.", "DROP_SPACE_TOKEN_INVALID", 401);
  }
  const encoded = body.slice(0, separatorIndex);
  const signature = body.slice(separatorIndex + 1);
  const expected = sign(encoded, secretName);
  if (!safeEqual(signature, expected)) {
    throw securityError("A Drop tér hozzáférési token aláírása érvénytelen.", "DROP_SPACE_TOKEN_INVALID", 401);
  }
  const payload = decodePayload<T>(encoded);
  if (!Number.isFinite(payload.exp) || Date.now() >= payload.exp * 1000) {
    throw securityError("A Drop tér hozzáférési token lejárt.", "DROP_SPACE_TOKEN_EXPIRED", 410);
  }
  return payload;
}

export function createDropSpaceInvitationToken(input: {
  membershipId: string;
  spaceId: string;
  email: string;
  invitedAt: string;
  expiresAt: string;
}) {
  const exp = Math.floor(new Date(input.expiresAt).getTime() / 1000);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
    throw securityError("A Drop tér meghívó lejárata érvénytelen.", "DROP_SPACE_INVITATION_EXPIRY_INVALID", 400);
  }
  const payload: DropSpaceInvitationTokenPayload = {
    v: 1,
    typ: "space_invitation",
    membershipId: input.membershipId,
    spaceId: input.spaceId,
    email: input.email.trim().toLowerCase(),
    invitedAt: input.invitedAt,
    exp,
  };
  return buildToken(INVITATION_PREFIX, payload, "DROP_TOKEN_HMAC_SECRET");
}

export function verifyDropSpaceInvitationToken(rawToken: string) {
  const payload = verifyToken<DropSpaceInvitationTokenPayload>(
    rawToken,
    INVITATION_PREFIX,
    "DROP_TOKEN_HMAC_SECRET",
  );
  if (payload.v !== 1 || payload.typ !== "space_invitation") {
    throw securityError("A Drop tér meghívó token tartalma érvénytelen.", "DROP_SPACE_TOKEN_INVALID", 401);
  }
  return payload;
}

export function createDropSpaceSessionToken(input: {
  membershipId: string;
  spaceId: string;
  email: string;
  acceptedAt: string;
  expiresAt: string;
}) {
  const exp = Math.floor(new Date(input.expiresAt).getTime() / 1000);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
    throw securityError("A Drop tér munkamenet lejárata érvénytelen.", "DROP_SPACE_SESSION_EXPIRY_INVALID", 400);
  }
  const payload: DropSpaceSessionTokenPayload = {
    v: 1,
    typ: "space_session",
    membershipId: input.membershipId,
    spaceId: input.spaceId,
    email: input.email.trim().toLowerCase(),
    acceptedAt: input.acceptedAt,
    exp,
  };
  return buildToken(SESSION_PREFIX, payload, "DROP_SESSION_SECRET");
}

export function verifyDropSpaceSessionToken(rawToken: string) {
  const payload = verifyToken<DropSpaceSessionTokenPayload>(
    rawToken,
    SESSION_PREFIX,
    "DROP_SESSION_SECRET",
  );
  if (payload.v !== 1 || payload.typ !== "space_session") {
    throw securityError("A Drop tér munkamenet tartalma érvénytelen.", "DROP_SPACE_SESSION_INVALID", 401);
  }
  return payload;
}

export function getDropSpaceTokenHint(rawToken: string) {
  if (rawToken.startsWith(INVITATION_PREFIX)) return `${INVITATION_PREFIX}…${rawToken.slice(-6)}`;
  if (rawToken.startsWith(SESSION_PREFIX)) return `${SESSION_PREFIX}…${rawToken.slice(-6)}`;
  return `dsp_…${rawToken.slice(-6)}`;
}
