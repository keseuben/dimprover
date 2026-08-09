import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { decideCoreErrorResponse } from "@/app/lib/decide-core/api";
import { createDecideRequest, listDecideRequests } from "@/app/lib/decide-core/store";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "approval.read");
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, error: access.error, code: "code" in access ? access.code : undefined },
      { status: access.status },
    );
  }
  try {
    const result = await listDecideRequests({
      projectId,
      status: request.nextUrl.searchParams.get("status"),
      requestType: request.nextUrl.searchParams.get("requestType"),
      priority: request.nextUrl.searchParams.get("priority"),
      query: request.nextUrl.searchParams.get("query"),
    });
    return NextResponse.json({
      ok: true,
      projectId,
      ...result,
      actorUserId: access.actor.userId,
      permissions: access.access.permissions.filter((item) => item.startsWith("approval.")),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return decideCoreErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "approval.write");
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
    const result = await createDecideRequest({
      projectId,
      body,
      actorUserId: access.actor.userId,
      actorDisplayName: access.actor.displayName,
    });
    return NextResponse.json(result, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return decideCoreErrorResponse(error);
  }
}
