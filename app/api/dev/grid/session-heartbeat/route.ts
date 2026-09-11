import { NextRequest, NextResponse } from "next/server";
import { isChatGridDeviceAuthorized } from "@/app/lib/dev-center/chatgrid-device-auth";
import { heartbeatDeveloperGridEngineSession } from "@/app/lib/developer-grid/session-heartbeat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { "cache-control": "no-store", "x-dimpro-environment": "DEV", "x-dimpro-production-access": "DENY" } });
}
export async function POST(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return json({ ok:false, error:"A Developer Grid eszköz nincs párosítva." }, 401);
  try {
    const heartbeat = await heartbeatDeveloperGridEngineSession(await request.json().catch(() => ({})));
    return json({ ok:true, heartbeat, productionAccess:"DENY" });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "DEVELOPER_GRID_ENGINE_HEARTBEAT_FAILED") : "DEVELOPER_GRID_ENGINE_HEARTBEAT_FAILED";
    const status = error && typeof error === "object" && "status" in error ? Number((error as { status?: unknown }).status) || 409 : 409;
    return json({ ok:false, code, error:error instanceof Error ? error.message : "A Developer Grid engine heartbeat sikertelen." }, status);
  }
}
