import { NextRequest, NextResponse } from "next/server";
import { isDeveloperGridReadAuthorized } from "@/app/lib/developer-grid/read-auth";
import { getDeveloperGridFoundation } from "@/app/lib/developer-grid/foundation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDeveloperGridReadAuthorized(request.headers))) {
    return NextResponse.json({ ok: false, error: "Nincs jogosultság a BENJADMIN Developer Gridhez." }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  try {
    const foundation = await getDeveloperGridFoundation();
    const sourceReady = foundation.sourceProvenance.sourceState === "VERIFIED";
    const runtimeReady = foundation.releaseRuntimeProvenance.state !== "BLOCKED";
    const status = sourceReady && runtimeReady ? 200 : 409;
    return NextResponse.json({ ok: status === 200, foundation }, { status, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A Developer Grid foundation nem tölthető be." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
