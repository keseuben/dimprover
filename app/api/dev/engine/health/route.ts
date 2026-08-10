import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getDevCenterEngineHealth } from "@/app/lib/dev-center/engine-repository";
import { engineUnauthorized } from "../_shared";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return engineUnauthorized();
  const health = await getDevCenterEngineHealth();
  return NextResponse.json({ ok: health.ready, health }, { status: health.ready ? 200 : 503, headers: { "cache-control": "no-store" } });
}
