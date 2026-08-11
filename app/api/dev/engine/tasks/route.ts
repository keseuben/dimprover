import { NextRequest, NextResponse } from "next/server";
import { getDevCenterMutationSubject, isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { createDevEngineTask, getDevCenterEngineState } from "@/app/lib/dev-center/engine-repository";
import { engineErrorResponse, engineUnauthorized } from "../_shared";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return engineUnauthorized();
  try { const state = await getDevCenterEngineState(); return NextResponse.json({ ok: true, tasks: state.tasks, dependencies: state.dependencies }, { headers: { "cache-control": "no-store" } }); }
  catch (error) { return engineErrorResponse(error); }
}
export async function POST(request: NextRequest) {
  if (!(await getDevCenterMutationSubject(request.headers, false))) return engineUnauthorized();
  try { const result = await createDevEngineTask(await request.json().catch(() => ({}))); return NextResponse.json(result, { status: result.ok ? 201 : 400, headers: { "cache-control": "no-store" } }); }
  catch (error) { return engineErrorResponse(error); }
}
