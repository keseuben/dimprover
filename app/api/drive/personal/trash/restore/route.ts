import { type NextRequest, NextResponse } from "next/server";
import { validateSameOriginMutation } from "@/app/lib/dimpro-auth/security";
import { restoreUserContentRefs } from "@/app/lib/content-core/repository";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!validateSameOriginMutation(request.headers)) return NextResponse.json({ ok: false, error: "AUTH_ORIGIN_DENIED" }, { status: 403, headers: { "cache-control": "no-store" } });
  const access = await resolvePersonalDriveContentActor(request);
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => null) as { refIds?: unknown } | null;
  const refIds = Array.isArray(body?.refIds) ? body.refIds.filter((value): value is string => typeof value === "string") : [];
  try {
    const result = await restoreUserContentRefs({ userId: access.contentUserId, refIds });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof DimproIdentityError ? error.status : 500;
    const code = error instanceof DimproIdentityError ? error.code : "PERSONAL_DRIVE_RESTORE_FAILED";
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A visszaállítás sikertelen.", code }, { status, headers: { "cache-control": "no-store" } });
  }
}
