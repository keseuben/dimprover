import { NextRequest, NextResponse } from "next/server";
import {
  getLicenseAdminKeyFilePath,
  isLicenseAdminAuthorized,
} from "@/app/lib/license/admin-auth";
import {
  getDimproAllowedEmails,
  getDimproLoginLogFilePath,
  readDimproLoginAttempts,
} from "@/app/lib/dimpro/login-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság a DIMPRO belépési napló megtekintéséhez.",
      adminKeyHint: getLicenseAdminKeyFilePath(),
    },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  const entries = await readDimproLoginAttempts(1000);
  const blocked = entries.filter((entry) => !entry.allowed || entry.result === "blocked");
  const successful = entries.filter((entry) => entry.result === "otp_verified");
  const uniqueBlockedEmails = new Set(blocked.map((entry) => entry.email)).size;
  const uniqueBlockedIps = new Set(blocked.map((entry) => entry.ipAddress).filter((value) => value !== "unknown")).size;

  return NextResponse.json(
    {
      ok: true,
      entries,
      allowedEmails: getDimproAllowedEmails(),
      logFile: getDimproLoginLogFilePath(),
      summary: {
        total: entries.length,
        blocked: blocked.length,
        successful: successful.length,
        uniqueBlockedEmails,
        uniqueBlockedIps,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
