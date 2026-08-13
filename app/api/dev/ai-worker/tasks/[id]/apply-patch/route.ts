import { NextRequest, NextResponse } from "next/server";
import { getDevCenterMutationSubject } from "@/app/lib/dev-center/auth";
import { applyValidatedMForgePatch } from "@/app/lib/dev-center/ai-worker/patch-apply";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await getDevCenterMutationSubject(request.headers, false))) return NextResponse.json({ ok: false, error: "Nincs jogosultság." }, { status: 401 });
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as { sessionId?: string };
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    if (!sessionId) return NextResponse.json({ ok: false, error: "A sessionId kötelező." }, { status: 400 });
    const result = await applyValidatedMForgePatch({ taskId: id, sessionId });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A validált M.Forge patch nem alkalmazható." }, { status: 409, headers: { "cache-control": "no-store" } });
  }
}
