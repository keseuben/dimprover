import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { getDialogCoreHealth } from "@/app/lib/dialog-core/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "dialog.read");
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, error: access.error, code: "code" in access ? access.code : undefined },
      { status: access.status, headers: { "cache-control": "no-store" } },
    );
  }
  const health = await getDialogCoreHealth();
  return NextResponse.json({
    ok: true,
    projectId,
    ...health,
    permissions: access.access.permissions.filter((permission) => permission.startsWith("dialog.")),
  }, { headers: { "cache-control": "no-store" } });
}
