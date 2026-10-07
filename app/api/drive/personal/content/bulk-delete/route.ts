import { type NextRequest, NextResponse } from "next/server";
import { validateSameOriginMutation } from "@/app/lib/dimpro-auth/security";
import { listUserContentDeleteDependencies, softRemoveUserContentRefs } from "@/app/lib/content-core/repository";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!validateSameOriginMutation(request.headers)) {
    return NextResponse.json({ ok: false, error: "A kérés forrása nem engedélyezett." }, { status: 403, headers: { "cache-control": "no-store" } });
  }
  const access = await resolvePersonalDriveContentActor(request);
  if (!access.ok) return access.response;
  const input = await request.json().catch(() => null) as { refIds?: unknown; mode?: unknown } | null;
  const refIds = Array.isArray(input?.refIds)
    ? [...new Set(input.refIds.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))]
    : [];
  if (!refIds.length || refIds.length > 500) {
    return NextResponse.json({ ok: false, error: "Legalább 1, legfeljebb 500 Saját Drive fájl jelölhető ki." }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  try {
    const dependencies = await listUserContentDeleteDependencies({ userId: access.contentUserId, refIds });
    if (input?.mode === "preflight") {
      return NextResponse.json({ ok: true, blocked: dependencies.length > 0, dependencies }, { headers: { "cache-control": "no-store" } });
    }
    if (dependencies.length) {
      return NextResponse.json({
        ok: false,
        code: "PERSONAL_DRIVE_DELETE_DEPENDENCY_BLOCKED",
        error: "A kijelölt fájl nem törölhető, mert aktív CsomagBOX-kapcsolata van.",
        dependencies,
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    const result = await softRemoveUserContentRefs({ userId: access.contentUserId, refIds });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof DimproIdentityError ? error.status : 500;
    const code = error instanceof DimproIdentityError ? error.code : "PERSONAL_DRIVE_DELETE_FAILED";
    const dependencies = code === "PERSONAL_DRIVE_DELETE_DEPENDENCY_BLOCKED"
      ? await listUserContentDeleteDependencies({ userId: access.contentUserId, refIds }).catch(() => [])
      : [];
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A Saját Drive törlés sikertelen.", code, dependencies }, { status, headers: { "cache-control": "no-store" } });
  }
}
