import { NextRequest, NextResponse } from "next/server";
import { isDeveloperGridReadAuthorized } from "@/app/lib/developer-grid/read-auth";
import { getDevCenterMutationSubject } from "@/app/lib/dev-center/auth";
import { appendGridEvent, listGridEvents } from "@/app/lib/developer-grid/state-store";
import type { GridEventKind, GridEventOrigin, WorkerCode } from "@/app/lib/developer-grid/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const kinds = new Set<GridEventKind>(["analysis", "coding", "file-change", "diff", "test", "build", "commit", "release", "handoff", "error", "review"]);
const origins = new Set<GridEventOrigin>(["LIVE", "BACKFILL"]);
const workers = new Set<WorkerCode>(["ARMINAI", "OUTMINAI", "BENJAMINAI", "JAZMINAI", "DEVMINAI"]);
const clean = (value: unknown, max = 2000) => String(value || "").replace(/\r\n/g, "\n").trim().slice(0, max);

function json(payload: unknown, status = 200) { return NextResponse.json(payload, { status, headers: { "cache-control": "no-store" } }); }

export async function GET(request: NextRequest) {
  if (!(await isDeveloperGridReadAuthorized(request.headers))) return json({ ok: false, error: "Nincs jogosultság a Developer Grid eseményekhez." }, 401);
  return json({ ok: true, mode: "DELTA_EVENT", page: await listGridEvents({ cursor: request.nextUrl.searchParams.get("cursor"), limit: Number(request.nextUrl.searchParams.get("limit") || 50) }) });
}

export async function POST(request: NextRequest) {
  if (!(await getDevCenterMutationSubject(request.headers, true))) return json({ ok: false, error: "Nincs jogosultság Developer Grid activity rögzítéséhez." }, 401);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const kind = clean(body.kind, 40).toLowerCase() as GridEventKind;
  const origin = clean(body.origin || "LIVE", 20).toUpperCase() as GridEventOrigin;
  const workerCode = clean(body.workerCode, 40).toUpperCase() as WorkerCode;
  if (!kinds.has(kind) || !origins.has(origin) || !workers.has(workerCode)) return json({ ok: false, error: "Érvénytelen Developer Grid activity contract." }, 400);
  const event = await appendGridEvent({ kind, origin, workerCode, taskId: clean(body.taskId, 180), projectId: clean(body.projectId || "project_dimprover", 180), branch: clean(body.branch, 240) || undefined, worktree: clean(body.worktree, 600) || undefined, head: clean(body.head, 80) || undefined, productionAccess: "DENY", delta: {
    summary: clean(body.summary, 3000), detail: clean(body.detail, 6000), mainModule: "BENJADMIN", moduleName: "Developer Grid V1",
    submoduleName: clean(body.submoduleName, 220) || null, workItem: clean(body.workItem, 500) || null, workStageIndex: Number(body.workStageIndex) || null,
    eventType: clean(body.eventType, 120) || null, status: clean(body.status, 40).toUpperCase() || null, severity: clean(body.severity, 40).toUpperCase() || null,
    sessionId: clean(body.sessionId, 240) || null, path: clean(body.path, 900) || null, changeType: clean(body.changeType, 40).toUpperCase() || null,
    testName: clean(body.testName, 300) || null, durationMs: Number.isFinite(Number(body.durationMs)) ? Math.max(0, Number(body.durationMs)) : null,
    errorCode: clean(body.errorCode, 180) || null, exitCode: Number.isFinite(Number(body.exitCode)) ? Number(body.exitCode) : null,
    runId: clean(body.runId, 180) || null, buildId: clean(body.buildId, 180) || null, handoffId: clean(body.handoffId, 180) || null,
    reviewId: clean(body.reviewId, 180) || null, contentSha256: clean(body.contentSha256, 64).toLowerCase() || null, artifactSha256: clean(body.artifactSha256, 64).toLowerCase() || null,
    outputSha256: clean(body.outputSha256, 64).toLowerCase() || null, resolvesFingerprint: clean(body.resolvesFingerprint, 64).toLowerCase() || null,
    reviewResult: clean(body.reviewResult, 40).toUpperCase() || null, handoffStatus: clean(body.handoffStatus, 40).toUpperCase() || null, sanitized: true
  } });
  return json({ ok: true, event }, 201);
}
