import { type NextRequest, NextResponse } from "next/server";
import { getUserContentItemByRefId } from "@/app/lib/content-core/repository";
import { createDriveSignedGetUrl } from "@/app/lib/drive-core/s3ObjectStorage";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, context: { params: Promise<{ refId: string }> }) {
  const access = await resolvePersonalDriveContentActor(request);
  if (!access.ok) return access.response;
  try {
    const { refId } = await context.params;
    if (!UUID_RE.test(refId)) return NextResponse.json({ ok: false, error: "PERSONAL_DRIVE_REF_INVALID" }, { status: 400, headers: { "cache-control": "no-store" } });
    const item = await getUserContentItemByRefId({ userId: access.contentUserId, refId });
    if (!item) return NextResponse.json({ ok: false, error: "PERSONAL_DRIVE_FILE_NOT_FOUND" }, { status: 404, headers: { "cache-control": "no-store" } });
    if (item.object.security_status !== "clean" || item.object.virus_scan_status !== "clean") {
      return NextResponse.json({ ok: false, error: "PERSONAL_DRIVE_FILE_NOT_CLEAN" }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    const signed = await createDriveSignedGetUrl({
      storageKey: item.object.storage_key,
      bucket: item.object.storage_bucket,
      fileName: item.ref.display_name || item.object.original_name || item.object.display_name,
      mimeType: item.object.mime_type,
      disposition: "attachment",
    });
    return NextResponse.json({ ok: true, download: signed }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof DimproIdentityError ? error.status : 500;
    const code = error instanceof DimproIdentityError ? error.code : "PERSONAL_DRIVE_DOWNLOAD_FAILED";
    const message = error instanceof Error ? error.message : "A Saját Drive fájl nem tölthető le.";
    return NextResponse.json({ ok: false, error: message, code }, { status, headers: { "cache-control": "no-store" } });
  }
}
