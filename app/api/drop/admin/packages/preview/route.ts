import { NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { buildDropPackagePreview } from "@/app/lib/drop/dropPackagePreview";
import { parseDropCreatePackageInput } from "@/app/lib/drop/dropValidation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság a Drop csomag-előnézet használatához.",
      code: "DROP_ADMIN_UNAUTHORIZED",
    },
    { status: 401, headers: dropNoStoreHeaders() },
  );
}

export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  try {
    const input = parseDropCreatePackageInput(await request.json().catch(() => null));
    const preview = buildDropPackagePreview(input);
    return NextResponse.json(
      {
        ok: true,
        version: "DROP 0.2.0",
        preview,
        warning: "Ez csak ellenőrző előnézet. Nem készül csomag, PIN, token vagy adatbázisrekord.",
      },
      { headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}
