import { NextRequest, NextResponse } from "next/server";
import { isChatGridDeviceAuthorized } from "@/app/lib/dev-center/chatgrid-device-auth";
import { reconcileDeveloperGridBuildRuns, requestDeveloperGridFullBuild } from "@/app/lib/developer-grid/build-runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { "cache-control": "no-store", "x-dimpro-environment": "DEV", "x-dimpro-production-access": "DENY" } });
}

export async function GET(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return json({ ok:false, error:"A Developer Grid eszköz nincs párosítva." }, 401);
  try { return json({ ok:true, buildRuns: await reconcileDeveloperGridBuildRuns(), productionAccess:"DENY" }); }
  catch (error) { return json({ ok:false, error:error instanceof Error ? error.message : "A Build Runner Pool állapota nem tölthető be." }, 500); }
}

export async function POST(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return json({ ok:false, error:"A Developer Grid eszköz nincs párosítva." }, 401);
  try { return json({ ok:true, build: await requestDeveloperGridFullBuild(await request.json().catch(() => ({}))) }); }
  catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as {code?:unknown}).code || "BUILD_REQUEST_FAILED") : "BUILD_REQUEST_FAILED";
    const status = error && typeof error === "object" && "status" in error ? Number((error as {status?:unknown}).status) || 409 : 409;
    return json({ ok:false, code, error:error instanceof Error ? error.message : "A FULL BUILD indítása sikertelen." }, status);
  }
}
