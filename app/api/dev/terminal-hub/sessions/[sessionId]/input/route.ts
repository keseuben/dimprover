import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { TerminalSessionError, writeTerminalSession } from "@/app/lib/dev-center/terminal-hub/session-registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const OWNER = "BENJADMIN_ADMIN";

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  if (!(await isDevCenterAuthorized(request.headers, false))) return NextResponse.json({ ok: false, error: "Nincs BENJADMIN terminál jogosultság." }, { status: 401 });
  try {
    const { sessionId } = await context.params;
    const body = await request.json().catch(() => ({})) as { data?: unknown };
    if (typeof body.data !== "string") return NextResponse.json({ ok: false, code: "TERMINAL_INPUT_INVALID", error: "Szöveges terminál input szükséges." }, { status: 400 });
    return NextResponse.json({ ok: true, session: writeTerminalSession(OWNER, sessionId, body.data) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof TerminalSessionError) return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: "A terminál input nem küldhető." }, { status: 500 });
  }
}
