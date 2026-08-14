import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import {
  listTerminalCommandEvents,
  TerminalCommandLibraryError,
} from "@/app/lib/dev-center/terminal-hub/command-library";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ commandId: string }> }) {
  if (!(await isDevCenterAuthorized(request.headers, false))) {
    return NextResponse.json({ ok: false, error: "Nincs BENJADMIN jogosultság a Terminál Parancstár eseményeihez." }, { status: 401 });
  }
  try {
    const { commandId } = await context.params;
    const limit = Number(new URL(request.url).searchParams.get("limit") || 80);
    const events = await listTerminalCommandEvents(commandId, limit);
    return NextResponse.json({ ok: true, events }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof TerminalCommandLibraryError) {
      return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ ok: false, code: "COMMAND_LIBRARY_EVENTS_ERROR", error: error instanceof Error ? error.message : "A parancsesemények nem tölthetők be." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
