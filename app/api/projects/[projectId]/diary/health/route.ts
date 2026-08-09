import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { diaryCoreErrorResponse } from "@/app/lib/diary-core/api";
import { getDiaryCoreHealth } from "@/app/lib/diary-core/store";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "diary.read");
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, error: access.error, code: "code" in access ? access.code : undefined },
      { status: access.status },
    );
  }
  try {
    const health = await getDiaryCoreHealth();
    return NextResponse.json({
      ok: true,
      projectId,
      ...health,
      actorUserId: access.actor.userId,
      actorDisplayName: access.actor.displayName,
      permissions: access.access.permissions.filter((item) => item.startsWith("diary.")),
      disclaimer: "A DIMPRO DIARY projekt-előkészítő és nyomon követő napló; nem helyettesíti a hivatalos e-építési naplót.",
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return diaryCoreErrorResponse(error);
  }
}
