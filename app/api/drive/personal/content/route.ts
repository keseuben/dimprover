import { type NextRequest, NextResponse } from "next/server";
import { listUserContentItems } from "@/app/lib/content-core/repository";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await resolvePersonalDriveContentActor(request);
  if (!access.ok) return access.response;
  try {
    const params = request.nextUrl.searchParams;
    const offsetInput = params.get("offset") || "0";
    if (!/^\d{1,6}$/.test(offsetInput) || Number(offsetInput) > 100_000) {
      return NextResponse.json({ ok: false, error: "PERSONAL_CONTENT_OFFSET_INVALID" },
        { status: 400, headers: { "cache-control": "no-store" } });
    }
    const offset = Number(offsetInput);
    const { items: rows, nextOffset } = await listUserContentItems({
      userId: access.contentUserId, limit: 200, offset,
    });
    const items = rows.map(({ ref, object }) => ({
      id: ref.id,
      objectId: object.id,
      name: ref.display_name || object.display_name || object.original_name || "DIMPRO fájl",
      originalName: object.original_name,
      mimeType: object.mime_type,
      sizeBytes: object.size_bytes,
      sha256: object.sha256,
      sourceSystem: ref.source_system,
      folderId: ref.folder_id,
      retainedIndependently: ref.retained_independently,
      securityStatus: object.security_status,
      virusScanStatus: object.virus_scan_status,
      createdAt: ref.created_at,
      updatedAt: ref.updated_at,
    }));
    return NextResponse.json({
      ok: true,
      workspace: { type: "PERSONAL", storageScope: "USER_ROOT", folderTree: true },
      items,
      nextOffset,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof DimproIdentityError ? error.status : 500;
    const code = error instanceof DimproIdentityError ? error.code : "PERSONAL_DRIVE_CONTENT_FAILED";
    const message = error instanceof Error ? error.message : "A Saját Drive tartalma nem tölthető be.";
    return NextResponse.json({ ok: false, error: message, code }, { status, headers: { "cache-control": "no-store" } });
  }
}
