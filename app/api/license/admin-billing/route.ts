import { NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import {
  getLicenseBillingSummaries,
  updateLicenseBillingAdmin,
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
  return json({ ok: false, error: "Nincs jogosultság az előfizetési és számlázási adatok kezeléséhez." }, 401);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  return json({ ok: true, billing: await getLicenseBillingSummaries() });
}

export async function PATCH(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ ok: false, error: "Érvénytelen előfizetési módosítás." }, 400);
  const legacyLicenseId = text(body.legacyLicenseId);
  if (!legacyLicenseId) return json({ ok: false, error: "Hiányzó legacy licencazonosító." }, 400);

  const result = await updateLicenseBillingAdmin(legacyLicenseId, body);
  return json(result, result.ok ? 200 : 404);
}
