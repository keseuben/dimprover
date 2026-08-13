import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { startBenjadminTime, stopBenjadminTime } from "@/app/lib/dev-center/team-dashboard-metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) {
    return NextResponse.json({ ok: false, error: "Nincs jogosultság a BENJADMIN időméréshez." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  try {
    if (body.action === "start") return NextResponse.json(await startBenjadminTime(typeof body.note === "string" ? body.note : undefined), { status: 201 });
    if (body.action === "stop") return NextResponse.json(await stopBenjadminTime());
    return NextResponse.json({ ok: false, error: "Ismeretlen időmérési művelet." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Az időmérés művelete sikertelen." }, { status: 500 });
  }
}
