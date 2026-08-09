import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export type DimproLoginAttempt = {
  timestamp: string;
  email: string;
  allowed: boolean;
  action: "request_otp" | "verify_otp" | "session_block";
  result: "allowed" | "blocked" | "otp_sent" | "otp_verified" | "invalid_code" | "provider_error";
  ipAddress: string;
  userAgent: string;
  host: string;
  referer: string;
  message?: string;
};

function resolveProjectRoot() {
  const cwd = process.cwd();
  const standaloneSuffix = `${path.sep}.next${path.sep}standalone`;
  if (cwd.endsWith(standaloneSuffix)) return cwd.slice(0, -standaloneSuffix.length);
  return cwd;
}

const projectRoot = process.env.DIMPRO_PROJECT_ROOT ?? resolveProjectRoot();
const logFile = path.join(projectRoot, ".dimprover", "data", "dimpro-login-attempts.log");
const defaultAllowedEmails = ["keseruben90@gmail.com"];

export function normalizeDimproEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function getDimproAllowedEmails() {
  const configured = process.env.DIMPRO_APP_ALLOWED_EMAILS?.trim();
  if (!configured) return defaultAllowedEmails;
  return configured
    .split(",")
    .map((email) => normalizeDimproEmail(email))
    .filter(Boolean);
}

export function isDimproEmailAllowed(value: unknown) {
  const email = normalizeDimproEmail(value);
  return Boolean(email) && getDimproAllowedEmails().includes(email);
}

export function getRequestIp(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export async function appendDimproLoginAttempt(
  headers: Headers,
  input: Omit<DimproLoginAttempt, "timestamp" | "ipAddress" | "userAgent" | "host" | "referer">,
) {
  const entry: DimproLoginAttempt = {
    timestamp: new Date().toISOString(),
    ipAddress: getRequestIp(headers),
    userAgent: headers.get("user-agent")?.slice(0, 500) || "unknown",
    host: headers.get("host")?.slice(0, 200) || "unknown",
    referer: headers.get("referer")?.slice(0, 500) || "",
    ...input,
  };

  await mkdir(path.dirname(logFile), { recursive: true });
  await appendFile(logFile, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

function safeParseLine(line: string): DimproLoginAttempt | null {
  try {
    const parsed = JSON.parse(line) as Partial<DimproLoginAttempt>;
    if (!parsed.timestamp || !parsed.email || !parsed.action || !parsed.result) return null;
    return {
      timestamp: String(parsed.timestamp),
      email: normalizeDimproEmail(parsed.email) || "missing-email",
      allowed: Boolean(parsed.allowed),
      action: parsed.action,
      result: parsed.result,
      ipAddress: String(parsed.ipAddress || "unknown"),
      userAgent: String(parsed.userAgent || "unknown"),
      host: String(parsed.host || "unknown"),
      referer: String(parsed.referer || ""),
      message: parsed.message ? String(parsed.message) : undefined,
    };
  } catch {
    return null;
  }
}

export async function readDimproLoginAttempts(limit = 500) {
  try {
    const raw = await readFile(logFile, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map(safeParseLine)
      .filter((entry): entry is DimproLoginAttempt => Boolean(entry))
      .reverse()
      .slice(0, Math.max(1, Math.min(limit, 2000)));
  } catch {
    return [];
  }
}

export function getDimproLoginLogFilePath() {
  return logFile;
}
