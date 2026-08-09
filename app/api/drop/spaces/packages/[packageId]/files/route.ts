import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { resolveDropSpaceSession } from "@/app/lib/drop/dropSpaceRepository";
import { DROP_SPACE_SESSION_COOKIE } from "@/app/lib/drop/dropSpaceSecurity";
import { getDropPackageUploadState } from "@/app/lib/drop/storage/dropUploadService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ packageId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    assertDropFeatureEnabled("spacesEnabled");
    const rawSession = request.cookies.get(DROP_SPACE_SESSION_COOKIE)?.value?.trim();
    if (!rawSession) {
      return NextResponse.json(
        { ok: false, error: "Nincs aktív Drop tér munkamenet.", code: "DROP_SPACE_SESSION_MISSING" },
        { status: 401, headers: dropNoStoreHeaders() },
      );
    }
    const [{ packageId }, session] = await Promise.all([
      context.params,
      resolveDropSpaceSession(rawSession),
    ]);
    const state = await getDropPackageUploadState(session, packageId);
    return NextResponse.json(
      { ok: true, version: "DROP 1.2.11", ...state },
      { headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}
