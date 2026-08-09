import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { DimproSendSessionClaims } from "./types";
import { DimproIdentityError } from "./types";

const SEND_CODE_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{3}-[A-Z0-9]{3}$/;
const PROJECT_CODE_PATTERN = /^PRJ-[0-9]{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{3}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{3}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_SESSION_TTL_SECONDS = 15 * 60;
const MAX_SESSION_TTL_SECONDS = 60 * 60;

function requiredSecret(name: string, minimumLength = 32) {
  const value = process.env[name]?.trim();
  if (!value || value.length < minimumLength || value.includes("<") || value.includes(">")) {
    throw new DimproIdentityError(
      `A(z) ${name} környezeti változó nincs biztonságosan beállítva.`,
      "DIMPRO_IDENTITY_SECRET_MISSING",
      503,
    );
  }
  return value;
}

function base64UrlEncode(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function safeJsonParse<T>(encoded: string): T | null {
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function safeEqualText(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function isIdentityCoreEnabled() {
  return process.env.DIMPRO_IDENTITY_CORE_ENABLED?.trim().toLowerCase() === "true";
}

export function normalizeDimproSendCode(value: unknown) {
  if (typeof value !== "string") return "";
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  if (compact.length !== 10) return "";
  const formatted = `${compact.slice(0, 4)}-${compact.slice(4, 7)}-${compact.slice(7, 10)}`;
  return SEND_CODE_PATTERN.test(formatted) ? formatted : "";
}

export function normalizeDimproProjectCode(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.toUpperCase().replace(/\s+/g, "").trim();
  return PROJECT_CODE_PATTERN.test(normalized) ? normalized : "";
}

export function normalizeUuid(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return UUID_PATTERN.test(text) ? text.toLowerCase() : "";
}

export function hashDimproSendCode(rawCode: string) {
  const normalized = normalizeDimproSendCode(rawCode);
  if (!normalized) {
    throw new DimproIdentityError(
      "A küldési jogosultságkód formátuma érvénytelen.",
      "DIMPRO_SEND_CODE_INVALID",
      400,
    );
  }
  return createHmac("sha256", requiredSecret("DIMPRO_SEND_CODE_PEPPER"))
    .update(`dimpro-send-code:v1:${normalized}`, "utf8")
    .digest("hex");
}

export function hashDimproRequestIp(rawIp: string) {
  const normalized = rawIp.trim().slice(0, 128) || "unknown";
  return createHmac("sha256", requiredSecret("DIMPRO_ACCESS_HASH_PEPPER"))
    .update(`dimpro-access-ip:v1:${normalized}`, "utf8")
    .digest("hex");
}

export function getRequestIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded
    || headers.get("x-real-ip")?.trim()
    || headers.get("cf-connecting-ip")?.trim()
    || "unknown";
}

export function summarizeUserAgent(headers: Headers) {
  return (headers.get("user-agent") || "unknown")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 500);
}

export function createDimproSendSession(entitlementId: string) {
  const normalizedId = normalizeUuid(entitlementId);
  if (!normalizedId) {
    throw new DimproIdentityError(
      "A Send-munkamenet nem hozható létre.",
      "DIMPRO_SEND_SESSION_ENTITLEMENT_INVALID",
      500,
    );
  }

  const configuredTtl = Number(process.env.DIMPRO_SEND_SESSION_TTL_SECONDS || DEFAULT_SESSION_TTL_SECONDS);
  const ttlSeconds = Number.isSafeInteger(configuredTtl)
    ? Math.min(MAX_SESSION_TTL_SECONDS, Math.max(60, configuredTtl))
    : DEFAULT_SESSION_TTL_SECONDS;
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims: DimproSendSessionClaims = {
    version: 1,
    audience: "dimpro-send",
    entitlementId: normalizedId,
    issuedAt,
    expiresAt: issuedAt + ttlSeconds,
    nonce: randomBytes(16).toString("base64url"),
  };
  const payload = base64UrlEncode(JSON.stringify(claims));
  const signature = createHmac("sha256", requiredSecret("DIMPRO_SEND_SESSION_SECRET"))
    .update(`dimpro-send-session:v1:${payload}`, "utf8")
    .digest("base64url");
  return {
    token: `dss1.${payload}.${signature}`,
    expiresAt: new Date(claims.expiresAt * 1000).toISOString(),
  };
}

export function verifyDimproSendSession(token: unknown): DimproSendSessionClaims {
  const raw = typeof token === "string" ? token.trim() : "";
  const [prefix, payload, signature, extra] = raw.split(".");
  if (prefix !== "dss1" || !payload || !signature || extra) {
    throw new DimproIdentityError(
      "A DIMPRO Send-munkamenet lejárt vagy nem érvényes.",
      "DIMPRO_SEND_SESSION_INVALID",
      401,
    );
  }

  const expected = createHmac("sha256", requiredSecret("DIMPRO_SEND_SESSION_SECRET"))
    .update(`dimpro-send-session:v1:${payload}`, "utf8")
    .digest("base64url");
  if (!safeEqualText(expected, signature)) {
    throw new DimproIdentityError(
      "A DIMPRO Send-munkamenet lejárt vagy nem érvényes.",
      "DIMPRO_SEND_SESSION_INVALID",
      401,
    );
  }

  const claims = safeJsonParse<DimproSendSessionClaims>(payload);
  const now = Math.floor(Date.now() / 1000);
  if (
    !claims
    || claims.version !== 1
    || claims.audience !== "dimpro-send"
    || !normalizeUuid(claims.entitlementId)
    || !Number.isSafeInteger(claims.issuedAt)
    || !Number.isSafeInteger(claims.expiresAt)
    || claims.issuedAt > now + 60
    || claims.expiresAt <= now
    || claims.expiresAt - claims.issuedAt > MAX_SESSION_TTL_SECONDS
    || typeof claims.nonce !== "string"
    || claims.nonce.length < 16
  ) {
    throw new DimproIdentityError(
      "A DIMPRO Send-munkamenet lejárt vagy nem érvényes.",
      "DIMPRO_SEND_SESSION_INVALID",
      401,
    );
  }
  return claims;
}

export function readBearerToken(headers: Headers) {
  const authorization = headers.get("authorization")?.trim() || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}
