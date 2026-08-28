import { NextRequest } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { createDefaultDeveloperGridStateStore } from "@/app/lib/dev-center/developer-grid/state-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) {
    return Response.json({ ok: false, error: "Nincs jogosultság a Developer Grid delta gatewayhez." }, { status: 401 });
  }
  const after = Number(request.nextUrl.searchParams.get("after") || 0);
  const taskId = request.nextUrl.searchParams.get("taskId")?.trim() || "";
  const limit = Number(request.nextUrl.searchParams.get("limit") || 100);
  const store = createDefaultDeveloperGridStateStore();
  return Response.json(
    { ok: true, delta: store.delta(after, taskId, limit) },
    { headers: { "cache-control": "no-store" } },
  );
}
