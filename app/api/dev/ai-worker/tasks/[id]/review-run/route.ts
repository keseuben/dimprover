import { NextRequest, NextResponse } from "next/server";
import { getDevCenterMutationSubject } from "@/app/lib/dev-center/auth";
import { requestVGuardReviewRun } from "@/app/lib/dev-center/ai-worker/vguard-review-run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await getDevCenterMutationSubject(request.headers, false))) {
    return NextResponse.json({ ok: false, error: "Nincs jogosultság." }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const result = await requestVGuardReviewRun(id);
    const code = "code" in result && typeof result.code === "string" ? result.code : "";
    return NextResponse.json(result, { status: result.ok ? 202 : code === "AI_WORKER_VGUARD_TASK_NOT_FOUND" ? 404 : 409, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A V.Guard review futás nem kérhető." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
