import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { diaryCoreErrorResponse } from "@/app/lib/diary-core/api";
import { createDiaryEntry, listDiaryEntries } from "@/app/lib/diary-core/store";

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
    const result = await listDiaryEntries({
      projectId,
      status: request.nextUrl.searchParams.get("status"),
      dateFrom: request.nextUrl.searchParams.get("dateFrom"),
      dateTo: request.nextUrl.searchParams.get("dateTo"),
      query: request.nextUrl.searchParams.get("query"),
    });
    return NextResponse.json({
      ok: true,
      projectId,
      ...result,
      permissions: access.access.permissions.filter((item) => item.startsWith("diary.")),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return diaryCoreErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "diary.write");
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
    const result = await createDiaryEntry({
      projectId,
      body,
      actorUserId: access.actor.userId,
      actorDisplayName: access.actor.displayName,
    });
    return NextResponse.json(result, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return diaryCoreErrorResponse(error);
  }
}
