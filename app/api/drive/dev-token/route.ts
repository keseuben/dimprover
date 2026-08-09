import { NextRequest, NextResponse } from "next/server";
import {
  getDriveDevTokenFilePath,
  getDriveDevTokenForAdmin,
} from "@/app/lib/drive/driveApi";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) {
    return NextResponse.json(
      {
        ok: false,
        error: "Nincs jogosultság a DIMPRO Drive fejlesztői token lekéréséhez.",
        authHint: "x-dimpro-license-admin-key header szükséges.",
      },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const token = await getDriveDevTokenForAdmin();

  return NextResponse.json(
    {
      ok: true,
      token,
      tokenFile: getDriveDevTokenFilePath(),
      headerName: "x-dimpro-drive-dev-token",
      apiRoot: "https://dimprover.hu/api/drive",
      warning:
        "Ez csak fejlesztői token a Drive API MVP teszteléséhez. Éles ügyfélkliensben hosszú életű szerver token nem tárolható.",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
