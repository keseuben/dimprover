import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { createTerminalSession, listTerminalSessions, TerminalSessionError } from "@/app/lib/dev-center/terminal-hub/session-registry";
import type { TerminalSessionCreateRequest } from "@/app/lib/dev-center/terminal-hub/session-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const OWNER = "BENJADMIN_ADMIN";

function errorResponse(error: unknown) {
  if (error instanceof TerminalSessionError) return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
  return NextResponse.json({ ok: false, code: "TERMINAL_SESSION_ERROR", error: error instanceof Error ? error.message : "Terminál session hiba." }, { status: 500 });
}

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) return NextResponse.json({ ok: false, error: "Nincs BENJADMIN terminál jogosultság." }, { status: 401 });
  return NextResponse.json({ ok: true, sessions: listTerminalSessions(OWNER) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) return NextResponse.json({ ok: false, error: "Nincs BENJADMIN terminál jogosultság." }, { status: 401 });
  try {
    const input = await request.json().catch(() => ({})) as Partial<TerminalSessionCreateRequest>;
    if (typeof input.cwd !== "string" || !input.cwd.trim()) return NextResponse.json({ ok: false, code: "TERMINAL_CWD_REQUIRED", error: "A terminál munkakönyvtár kötelező." }, { status: 400 });
    const session = await createTerminalSession(OWNER, { cwd: input.cwd.trim(), cols: input.cols, rows: input.rows });
    return NextResponse.json({ ok: true, session }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
