import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { DevelopmentSchedulerError, runDevelopmentSchedulerTick } from "@/app/lib/dev-center/development-scheduler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return NextResponse.json({ ok: false, error: "Nincs jogosultság a scheduler heartbeat futtatásához." }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const source = ["monitor", "manual", "chatgpt", "recovery"].includes(String(body.source || "")) ? String(body.source) as "monitor" | "manual" | "chatgpt" | "recovery" : "monitor";
    const result = await runDevelopmentSchedulerTick({ source, scheduleId: typeof body.scheduleId === "string" ? body.scheduleId : null, now: typeof body.now === "string" ? body.now : undefined });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DevelopmentSchedulerError) return NextResponse.json({ ok: false, error: error.message, code: error.code, details: error.details || null }, { status: error.status });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A scheduler heartbeat sikertelen.", code: "SCHEDULER_TICK_FAILED" }, { status: 500 });
  }
}
