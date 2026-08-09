import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { decideCoreErrorResponse } from "@/app/lib/decide-core/api";
import { respondDecideRequest } from "@/app/lib/decide-core/store";

type RouteContext = { params: Promise<{ projectId: string; requestId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId, requestId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "approval.respond");
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, error: access.error, code: "code" in access ? access.code : undefined },
      { status: access.status },
    );
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés.", code: "DECIDE_INVALID_JSON" }, { status: 400 });
  }
  try {
    const result = await respondDecideRequest({
      projectId,
      requestId,
      body,
      actorUserId: access.actor.userId,
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return decideCoreErrorResponse(error);
  }
}
