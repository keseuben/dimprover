import { NextRequest, NextResponse } from "next/server";
import { isDeveloperGridReadAuthorized } from "@/app/lib/developer-grid/read-auth";
import { getDeveloperGridSystemHealth } from "@/app/lib/developer-grid/system-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDeveloperGridReadAuthorized(request.headers))) {
    return NextResponse.json({ ok: false, error: "Nincs jogosultság a BENJADMIN Developer Grid system health adataihoz." }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  try {
    const health = await getDeveloperGridSystemHealth();
    return NextResponse.json({ ok: true, health }, { status: 200, headers: { "cache-control": "private, max-age=15" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A Developer Grid system health nem tölthető be." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
