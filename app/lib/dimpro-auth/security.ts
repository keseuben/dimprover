import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { getDimproAuthConfig } from "./config";

export const DIMPRO_AUTH_SESSION_COOKIE = "__Host-dimpro_auth";
export const DIMPRO_AUTH_PURPOSE_LOGIN = "LOGIN";

export function normalizeDimproAuthEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidDimproAuthEmail(email: string) {
  return email.length >= 5 && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function createDimproAuthOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashDimproAuthOtp(email: string, purpose: string, code: string) {
  return createHmac("sha256", getDimproAuthConfig().otpPepper)
    .update(`dimpro-auth-otp:v1:${purpose}:${email}:${code}`, "utf8")
    .digest();
}

export function verifyDimproAuthOtpHash(expected: Buffer, email: string, purpose: string, code: string) {
  const actual = hashDimproAuthOtp(email, purpose, code);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createDimproAuthSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashDimproAuthSessionToken(token: string) {
  return createHmac("sha256", getDimproAuthConfig().sessionPepper)
    .update(`dimpro-auth-session:v1:${token}`, "utf8")
    .digest();
}

export function hashDimproAuthEmailForAudit(email: string) {
  return createHash("sha256").update(`dimpro-auth-email:v1:${email}`, "utf8").digest();
}

export function getDimproAuthRequestIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || headers.get("x-real-ip")?.trim()
    || headers.get("cf-connecting-ip")?.trim()
    || null;
}

export function getDimproAuthUserAgent(headers: Headers) {
  return (headers.get("user-agent") || "unknown").replace(/[\r\n\t]+/g, " ").trim().slice(0, 500);
}

export function newDimproAuthCorrelationId(headers: Headers) {
  const supplied = headers.get("x-correlation-id")?.trim();
  if (supplied && /^[A-Za-z0-9._:-]{8,120}$/.test(supplied)) return supplied;
  return randomBytes(16).toString("hex");
}

export function validateSameOriginMutation(headers: Headers) {
  const origin = headers.get("origin")?.trim();
  if (!origin) return true;
  const host = headers.get("host")?.trim().toLowerCase();
  if (!host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
