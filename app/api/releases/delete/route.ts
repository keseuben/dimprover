import { NextRequest, NextResponse } from "next/server";
import { deleteReleasePackage } from "@/app/lib/downloads/releaseDownloads";
import {
  getLicenseAdminKeyFilePath,
  isLicenseAdminAuthorized,
} from "@/app/lib/license/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság release csomag törléséhez.",
      adminKeyHint: getLicenseAdminKeyFilePath(),
    },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim();

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Hiányzik a törlendő release token." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const result = await deleteReleasePackage(token);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.message },
      { status: result.status, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      fileDeleted: result.fileDeleted,
      deleted: {
        token: result.record.token,
        project: result.record.project,
        version: result.record.version,
        fileName: result.record.fileName,
        sizeBytes: result.record.sizeBytes,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
