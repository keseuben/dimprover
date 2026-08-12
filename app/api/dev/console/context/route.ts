import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getDeveloperConsoleRuntimeContext } from "@/app/lib/dev-center/developer-console";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return NextResponse.json({ ok: false, error: "Nincs jogosultság a fejlesztési kontextushoz." }, { status: 401 });
  try { return NextResponse.json({ ok: true, context: await getDeveloperConsoleRuntimeContext() }, { headers: { "cache-control": "no-store" } }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A fejlesztési kontextus nem tölthető be." }, { status: 500 }); }
}
