import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { resizeTerminalSession, TerminalSessionError } from "@/app/lib/dev-center/terminal-hub/session-registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const OWNER = "BENJADMIN_ADMIN";

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  if (!(await isDevCenterAuthorized(request.headers, false))) return NextResponse.json({ ok: false, error: "Nincs BENJADMIN terminál jogosultság." }, { status: 401 });
  try {
    const { sessionId } = await context.params;
    const body = await request.json().catch(() => ({})) as { cols?: unknown; rows?: unknown };
    return NextResponse.json({ ok: true, session: resizeTerminalSession(OWNER, sessionId, Number(body.cols), Number(body.rows)) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof TerminalSessionError) return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: "A terminál mérete nem módosítható." }, { status: 500 });
  }
}
