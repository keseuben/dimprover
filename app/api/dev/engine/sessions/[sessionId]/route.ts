import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { advanceDevEngineSession } from "@/app/lib/dev-center/engine-repository";
import { engineErrorResponse, engineUnauthorized } from "../../_shared";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function PATCH(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return engineUnauthorized();
  try {
    const { sessionId } = await context.params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const result = await advanceDevEngineSession(sessionId, action, body);
    return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
  } catch (error) { return engineErrorResponse(error); }
}
