import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { DriveCoreRepositoryError } from "@/app/lib/drive-core/errors";
import { getProjectDriveProvisioningState, provisionProjectDrive } from "@/app/lib/drive-core/projectProvisioning";
import { dimproIdentityErrorResponse } from "@/app/lib/identity-core/api";
import { getProjectIdentityProvisioningState, provisionProjectIdentityBridge } from "@/app/lib/identity-core/projectProvisioning";

type RouteContext = { params: Promise<{ projectId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "project.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    const provisioning = await getProjectIdentityProvisioningState(projectId);
    return NextResponse.json({ ok: true, provisioning }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "project.update");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    let drive = await getProjectDriveProvisioningState(projectId);
    if (!drive.ready || !drive.incomingDropFolder) {
      const provisioned = await provisionProjectDrive(projectId, access.actor.userId);
      drive = {
        version: provisioned.version,
        projectId,
        ready: provisioned.ready,
        folderCount: provisioned.folderCount,
        incomingDropFolder: provisioned.incomingDropFolder,
      };
    }
    if (!drive.ready || !drive.incomingDropFolder) {
      throw new DriveCoreRepositoryError("A Beérkező Drop Drive célmappa nem áll készen.", "DRIVE_PROJECT_PROVISIONING_INCOMING_FOLDER_MISSING", 503);
    }
    const provisioning = await provisionProjectIdentityBridge({
      projectId,
      actorUserId: access.actor.userId,
      driveFolderId: drive.incomingDropFolder.id,
      incomingFolderName: drive.incomingDropFolder.name,
    });
    return NextResponse.json({ ok: true, provisioning }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DriveCoreRepositoryError) return driveCoreErrorResponse(error);
    return dimproIdentityErrorResponse(error);
  }
}
