import { type NextRequest, NextResponse } from "next/server";
import { listPersonalDriveFavoriteRefIds, setPersonalDriveFavorite } from "@/app/lib/content-core/personalFavorites";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown, fallback: string) {
  const status = error instanceof DimproIdentityError ? error.status : 500;
  const code = error instanceof DimproIdentityError ? error.code : "PERSONAL_DRIVE_FAVORITES_FAILED";
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : fallback, code }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const access = await resolvePersonalDriveContentActor(request);
  if (!access.ok) return access.response;
  try {
    const documentIds = await listPersonalDriveFavoriteRefIds(access.contentUserId);
    return NextResponse.json({ ok: true, documentIds }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "A Saját Drive kedvencei nem tölthetők be.");
  }
}

export async function PUT(request: NextRequest) {
  const access = await resolvePersonalDriveContentActor(request);
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => null) as { documentId?: unknown; favorite?: unknown } | null;
  const documentId = typeof body?.documentId === "string" ? body.documentId.trim() : "";
  if (!documentId || typeof body?.favorite !== "boolean") {
    return NextResponse.json({ ok: false, error: "A documentId és favorite mező kötelező." }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  try {
    const documentIds = await setPersonalDriveFavorite({ userId: access.contentUserId, refId: documentId, favorite: body.favorite });
    return NextResponse.json({ ok: true, documentId, favorite: body.favorite, documentIds }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "A Saját Drive kedvenc állapota nem módosítható.");
  }
}
