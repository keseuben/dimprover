import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { autoRouteDevEngineTaskByAvailability, createDevEngineTask } from "@/app/lib/dev-center/engine-repository";
import { createBenAiConsoleMessage, createBenjadminConsoleMessage, listDeveloperConsoleMessagesPage, resolveDeveloperConsoleRepositoryId } from "@/app/lib/dev-center/developer-console";
import { buildBenAiDispatch, estimateDevelopmentMinutes } from "@/app/lib/dev-center/benai-dispatch";
import { createExternalAiWorkerTask } from "@/app/lib/dev-center/ai-worker/v1";

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
    const limit = Number(request.nextUrl.searchParams.get("limit") || 180);
    const beforeRaw = request.nextUrl.searchParams.get("before")?.trim() || null;
    const before = beforeRaw && Number.isFinite(new Date(beforeRaw).getTime()) ? new Date(beforeRaw).toISOString() : null;
    const result = await listDeveloperConsoleMessagesPage({ limit, before });
    return json({ ok: true, messages: result.messages, page: result.page, generatedAt: new Date().toISOString() });
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
    let autoRouting: Awaited<ReturnType<typeof autoRouteDevEngineTaskByAvailability>> | null = null;
    let externalTaskCreated = false;
    if (body.createTask && target === "VGUARD") {
      return json({
        ok: false,
        error: "V.Guard-AI review-only worker: új kódolási taskot nem kaphat. Küldj neki chatüzenetet, vagy az AI Workerek panelen válassz meglévő M.Forge eredményt független review-ra.",
        code: "DEV_CONSOLE_VGUARD_REVIEW_ONLY",
      }, 409);
    }
    if (body.createTask && body.projectId && target === "MFORGE") {
      const title = instruction.split(/\r?\n/)[0].slice(0, 180);
      const created = await createExternalAiWorkerTask({
        projectId: body.projectId,
        title,
        goal: instruction,
        launchMode: "WORKER",
        modelPreference: "AUTO",
      });
      if (!created.ok) return json({ ok: false, error: created.error || "Az M.Forge külső AI worker task nem hozható létre." }, 400);
      task = created.task;
      externalTaskCreated = true;
    } else if (body.createTask && body.projectId) {
      const requestedWorkerId = Object.prototype.hasOwnProperty.call(workerMap, target) ? workerMap[target] : null;
      const title = instruction.split(/\r?\n/)[0].slice(0, 180);
      const repositoryId = await resolveDeveloperConsoleRepositoryId(body.projectId);
      if (!repositoryId) return json({ ok: false, error: "A kiválasztott fejlesztési projekthez nincs aktív repository-kötés. A task biztonságosan nem indítható.", code: "DEV_CONSOLE_REPOSITORY_BINDING_REQUIRED" }, 409);
      const estimate = estimateDevelopmentMinutes(instruction);
      const created = await createDevEngineTask({
        projectId: body.projectId,
        repositoryId,
        title,
        description: instruction,
        priority: 70,
        requestedWorkerId,
        createdBy: "BenjAdmin",
        metadata: {
          origin: "BENJADMIN_DEVELOPER_CONSOLE",
          target,
          estimateMinutes: estimate.minutes,
          estimateMinMinutes: estimate.minMinutes,
          estimateMaxMinutes: estimate.maxMinutes,
          estimateSource: estimate.source,
        },
      });
      if (!created.ok) return json({ ok: false, error: created.error || "A fejlesztési feladat nem hozható létre." }, 400);
      task = created.task;
      autoRouting = await autoRouteDevEngineTaskByAvailability({
        taskId: String(created.task.id),
        estimateMinutes: estimate.minutes,
        preferredWorkerCode: requestedWorkerId ? target : null,
        note: requestedWorkerId ? "BENJADMIN kézi preferencia · Ben-AI kapacitásellenőrzéssel" : "Ben-AI automatikus kapacitásalapú kiosztás",
        prepareForPlusPull: true,
        chainSource: "BENJADMIN_COMMAND",
      });
      task = autoRouting.task;
    }
    const message = await createBenjadminConsoleMessage({
      text: instruction,
      target,
      detail: body.detail,
      taskId: task?.id || null,
      projectId: body.projectId || null,
      kind: body.kind === "DECISION" ? "DECISION" : "INSTRUCTION",
    });
    const dispatchTarget = autoRouting?.routed && autoRouting.worker?.code ? autoRouting.worker.code : target;
    const dispatch = buildBenAiDispatch({ text: instruction, target: dispatchTarget, taskId: task?.id || null, projectId: body.projectId || null });
    if (externalTaskCreated) {
      dispatch.stage = "TASK_ASSIGNED";
      dispatch.selectedWorkerId = "worker_mforge";
      dispatch.selectedWorkerCode = "MFORGE";
      dispatch.selectedWorkerName = "M.Forge-AI";
      dispatch.summary = "M.Forge-AI külső fejlesztési task létrejött DRAFT állapotban.";
      dispatch.nextStep = "Következő kapuk: technikai scope → preflight → Safe Context Pack → provider prompt → M.Forge run. A külső modell csak konfigurált provider és engedélyezett execution gate mellett indul.";
    } else if (!task?.id && target === "MFORGE") {
      dispatch.summary = "Az üzenet M.Forge-AI részére bekerült a közös fejlesztői beszélgetésbe; task nem készült.";
      dispatch.nextStep = "Ez chat-címzés. Külső modellválasz csak konfigurált provider-kapcsolattal indítható; végrehajtható munkához kapcsold be a Külső fejlesztési task létrehozását és válassz projektet.";
    } else if (!task?.id && target === "VGUARD") {
      dispatch.summary = "Az üzenet V.Guard-AI részére bekerült a közös fejlesztői beszélgetésbe; review task nem készült.";
      dispatch.nextStep = "V.Guard review-only. Kérdés/címzés rögzíthető itt; független review-t meglévő M.Forge eredményre az AI Workerek workflow indít.";
    }
    if (autoRouting?.routed && autoRouting.worker) {
      dispatch.stage = "TASK_ASSIGNED";
      dispatch.selectedWorkerId = autoRouting.worker.id;
      dispatch.selectedWorkerCode = autoRouting.worker.code;
      dispatch.selectedWorkerName = autoRouting.worker.name;
      dispatch.summary = autoRouting.worker.name + " megkapta a feladatot; a BENJADMIN átadó ChatGPT pullra kész.";
      dispatch.nextStep = "A kijelölt " + autoRouting.worker.name + " ChatGPT munkamenetben elég a rövid Folytasd. parancs; a Plus/MCP bridge felveszi a taskot és RUNNING állapotba viszi.";
    }
    if (autoRouting && !autoRouting.routed) {
      dispatch.stage = "COORDINATOR_ROUTING";
      dispatch.selectedWorkerId = null;
      dispatch.selectedWorkerCode = null;
      dispatch.selectedWorkerName = null;
      if (autoRouting.reason === "PREFERRED_UNAVAILABLE") {
        const preferred = autoRouting.preferredWorker?.name || target;
        const suggestion = autoRouting.suggestedWorker?.name || null;
        dispatch.summary = `${preferred} jelenleg foglalt vagy ezen a projekten nem választható.`;
        dispatch.nextStep = suggestion ? `Ben-AI javaslata: ${suggestion} szabad és jogosult. A feladat egyelőre vár, amíg jóvá nem hagyod az alternatívát vagy felszabadul a választott worker.` : "Jelenleg nincs szabad és jogosult alternatív worker; a task Ben-AI várólistán marad.";
      } else {
        dispatch.summary = "Ben-AI átvette a taskot, de jelenleg nincs szabad és jogosult worker. A feladat a koordinátori várólistán marad.";
        dispatch.nextStep = "Ben-AI a következő kapacitásvizsgálatkor automatikusan kiosztja; kézi worker-választás normál esetben nem szükséges.";
      }
    }
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
        plusPullReady: autoRouting?.routed === true,
        coordinatorChainState: autoRouting?.routed ? "READY_FOR_PLUS_PULL" : null,
        handoffPrompt: dispatch.handoffPrompt,
      },
    });
    return json({ ok: true, message, coordinatorMessage, task, dispatch, autoRouting }, 201);
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 400;
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    return json({ ok: false, error: error instanceof Error ? error.message : "Az utasítás nem rögzíthető.", code }, status);
  }
}
