import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { LicenseApiResponse } from "./types";

const auditLogFile = path.join(
  process.cwd(),
  ".dimprover",
  "data",
  "license-audit.log",
);

type LicenseAuditAction = "activate" | "check" | "public-key" | "rate-limit";

type LicenseAuditInput = {
  action: LicenseAuditAction;
  ipAddress: string;
  licenseKey?: string;
  machineIdHash?: string;
  appId?: string;
  appVersion?: string;
  response?: LicenseApiResponse;
  note?: string;
};

function maskLicenseKey(licenseKey?: string) {
  if (!licenseKey) return undefined;
  if (licenseKey.length <= 10) return "***";
  return `${licenseKey.slice(0, 10)}***${licenseKey.slice(-4)}`;
}

function safeString(value: string | undefined) {
  if (!value) return undefined;
  return value.slice(0, 180);
}

export async function appendLicenseAuditLog(input: LicenseAuditInput) {
  const response = input.response;
  const logLine = {
    timestamp: new Date().toISOString(),
    action: input.action,
    ipAddress: safeString(input.ipAddress),
    licenseKey: maskLicenseKey(input.licenseKey),
    machineIdHash: safeString(input.machineIdHash),
    appId: safeString(input.appId),
    appVersion: safeString(input.appVersion),
    ok: response?.ok,
    status: response?.status,
    errorCode: response && !response.ok ? response.errorCode : undefined,
    note: safeString(input.note),
  };

  await mkdir(path.dirname(auditLogFile), { recursive: true });
  await appendFile(auditLogFile, `${JSON.stringify(logLine)}\n`, "utf8");
}

export function getClientIp(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return headers.get("x-real-ip") ?? "unknown";
}
