import { NextRequest, NextResponse } from "next/server";
import { getDevCenterMutationSubject } from "@/app/lib/dev-center/auth";
import { pullDevEngineTaskForPlusWorker } from "@/app/lib/dev-center/engine-repository";
import { createBenAiConsoleMessage } from "@/app/lib/dev-center/developer-console";
import { engineErrorResponse, engineUnauthorized } from "@/app/api/dev/engine/_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ workerCode: string }> }) {
  if (!(await getDevCenterMutationSubject(request.headers, false))) return engineUnauthorized();
  try {
    const { workerCode } = await context.params;
    const pulled = await pullDevEngineTaskForPlusWorker(workerCode);
    if (pulled.found && pulled.task) {
      await createBenAiConsoleMessage({
        summary: `${pulled.worker.name} felvette a következő BENJADMIN feladatot.`,
        detail: `${pulled.task.title} · Plus-only ChatGPT bridge · ${pulled.handoff?.bridgeState || "RUNNING"}.`,
        taskId: pulled.task.id,
        projectId: pulled.task.projectId,
        kind: "TASK_UPDATE",
        metadata: { action: "PLUS_PULL", workerCode: pulled.worker.code, bridgeState: pulled.handoff?.bridgeState, handoffPromptSha256: pulled.handoff?.sha256 },
      });
    }
    return NextResponse.json(pulled, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
