import {
  bootstrapDriveProject,
  createDriveFolder,
  listDriveTree,
} from "./databaseRepository";
import { DriveCoreRepositoryError } from "./errors";

export const DRIVE_PROJECT_PROVISIONING_VERSION = "1.1.0";
export const DRIVE_INCOMING_DROP_FOLDER_NAME = "Beérkező Drop";
export const DRIVE_INCOMING_DROP_FOLDER_SORT_ORDER = 70;

export type DriveProjectProvisioningState = {
  version: string;
  projectId: string;
  ready: boolean;
  folderCount: number;
  incomingDropFolder: {
    id: string;
    name: string;
    path: string;
  } | null;
};

async function readProvisioningState(projectId: string): Promise<DriveProjectProvisioningState> {
  const tree = await listDriveTree(projectId);
  const incoming = tree.folders.find((folder) =>
    folder.parentId === null
    && folder.name.localeCompare(DRIVE_INCOMING_DROP_FOLDER_NAME, "hu-HU", { sensitivity: "base" }) === 0,
  ) || null;
  return {
    version: DRIVE_PROJECT_PROVISIONING_VERSION,
    projectId,
    ready: tree.folders.length > 0 && Boolean(incoming),
    folderCount: tree.folders.length,
    incomingDropFolder: incoming ? { id: incoming.id, name: incoming.name, path: incoming.path } : null,
  };
}

export async function getProjectDriveProvisioningState(projectId: string) {
  return readProvisioningState(projectId);
}

export async function provisionProjectDrive(projectId: string, actorUserId: string) {
  const bootstrap = await bootstrapDriveProject(projectId, actorUserId);
  let state = await readProvisioningState(projectId);
  let incomingCreated = false;

  if (!state.incomingDropFolder) {
    const created = await createDriveFolder(projectId, {
      name: DRIVE_INCOMING_DROP_FOLDER_NAME,
      parentId: null,
      sortOrder: DRIVE_INCOMING_DROP_FOLDER_SORT_ORDER,
    }, actorUserId);
    if (!created.ok) {
      // Idempotens retry: párhuzamos provisioning esetén a mappa közben létrejöhetett.
      state = await readProvisioningState(projectId);
      if (!state.incomingDropFolder) throw new DriveCoreRepositoryError(created.error, "DRIVE_PROJECT_PROVISIONING_INCOMING_FOLDER_FAILED", 503);
    } else {
      incomingCreated = true;
      state = await readProvisioningState(projectId);
    }
  }

  return {
    ok: true as const,
    version: DRIVE_PROJECT_PROVISIONING_VERSION,
    projectId,
    ready: state.ready,
    bootstrap,
    incomingDropFolder: state.incomingDropFolder,
    incomingCreated,
    folderCount: state.folderCount,
  };
}
