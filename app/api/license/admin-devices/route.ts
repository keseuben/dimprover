import { NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import {
  applyLicenseDeviceAdminAction,
  getLicenseDeviceSummaries,
} from "@/app/lib/license/admin-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function unauthorized() {
  return json({ ok: false, error: "Nincs jogosultság a licenc-gépkötések kezeléséhez." }, 401);
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  return json({ ok: true, devices: await getLicenseDeviceSummaries() });
}

export async function PATCH(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Érvénytelen gépkezelési kérés." }, 400);
  const result = await applyLicenseDeviceAdminAction(body);
  return json(result, result.ok ? 200 : 400);
}
