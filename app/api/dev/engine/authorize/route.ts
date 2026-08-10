import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { assertDevEngineOperation } from "@/app/lib/dev-center/engine-repository";
import type { DevEngineOperation } from "@/app/lib/dev-center/engine-types";
import { engineErrorResponse, engineUnauthorized } from "../_shared";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const operations: DevEngineOperation[] = ["write", "build", "test", "migration", "restart", "deploy"];
export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return engineUnauthorized();
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const operation = typeof body.operation === "string" ? body.operation.trim() as DevEngineOperation : "write";
    if (!sessionId || !operations.includes(operation)) return NextResponse.json({ ok: false, error: "Érvényes sessionId és operation szükséges." }, { status: 400 });
    return NextResponse.json(await assertDevEngineOperation(sessionId, operation), { headers: { "cache-control": "no-store" } });
  } catch (error) { return engineErrorResponse(error); }
}
