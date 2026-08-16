import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { projectCoreErrorResponse } from "@/app/lib/project-core/api";
import { updateProject } from "@/app/lib/project-core/store";
import { getProjectDriveProvisioningState, provisionProjectDrive } from "@/app/lib/drive-core/projectProvisioning";
import { provisionProjectIdentityBridge } from "@/app/lib/identity-core/projectProvisioning";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

type RouteContext = { params: Promise<{ projectId: string }> };

type IdentitySyncFailure = {
  ok: false;
  version: "1.0.0";
  projectId: string;
  ready: false;
  retryRequired: true;
  error: string;
  code: string;
};

async function syncIdentityProject(projectId: string, actorUserId: string) {
  try {
    let drive = await getProjectDriveProvisioningState(projectId);
    if (!drive.ready || !drive.incomingDropFolder) {
      const provisioned = await provisionProjectDrive(projectId, actorUserId);
      drive = {
        version: provisioned.version,
        projectId,
        ready: provisioned.ready,
        folderCount: provisioned.folderCount,
        incomingDropFolder: provisioned.incomingDropFolder,
      };
    }
    if (!drive.ready || !drive.incomingDropFolder) {
      return {
        ok: false,
        version: "1.0.0",
        projectId,
        ready: false,
        retryRequired: true,
        error: "A canonical projekt szinkronhoz a Beérkező Drop Drive célmappa szükséges.",
        code: "DIMPRO_PROJECT_IDENTITY_DRIVE_PREREQUISITE",
      } satisfies IdentitySyncFailure;
    }
    return await provisionProjectIdentityBridge({
      projectId,
      actorUserId,
      driveFolderId: drive.incomingDropFolder.id,
      incomingFolderName: drive.incomingDropFolder.name,
    });
  } catch (error) {
    return {
      ok: false,
      version: "1.0.0",
      projectId,
      ready: false,
      retryRequired: true,
      error: error instanceof DimproIdentityError
        ? error.message
        : "A canonical DIMPRO projekt szinkron átmenetileg sikertelen.",
      code: error instanceof DimproIdentityError
        ? error.code
        : "DIMPRO_PROJECT_IDENTITY_SYNC_FAILED",
    } satisfies IdentitySyncFailure;
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const accessResult = await requireProjectPermission(request, projectId, "project.read");
  if (!accessResult.ok) return NextResponse.json({ ok: false, error: accessResult.error }, { status: accessResult.status });
  return NextResponse.json({ ok: true, project: accessResult.access.project, membership: accessResult.access.membership, permissions: accessResult.access.permissions });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const accessResult = await requireProjectPermission(request, projectId, "project.update");
  if (!accessResult.ok) return NextResponse.json({ ok: false, error: accessResult.error }, { status: accessResult.status });
  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  }
  try {
    const result = await updateProject(projectId, input, accessResult.actor.userId);
    if (!result.ok) return NextResponse.json(result, { status: 404 });
    const identityProvisioning = await syncIdentityProject(projectId, accessResult.actor.userId);
    return NextResponse.json({ ...result, identityProvisioning });
  } catch (error) {
    return projectCoreErrorResponse(error);
  }
}
