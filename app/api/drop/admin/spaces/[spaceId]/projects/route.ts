import { type NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import {
  linkDropSpaceProject,
  listDropSpaceProjectOptions,
  unlinkDropSpaceProject,
} from "@/app/lib/drop/dropSpaceProjectLinkService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ spaceId: string }> };

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Nincs jogosultság a Drop tér projektkapcsolatainak kezeléséhez.", code: "DROP_SPACE_ADMIN_UNAUTHORIZED" },
    { status: 401, headers: dropNoStoreHeaders() },
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    assertDropFeatureEnabled("spacesEnabled");
    const { spaceId } = await context.params;
    const result = await listDropSpaceProjectOptions(spaceId);
    return NextResponse.json({ ok: true, version: "DROP 1.2.12", ...result }, { headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    assertDropFeatureEnabled("spacesEnabled");
    const { spaceId } = await context.params;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Érvénytelen projektkapcsolati kérés.", code: "DROP_SPACE_PROJECT_INPUT_INVALID" },
        { status: 400, headers: dropNoStoreHeaders() },
      );
    }
    const result = await linkDropSpaceProject(spaceId, body.projectId, {
      syncToDock: body.syncToDock !== false,
      allowDockPackageCreation: body.allowDockPackageCreation !== false,
      archiveToDrive: body.archiveToDrive === true,
      driveTargetFolderId: typeof body.driveTargetFolderId === "string" ? body.driveTargetFolderId : null,
    });
    return NextResponse.json(
      { ok: true, version: "DROP 1.2.12", ...result },
      { status: result.created ? 201 : 200, headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    assertDropFeatureEnabled("spacesEnabled");
    const { spaceId } = await context.params;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const result = await unlinkDropSpaceProject(spaceId, body?.projectId);
    return NextResponse.json({ ok: true, version: "DROP 1.2.12", ...result }, { headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}
