import type { DimproAuthUserLevel } from "./types";

export type DimproAuthSessionPolicy = Readonly<{
  absoluteSeconds: number;
  inactivitySeconds: number;
}>;

const SESSION_POLICIES: Readonly<Record<DimproAuthUserLevel, DimproAuthSessionPolicy>> = Object.freeze({
  SIMPLE: Object.freeze({ absoluteSeconds: 14 * 86400, inactivitySeconds: 24 * 3600 }),
  STAFF: Object.freeze({ absoluteSeconds: 14 * 86400, inactivitySeconds: 24 * 3600 }),
  PROJECT_MANAGER: Object.freeze({ absoluteSeconds: 7 * 86400, inactivitySeconds: 6 * 3600 }),
  ORG_ADMIN: Object.freeze({ absoluteSeconds: 3 * 86400, inactivitySeconds: 2 * 3600 }),
  SUPERADMIN: Object.freeze({ absoluteSeconds: 1 * 86400, inactivitySeconds: 1 * 3600 }),
});

export function getDimproAuthSessionPolicy(level: DimproAuthUserLevel): DimproAuthSessionPolicy {
  const policy = SESSION_POLICIES[level];
  if (!policy) throw new Error(`Ismeretlen DIMPRO AUTH security level: ${level}`);
  return policy;
}

export function dimproSessionCookieMaxAge(expiresAt: Date | string, now = Date.now()) {
  const expiry = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  if (!Number.isFinite(expiry)) throw new Error("Érvénytelen DIMPRO AUTH session lejárat.");
  return Math.max(1, Math.floor((expiry - now) / 1000));
}
