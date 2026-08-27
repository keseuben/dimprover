import { NextRequest, NextResponse } from "next/server";
import { getDevCenterMutationSubject, isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { materializeCurrentDeveloperGridTaskSession } from "@/app/lib/developer-grid/task-session-materializer";
import { readGridState } from "@/app/lib/developer-grid/state-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return json({ ok: false, error: "Nincs jogosultság a Developer Grid state-hez." }, 401);
  return json({ ok: true, state: await readGridState() });
}

export async function POST(request: NextRequest) {
  if (!(await getDevCenterMutationSubject(request.headers, true))) return json({ ok: false, error: "Nincs jogosultság a Developer Grid task/session materializálásához." }, 401);
  try {
    const materialized = await materializeCurrentDeveloperGridTaskSession();
    return json({ ok: true, materialized });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
    return json({ ok: false, code: code || "DEVELOPER_GRID_STATE_MATERIALIZATION_FAILED", error: error instanceof Error ? error.message : "A Developer Grid state materializálása sikertelen." }, code === "SOURCE_BASELINE_MISMATCH" ? 409 : 500);
  }
}
