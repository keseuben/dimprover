import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { decideCoreErrorResponse } from "@/app/lib/decide-core/api";
import { getDecideCoreHealth } from "@/app/lib/decide-core/store";

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
    const health = await getDecideCoreHealth();
    return NextResponse.json({
      ok: true,
      projectId,
      ...health,
      actorUserId: access.actor.userId,
      actorDisplayName: access.actor.displayName,
      permissions: access.access.permissions.filter((item) => item.startsWith("approval.")),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return decideCoreErrorResponse(error);
  }
}
