import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { listDevelopmentHandoffs, saveDevelopmentHandoff } from "@/app/lib/dev-center/handoff-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(payload: unknown, status = 200) { return NextResponse.json(payload, { status, headers: { "cache-control": "no-store" } }); }

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return json({ ok: false, error: "Nincs jogosultság az átadási munkanaplóhoz." }, 401);
  try {
    const filters = Object.fromEntries(request.nextUrl.searchParams.entries());
    return json({ ok: true, handoffs: await listDevelopmentHandoffs(filters) });
  } catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "Az átadások nem tölthetők be." }, 500); }
}

export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers))) return json({ ok: false, error: "Nincs jogosultság átadó mentéséhez." }, 401);
  try { return json({ ok: true, handoff: await saveDevelopmentHandoff(await request.json()) }, 201); }
  catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "Az átadó nem menthető." }, 400); }
}
