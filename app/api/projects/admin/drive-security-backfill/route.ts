import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import {
  executeDriveSecurityBackfill,
  getDriveSecurityBackfillPlan,
} from "@/app/lib/drive-core/securityBackfillService";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const CONFIRMATION = "REQUARANTINE_LEGACY_DRIVE";

function parseLimit(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : fallback;
}

function parseVersionIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, 25);
}

async function authorized(request: NextRequest) {
  return isLicenseAdminAuthorized(request.headers);
}

export async function GET(request: NextRequest) {
  if (!(await authorized(request))) {
    return NextResponse.json({ ok: false, error: "Nincs licencadmin-jogosultság a DRIVE security backfill tervhez." }, { status: 401 });
  }
  try {
    const projectId = request.nextUrl.searchParams.get("projectId")?.trim() || null;
    const limit = parseLimit(request.nextUrl.searchParams.get("limit"), 50);
    const plan = await getDriveSecurityBackfillPlan({ projectId, limit });
    return NextResponse.json({ ...plan, execute: false, confirmationRequired: CONFIRMATION }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!(await authorized(request))) {
    return NextResponse.json({ ok: false, error: "Nincs licencadmin-jogosultság a DRIVE security backfill végrehajtásához." }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });

  const projectId = typeof body.projectId === "string" ? body.projectId.trim() || null : null;
  const versionIds = parseVersionIds(body.versionIds);
  const limit = parseLimit(body.limit, 5);
  const execute = body.execute === true;

  try {
    if (!execute) {
      const plan = await getDriveSecurityBackfillPlan({ projectId, versionIds, limit: Math.min(limit, 100) });
      return NextResponse.json({ ...plan, execute: false, confirmationRequired: CONFIRMATION }, {
        headers: { "cache-control": "no-store" },
      });
    }
    if (body.confirm !== CONFIRMATION) {
      return NextResponse.json({
        ok: false,
        error: `A végrehajtáshoz explicit confirm=${CONFIRMATION} szükséges.`,
        code: "DRIVE_SECURITY_BACKFILL_CONFIRMATION_REQUIRED",
      }, { status: 400 });
    }
    if (!projectId && !versionIds.length) {
      return NextResponse.json({
        ok: false,
        error: "Végrehajtáskor projectId vagy explicit versionIds megadása kötelező.",
        code: "DRIVE_SECURITY_BACKFILL_SCOPE_REQUIRED",
      }, { status: 400 });
    }

    const result = await executeDriveSecurityBackfill({
      projectId,
      versionIds,
      limit: Math.min(limit, 10),
      actorUserId: "license-admin-drive-security-backfill",
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
