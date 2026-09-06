import "server-only";

import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const MANAGEMENT_API = "https://api.supabase.com";
const DEFAULT_SECRET_DIR = "/root/.dimpro-secrets/supabase-dev";
const DEFAULT_TOKEN_FILE = path.join(DEFAULT_SECRET_DIR, "analytics-usage-read.token");
const DEFAULT_STATUS_FILE = path.join(DEFAULT_SECRET_DIR, "analytics-usage-read.status.json");

export type SupabaseMonitoringStatus = {
  configured: boolean;
  projectRef: string | null;
  permission: "analytics_usage_read";
  storage: "SERVER_SECRET_FILE";
  lastValidatedAt: string | null;
  validationState: "VALIDATED" | "NOT_CONFIGURED" | "UNKNOWN";
};

function tokenFile() {
  return process.env.BENJADMIN_SUPABASE_ANALYTICS_TOKEN_FILE?.trim() || DEFAULT_TOKEN_FILE;
}

function statusFile() {
  return process.env.BENJADMIN_SUPABASE_ANALYTICS_STATUS_FILE?.trim() || DEFAULT_STATUS_FILE;
}

export function resolveSupabaseProjectRef() {
  const explicit = process.env.SUPABASE_PROJECT_REF?.trim() || process.env.BENJADMIN_SUPABASE_PROJECT_REF?.trim() || "";
  if (/^[a-z0-9]{8,40}$/i.test(explicit)) return explicit;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  try {
    const host = new URL(url).hostname;
    return host.match(/^([a-z0-9]+)\.supabase\.co$/i)?.[1] || null;
  } catch {
    return null;
  }
}

export async function readSupabaseAnalyticsToken() {
  const direct = process.env.BENJADMIN_SUPABASE_ANALYTICS_TOKEN?.trim();
  if (direct) return direct;
  try { return (await readFile(tokenFile(), "utf8")).trim(); }
  catch { return ""; }
}

async function managementGet(pathname: string, token: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${MANAGEMENT_API}${pathname}`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(response.status === 401
        ? "A Supabase Management API token érvénytelen vagy lejárt."
        : response.status === 403
          ? "A tokenhez hiányzik az analytics_usage_read jogosultság ehhez a projekthez."
          : response.status === 429
            ? "A Supabase Management API ideiglenes rate limitet jelzett."
            : `Supabase Management API HTTP ${response.status}.`);
      Object.assign(error, { code: `SUPABASE_MANAGEMENT_HTTP_${response.status}` });
      throw error;
    }
    return response.json().catch(() => null);
  } finally {
    clearTimeout(timer);
  }
}

export async function validateSupabaseAnalyticsToken(tokenValue: string) {
  const token = String(tokenValue || "").trim();
  if (token.length < 20 || /\s/.test(token)) {
    const error = new Error("A Supabase Management API token formátuma érvénytelen.");
    Object.assign(error, { code: "SUPABASE_ANALYTICS_TOKEN_INVALID" });
    throw error;
  }
  const projectRef = resolveSupabaseProjectRef();
  if (!projectRef) {
    const error = new Error("A Supabase projektazonosító nem állapítható meg a DEV runtime-ból.");
    Object.assign(error, { code: "SUPABASE_PROJECT_REF_MISSING" });
    throw error;
  }
  const [counts, requests] = await Promise.all([
    managementGet(`/v1/projects/${encodeURIComponent(projectRef)}/analytics/endpoints/usage.api-counts`, token),
    managementGet(`/v1/projects/${encodeURIComponent(projectRef)}/analytics/endpoints/usage.api-requests-count`, token),
  ]);
  if (!Array.isArray(counts?.result) || !Array.isArray(requests?.result)) {
    const error = new Error("A Supabase analytics válasza nem felel meg a várt szerződésnek.");
    Object.assign(error, { code: "SUPABASE_ANALYTICS_RESPONSE_INVALID" });
    throw error;
  }
  return { projectRef, validatedAt: new Date().toISOString() };
}

async function writeStatus(projectRef: string, validatedAt: string) {
  const file = statusFile();
  const dir = path.dirname(file);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700).catch(() => undefined);
  await writeFile(file, `${JSON.stringify({ schemaVersion: 1, projectRef, permission: "analytics_usage_read", validatedAt }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(file, 0o600);
}

export async function saveSupabaseAnalyticsToken(tokenValue: string) {
  const token = String(tokenValue || "").trim();
  const validated = await validateSupabaseAnalyticsToken(token);
  const file = tokenFile();
  const dir = path.dirname(file);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700).catch(() => undefined);
  const tmp = path.join(dir, `.analytics-token-${process.pid}-${randomBytes(6).toString("hex")}.tmp`);
  try {
    await writeFile(tmp, `${token}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(tmp, 0o600);
    await rename(tmp, file);
    await chmod(file, 0o600);
  } finally {
    await rm(tmp, { force: true }).catch(() => undefined);
  }
  await writeStatus(validated.projectRef, validated.validatedAt);
  return validated;
}

export async function deleteSupabaseAnalyticsToken() {
  if (process.env.BENJADMIN_SUPABASE_ANALYTICS_TOKEN?.trim()) {
    const error = new Error("A token környezeti változóból érkezik; a webes felület csak a szerveroldali tokenfájlt tudja törölni.");
    Object.assign(error, { code: "SUPABASE_ANALYTICS_TOKEN_ENV_MANAGED" });
    throw error;
  }
  await rm(tokenFile(), { force: true });
  await rm(statusFile(), { force: true });
}

export async function getSupabaseMonitoringStatus(): Promise<SupabaseMonitoringStatus> {
  const projectRef = resolveSupabaseProjectRef();
  let configured = Boolean(process.env.BENJADMIN_SUPABASE_ANALYTICS_TOKEN?.trim());
  if (!configured) {
    try { configured = (await stat(tokenFile())).isFile() && Boolean((await readFile(tokenFile(), "utf8")).trim()); }
    catch { configured = false; }
  }
  let lastValidatedAt: string | null = null;
  if (configured) {
    try {
      const parsed = JSON.parse(await readFile(statusFile(), "utf8")) as { validatedAt?: unknown; projectRef?: unknown };
      if (typeof parsed.validatedAt === "string" && (!projectRef || parsed.projectRef === projectRef)) lastValidatedAt = parsed.validatedAt;
    } catch {}
  }
  return {
    configured,
    projectRef,
    permission: "analytics_usage_read",
    storage: "SERVER_SECRET_FILE",
    lastValidatedAt,
    validationState: configured ? (lastValidatedAt ? "VALIDATED" : "UNKNOWN") : "NOT_CONFIGURED",
  };
}
