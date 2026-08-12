import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { createDevEngineTask } from "@/app/lib/dev-center/engine-repository";
import { createBenAiConsoleMessage, createBenjadminConsoleMessage, listDeveloperConsoleMessages } from "@/app/lib/dev-center/developer-console";
import { buildBenAiDispatch } from "@/app/lib/dev-center/benai-dispatch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { "cache-control": "no-store" } });
}

const workerMap: Record<string, string | null> = {
  BENAI: null,
  ARMINAI: "worker_arminai",
  JAZMINAI: "worker_jazminai",
  OUTMINAI: "worker_outminai",
  EVERYONE: null,
};

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return json({ ok: false, error: "Nincs jogosultság a fejlesztői konzolhoz." }, 401);
  try {
    return json({ ok: true, messages: await listDeveloperConsoleMessages(180), generatedAt: new Date().toISOString() });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "A fejlesztői konzol nem tölthető be." }, 500);
  }
}

export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers))) return json({ ok: false, error: "Nincs jogosultság fejlesztői utasítás rögzítéséhez." }, 401);
  try {
    const body = await request.json() as { text?: string; target?: string; detail?: string; projectId?: string; createTask?: boolean; kind?: "INSTRUCTION" | "DECISION" };
    const instruction = String(body.text || "").trim();
    const target = String(body.target || "BENAI").toUpperCase();
    if (!instruction) return json({ ok: false, error: "Az utasítás nem lehet üres." }, 400);
    let task: { id?: string } | null = null;
    if (body.createTask && body.projectId) {
      const requestedWorkerId = Object.prototype.hasOwnProperty.call(workerMap, target) ? workerMap[target] : null;
      const title = instruction.split(/\r?\n/)[0].slice(0, 180);
      const created = await createDevEngineTask({
        projectId: body.projectId,
        title,
        description: instruction,
        priority: 70,
        requestedWorkerId,
        createdBy: "BenjAdmin",
        metadata: { origin: "BENJADMIN_DEVELOPER_CONSOLE", target },
      });
      if (!created.ok) return json({ ok: false, error: created.error || "A fejlesztési feladat nem hozható létre." }, 400);
      task = created.task;
    }
    const message = await createBenjadminConsoleMessage({
      text: instruction,
      target,
      detail: body.detail,
      taskId: task?.id || null,
      projectId: body.projectId || null,
      kind: body.kind === "DECISION" ? "DECISION" : "INSTRUCTION",
    });
    const dispatch = buildBenAiDispatch({ text: instruction, target, taskId: task?.id || null, projectId: body.projectId || null });
    const coordinatorMessage = await createBenAiConsoleMessage({
      summary: dispatch.summary,
      detail: dispatch.nextStep,
      taskId: task?.id || null,
      projectId: body.projectId || null,
      metadata: {
        dispatchStage: dispatch.stage,
        bridgeMode: dispatch.bridgeMode,
        selectedWorkerId: dispatch.selectedWorkerId,
        selectedWorkerCode: dispatch.selectedWorkerCode,
        executorConfigured: dispatch.executorConfigured,
        handoffPrompt: dispatch.handoffPrompt,
      },
    });
    return json({ ok: true, message, coordinatorMessage, task, dispatch }, 201);
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 400;
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    return json({ ok: false, error: error instanceof Error ? error.message : "Az utasítás nem rögzíthető.", code }, status);
  }
}
