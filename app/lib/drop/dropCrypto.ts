import {
  createHmac,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { DropAccessPurpose } from "./dropTypes";

const TOKEN_PREFIX: Record<DropAccessPurpose, string> = {
  upload: "dmp_u_",
  view: "dmp_v_",
  download: "dmp_d_",
  report: "dmp_r_",
};

function requireSecret(name: "DROP_TOKEN_HMAC_SECRET" | "DROP_SESSION_SECRET") {
  const value = process.env[name]?.trim();
  if (!value || value.length < 32 || value.includes("<") || value.includes(">")) {
    const error = new Error(`${name} nincs biztonságosan beállítva.`);
    Object.assign(error, { code: "DROP_SECURITY_NOT_READY", status: 503 });
    throw error;
  }
  return value;
}

export function isDropTokenSecurityConfigured() {
  const tokenSecret = process.env.DROP_TOKEN_HMAC_SECRET?.trim();
  const sessionSecret = process.env.DROP_SESSION_SECRET?.trim();
  return Boolean(tokenSecret && tokenSecret.length >= 32 && sessionSecret && sessionSecret.length >= 32);
}

export function generateDropPin() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function normalizeDropPin(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 6);
}

export function hashDropPin(pin: string, salt = randomBytes(16).toString("hex")) {
  const normalized = normalizeDropPin(pin);
  if (!/^\d{6}$/.test(normalized)) {
    const error = new Error("A PIN pontosan hat számjegyből állhat.");
    Object.assign(error, { code: "DROP_INVALID_PIN", status: 400 });
    throw error;
  }
  const hash = scryptSync(normalized, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex");
  return { hash, salt };
}

export function verifyDropPin(pin: string, expectedHash: string, salt: string) {
  try {
    const actual = Buffer.from(hashDropPin(pin, salt).hash, "hex");
    const expected = Buffer.from(expectedHash, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function hashDropToken(rawToken: string) {
  return createHmac("sha256", requireSecret("DROP_TOKEN_HMAC_SECRET"))
    .update(rawToken, "utf8")
    .digest("hex");
}

export function createDropCapabilityToken(purpose: DropAccessPurpose, expiresAt: string) {
  const rawToken = `${TOKEN_PREFIX[purpose]}${randomBytes(32).toString("base64url")}`;
  return {
    purpose,
    rawToken,
    tokenHash: hashDropToken(rawToken),
    tokenHint: `${TOKEN_PREFIX[purpose]}…${rawToken.slice(-6)}`,
    expiresAt,
  };
}

export function inferDropTokenPurpose(rawToken: string): DropAccessPurpose | null {
  const entry = Object.entries(TOKEN_PREFIX).find(([, prefix]) => rawToken.startsWith(prefix));
  return entry ? (entry[0] as DropAccessPurpose) : null;
}

export function createDropSecurityFingerprint(namespace: string, value: string) {
  return createHmac("sha256", requireSecret("DROP_SESSION_SECRET"))
    .update(`${namespace}:${value}`, "utf8")
    .digest("hex");
}

export function safeTokenReference(rawToken: string) {
  const purpose = inferDropTokenPurpose(rawToken);
  if (!purpose) return "ismeretlen-token";
  return `${TOKEN_PREFIX[purpose]}…${rawToken.slice(-6)}`;
}
