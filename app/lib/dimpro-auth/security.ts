import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
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

export function createDimproAuthInvitationToken() {
  return randomBytes(32).toString("base64url");
}

export function isValidDimproAuthInvitationToken(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function hashDimproAuthInvitationToken(token: string) {
  return createHmac("sha256", getDimproAuthConfig().invitationPepper)
    .update(`dimpro-auth-invitation:v1:${token}`, "utf8")
    .digest();
}

export function hashDimproAuthEmailForAudit(email: string) {
  return createHmac("sha256", getDimproAuthConfig().auditPepper)
    .update(`dimpro-auth-email-audit:v1:${normalizeDimproAuthEmail(email)}`, "utf8")
    .digest();
}

function normalizedIp(value: string | null) {
  const candidate = value?.trim() || "";
  return candidate && isIP(candidate) ? candidate : null;
}

export function getDimproAuthRequestIp(headers: Headers) {
  const realIp = normalizedIp(headers.get("x-real-ip"));
  if (realIp) return realIp;
  const cloudflareIp = normalizedIp(headers.get("cf-connecting-ip"));
  if (cloudflareIp) return cloudflareIp;
  const forwarded = (headers.get("x-forwarded-for") || "")
    .split(",")
    .map((entry) => normalizedIp(entry))
    .filter((entry): entry is string => Boolean(entry));
  return forwarded.length ? forwarded[forwarded.length - 1] : null;
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
  const host = headers.get("host")?.trim().toLowerCase();
  if (!host || !/^[a-z0-9.:-]+$/.test(host)) return false;
  const origin = headers.get("origin")?.trim();
  if (origin) {
    try {
      const parsed = new URL(origin);
      const loopback = host.startsWith("localhost") || host.startsWith("127.0.0.1");
      const protocolAllowed = parsed.protocol === "https:" || (loopback && parsed.protocol === "http:");
      return protocolAllowed && parsed.host.toLowerCase() === host;
    } catch {
      return false;
    }
  }
  const fetchSite = headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  return true;
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
