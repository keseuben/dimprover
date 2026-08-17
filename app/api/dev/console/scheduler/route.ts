import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import {
  createDevelopmentSchedule,
  DevelopmentSchedulerError,
  getDevelopmentSchedulerSnapshot,
  setDevelopmentScheduleStatus,
} from "@/app/lib/dev-center/development-scheduler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fail(error: unknown) {
  if (error instanceof DevelopmentSchedulerError) return NextResponse.json({ ok: false, error: error.message, code: error.code, details: error.details || null }, { status: error.status });
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A fejlesztési ütemezés művelete sikertelen.", code: "SCHEDULER_UNKNOWN_ERROR" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return NextResponse.json({ ok: false, error: "Nincs jogosultság a fejlesztési ütemezéshez." }, { status: 401 });
  try {
    const projectId = request.nextUrl.searchParams.get("projectId")?.trim() || null;
    return NextResponse.json({ ok: true, scheduler: await getDevelopmentSchedulerSnapshot(projectId) }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return fail(error); }
}

export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return NextResponse.json({ ok: false, error: "Nincs jogosultság a fejlesztési ütemezéshez." }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "CREATE").trim().toUpperCase();
    if (action === "CREATE") {
      const schedule = await createDevelopmentSchedule({
        projectId: String(body.projectId || ""), title: typeof body.title === "string" ? body.title : null,
        startAt: String(body.startAt || ""), endAt: typeof body.endAt === "string" ? body.endAt : null,
        cadenceMinutes: Number(body.cadenceMinutes || 60), timezone: typeof body.timezone === "string" ? body.timezone : null,
        preferredWorkerCode: typeof body.preferredWorkerCode === "string" ? body.preferredWorkerCode : null,
        maxRuns: body.maxRuns == null ? null : Number(body.maxRuns), missedRunPolicy: body.missedRunPolicy === "skip" ? "skip" : "catch_up_once",
        createdBy: "BenjAdmin", metadata: { source: "BENJADMIN_CONSOLE", productionAccess: "DENY" },
      });
      return NextResponse.json({ ok: true, schedule }, { status: 201 });
    }
    if (["PAUSE", "RESUME", "CANCEL"].includes(action)) {
      const scheduleId = String(body.scheduleId || "").trim();
      const status = action === "PAUSE" ? "paused" : action === "RESUME" ? "active" : "cancelled";
      return NextResponse.json({ ok: true, schedule: await setDevelopmentScheduleStatus(scheduleId, status) });
    }
    return NextResponse.json({ ok: false, error: "Ismeretlen scheduler művelet.", code: "SCHEDULER_ACTION_INVALID" }, { status: 400 });
  } catch (error) { return fail(error); }
}
