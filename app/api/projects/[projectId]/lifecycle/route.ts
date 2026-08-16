import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { projectCoreErrorResponse } from "@/app/lib/project-core/api";
import { changeProjectLifecycle } from "@/app/lib/project-core/store";
import type { ProjectLifecycleStatus } from "@/app/lib/project-core/types";
import { normalizeDriveCoreError } from "@/app/lib/drive-core/errors";
import { getProjectDriveProvisioningState, provisionProjectDrive } from "@/app/lib/drive-core/projectProvisioning";
import { provisionProjectIdentityBridge } from "@/app/lib/identity-core/projectProvisioning";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

type RouteContext = { params: Promise<{ projectId: string }> };
const ALLOWED_STATUSES: ProjectLifecycleStatus[] = ["DRAFT","ACTIVE","CLOSING","READ_ONLY","ARCHIVED","DELETION_SCHEDULED","DELETED"];

type IdentitySyncFailure = {
  ok: false;
  version: "1.0.0";
  projectId: string;
  ready: false;
  retryRequired: true;
  error: string;
  code: string;
};

async function syncIdentityLifecycle(projectId: string, actorUserId: string, nextStatus: ProjectLifecycleStatus) {
  try {
    let drive = await getProjectDriveProvisioningState(projectId);
    if ((!drive.ready || !drive.incomingDropFolder) && nextStatus !== "DELETED") {
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
        error: "A canonical projekt-életciklus szinkronhoz a Beérkező Drop Drive célmappa szükséges.",
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
    const driveError = normalizeDriveCoreError(error);
    if (driveError.body.code !== "DRIVE_CORE_UNEXPECTED_ERROR") {
      return {
        ok: false,
        version: "1.0.0",
        projectId,
        ready: false,
        retryRequired: true,
        error: driveError.body.error,
        code: driveError.body.code,
      } satisfies IdentitySyncFailure;
    }
    return {
      ok: false,
      version: "1.0.0",
      projectId,
      ready: false,
      retryRequired: true,
      error: error instanceof DimproIdentityError
        ? error.message
        : "A canonical DIMPRO projekt-életciklus szinkron átmenetileg sikertelen.",
      code: error instanceof DimproIdentityError
        ? error.code
        : "DIMPRO_PROJECT_IDENTITY_LIFECYCLE_SYNC_FAILED",
    } satisfies IdentitySyncFailure;
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const accessResult = await requireProjectPermission(request, projectId, "project.manage_lifecycle");
  if (!accessResult.ok) return NextResponse.json({ ok: false, error: accessResult.error }, { status: accessResult.status });
  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  }
  const nextStatus = String(input.nextStatus || "") as ProjectLifecycleStatus;
  if (!ALLOWED_STATUSES.includes(nextStatus)) return NextResponse.json({ ok: false, error: "Érvénytelen projektállapot." }, { status: 400 });
  try {
    const result = await changeProjectLifecycle(projectId, nextStatus, accessResult.actor.userId);
    if (!result.ok) return NextResponse.json(result, { status: 409 });
    const identityProvisioning = await syncIdentityLifecycle(projectId, accessResult.actor.userId, nextStatus);
    return NextResponse.json({ ...result, identityProvisioning });
  } catch (error) {
    return projectCoreErrorResponse(error);
  }
}
