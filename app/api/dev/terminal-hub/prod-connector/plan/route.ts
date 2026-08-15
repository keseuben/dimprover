import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { compileProdReadOnlyProbePlan, ProdProbePlanError } from "@/app/lib/dev-center/terminal-hub/prod-probe-plan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ProdProbePlanError) {
    return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ ok: false, code: "PROD_PROBE_PLAN_INTERNAL_ERROR", error: "A PROD read-only probe terv nem készíthető el." }, { status: 500, headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) {
    return NextResponse.json({ ok: false, error: "Nincs BENJADMIN jogosultság a PROD probe tervhez." }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const plan = compileProdReadOnlyProbePlan({ probeId: typeof body.probeId === "string" ? body.probeId : "" });
    return NextResponse.json({ ok: true, plan }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
