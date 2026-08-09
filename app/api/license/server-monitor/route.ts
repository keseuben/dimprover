import { NextRequest, NextResponse } from "next/server";
import {
  getServerMonitorResponse,
  runServerMonitor,
  sendServerMonitorTestEmail,
  type ServerMonitorRun,
} from "@/app/lib/license/server-monitor";
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
      error: "Nincs jogosultság a szerverfigyelő API használatához.",
      adminKeyHint: getLicenseAdminKeyFilePath(),
    },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

async function isMonitorAuthorized(headers: Headers) {
  if (await isLicenseAdminAuthorized(headers)) return true;

  const monitorKey = process.env.DIMPRO_SERVER_MONITOR_KEY?.trim();
  const receivedMonitorKey = headers.get("x-dimpro-server-monitor-key")?.trim();
  return Boolean(monitorKey && receivedMonitorKey && monitorKey === receivedMonitorKey);
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 80);
  const data = await getServerMonitorResponse(Number.isFinite(limit) ? limit : 80);
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  let body: { source?: string; action?: string } = {};
  try {
    body = await request.json() as { source?: string; action?: string };
  } catch {
    body = {};
  }

  if (body.action === "testEmail") {
    if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
    const emailTest = await sendServerMonitorTestEmail();
    const data = await getServerMonitorResponse(80);
    return NextResponse.json({ ...data, emailTest }, { headers: { "cache-control": "no-store" } });
  }

  if (!(await isMonitorAuthorized(request.headers))) return unauthorized();

  let source: ServerMonitorRun["source"] = "manual";
  if (body.source === "cron" || body.source === "api" || body.source === "manual") source = body.source;

  const latest = await runServerMonitor(source);
  const data = await getServerMonitorResponse(80);
  return NextResponse.json({ ...data, latest }, { headers: { "cache-control": "no-store" } });
}
