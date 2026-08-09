import { NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { createDropPackage, listDropPackages } from "@/app/lib/drop/dropRepository";
import { parseDropCreatePackageInput } from "@/app/lib/drop/dropValidation";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { sendDropPackageInvitations } from "@/app/lib/drop/dropEmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Nincs jogosultság a Drop csomagkezelő használatához.", code: "DROP_ADMIN_UNAUTHORIZED" },
    { status: 401, headers: dropNoStoreHeaders() },
  );
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    assertDropFeatureEnabled("packageEngineEnabled");
    const packages = await listDropPackages(50);
    return NextResponse.json({ ok: true, version: "DROP 0.2.0", packages }, { headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    assertDropFeatureEnabled("packageEngineEnabled");
    const input = parseDropCreatePackageInput(await request.json().catch(() => null));
    const created = await createDropPackage(input, {
      userId: "license-admin",
      name: "DIMPRO licencadmin",
    });
    const emailNotification = await sendDropPackageInvitations(created).catch((error) => ({
      enabled: true,
      configured: true,
      kind: "invitation" as const,
      attempted: 0,
      sent: 0,
      failed: 1,
      skipped: 0,
      recipients: [],
      generatedAt: new Date().toISOString(),
      note: error instanceof Error ? error.message : "A Drop meghívó e-mail küldése sikertelen.",
    }));
    return NextResponse.json(
      {
        ok: true,
        version: "DROP 0.2.0",
        created,
        emailNotification,
        warning: "A nyers PIN és hozzáférési tokenek csak ebben a válaszban jelennek meg. Az adatbázis kizárólag hasheket tárol.",
      },
      { status: 201, headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}
