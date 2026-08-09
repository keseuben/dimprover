import { randomBytes, timingSafeEqual } from "node:crypto";
import { createDropSecurityFingerprint } from "../dropCrypto";
import { DROP_DOWNLOAD_PROOF_COOKIE } from "./dropPublicSession";

const PROOF_TTL_MS = 30 * 60_000;

function signature(payload: string) {
  return createDropSecurityFingerprint("drop-download-pin-proof", payload);
}

export function createDropDownloadProof(packageId: string) {
  const expiresAtMs = Date.now() + PROOF_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ packageId, expiresAtMs, nonce: randomBytes(12).toString("hex") }), "utf8").toString("base64url");
  return { value: `${payload}.${signature(payload)}`, expiresAt: new Date(expiresAtMs).toISOString() };
}

export function verifyDropDownloadProof(value: string | null | undefined, packageId: string) {
  if (!value) return false;
  const [payload, received] = value.split(".");
  if (!payload || !received) return false;
  const expected = signature(payload);
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { packageId?: string; expiresAtMs?: number };
    return parsed.packageId === packageId && Number(parsed.expiresAtMs) > Date.now();
  } catch { return false; }
}

export function readCookieFromHeaders(headers: Headers, name: string) {
  const raw = headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export function hasDropDownloadProof(headers: Headers, packageId: string) {
  return verifyDropDownloadProof(readCookieFromHeaders(headers, DROP_DOWNLOAD_PROOF_COOKIE), packageId);
}

export function dropDownloadProofCookie(value: string, expiresAt: string) {
  return {
    name: DROP_DOWNLOAD_PROOF_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    expires: new Date(expiresAt),
  };
}
