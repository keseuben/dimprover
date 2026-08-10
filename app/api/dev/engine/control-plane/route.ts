import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getBenjadminControlPlaneSnapshot } from "@/app/lib/dev-center/control-plane";
import { engineErrorResponse, engineUnauthorized } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return engineUnauthorized();
  try {
    return NextResponse.json(
      { ok: true, controlPlane: await getBenjadminControlPlaneSnapshot() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return engineErrorResponse(error);
  }
}
