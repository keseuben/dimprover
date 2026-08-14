import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { closeTerminalSession, getTerminalSession, TerminalSessionError } from "@/app/lib/dev-center/terminal-hub/session-registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const OWNER = "BENJADMIN_ADMIN";

function errorResponse(error: unknown) {
  if (error instanceof TerminalSessionError) return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
  return NextResponse.json({ ok: false, error: "Terminál session hiba." }, { status: 500 });
}

export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  if (!(await isDevCenterAuthorized(request.headers, false))) return NextResponse.json({ ok: false, error: "Nincs BENJADMIN terminál jogosultság." }, { status: 401 });
  try { const { sessionId } = await context.params; return NextResponse.json({ ok: true, session: { ...getTerminalSession(OWNER, sessionId).summary } }, { headers: { "cache-control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  if (!(await isDevCenterAuthorized(request.headers, false))) return NextResponse.json({ ok: false, error: "Nincs BENJADMIN terminál jogosultság." }, { status: 401 });
  try { const { sessionId } = await context.params; return NextResponse.json({ ok: true, session: closeTerminalSession(OWNER, sessionId) }, { headers: { "cache-control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
