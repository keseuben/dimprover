import { NextRequest, NextResponse } from "next/server";
import { openDropPackageWithPin } from "@/app/lib/drop/dropAccess";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { normalizeDropPin } from "@/app/lib/drop/dropCrypto";
import { normalizeDropPublicCode } from "@/app/lib/drop/dropValidation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertDropFeatureEnabled("accessGateEnabled");
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const publicCode = normalizeDropPublicCode(body?.publicCode);
    const pin = normalizeDropPin(body?.pin);
    if (!publicCode || !/^\d{6}$/.test(pin)) {
      return NextResponse.json(
        { ok: false, error: "A csomagkód és a hatjegyű PIN megadása kötelező.", code: "DROP_INVALID_ACCESS_INPUT" },
        { status: 400, headers: dropNoStoreHeaders() },
      );
    }

    const grant = await openDropPackageWithPin({ publicCode, pin, purpose: "view", headers: request.headers });
    return NextResponse.json(
      {
        ok: true,
        grant: {
          publicCode: grant.publicCode,
          title: grant.title,
          mode: grant.mode,
          purpose: grant.purpose,
          tokenHint: grant.tokenHint,
          expiresAt: grant.expiresAt,
          packageExpiresAt: grant.packageExpiresAt,
          redirectPath: grant.redirectPath,
        },
      },
      { headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}
