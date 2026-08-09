import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { createDropPackageGroupForSession, getDropPackageGroupsForSession } from "@/app/lib/drop/dropGroupService";
import { resolveDropSpaceSession } from "@/app/lib/drop/dropSpaceRepository";
import { DROP_SPACE_SESSION_COOKIE } from "@/app/lib/drop/dropSpaceSecurity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ packageId: string }> };

async function resolveSession(request: NextRequest) {
  const rawSession = request.cookies.get(DROP_SPACE_SESSION_COOKIE)?.value?.trim();
  if (!rawSession) {
    const error = new Error("Nincs aktív Drop tér munkamenet.");
    Object.assign(error, { code: "DROP_SPACE_SESSION_MISSING", status: 401 });
    throw error;
  }
  return resolveDropSpaceSession(rawSession);
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    assertDropFeatureEnabled("spacesEnabled");
    const [{ packageId }, session] = await Promise.all([context.params, resolveSession(request)]);
    const groups = await getDropPackageGroupsForSession(session, packageId);
    return NextResponse.json({ ok: true, version: "DROP 1.2.11", groups }, { headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    assertDropFeatureEnabled("spacesEnabled");
    const [{ packageId }, session, body] = await Promise.all([context.params, resolveSession(request), request.json()]);
    const result = await createDropPackageGroupForSession(session, packageId, body);
    return NextResponse.json({ ok: true, version: "DROP 1.2.11", ...result }, { status: result.created ? 201 : 200, headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}
