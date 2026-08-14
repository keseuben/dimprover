import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import {
  listTerminalCommands,
  recordTerminalCommand,
  TerminalCommandLibraryError,
} from "@/app/lib/dev-center/terminal-hub/command-library";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof TerminalCommandLibraryError) {
    return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ ok: false, code: "COMMAND_LIBRARY_INTERNAL_ERROR", error: error instanceof Error ? error.message : "Terminál Parancstár hiba." }, { status: 500, headers: { "cache-control": "no-store" } });
}

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) {
    return NextResponse.json({ ok: false, error: "Nincs BENJADMIN jogosultság a Terminál Parancstárhoz." }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const commands = await listTerminalCommands({
      query: url.searchParams.get("q") || "",
      shellFamily: url.searchParams.get("shell") || "",
      environment: url.searchParams.get("environment") || "",
      projectId: url.searchParams.get("projectId") || "",
      limit: Number(url.searchParams.get("limit") || 80),
    });
    return NextResponse.json({ ok: true, commands }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) {
    return NextResponse.json({ ok: false, error: "Nincs BENJADMIN jogosultság a Terminál Parancstárhoz." }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const command = typeof body.command === "string" ? body.command : "";
    if (!command.trim()) return NextResponse.json({ ok: false, code: "COMMAND_LIBRARY_COMMAND_REQUIRED", error: "A parancs kötelező." }, { status: 400 });
    const environment = typeof body.environment === "string" ? body.environment : "DEV";
    if (!['DEV', 'LOCAL'].includes(environment)) {
      return NextResponse.json({ ok: false, code: "COMMAND_LIBRARY_MANUAL_ENV_DENIED", error: "P3 DEV-ben kézi rögzítés csak DEV vagy LOCAL környezethez engedélyezett." }, { status: 403 });
    }
    const result = await recordTerminalCommand({
      command,
      shellFamily: typeof body.shellFamily === "string" ? body.shellFamily : "bash",
      environment,
      projectId: typeof body.projectId === "string" ? body.projectId : null,
      source: "manual",
      purpose: typeof body.purpose === "string" ? body.purpose : "",
      resultStatus: "unknown",
      resultSummary: "",
      tags: body.tags,
      actor: "BENJADMIN",
    });
    return NextResponse.json({ ok: true, result }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
