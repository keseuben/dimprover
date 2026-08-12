import { NextRequest, NextResponse } from "next/server";
import { getDevCenterMutationSubject, isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { createExternalAiWorkerTask, EXTERNAL_AI_DEFAULTS, EXTERNAL_AI_WORKERS, listExternalAiWorkerTasks, mockWorkerAdapter } from "@/app/lib/dev-center/ai-worker/v1";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return NextResponse.json({ ok: false, error: "Nincs jogosultság." }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, tasks: await listExternalAiWorkerTasks(), workers: EXTERNAL_AI_WORKERS, defaults: EXTERNAL_AI_DEFAULTS, adapter: await mockWorkerAdapter.probe() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "AI worker taskok nem tölthetők." }, { status: 500 });
  }
}
export async function POST(request: NextRequest) {
  if (!(await getDevCenterMutationSubject(request.headers, false))) return NextResponse.json({ ok: false, error: "Nincs jogosultság." }, { status: 401 });
  try {
    const result = await createExternalAiWorkerTask(await request.json().catch(() => ({})));
    return NextResponse.json(result, { status: result.ok ? 201 : 400, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "AI worker task nem hozható létre." }, { status: 500 });
  }
}
