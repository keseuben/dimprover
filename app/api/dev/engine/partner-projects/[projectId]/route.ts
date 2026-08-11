import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getPartnerProjectById, PartnerDevelopmentError } from "@/app/lib/dev-center/partner-projects";
import { engineUnauthorized } from "../../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return engineUnauthorized();
  try {
    const { projectId } = await context.params;
    const snapshot = await getPartnerProjectById(projectId);
    if (snapshot.health.ready && !snapshot.project) {
      return NextResponse.json(
        { ok: false, error: "A partnerprojekt nem található.", code: "PARTNER_PROJECT_NOT_FOUND" },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json({ ok: true, ...snapshot }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
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
}
