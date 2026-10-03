import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getDimproAuthConfig } from "./config";

export const DIMPRO_APP_SESSION_COOKIE = "__Host-dimpro_app";
export const DIMPRO_SSO_FLOW_COOKIE = "__Host-dimpro_sso";

export type DimproSsoFlowCookie = {
  version: 1;
  clientId: string;
  state: string;
  verifier: string;
  returnTo: string;
  createdAt: number;
};

function ssoSecret() {
  return getDimproAuthConfig().ssoStateSecret;
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createPkceVerifier() {
  return randomBytes(32).toString("base64url");
}

export function createPkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function createSsoState() {
  return randomBytes(24).toString("base64url");
}

export function createAuthorizationCode() {
  return randomBytes(32).toString("base64url");
}

export function hashAuthorizationCode(code: string) {
  return createHmac("sha256", ssoSecret()).update(`dimpro-auth-code:v1:${code}`, "utf8").digest();
}

export function createAppSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashAppSessionToken(token: string) {
  return createHmac("sha256", ssoSecret()).update(`dimpro-app-session:v1:${token}`, "utf8").digest();
}

export function encodeSsoFlowCookie(flow: DimproSsoFlowCookie) {
  const payload = Buffer.from(JSON.stringify(flow), "utf8").toString("base64url");
  const signature = createHmac("sha256", ssoSecret()).update(`dimpro-sso-flow:v1:${payload}`, "utf8").digest("base64url");
  return `dsso1.${payload}.${signature}`;
}

export function decodeSsoFlowCookie(raw: string): DimproSsoFlowCookie | null {
  const [prefix, payload, signature, extra] = raw.split(".");
  if (prefix !== "dsso1" || !payload || !signature || extra) return null;
  const expected = createHmac("sha256", ssoSecret()).update(`dimpro-sso-flow:v1:${payload}`, "utf8").digest("base64url");
  if (!safeEqual(expected, signature)) return null;
  try {
    const flow = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DimproSsoFlowCookie;
    if (
      flow.version !== 1
      || !/^[A-Za-z0-9_-]{32,200}$/.test(flow.state)
      || !/^[A-Za-z0-9_-]{43,128}$/.test(flow.verifier)
      || !/^dimpro-[a-z0-9-]+$/.test(flow.clientId)
      || typeof flow.returnTo !== "string"
      || !flow.returnTo.startsWith("/")
      || flow.returnTo.startsWith("//")
      || !Number.isSafeInteger(flow.createdAt)
      || Date.now() - flow.createdAt > 10 * 60 * 1000
    ) return null;
    return flow;
  } catch {
    return null;
  }
}

export function transientSsoCookieOptions(maxAge = 10 * 60) {
  return { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge };
}

export function appSessionCookieOptions(maxAge: number) {
  return { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge };
}
