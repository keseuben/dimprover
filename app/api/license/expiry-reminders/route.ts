import { NextRequest, NextResponse } from "next/server";
import {
  getLicenseExpiryReminderStatus,
  runLicenseExpiryReminders,
  type LicenseExpiryReminderSource,
} from "@/app/lib/license/expiry-reminders";
import {
  getLicenseAdminKeyFilePath,
  isLicenseAdminAuthorized,
} from "@/app/lib/license/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság a licenclejárati értesítő használatához.",
      adminKeyHint: getLicenseAdminKeyFilePath(),
    },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  return NextResponse.json(
    await getLicenseExpiryReminderStatus(Number.isFinite(limit) ? limit : 50),
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  let body: { source?: string; dryRun?: boolean } = {};
  try {
    body = await request.json() as { source?: string; dryRun?: boolean };
  } catch {
    body = {};
  }

  let source: LicenseExpiryReminderSource = "manual";
  if (body.source === "cron" || body.source === "manual" || body.source === "api") {
    source = body.source;
  }

  try {
    const run = await runLicenseExpiryReminders(source, { dryRun: Boolean(body.dryRun) });
    return NextResponse.json(
      { ok: true, run },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
