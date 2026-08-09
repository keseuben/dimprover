import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { diaryCoreErrorResponse } from "@/app/lib/diary-core/api";
import { closeDiaryEntry } from "@/app/lib/diary-core/store";

type RouteContext = { params: Promise<{ projectId: string; entryId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId, entryId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "diary.close");
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
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés.", code: "DIARY_INVALID_JSON" }, { status: 400 });
  }
  try {
    const result = await closeDiaryEntry({
      projectId,
      entryId,
      body,
      actorUserId: access.actor.userId,
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return diaryCoreErrorResponse(error);
  }
}
