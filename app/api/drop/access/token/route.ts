import { NextRequest, NextResponse } from "next/server";
import { validateDropAccessToken } from "@/app/lib/drop/dropAccess";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { parseDropAccessPurpose } from "@/app/lib/drop/dropValidation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertDropFeatureEnabled("accessGateEnabled");
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const rawToken = String(body?.token || "").trim();
    const expectedPurpose = parseDropAccessPurpose(body?.purpose, "view");
    if (!rawToken || rawToken.length > 180) {
      return NextResponse.json(
        { ok: false, error: "Hiányzó vagy hibás hozzáférési token.", code: "DROP_INVALID_TOKEN_INPUT" },
        { status: 400, headers: dropNoStoreHeaders() },
      );
    }
    const grant = await validateDropAccessToken({ rawToken, expectedPurpose, headers: request.headers });
    return NextResponse.json({ ok: true, grant }, { headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}
