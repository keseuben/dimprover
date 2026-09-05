import { NextRequest, NextResponse } from "next/server";
import { isChatGridDeviceAuthorized } from "@/app/lib/dev-center/chatgrid-device-auth";
import { listDevelopmentHandoffs, saveDevelopmentHandoff } from "@/app/lib/dev-center/handoff-store";
import { appendGridEvent } from "@/app/lib/developer-grid/state-store";
import type { WorkerCode } from "@/app/lib/developer-grid/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return NextResponse.json({ ok: false, error: "A ChatGrid eszköz nincs párosítva." }, { status: 401 });
  try { return NextResponse.json({ ok: true, handoffs: await listDevelopmentHandoffs(Object.fromEntries(request.nextUrl.searchParams.entries())) }, { headers: { "cache-control": "no-store" } }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Az átadások nem tölthetők be." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return NextResponse.json({ ok: false, error: "A ChatGrid eszköz nincs párosítva." }, { status: 401 });
  try {
    const handoff = await saveDevelopmentHandoff(await request.json());
    const normalizedWorker = handoff.workerCode === "BENAI" ? "BENJAMINAI" : handoff.workerCode;
    if (["ARMINAI", "OUTMINAI", "BENJAMINAI", "JAZMINAI"].includes(normalizedWorker) && handoff.taskId) {
      await appendGridEvent({
        kind: "handoff", origin: "LIVE", workerCode: normalizedWorker as WorkerCode, taskId: handoff.taskId, projectId: handoff.project || "project_dimprover",
        branch: handoff.branch || undefined, worktree: handoff.worktree || undefined, head: /^[0-9a-f]{40}$/i.test(handoff.endCommit) ? handoff.endCommit : undefined, productionAccess: "DENY",
        delta: { eventType: "HANDOFF_SAVED", summary: `HANDOFF ${handoff.status} mentve.`, status: handoff.status === "COMPLETED" ? "COMPLETED" : handoff.status === "PARTIAL" ? "PARTIAL" : "BLOCKED",
          severity: handoff.status === "COMPLETED" ? "INFO" : handoff.status === "PARTIAL" ? "WARNING" : "HIGH", handoffId: handoff.id, handoffStatus: handoff.status, contentSha256: handoff.sha256, sanitized: true },
      }).catch(() => null);
    }
    return NextResponse.json({ ok: true, handoff }, { status: 201, headers: { "cache-control": "no-store" } });
  }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Az átadó nem menthető." }, { status: 400 }); }
}
