import { NextRequest, NextResponse } from "next/server";
import { isChatGridDeviceAuthorized } from "@/app/lib/dev-center/chatgrid-device-auth";
import { listDevelopmentHandoffs, saveDevelopmentHandoff } from "@/app/lib/dev-center/handoff-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return NextResponse.json({ ok: false, error: "A ChatGrid eszköz nincs párosítva." }, { status: 401 });
  try { return NextResponse.json({ ok: true, handoffs: await listDevelopmentHandoffs(Object.fromEntries(request.nextUrl.searchParams.entries())) }, { headers: { "cache-control": "no-store" } }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Az átadások nem tölthetők be." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return NextResponse.json({ ok: false, error: "A ChatGrid eszköz nincs párosítva." }, { status: 401 });
  try { return NextResponse.json({ ok: true, handoff: await saveDevelopmentHandoff(await request.json()) }, { status: 201, headers: { "cache-control": "no-store" } }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Az átadó nem menthető." }, { status: 400 }); }
}
