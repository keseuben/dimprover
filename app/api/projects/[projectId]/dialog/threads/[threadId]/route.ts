import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { dialogCoreErrorResponse } from "@/app/lib/dialog-core/api";
import { getDialogThread, updateDialogThread } from "@/app/lib/dialog-core/store";

type RouteContext = { params: Promise<{ projectId: string; threadId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId, threadId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "dialog.read");
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error, code: "code" in access ? access.code : undefined }, { status: access.status });
  }
  try {
    const bundle = await getDialogThread(projectId, threadId);
    return NextResponse.json({ ok: true, ...bundle, permissions: access.access.permissions.filter((item) => item.startsWith("dialog.")) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return dialogCoreErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { projectId, threadId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "dialog.write");
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error, code: "code" in access ? access.code : undefined }, { status: access.status });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés.", code: "DIALOG_INVALID_JSON" }, { status: 400 });
  }
  try {
    const result = await updateDialogThread({ projectId, threadId, body, actorUserId: access.actor.userId });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return dialogCoreErrorResponse(error);
  }
}
