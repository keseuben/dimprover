import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const defaultAdminEmails = ["keseruben90@gmail.com"];
const logFile = path.join(
  process.cwd(),
  ".dimprover",
  "data",
  "license-admin-login-attempts.log",
);

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getAllowedEmails() {
  const configured = process.env.DIMPRO_LICENSE_ADMIN_EMAILS?.trim();
  if (!configured) return defaultAdminEmails;
  return configured
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function getClientIp(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return headers.get("x-real-ip") ?? "unknown";
}

async function appendLoginAttemptLog(input: {
  email: string;
  allowed: boolean;
  action: string;
  ipAddress: string;
  userAgent: string;
}) {
  await mkdir(path.dirname(logFile), { recursive: true });
  await appendFile(
    logFile,
    `${JSON.stringify({ timestamp: new Date().toISOString(), ...input })}\n`,
    "utf8",
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body && typeof body === "object" ? (body as { email?: unknown }).email : "");
  const action = typeof body === "object" && body && typeof (body as { action?: unknown }).action === "string"
    ? String((body as { action: string }).action).slice(0, 60)
    : "request_otp";
  const allowedEmails = getAllowedEmails();
  const allowed = Boolean(email) && allowedEmails.includes(email);

  await appendLoginAttemptLog({
    email: email || "missing-email",
    allowed,
    action,
    ipAddress: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent")?.slice(0, 240) ?? "unknown",
  });

  return NextResponse.json(
    {
      ok: true,
      allowed,
      message: allowed
        ? "Admin e-mail cím engedélyezve."
        : "Ez az e-mail cím nincs engedélyezve a licencadmin felülethez. A próbálkozást naplóztuk.",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
