import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import {
  getDriveFolderPasswordGateStatus,
  requireDriveFolderAclAccess,
} from "@/app/lib/drive-core/folderAccess";
import {
  mergeDriveFolderUnlockGrant,
  parseDriveFolderUnlockToken,
  signDriveFolderUnlockToken,
  verifyDriveFolderPassword,
} from "@/app/lib/drive-core/folderPasswordCrypto";
import {
  getDriveFolderPasswordAttemptState,
  getDriveFolderPasswordRecord,
  recordDriveFolderPasswordFailure,
  recordDriveFolderPasswordUnlock,
} from "@/app/lib/drive-core/folderPasswordRepository";
import {
  DRIVE_FOLDER_UNLOCK_COOKIE,
  DRIVE_FOLDER_UNLOCK_COOKIE_OPTIONS,
} from "@/app/lib/drive-core/folderPasswordSession";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = { params: Promise<{ projectId: string; folderId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId, folderId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "project.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  }

  try {
    await requireDriveFolderAclAccess(projectId, folderId, access.access);
    const status = await getDriveFolderPasswordGateStatus(projectId, folderId);
    if (!status.locked || !status.gateFolderId) {
      return NextResponse.json({ ok: true, alreadyUnlocked: true, status }, { headers: { "cache-control": "no-store" } });
    }

    const gateFolderId = status.gateFolderId;
    await requireDriveFolderAclAccess(projectId, gateFolderId, access.access);
    const passwordRecord = await getDriveFolderPasswordRecord(projectId, gateFolderId);
    if (!passwordRecord) {
      return NextResponse.json({ ok: false, error: "A mappajelszó-védelem állapota megváltozott." }, { status: 409 });
    }

    const attempt = await getDriveFolderPasswordAttemptState(projectId, gateFolderId, access.actor.userId);
    if (attempt.locked) {
      return NextResponse.json({
        ok: false,
        error: "Túl sok hibás próbálkozás. A mappa feloldása ideiglenesen zárolva van.",
        code: "DRIVE_FOLDER_PASSWORD_LOCKED_OUT",
        lockedUntil: attempt.lockedUntil,
      }, { status: 429, headers: { "cache-control": "no-store" } });
    }

    const password = typeof body.password === "string" ? body.password : "";
    const passwordMatches = password.length >= 8
      && password.length <= 128
      && verifyDriveFolderPassword(password, passwordRecord.passwordHash);

    if (!passwordMatches) {
      const failure = await recordDriveFolderPasswordFailure(projectId, gateFolderId, access.actor.userId);
      return NextResponse.json({
        ok: false,
        error: failure.locked
          ? "Túl sok hibás próbálkozás. A mappa feloldása ideiglenesen zárolva van."
          : "Hibás mappajelszó.",
        code: failure.locked ? "DRIVE_FOLDER_PASSWORD_LOCKED_OUT" : "DRIVE_FOLDER_PASSWORD_INVALID",
        failureCount: failure.failureCount,
        attemptsRemaining: Math.max(0, passwordRecord.maxAttempts - failure.failureCount),
        lockedUntil: failure.lockedUntil,
      }, {
        status: failure.locked ? 429 : 401,
        headers: { "cache-control": "no-store" },
      });
    }

    await recordDriveFolderPasswordUnlock(
      projectId,
      gateFolderId,
      passwordRecord.passwordVersion,
      access.actor.userId,
    );

    const expiresAt = Date.now() + passwordRecord.unlockTtlMinutes * 60 * 1000;
    const existing = parseDriveFolderUnlockToken(request.cookies.get(DRIVE_FOLDER_UNLOCK_COOKIE)?.value);
    const grants = mergeDriveFolderUnlockGrant(existing, {
      projectId,
      folderId: gateFolderId,
      passwordVersion: passwordRecord.passwordVersion,
      expiresAt,
    });
    const token = signDriveFolderUnlockToken(grants);

    const response = NextResponse.json({
      ok: true,
      folderId: gateFolderId,
      passwordVersion: passwordRecord.passwordVersion,
      expiresAt,
      unlockTtlMinutes: passwordRecord.unlockTtlMinutes,
    }, { headers: { "cache-control": "no-store" } });
    response.cookies.set(DRIVE_FOLDER_UNLOCK_COOKIE, token, DRIVE_FOLDER_UNLOCK_COOKIE_OPTIONS);
    return response;
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
