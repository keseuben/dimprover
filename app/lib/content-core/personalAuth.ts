import { type NextRequest, NextResponse } from "next/server";
import { hasPersonalDriveAccess } from "@/app/lib/dimpro-auth/repository";
import { resolveProjectCoreAuth } from "@/app/lib/project-core/auth";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import { ensurePersonalDriveCanonicalUser } from "./personalIdentity";

export async function resolvePersonalDriveContentActor(request: NextRequest) {
  const auth = await resolveProjectCoreAuth(request);
  if (!auth.ok) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status, headers: { "cache-control": "no-store" } }) };
  }
  try {
    if (!(await hasPersonalDriveAccess(auth.actor.userId))) {
      return { ok: false as const, response: NextResponse.json({ ok: false, error: "PERSONAL_DRIVE_FORBIDDEN" }, { status: 403, headers: { "cache-control": "no-store" } }) };
    }
    const canonical = await ensurePersonalDriveCanonicalUser({
      authUserId: auth.actor.userId,
      email: auth.actor.email,
      displayName: auth.actor.displayName,
    });
    return { ok: true as const, actor: auth.actor, contentUserId: canonical.id };
  } catch (error) {
    const status = error instanceof DimproIdentityError ? error.status : 500;
    const code = error instanceof DimproIdentityError ? error.code : "PERSONAL_DRIVE_IDENTITY_BRIDGE_FAILED";
    const message = error instanceof Error ? error.message : "A Saját Drive felhasználói profilja nem készíthető elő.";
    return { ok: false as const, response: NextResponse.json({ ok: false, error: message, code }, { status, headers: { "cache-control": "no-store" } }) };
  }
}
