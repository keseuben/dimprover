import { type NextRequest, NextResponse } from "next/server";
import { resolveProjectCoreAuth } from "@/app/lib/project-core/auth";
import { projectCoreErrorResponse } from "@/app/lib/project-core/api";
import { createProject, listAccessibleProjects } from "@/app/lib/project-core/store";
import { normalizeDriveCoreError } from "@/app/lib/drive-core/errors";
import { DRIVE_PROJECT_PROVISIONING_VERSION, provisionProjectDrive } from "@/app/lib/drive-core/projectProvisioning";
import { provisionProjectIdentityBridge } from "@/app/lib/identity-core/projectProvisioning";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import { hasPersonalDriveAccess } from "@/app/lib/dimpro-auth/repository";
import { getVerifiedAuthUserIdentity } from "@/app/lib/dimpro-auth/user-identities";

export async function GET(request: NextRequest) {
  const authResult = await resolveProjectCoreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json({ ok: false, error: authResult.error }, { status: authResult.status });
  }
  try {
    const projects = await listAccessibleProjects(authResult.actor.userAliases);
    return NextResponse.json({ ok: true, projects });
  } catch (error) {
    return projectCoreErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const authResult = await resolveProjectCoreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json({ ok: false, error: authResult.error }, { status: authResult.status });
  }

  const canCreateProject = await hasPersonalDriveAccess(authResult.actor.userId).catch(() => false);
  if (!canCreateProject) {
    return NextResponse.json({
      ok: false,
      error: "PROJECT_CREATE_ENTITLEMENT_REQUIRED",
      message: "A projekt-only meghívotti hozzáférés nem jogosít új projekt létrehozására.",
    }, { status: 403, headers: { "cache-control": "no-store" } });
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  }

  try {
    const actingIdentityId = typeof input.actingIdentityId === "string" ? input.actingIdentityId.trim() : "";
    if (actingIdentityId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actingIdentityId)) {
      return NextResponse.json({
        ok: false,
        error: "PROJECT_CREATE_IDENTITY_INVALID",
        message: "A projektindítási identitás azonosítója érvénytelen.",
      }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    const actingIdentity = await getVerifiedAuthUserIdentity(authResult.actor.userId, actingIdentityId || null);
    if (!actingIdentity) {
      return NextResponse.json({
        ok: false,
        error: "PROJECT_CREATE_IDENTITY_REQUIRED",
        message: actingIdentityId
          ? "A kiválasztott projektindítási identitás nem hitelesített vagy nem ehhez a fiókhoz tartozik."
          : "A projekt létrehozásához legalább egy hitelesített e-mail-identitás szükséges.",
      }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    const result = await createProject(input, {
      userId: authResult.actor.userId,
      displayName: actingIdentity.displayName || authResult.actor.displayName,
      email: actingIdentity.email,
      organizationName: actingIdentity.organizationName,
      actingIdentityId: actingIdentity.id,
      identityType: actingIdentity.identityType,
    });
    if (!result.ok) return NextResponse.json(result, { status: 400 });

    let driveProvisioning: Awaited<ReturnType<typeof provisionProjectDrive>> | {
      ok: false;
      version: string;
      projectId: string;
      ready: false;
      retryRequired: true;
      error: string;
      code: string;
    };
    try {
      driveProvisioning = await provisionProjectDrive(result.project.id, authResult.actor.userId);
    } catch (driveError) {
      const normalized = normalizeDriveCoreError(driveError);
      driveProvisioning = {
        ok: false,
        version: DRIVE_PROJECT_PROVISIONING_VERSION,
        projectId: result.project.id,
        ready: false,
        retryRequired: true,
        error: normalized.body.error,
        code: normalized.body.code,
      };
    }

    let identityProvisioning: Awaited<ReturnType<typeof provisionProjectIdentityBridge>> | {
      ok: false;
      version: string;
      projectId: string;
      ready: false;
      retryRequired: true;
      error: string;
      code: string;
    };
    if (driveProvisioning.ok && driveProvisioning.ready && driveProvisioning.incomingDropFolder) {
      try {
        identityProvisioning = await provisionProjectIdentityBridge({
          projectId: result.project.id,
          actorUserId: authResult.actor.userId,
          driveFolderId: driveProvisioning.incomingDropFolder.id,
          incomingFolderName: driveProvisioning.incomingDropFolder.name,
        });
      } catch (identityError) {
        identityProvisioning = {
          ok: false,
          version: "1.0.0",
          projectId: result.project.id,
          ready: false,
          retryRequired: true,
          error: identityError instanceof DimproIdentityError
            ? identityError.message
            : "A canonical DIMPRO projektkapcsolat inicializálása átmenetileg sikertelen.",
          code: identityError instanceof DimproIdentityError
            ? identityError.code
            : "DIMPRO_PROJECT_IDENTITY_PROVISIONING_FAILED",
        };
      }
    } else {
      identityProvisioning = {
        ok: false,
        version: "1.0.0",
        projectId: result.project.id,
        ready: false,
        retryRequired: true,
        error: "A canonical DIMPRO projektkapcsolat a Drive provisioning befejezése után hozható létre.",
        code: "DIMPRO_PROJECT_IDENTITY_DRIVE_PREREQUISITE",
      };
    }

    return NextResponse.json({ ...result, actingIdentity, driveProvisioning, identityProvisioning }, { status: 201 });
  } catch (error) {
    return projectCoreErrorResponse(error);
  }
}
