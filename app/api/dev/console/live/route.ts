import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getDeveloperConsoleLiveStatus } from "@/app/lib/dev-center/developer-console";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) {
    return NextResponse.json({ ok: false, error: "Nincs jogosultság a BENJADMIN élő fejlesztői állapothoz." }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  try {
    return NextResponse.json({ ok: true, live: await getDeveloperConsoleLiveStatus() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Az élő fejlesztői állapot nem tölthető be." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
