import { NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import { reissueDropPackageToken } from "@/app/lib/drop/dropAdminService";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { supabaseDropAdminRepository } from "@/app/lib/drop/dropSupabaseAdminRepository";
import {
  parseDropAccessPurposeStrict,
  parseDropPackageId,
} from "@/app/lib/drop/dropValidation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ packageId: string; purpose: string }>;
};

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság új Drop hozzáférési link kiadásához.",
      code: "DROP_ADMIN_UNAUTHORIZED",
    },
    { status: 401, headers: dropNoStoreHeaders() },
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  try {
    assertDropFeatureEnabled("packageEngineEnabled");
    const params = await context.params;
    const packageId = parseDropPackageId(params.packageId);
    const purpose = parseDropAccessPurposeStrict(params.purpose);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const expiresAt = typeof body.expiresAt === "string" ? body.expiresAt : undefined;

    const issued = await reissueDropPackageToken(supabaseDropAdminRepository, {
      packageId,
      purpose,
      expiresAt,
      actor: {
        userId: "license-admin",
        name: "DIMPRO licencadmin",
      },
    });

    return NextResponse.json(
      {
        ok: true,
        version: "DROP 0.2.0",
        issued,
        warning: "A nyers hozzáférési token és a teljes link csak ebben a válaszban jelenik meg. Az adatbázis kizárólag HMAC-hash értéket tárol.",
      },
      { status: 201, headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}
