import { NextRequest, NextResponse } from "next/server";
import { isChatGridDeviceAuthorized } from "@/app/lib/dev-center/chatgrid-device-auth";
import { closeDeveloperGridWork } from "@/app/lib/developer-grid/work-close";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { "cache-control":"no-store", "x-dimpro-environment":"DEV", "x-dimpro-production-access":"DENY" } });
}

export async function POST(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return json({ ok:false, error:"A Developer Grid eszköz nincs párosítva." }, 401);
  try { return json({ ok:true, close:await closeDeveloperGridWork(await request.json().catch(() => ({}))), productionAccess:"DENY" }); }
  catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as {code?:unknown}).code || "DEVELOPER_GRID_CLOSE_FAILED") : "DEVELOPER_GRID_CLOSE_FAILED";
    const status = error && typeof error === "object" && "status" in error ? Number((error as {status?:unknown}).status) || 409 : 409;
    return json({ ok:false, code, error:error instanceof Error ? error.message : "A Developer Grid lezárás sikertelen." }, status);
  }
}
