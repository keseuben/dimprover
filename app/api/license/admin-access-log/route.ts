import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  getLicenseAdminKeyFilePath,
  isLicenseAdminAuthorized,
} from "@/app/lib/license/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminAccessLogEntry = {
  timestamp: string;
  email: string;
  allowed: boolean;
  action: string;
  ipAddress: string;
  userAgent: string;
};

const logFile = path.join(
  process.cwd(),
  ".dimprover",
  "data",
  "license-admin-login-attempts.log",
);

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság az admin belépési napló megtekintéséhez.",
      adminKeyHint: getLicenseAdminKeyFilePath(),
    },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

function safeParseLine(line: string): AdminAccessLogEntry | null {
  try {
    const parsed = JSON.parse(line) as Partial<AdminAccessLogEntry>;
    return {
      timestamp: typeof parsed.timestamp === "string" ? parsed.timestamp : "",
      email: typeof parsed.email === "string" ? parsed.email : "ismeretlen",
      allowed: Boolean(parsed.allowed),
      action: typeof parsed.action === "string" ? parsed.action : "request_otp",
      ipAddress: typeof parsed.ipAddress === "string" ? parsed.ipAddress : "unknown",
      userAgent: typeof parsed.userAgent === "string" ? parsed.userAgent : "unknown",
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  try {
    const raw = await readFile(logFile, "utf8");
    const entries = raw
      .split("\n")
      .filter(Boolean)
      .map(safeParseLine)
      .filter((entry): entry is AdminAccessLogEntry => Boolean(entry))
      .reverse()
      .slice(0, 100);

    return NextResponse.json(
      { ok: true, entries },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: true, entries: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
