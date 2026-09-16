import { NextRequest, NextResponse } from "next/server";
import { isChatGridDeviceAuthorized } from "@/app/lib/dev-center/chatgrid-device-auth";
import { reconcileCodexTaskBridgeBuild, requestCodexTaskBridgeBuild } from "@/app/lib/developer-grid/task-bridge/build-adapter";
import { getCodexTaskBridge, getCodexTaskBridgeBootstrap, getCodexTaskBridgeReviewPrompt, heartbeatCodexTaskBridge, importCodexTaskBridgeResult, importCodexTaskBridgeReview, importCodexTaskBridgeAcceptance, markCodexTaskBridgeReviewStarted, markCodexTaskBridgeWorkerStarted, resumeCodexTaskBridgeAfterReviewChanges, startCodexTaskBridge } from "@/app/lib/developer-grid/task-bridge/core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function json(payload: unknown, status = 200) { return NextResponse.json(payload, { status, headers: { "cache-control": "no-store", "x-dimpro-environment": "DEV", "x-dimpro-production-access": "DENY" } }); }
function errorResponse(error: unknown, fallback: string) {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "TASK_BRIDGE_FAILED") : "TASK_BRIDGE_FAILED";
  const status = error && typeof error === "object" && "status" in error ? Number((error as { status?: unknown }).status) || 500 : 500;
  return json({ ok: false, code, error: error instanceof Error ? error.message : fallback }, status);
}
export async function GET(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return json({ ok: false, error: "A Developer Grid eszköz nincs párosítva." }, 401);
  try {
    const action=request.nextUrl.searchParams.get("action");const taskId=request.nextUrl.searchParams.get("taskId");
    if(action==="bootstrap") return json({ok:true,bootstrap:await getCodexTaskBridgeBootstrap(String(taskId||"")),productionAccess:"DENY"});
    if(action==="review") return json({ok:true,review:await getCodexTaskBridgeReviewPrompt(String(taskId||"")),productionAccess:"DENY"});
    const current=await getCodexTaskBridge({ taskId, workerCode: request.nextUrl.searchParams.get("workerCode") });
    return json({ ok: true, taskBridge: await reconcileCodexTaskBridgeBuild(current), productionAccess: "DENY" });
  }
  catch (error) { return errorResponse(error, "A Task Bridge állapot nem tölthető be."); }
}
export async function POST(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return json({ ok: false, error: "A Developer Grid eszköz nincs párosítva." }, 401);
  try { const body=await request.json().catch(() => ({}));
    if(String(body.action||"").toUpperCase()==="REQUEST_BUILD") return json({ok:true,build:await requestCodexTaskBridgeBuild(String(body.taskId||""))});
    return json({ ok: true, taskBridge: await startCodexTaskBridge(body) }, 201);
  }
  catch (error) { return errorResponse(error, "A Codex Task Bridge nem indítható."); }
}
export async function PUT(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return json({ ok: false, error: "A Developer Grid eszköz nincs párosítva." }, 401);
  try { const body = await request.json().catch(() => ({}));
    if(String(body.action||"").toUpperCase()==="IMPORT_REVIEW") return json({ok:true,result:await importCodexTaskBridgeReview(String(body.taskId||""))});
    if(String(body.action||"").toUpperCase()==="IMPORT_ACCEPTANCE") return json({ok:true,result:await importCodexTaskBridgeAcceptance(String(body.taskId||""))});
    return json({ ok: true, result: await importCodexTaskBridgeResult(String(body.taskId || "")) });
  }
  catch (error) { return errorResponse(error, "A Codex result import sikertelen."); }
}
export async function PATCH(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return json({ ok: false, error: "A Developer Grid eszköz nincs párosítva." }, 401);
  try { const body = await request.json().catch(() => ({}));
    if(String(body.action||"").toUpperCase()==="WORKER_STARTED") return json({ok:true,result:await markCodexTaskBridgeWorkerStarted(String(body.taskId||""))});
    if(String(body.action||"").toUpperCase()==="REVIEW_STARTED") return json({ok:true,result:await markCodexTaskBridgeReviewStarted(String(body.taskId||""))});
    if(String(body.action||"").toUpperCase()==="START_REWORK") return json({ok:true,result:await resumeCodexTaskBridgeAfterReviewChanges(String(body.taskId||""))});
    return json({ ok: true, heartbeat: await heartbeatCodexTaskBridge(String(body.taskId || "")) });
  }
  catch (error) { return errorResponse(error, "A Codex Task Bridge heartbeat sikertelen."); }
}
