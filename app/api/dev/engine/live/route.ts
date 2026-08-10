import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getDevCenterEngineGate, getDevCenterEngineState } from "@/app/lib/dev-center/engine-repository";
import { getOrchestrationSnapshot } from "@/app/lib/dev-center/orchestration-repository";
import { engineErrorResponse, engineUnauthorized } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return engineUnauthorized();

  try {
    const [state, gate, orchestration] = await Promise.all([
      getDevCenterEngineState(),
      getDevCenterEngineGate(),
      getOrchestrationSnapshot(),
    ]);

    return NextResponse.json(
      {
        ok: true,
        state,
        gate,
        orchestration,
        live: {
          refreshIntervalMs: 5000,
          generatedAt: new Date().toISOString(),
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return engineErrorResponse(error);
  }
}
