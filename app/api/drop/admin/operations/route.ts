import { type NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { getDropOperationsResponse, runDropOperationsMonitor } from "@/app/lib/drop/operations/dropOperationsService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Nincs jogosultság a Drop üzemeltetési központhoz.", code: "DROP_OPERATIONS_UNAUTHORIZED" },
    { status: 401, headers: dropNoStoreHeaders() },
  );
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    const limit = Math.max(1, Math.min(120, Number(request.nextUrl.searchParams.get("limit") || 60)));
    const response = await getDropOperationsResponse(limit);
    return NextResponse.json(response, { headers: dropNoStoreHeaders() });
  } catch (error) { return dropErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action !== "run") {
      return NextResponse.json(
        { ok: false, error: "Érvénytelen üzemeltetési művelet.", code: "DROP_OPERATIONS_ACTION_INVALID" },
        { status: 400, headers: dropNoStoreHeaders() },
      );
    }
    const snapshot = await runDropOperationsMonitor({
      source: "manual",
      deepStorageAudit: body.deepStorageAudit === true,
      notify: body.notify !== false,
    });
    return NextResponse.json({ ok: true, version: "DROP 1.2.11", snapshot }, { headers: dropNoStoreHeaders() });
  } catch (error) { return dropErrorResponse(error); }
}
