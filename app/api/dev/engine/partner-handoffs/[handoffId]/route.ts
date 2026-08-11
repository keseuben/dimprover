import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import {
  transitionPartnerHandoff,
  type PartnerHandoffAction,
} from "@/app/lib/dev-center/partner-handoffs";
import { PartnerDevelopmentError } from "@/app/lib/dev-center/partner-projects";
import { engineUnauthorized } from "../../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof PartnerDevelopmentError) {
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code, details: error.details },
      { status: error.status, headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : "Ismeretlen partnerátadási hiba." },
    { status: 500, headers: { "cache-control": "no-store" } },
  );
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ handoffId: string }> }) {
  if (!(await isDevCenterAuthorized(request.headers, false))) return engineUnauthorized();
  try {
    const { handoffId } = await context.params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action.trim().toUpperCase() as PartnerHandoffAction : "" as PartnerHandoffAction;
    const handoff = await transitionPartnerHandoff(handoffId, action, body);
    return NextResponse.json({ ok: true, handoff }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
