import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import {
  createPartnerProjectDraft,
  listPartnerProjects,
  PartnerDevelopmentError,
} from "@/app/lib/dev-center/partner-projects";
import { engineUnauthorized } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function partnerErrorResponse(error: unknown) {
  if (error instanceof PartnerDevelopmentError) {
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code, details: error.details },
      { status: error.status, headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : "Ismeretlen Partner Development Plane hiba." },
    { status: 500, headers: { "cache-control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return engineUnauthorized();
  try {
    const snapshot = await listPartnerProjects();
    return NextResponse.json(
      { ok: true, ...snapshot },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return partnerErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) return engineUnauthorized();
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const result = await createPartnerProjectDraft(body);
    return NextResponse.json(
      { ok: true, ...result },
      { status: result.result.created === true ? 201 : 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return partnerErrorResponse(error);
  }
}
