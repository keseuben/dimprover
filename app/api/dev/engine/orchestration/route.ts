import { NextRequest, NextResponse } from "next/server";
import { getDevCenterMutationSubject, isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import {
  acquireScopeBundleAtomic,
  claimTaskAtomic,
  completeTaskAtomic,
  getOrchestrationSnapshot,
  heartbeatSessionAtomic,
  recoverStaleSessionsAtomic,
  releaseSessionAtomic,
} from "@/app/lib/dev-center/orchestration-repository";
import { assertDevEngineWorkerSession } from "@/app/lib/dev-center/engine-repository";
import { engineErrorResponse, engineUnauthorized } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return engineUnauthorized();
  try {
    return NextResponse.json({ ok: true, orchestration: await getOrchestrationSnapshot() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return engineErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const subject = await getDevCenterMutationSubject(request.headers, true);
  if (!subject) return engineUnauthorized();
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const workerId = typeof body.workerId === "string" ? body.workerId : "";
    const taskId = typeof body.taskId === "string" ? body.taskId : null;
    const leaseSeconds = typeof body.leaseSeconds === "number" ? body.leaseSeconds : undefined;

    if (subject.kind === "worker") {
      const workerActions = new Set(["claim_task", "acquire_scope", "heartbeat", "release", "complete_task"]);
      if (!workerActions.has(action)) return NextResponse.json({ ok: false, error: "A worker identity ehhez az orchestration művelethez nem jogosult.", code: "DEV_CENTER_WORKER_ACTION_DENIED" }, { status: 403 });
      if (workerId && workerId !== subject.workerId) return NextResponse.json({ ok: false, error: "A workerId nem egyezik a hitelesített worker identityvel.", code: "DEV_CENTER_WORKER_IDENTITY_MISMATCH" }, { status: 403 });
      if (action !== "claim_task") {
        if (!sessionId) return NextResponse.json({ ok: false, error: "A sessionId kötelező." }, { status: 400 });
        await assertDevEngineWorkerSession(sessionId, subject.workerId);
      }
    }

    if (action === "claim_task" || action === "claim_next_task") {
      const effectiveWorkerId = subject.kind === "worker" ? subject.workerId : workerId;
      if (!sessionId || !effectiveWorkerId) return NextResponse.json({ ok: false, error: "A sessionId és workerId kötelező." }, { status: 400 });
      const result = await claimTaskAtomic({ sessionId, workerId: effectiveWorkerId, taskId: action === "claim_task" ? taskId : null, leaseSeconds });
      return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
    }
    if (action === "acquire_scope") {
      if (!sessionId) return NextResponse.json({ ok: false, error: "A sessionId kötelező." }, { status: 400 });
      const result = await acquireScopeBundleAtomic({ sessionId, scope: body.scope, leaseSeconds });
      return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
    }
    if (action === "heartbeat") {
      if (!sessionId) return NextResponse.json({ ok: false, error: "A sessionId kötelező." }, { status: 400 });
      return NextResponse.json({ ok: true, ...(await heartbeatSessionAtomic(sessionId, leaseSeconds)) }, { headers: { "cache-control": "no-store" } });
    }
    if (action === "release") {
      if (!sessionId) return NextResponse.json({ ok: false, error: "A sessionId kötelező." }, { status: 400 });
      const reason = typeof body.reason === "string" ? body.reason : "Session lezárva.";
      const requeueTask = body.requeueTask !== false;
      return NextResponse.json({ ok: true, session: await releaseSessionAtomic(sessionId, reason, requeueTask) }, { headers: { "cache-control": "no-store" } });
    }
    if (action === "complete_task") {
      if (!sessionId) return NextResponse.json({ ok: false, error: "A sessionId kötelező." }, { status: 400 });
      const summary = typeof body.summary === "string" ? body.summary : "";
      return NextResponse.json({ ok: true, task: await completeTaskAtomic(sessionId, summary) }, { headers: { "cache-control": "no-store" } });
    }
    if (action === "recover_stale") {
      const limit = typeof body.limit === "number" ? body.limit : 20;
      return NextResponse.json({ ok: true, recovery: await recoverStaleSessionsAtomic(limit) }, { headers: { "cache-control": "no-store" } });
    }

    return NextResponse.json({ ok: false, error: "Ismeretlen orchestration művelet." }, { status: 400, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
