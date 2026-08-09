import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { getDropDriveArchiveState } from "@/app/lib/drop/archive/dropDriveArchiveService";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { listVisibleDropSpacePackages, resolveDropSpaceSession } from "@/app/lib/drop/dropSpaceRepository";
import { DROP_SPACE_SESSION_COOKIE } from "@/app/lib/drop/dropSpaceSecurity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ packageId: string }> };

function apiError(message: string, code: string, status: number) {
  const error = new Error(message);
  Object.assign(error, { code, status });
  return error;
}

async function assertPackageVisible(packageId: string) {
  const cookieStore = await cookies();
  const rawSession = cookieStore.get(DROP_SPACE_SESSION_COOKIE)?.value || "";
  if (!rawSession) throw apiError("A Drop tér munkamenet hiányzik.", "DROP_SPACE_SESSION_REQUIRED", 401);
  const session = await resolveDropSpaceSession(rawSession);
  const packages = await listVisibleDropSpacePackages(session);
  const packageItem = packages.find((item) => item.id === packageId);
  if (!packageItem) throw apiError("A csomag nem található vagy nem látható.", "DROP_SPACE_PACKAGE_NOT_VISIBLE", 404);
  return packageItem;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    assertDropFeatureEnabled("spacesEnabled");
    const { packageId } = await context.params;
    await assertPackageVisible(packageId);
    const state = await getDropDriveArchiveState(packageId);
    return NextResponse.json({ ok: true, ...state }, { headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}
