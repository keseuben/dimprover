import { type NextRequest, NextResponse } from "next/server";
import { listUserRemovedContentItems } from "@/app/lib/content-core/repository";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await resolvePersonalDriveContentActor(request);
  if (!access.ok) return access.response;
  try {
    const rows = await listUserRemovedContentItems({ userId: access.contentUserId, limit: 500 });
    const items = rows.map(({ ref, object }) => ({
      id: ref.id,
      name: ref.display_name || object.display_name || object.original_name || "DIMPRO fájl",
      originalName: object.original_name,
      mimeType: object.mime_type,
      sizeBytes: object.size_bytes,
      sourceSystem: ref.source_system,
      folderId: ref.folder_id,
      deletedAt: ref.updated_at,
    }));
    return NextResponse.json({ ok: true, count: items.length, items }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof DimproIdentityError ? error.status : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A Saját Drive Lomtár nem tölthető be." }, { status, headers: { "cache-control": "no-store" } });
  }
}
