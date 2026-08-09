import { NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import { transitionDropPackageStatus } from "@/app/lib/drop/dropAdminService";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { supabaseDropAdminRepository } from "@/app/lib/drop/dropSupabaseAdminRepository";
import { parseDropPackageId, parseDropPackageStatus } from "@/app/lib/drop/dropValidation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ packageId: string }>;
};

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság a Drop csomag állapotának módosításához.",
      code: "DROP_ADMIN_UNAUTHORIZED",
    },
    { status: 401, headers: dropNoStoreHeaders() },
  );
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  try {
    assertDropFeatureEnabled("packageEngineEnabled");
    const { packageId: rawPackageId } = await context.params;
    const packageId = parseDropPackageId(rawPackageId);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const targetStatus = parseDropPackageStatus(body.targetStatus);
    const reason = typeof body.reason === "string" ? body.reason : undefined;

    const result = await transitionDropPackageStatus(supabaseDropAdminRepository, {
      packageId,
      targetStatus,
      reason,
      actor: {
        userId: "license-admin",
        name: "DIMPRO licencadmin",
      },
    });

    return NextResponse.json(
      {
        ok: true,
        version: "DROP 0.2.0",
        changed: result.changed,
        revokedTokenCount: result.revokedTokenCount,
        package: {
          id: result.package.id,
          publicCode: result.package.public_code,
          status: result.package.status,
          updatedAt: result.package.updated_at,
          closedAt: result.package.closed_at,
          expiredAt: result.package.expired_at,
          deletedAt: result.package.deleted_at,
        },
      },
      { headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}
