import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getDevCenterEngineState, openDevEngineSession } from "@/app/lib/dev-center/engine-repository";
import { engineErrorResponse, engineUnauthorized } from "../_shared";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return engineUnauthorized();
  try { const state = await getDevCenterEngineState(); return NextResponse.json({ ok: true, sessions: state.sessions, workers: state.workers, locks: state.locks }, { headers: { "cache-control": "no-store" } }); }
  catch (error) { return engineErrorResponse(error); }
}
export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return engineUnauthorized();
  try { const result = await openDevEngineSession(await request.json().catch(() => ({}))); return NextResponse.json(result, { status: 201, headers: { "cache-control": "no-store" } }); }
  catch (error) { return engineErrorResponse(error); }
}
