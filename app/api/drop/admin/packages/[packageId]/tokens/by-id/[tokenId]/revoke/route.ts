import { NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import { revokeDropPackageToken } from "@/app/lib/drop/dropAdminService";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { supabaseDropAdminRepository } from "@/app/lib/drop/dropSupabaseAdminRepository";
import { parseDropPackageId, parseDropTokenId } from "@/app/lib/drop/dropValidation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ packageId: string; tokenId: string }>;
};

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság a Drop hozzáférési token visszavonásához.",
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
    const tokenId = parseDropTokenId(params.tokenId);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const reason = typeof body.reason === "string" ? body.reason : undefined;

    const result = await revokeDropPackageToken(supabaseDropAdminRepository, {
      packageId,
      tokenId,
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
        ...result,
      },
      { headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}
