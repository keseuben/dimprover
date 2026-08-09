import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { addManualDevWorkSession } from "@/app/lib/dev-center/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ versionId: string }> }) {
  if (!(await isDevCenterAuthorized(request.headers, true))) {
    return NextResponse.json({ ok: false, error: "Nincs jogosultság kézi idő rögzítéséhez." }, { status: 401 });
  }
  const { versionId } = await context.params;
  const result = await addManualDevWorkSession(versionId, await request.json().catch(() => ({})));
  return NextResponse.json(result, { status: result.ok ? 201 : 400, headers: { "cache-control": "no-store" } });
}
