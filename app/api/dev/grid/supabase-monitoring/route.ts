import { NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import {
  deleteSupabaseAnalyticsToken,
  getSupabaseMonitoringStatus,
  saveSupabaseAnalyticsToken,
} from "@/app/lib/developer-grid/supabase-monitoring-config";
import { invalidateSupabaseTrafficCache } from "@/app/lib/developer-grid/system-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (payload: unknown, status = 200) => NextResponse.json(payload, { status, headers: { "cache-control": "no-store" } });

async function authorized(request: NextRequest) {
  return isLicenseAdminAuthorized(request.headers);
}

export async function GET(request: NextRequest) {
  if (!(await authorized(request))) return json({ ok: false, error: "Admin jogosultság szükséges a Supabase monitoring beállításához." }, 401);
  return json({ ok: true, status: await getSupabaseMonitoringStatus() });
}

export async function POST(request: NextRequest) {
  if (!(await authorized(request))) return json({ ok: false, error: "Admin jogosultság szükséges a Supabase monitoring beállításához." }, 401);
  let body: { token?: string } = {};
  try { body = await request.json() as { token?: string }; } catch {}
  try {
    const validated = await saveSupabaseAnalyticsToken(body.token || "");
    invalidateSupabaseTrafficCache();
    return json({ ok: true, validated: { projectRef: validated.projectRef, validatedAt: validated.validatedAt }, status: await getSupabaseMonitoringStatus() });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "SUPABASE_MONITORING_SETUP_FAILED";
    return json({ ok: false, code, error: error instanceof Error ? error.message : "A Supabase monitoring token nem menthető." }, code.includes("HTTP_429") ? 429 : code.includes("HTTP_401") ? 401 : code.includes("HTTP_403") ? 403 : 400);
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await authorized(request))) return json({ ok: false, error: "Admin jogosultság szükséges a Supabase monitoring beállításához." }, 401);
  try {
    await deleteSupabaseAnalyticsToken();
    invalidateSupabaseTrafficCache();
    return json({ ok: true, status: await getSupabaseMonitoringStatus() });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "A helyi Supabase monitoring token nem törölhető." }, 409);
  }
}
