import { NextRequest, NextResponse } from "next/server";
import { getDevCenterMutationSubject } from "@/app/lib/dev-center/auth";
import {
  acceptBenAiSuggestedWorker,
  advanceDevEngineTaskManualBridge,
  finalizeDevEngineTask,
  recordDevEngineTaskManualBridgeResult,
  routeDevEngineTask,
  setDevEngineTaskTesting,
  startDevEngineTaskManualBridge,
  updateDevEngineTaskEstimate,
} from "@/app/lib/dev-center/engine-repository";
import { createBenAiConsoleMessage } from "@/app/lib/dev-center/developer-console";
import { sendDevPushNotification } from "@/app/lib/dev-center/push-store";
import { engineErrorResponse, engineUnauthorized } from "@/app/api/dev/engine/_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TaskAction = "ROUTE" | "ACCEPT_SUGGESTION" | "ESTIMATE" | "START" | "HANDOFF" | "RUNNING" | "RESULT_PENDING" | "RESULT_REPORT" | "TESTING" | "COMPLETE" | "FAIL";

async function notifyOutcome(input: { taskId: string; title: string; body: string; priority: "normal" | "high" }) {
  try {
    return await sendDevPushNotification({
      title: input.title,
      body: input.body,
      url: `/admin/dev-console?task=${encodeURIComponent(input.taskId)}`,
      tag: `benjadmin-task-${input.taskId}`,
      priority: input.priority,
    });
  } catch (error) {
    return { ok: false as const, sent: 0, failed: 0, reason: error instanceof Error ? error.message : "Push nem érhető el." };
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  if (!(await getDevCenterMutationSubject(request.headers, false))) return engineUnauthorized();
  try {
    const { taskId } = await context.params;
    const body = await request.json().catch(() => ({})) as { action?: TaskAction; workerCode?: string; estimateMinutes?: number; note?: string; summary?: string; commit?: string; buildId?: string; tests?: string; docs?: string; nextStep?: string };
    const action = String(body.action || "").toUpperCase() as TaskAction;
    let result: Record<string, unknown>;
    let notice = "";
    let notification: Record<string, unknown> | null = null;

    if (action === "ROUTE") {
      const routed = await routeDevEngineTask({ taskId, workerCode: String(body.workerCode || ""), estimateMinutes: body.estimateMinutes, note: body.note });
      result = routed;
      notice = `Felelős: ${routed.worker.name}. A task READY állapotba került.`;
      await createBenAiConsoleMessage({ summary: `${routed.task.title} -> ${routed.worker.name}`, detail: "Worker ownership és task routing rögzítve az AI Fejlesztői Térben.", taskId, projectId: routed.task.projectId, kind: "TASK_ASSIGNMENT", metadata: { workerCode: routed.worker.code, action } });
    } else if (action === "ACCEPT_SUGGESTION") {
      const accepted = await acceptBenAiSuggestedWorker(taskId);
      result = accepted;
      notice = `Ben-AI javaslat elfogadva: ${accepted.worker?.name || accepted.worker?.code || "worker"}.`;
      await createBenAiConsoleMessage({ summary: notice, detail: "A javasolt worker kapacitása és projektjogosultsága újraellenőrizve, majd a task hozzá került.", taskId, projectId: accepted.task.projectId, kind: "TASK_ASSIGNMENT", metadata: { action, workerCode: accepted.worker?.code || null } });
    } else if (action === "ESTIMATE") {
      const estimated = await updateDevEngineTaskEstimate({ taskId, estimateMinutes: Number(body.estimateMinutes), note: body.note });
      result = estimated;
      notice = `Fejlesztési időbecslés: ${estimated.estimateMinutes} perc.`;
      await createBenAiConsoleMessage({ summary: notice, detail: body.note || "BENJADMIN időbecslés frissítve.", taskId, projectId: estimated.task.projectId, kind: "TASK_UPDATE", metadata: { estimateMinutes: estimated.estimateMinutes, action } });
    } else if (action === "START") {
      const started = await startDevEngineTaskManualBridge(taskId);
      result = started;
      notice = `${started.worker.name} munkamenete elindult · ${started.session.handshakeStage}.`;
      await createBenAiConsoleMessage({ summary: `${started.task.title} · INDÍTVA`, detail: `Session: ${started.session.id} · kapu: ${started.session.handshakeStage}. A kódírás csak a branch/worktree/scope READY kapu után engedett.`, taskId, projectId: started.task.projectId, kind: "TASK_UPDATE", metadata: { workerCode: started.worker.code, sessionId: started.session.id, expectedFinishAt: started.expectedFinishAt, action } });
    } else if (action === "HANDOFF" || action === "RUNNING" || action === "RESULT_PENDING") {
      const advanced = await advanceDevEngineTaskManualBridge({ taskId, target: action === "HANDOFF" ? "HANDED_OFF" : action });
      result = advanced;
      notice = action === "HANDOFF" ? `${advanced.task.title} átadva a kijelölt ChatGPT workernek.` : action === "RUNNING" ? `${advanced.task.title} · ChatGPT munkamenet fut.` : `${advanced.task.title} · eredmény visszaérkezett, tesztelésre vár.`;
      await createBenAiConsoleMessage({
        summary: notice,
        detail: action === "HANDOFF" ? "A kézi ChatGPT/MCP átadás időpontja és prompt SHA rögzítve." : action === "RUNNING" ? "A kódoló ChatGPT munkamenet futása kézzel visszaigazolva." : "A kódoló eredménye visszaérkezett; következő kapu a tesztelés.",
        taskId,
        projectId: advanced.task.projectId,
        kind: "TASK_UPDATE",
        metadata: { action, bridgeState: advanced.bridgeState, handoffPromptSha256: advanced.handoffPromptSha256 },
      });
    } else if (action === "RESULT_REPORT") {
      const recorded = await recordDevEngineTaskManualBridgeResult({ taskId, summary: String(body.summary || ""), commit: body.commit, buildId: body.buildId, tests: body.tests, docs: body.docs, nextStep: body.nextStep });
      result = recorded;
      notice = `${recorded.task.title} · strukturált ChatGPT eredmény rögzítve.`;
      await createBenAiConsoleMessage({ summary: notice, detail: recorded.result.summary, taskId, projectId: recorded.task.projectId, kind: "TEST_RESULT", level: recorded.result.sanitized ? "warning" : "success", metadata: { action, bridgeState: recorded.bridgeState, resultVersion: recorded.result.version, resultSha256: recorded.result.sha256, commit: recorded.result.commit, buildId: recorded.result.buildId, sanitized: recorded.result.sanitized, testingSuggested: recorded.testingSuggested } });
    } else if (action === "TESTING") {
      const testing = await setDevEngineTaskTesting(taskId);
      result = testing;
      notice = `${testing.task.title} tesztelési fázisban.`;
      await createBenAiConsoleMessage({ summary: notice, detail: "A task állapota TESTING.", taskId, projectId: testing.task.projectId, kind: "TEST_RESULT", metadata: { action } });
    } else if (action === "COMPLETE" || action === "FAIL") {
      const finalized = await finalizeDevEngineTask({ taskId, outcome: action === "COMPLETE" ? "completed" : "failed", note: body.note });
      result = finalized;
      const success = action === "COMPLETE";
      notice = success ? `${finalized.task.title} elkészült.` : `${finalized.task.title} hibával / blokkolással leállt.`;
      if (finalized.alreadyFinalized) {
        notification = { ok: true, skipped: true, reason: "ALREADY_FINALIZED" };
      } else {
        await createBenAiConsoleMessage({ summary: notice, detail: body.note || (success ? "A task sikeresen lezárva." : finalized.task.blockedReason || "Blokkoló hiba."), taskId, projectId: finalized.task.projectId, kind: success ? "TASK_UPDATE" : "ERROR", level: success ? "success" : "error", progressPercent: success ? 100 : null, metadata: { action, outcome: success ? "completed" : "failed" } });
        notification = await notifyOutcome({ taskId, title: success ? "BENJADMIN · Feladat elkészült" : "BENJADMIN · Fejlesztési hiba", body: notice, priority: success ? "normal" : "high" });
      }
    } else {
      return NextResponse.json({ ok: false, error: "Ismeretlen AI Fejlesztői Tér task művelet." }, { status: 400, headers: { "cache-control": "no-store" } });
    }

    return NextResponse.json({ ok: true, action, result, notice, notification }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
