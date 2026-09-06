import "server-only";

import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";

const CANONICAL_ADMIN_CHECK_URL = "http://127.0.0.1:3100/api/license/admin";

function suppliedAdminKey(headers: Headers) {
  const direct = headers.get("x-dimpro-license-admin-key")?.trim();
  const auth = headers.get("authorization")?.trim();
  const bearer = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  return direct || bearer || "";
}

async function canonicalBenjadminAdminAuthorized(headers: Headers) {
  const key = suppliedAdminKey(headers);
  if (key.length < 20) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(CANONICAL_ADMIN_CHECK_URL, {
      method: "GET",
      headers: {
        host: "admin.dev.dimpro.hu",
        "x-dimpro-license-admin-key": key,
        accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const payload = await response.json().catch(() => null) as { ok?: unknown } | null;
    return payload?.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function isDeveloperGridAdminAuthorized(headers: Headers) {
  if (await isLicenseAdminAuthorized(headers)) return true;
  return canonicalBenjadminAdminAuthorized(headers);
}
