import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import {
  listPartnerHandoffs,
  preparePartnerHandoff,
} from "@/app/lib/dev-center/partner-handoffs";
import { PartnerDevelopmentError } from "@/app/lib/dev-center/partner-projects";
import { engineUnauthorized } from "../_shared";

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

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return engineUnauthorized();
  try {
    const projectId = request.nextUrl.searchParams.get("projectId") || undefined;
    const result = await listPartnerHandoffs(projectId);
    return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) return engineUnauthorized();
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const handoff = await preparePartnerHandoff(body);
    return NextResponse.json(
      { ok: true, handoff },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
