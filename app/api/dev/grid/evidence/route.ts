import { NextRequest, NextResponse } from "next/server";
import { isChatGridDeviceAuthorized } from "@/app/lib/dev-center/chatgrid-device-auth";
import { getGridEvidenceSummary, listGridEvidence } from "@/app/lib/developer-grid/evidence";
import { ingestDeveloperGridWorkerEvidence } from "@/app/lib/developer-grid/evidence-ingest";
import type { GridEvidenceKind } from "@/app/lib/developer-grid/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const kinds = new Set<GridEvidenceKind>(["FILE", "TEST", "ERROR", "HANDOFF", "BUILD", "BOOT_ACK", "REVIEW"]);
function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { "cache-control": "no-store", "x-dimpro-environment": "DEV", "x-dimpro-production-access": "DENY" } });
}

export async function GET(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return json({ ok:false, error:"A Developer Grid eszköz nincs párosítva." }, 401);
  const taskId = String(request.nextUrl.searchParams.get("taskId") || "").trim().slice(0, 220);
  const kindRaw = String(request.nextUrl.searchParams.get("kind") || "").trim().toUpperCase() as GridEvidenceKind;
  const kind = kinds.has(kindRaw) ? kindRaw : undefined;
  const evidence = await listGridEvidence({ taskId: taskId || undefined, kind, limit: Number(request.nextUrl.searchParams.get("limit") || 100) });
  const summary = taskId ? await getGridEvidenceSummary(taskId) : null;
  return json({ ok:true, evidence, summary, productionAccess:"DENY" });
}

export async function POST(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return json({ ok:false, error:"A Developer Grid eszköz nincs párosítva." }, 401);
  try {
    const result = await ingestDeveloperGridWorkerEvidence(await request.json().catch(() => ({})));
    return json({ ok:true, result }, 201);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as {code?:unknown}).code || "DEVELOPER_GRID_EVIDENCE_INGEST_FAILED") : "DEVELOPER_GRID_EVIDENCE_INGEST_FAILED";
    const status = error && typeof error === "object" && "status" in error ? Number((error as {status?:unknown}).status) || 409 : 409;
    return json({ ok:false, code, error:error instanceof Error ? error.message : "A Developer Grid evidence rögzítése sikertelen." }, status);
  }
}
