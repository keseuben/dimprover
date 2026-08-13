import { NextRequest, NextResponse } from "next/server";
import { getDevCenterMutationSubject } from "@/app/lib/dev-center/auth";
import { finalizeMForgeResult } from "@/app/lib/dev-center/ai-worker/mforge-finalize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await getDevCenterMutationSubject(request.headers, false))) return NextResponse.json({ ok: false, error: "Nincs jogosultság." }, { status: 401 });
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as { sessionId?: string };
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    if (!sessionId) return NextResponse.json({ ok: false, error: "A sessionId kötelező." }, { status: 400 });
    return NextResponse.json(await finalizeMForgeResult({ taskId: id, sessionId }), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Az M.Forge eredmény nem finalizálható." }, { status: 409, headers: { "cache-control": "no-store" } });
  }
}
