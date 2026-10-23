import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "cache-control": "private, no-store" };

/**
 * Return a stable, per-central-auth-identity, opaque localStorage namespace.
 * This is NOT an authorization token: every actual receipt lookup must still
 * enforce the caller's current server-side identity and ACL.
 */
export async function GET(request: NextRequest) {
  const access = await resolvePersonalDriveContentActor(request);
  if (!access.ok) return access.response;
  if (process.env.DIMPRO_PRODUCTION_ACCESS !== "DENY"
    || process.env.DIMPRO_AUTH_ENVIRONMENT !== "DEV") {
    return NextResponse.json({ ok: false, code: "PERSONAL_UPLOAD_RECOVERY_DEV_ONLY" },
      { status: 403, headers: HEADERS });
  }
  const recoveryScope = createHash("sha256")
    .update("DIMPRO_DRIVE_PERSONAL_UPLOAD_RECOVERY_V1:")
    .update(access.actor.userId)
    .digest("hex");
  return NextResponse.json({ ok: true, recoveryScope }, { headers: HEADERS });
}
