import { NextRequest, NextResponse } from "next/server";
import { getDevCenterMutationSubject } from "@/app/lib/dev-center/auth";
import { undoDevEngineTaskDevelopmentMap, updateDevEngineTaskDevelopmentMap } from "@/app/lib/dev-center/engine-repository";
import { engineErrorResponse, engineUnauthorized } from "@/app/api/dev/engine/_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  if (!(await getDevCenterMutationSubject(request.headers, false))) return engineUnauthorized();
  try {
    const { taskId } = await context.params;
    const body = await request.json().catch(() => ({})) as { nodeId?: string; workItem?: string; action?: string };
    const result = body.action === "undo"
      ? await undoDevEngineTaskDevelopmentMap({ taskId, updatedBy: "BenjAdmin" })
      : await updateDevEngineTaskDevelopmentMap({ taskId, nodeId: String(body.nodeId || ""), workItem: body.workItem, updatedBy: "BenjAdmin" });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
