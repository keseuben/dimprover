import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const TOKEN_BYTES = 32;

export const WINDOWS_BRIDGE_PAIRING_ATTEMPT_LIMIT = 5 as const;

export function normalizeWindowsBridgePairingCode(value: string) {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 16);
}

export function createWindowsBridgePairingCode() {
  const bytes = randomBytes(10);
  let code = "";
  for (let index = 0; index < 10; index += 1) code += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

export function createWindowsBridgeToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashWindowsBridgeToken(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashWindowsBridgePairingCode(secret: string, pairingId: string, code: string) {
  return createHmac("sha256", secret).update(`${pairingId}:${normalizeWindowsBridgePairingCode(code)}`, "utf8").digest("hex");
}

export function safeWindowsBridgeHashEqual(left: string, right: string) {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
