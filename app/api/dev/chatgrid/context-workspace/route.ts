import { NextRequest, NextResponse } from "next/server";
import { isChatGridDeviceAuthorized } from "@/app/lib/dev-center/chatgrid-device-auth";
import { developmentResourceHealth, listDevelopmentResources } from "@/app/lib/dev-center/development-resources";
import { listDevelopmentHandoffs } from "@/app/lib/dev-center/handoff-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return NextResponse.json({ ok: false, error: "A ChatGrid eszköz nincs párosítva." }, { status: 401 });
  try {
    const filters = Object.fromEntries(request.nextUrl.searchParams.entries());
    const [resources, resourceHealth, handoffs] = await Promise.all([listDevelopmentResources(), developmentResourceHealth(), listDevelopmentHandoffs(filters)]);
    return NextResponse.json({ ok: true, productionAccess: "DENY", generatedAt: new Date().toISOString(), resources, resourceHealth, handoffs }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A Context Workspace nem tölthető be." }, { status: 500 });
  }
}
