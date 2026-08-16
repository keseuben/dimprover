import { type NextRequest, NextResponse } from "next/server";
import { resolveProjectCoreAuth } from "@/app/lib/project-core/auth";
import { projectCoreErrorResponse } from "@/app/lib/project-core/api";
import { createProject, listAccessibleProjects } from "@/app/lib/project-core/store";
import { normalizeDriveCoreError } from "@/app/lib/drive-core/errors";
import { provisionProjectDrive } from "@/app/lib/drive-core/projectProvisioning";
import { provisionProjectIdentityBridge } from "@/app/lib/identity-core/projectProvisioning";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

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

  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  }

  try {
    const result = await createProject(input, {
      userId: authResult.actor.userId,
      displayName: authResult.actor.displayName,
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
        version: "1.1.0",
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

    return NextResponse.json({ ...result, driveProvisioning, identityProvisioning }, { status: 201 });
  } catch (error) {
    return projectCoreErrorResponse(error);
  }
}
