import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getDevCenterEngineGate } from "@/app/lib/dev-center/engine-repository";
import { engineErrorResponse, engineUnauthorized } from "../_shared";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return engineUnauthorized();
  try { const gate = await getDevCenterEngineGate(); return NextResponse.json({ ok: gate.ready, gate }, { status: gate.ready ? 200 : 409, headers: { "cache-control": "no-store" } }); }
  catch (error) { return engineErrorResponse(error); }
}
