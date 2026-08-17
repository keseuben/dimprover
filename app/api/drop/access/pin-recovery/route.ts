import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { requestDropPinRecovery } from "@/app/lib/drop/dropPinRecovery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const genericMessage = "A kérelmet fogadtuk. Ha a csomagkód és az e-mail-cím jogosult, az új PIN e-mailben érkezik. A korábbi PIN csak sikeres küldés után válik érvénytelenné.";

export async function POST(request: NextRequest) {
  const requestId = `pinrec_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  try {
    assertDropFeatureEnabled("accessGateEnabled");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const result = await requestDropPinRecovery({ publicCode: body?.publicCode, email: body?.email, requestId });
    console.info("DROP PIN recovery request:", JSON.stringify({
      requestId,
      outcome: result.outcome,
      delivered: result.delivered,
      rateLimited: result.rateLimited,
      packageId: result.packageId,
    }));
  } catch (error) {
    console.error("DROP PIN recovery failed:", JSON.stringify({
      requestId,
      error: error instanceof Error ? error.message : "unknown error",
    }));
  }
  return NextResponse.json(
    { ok: true, version: "DROP 1.2.13", requestId, message: genericMessage },
    { status: 202, headers: dropNoStoreHeaders() },
  );
}
