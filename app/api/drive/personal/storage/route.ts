import { type NextRequest, NextResponse } from "next/server";
import { getPersonalDriveStorageQuota } from "@/app/lib/content-core/repository";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await resolvePersonalDriveContentActor(request);
  if (!access.ok) return access.response;
  try {
    const storage = await getPersonalDriveStorageQuota({ userId: access.contentUserId });
    return NextResponse.json({ ok: true, storage }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof DimproIdentityError ? error.status : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A Saját Drive tárhelyadat nem tölthető be." }, { status, headers: { "cache-control": "no-store" } });
  }
}
