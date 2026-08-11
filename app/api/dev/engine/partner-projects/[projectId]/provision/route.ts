import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { PartnerDevelopmentError } from "@/app/lib/dev-center/partner-projects";
import { provisionPartnerProject } from "@/app/lib/dev-center/partner-provisioning";
import { engineUnauthorized } from "../../../_shared";

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
    { ok: false, error: error instanceof Error ? error.message : "Ismeretlen partner provisioning hiba." },
    { status: 500, headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  if (!(await isDevCenterAuthorized(request.headers, false))) return engineUnauthorized();
  try {
    const { projectId } = await context.params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const actor = typeof body.createdBy === "string" && body.createdBy.trim() ? body.createdBy.trim() : "BenjAdmin";
    const result = await provisionPartnerProject(projectId, actor);
    return NextResponse.json(
      { ok: true, ...result },
      { status: result.ready ? 200 : 202, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
