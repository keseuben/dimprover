import { NextRequest, NextResponse } from "next/server";
import { getDevCenterMutationSubject } from "@/app/lib/dev-center/auth";
import {
  ControlPlaneCommandError,
  queueControlCommand,
} from "@/app/lib/dev-center/control-plane-commands";
import { engineUnauthorized } from "../../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await getDevCenterMutationSubject(request.headers, false))) return engineUnauthorized();

  try {
    const body = await request.json().catch(() => null);
    const result = await queueControlCommand(body);
    return NextResponse.json(result, {
      status: 202,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ControlPlaneCommandError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: error.status, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Ismeretlen Control Plane command hiba.",
        code: "CONTROL_COMMAND_INTERNAL_ERROR",
      },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
