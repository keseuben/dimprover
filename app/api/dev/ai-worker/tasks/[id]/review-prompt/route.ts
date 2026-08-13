import { NextRequest, NextResponse } from "next/server";
import { getDevCenterMutationSubject } from "@/app/lib/dev-center/auth";
import { buildAndPersistVGuardReviewPrompt } from "@/app/lib/dev-center/ai-worker/vguard-review-prompt";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await getDevCenterMutationSubject(request.headers, false))) return NextResponse.json({ ok: false, error: "Nincs jogosultság." }, { status: 401 });
  try {
    const { id } = await context.params;
    const result = await buildAndPersistVGuardReviewPrompt(id);
    return NextResponse.json(result, { status: result.ok ? 200 : 409, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A V.Guard review prompt nem készíthető el." }, { status: 500 });
  }
}
