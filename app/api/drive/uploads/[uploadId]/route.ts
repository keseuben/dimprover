import { NextRequest, NextResponse } from "next/server";
import { deleteDriveUploadSession, sanitizeDriveId } from "@/app/lib/drive/driveApi";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    uploadId: string;
  }>;
};

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság a DIMPRO Drive upload session törléséhez.",
      authHint: "x-dimpro-license-admin-key header szükséges.",
    },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  const params = await context.params;
  const uploadId = sanitizeDriveId(params.uploadId, "upload");
  const result = await deleteDriveUploadSession(uploadId);

  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
