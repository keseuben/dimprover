import { NextRequest, NextResponse } from "next/server";
import {
  estimateHageAi,
  getHageAiStatus,
  getHageAiUsageSummary,
  HageAiGatewayError,
  runHageAi,
  type HageAiGatewayRequest,
} from "@/app/lib/license/hage-ai-gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ operation: string }> },
) {
  const { operation } = await context.params;
  const body = await request.json().catch(() => null) as HageAiGatewayRequest | null;
  if (!body || typeof body !== "object") return json({ ok: false, errorCode: "INVALID_REQUEST", message: "Érvénytelen AI Gateway kérés." }, 400);

  try {
    if (operation === "status") return json(await getHageAiStatus(body));
    if (operation === "estimate") return json(await estimateHageAi(body));
    if (operation === "run") return json(await runHageAi(body));
    if (operation === "usage") return json(await getHageAiUsageSummary(body));
    return json({ ok: false, errorCode: "UNKNOWN_OPERATION", message: "Ismeretlen AI Gateway művelet." }, 404);
  } catch (error) {
    if (error instanceof HageAiGatewayError) {
      return json({ ok: false, errorCode: error.errorCode, message: error.message }, error.statusCode);
    }
    console.error("HAGE AI Gateway hiba:", error);
    return json({ ok: false, errorCode: "HAGE_AI_GATEWAY_ERROR", message: error instanceof Error ? error.message : "Ismeretlen AI Gateway hiba." }, 500);
  }
}
