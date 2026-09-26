import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const PROJECT_GATE_DEV_ACCESS_COOKIE = "dimpro_project_gate_dev_access";
export const PROJECT_GATE_DEV_ACCESS_USER_ID = "dev-web-user";

const TOKEN_VERSION = "v1";
const DEFAULT_TTL_SECONDS = 8 * 60 * 60;

function normalizeHost(value: string | null | undefined) {
  return (value || "").trim().toLowerCase().replace(/:\d+$/, "");
}

function enabledFlag() {
  return process.env.PROJECTKAPU_DEV_CODE_AUTH_ENABLED?.trim().toLowerCase() === "true";
}

function baseSecret() {
  const explicit = process.env.PROJECTKAPU_DEV_ACCESS_SESSION_SECRET?.trim() || "";
  const fallback = process.env.DROP_SESSION_SECRET?.trim() || "";
  const value = explicit || fallback;
  return value.length >= 32 && !value.includes("<") && !value.includes(">") ? value : "";
}

function configuredCodeSalt() {
  const value = process.env.PROJECTKAPU_DEV_ACCESS_CODE_SALT?.trim().toLowerCase() || "";
  return /^[a-f0-9]{32}$/.test(value) ? value : "";
}

function configuredCodeHash() {
  const value = process.env.PROJECTKAPU_DEV_ACCESS_CODE_HASH?.trim().toLowerCase() || "";
  return /^[a-f0-9]{64}$/.test(value) ? value : "";
}

function derivedSessionSecret() {
  const secret = baseSecret();
  if (!secret) return "";
  return createHmac("sha256", secret)
    .update("projectkapu-dev-access-session-v1", "utf8")
    .digest("hex");
}

function allowedHosts() {
  const configured = process.env.PROJECTKAPU_DEV_ACCESS_HOSTS?.trim();
  const values = configured
    ? configured.split(",")
    : ["projektkapu.dev.dimpro.hu", "localhost", "127.0.0.1"];
  return new Set(values.map(normalizeHost).filter(Boolean));
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(payload: string) {
  return createHmac("sha256", derivedSessionSecret()).update(payload, "utf8").digest("base64url");
}

function hashAccessCode(code: string) {
  const salt = configuredCodeSalt();
  if (!salt) return "";
  return scryptSync(
    code,
    Buffer.from(salt, "hex"),
    32,
    { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
  ).toString("hex");
}

export function isProjectGateDevAccessConfigured(hostValue: string | null | undefined) {
  const host = normalizeHost(hostValue);
  return Boolean(
    enabledFlag()
      && host
      && allowedHosts().has(host)
      && configuredCodeSalt()
      && configuredCodeHash()
      && derivedSessionSecret(),
  );
}

export function verifyProjectGateDevAccessCode(input: unknown) {
  const provided = typeof input === "string" ? input.trim() : "";
  if (!/^\d{6}$/.test(provided)) return false;
  const expected = configuredCodeHash();
  const actual = hashAccessCode(provided);
  return Boolean(expected && actual && safeEqual(actual, expected));
}

export function createProjectGateDevAccessToken(nowMs = Date.now()) {
  if (!derivedSessionSecret()) throw new Error("PROJECTKAPU_DEV_ACCESS_SESSION_SECRET_MISSING");
  const expiresAt = Math.floor(nowMs / 1000) + DEFAULT_TTL_SECONDS;
  const payload = `${TOKEN_VERSION}.${expiresAt}`;
  return {
    token: `${payload}.${sign(payload)}`,
    expiresAt,
    maxAge: DEFAULT_TTL_SECONDS,
  };
}

export function verifyProjectGateDevAccessToken(rawValue: string | null | undefined, nowMs = Date.now()) {
  const raw = rawValue?.trim() || "";
  const [version, expiresRaw, suppliedSignature, ...rest] = raw.split(".");
  if (rest.length || version !== TOKEN_VERSION || !/^\d+$/.test(expiresRaw || "") || !suppliedSignature) return false;
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(nowMs / 1000)) return false;
  if (!derivedSessionSecret()) return false;
  const payload = `${version}.${expiresRaw}`;
  return safeEqual(suppliedSignature, sign(payload));
}

export function requestHasProjectGateDevAccess(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!isProjectGateDevAccessConfigured(host)) return false;
  return verifyProjectGateDevAccessToken(request.cookies.get(PROJECT_GATE_DEV_ACCESS_COOKIE)?.value);
}

export function projectGateDevAccessCookieOptions(hostValue: string | null | undefined, maxAge: number) {
  const host = normalizeHost(hostValue);
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: host !== "localhost" && host !== "127.0.0.1",
    path: "/",
    maxAge,
  };
}
