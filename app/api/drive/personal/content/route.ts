import { type NextRequest, NextResponse } from "next/server";
import { hasPersonalDriveAccess } from "@/app/lib/dimpro-auth/repository";
import { listUserContentItems } from "@/app/lib/content-core/repository";
import { resolveProjectCoreAuth } from "@/app/lib/project-core/auth";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await resolveProjectCoreAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status, headers: { "cache-control": "no-store" } });
  try {
    if (!(await hasPersonalDriveAccess(auth.actor.userId))) {
      return NextResponse.json({ ok: false, error: "PERSONAL_DRIVE_FORBIDDEN" }, { status: 403, headers: { "cache-control": "no-store" } });
    }
    const rows = await listUserContentItems({ userId: auth.actor.userId, limit: 250 });
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
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof DimproIdentityError ? error.status : 500;
    const code = error instanceof DimproIdentityError ? error.code : "PERSONAL_DRIVE_CONTENT_FAILED";
    const message = error instanceof Error ? error.message : "A Saját Drive tartalma nem tölthető be.";
    return NextResponse.json({ ok: false, error: message, code }, { status, headers: { "cache-control": "no-store" } });
  }
}
