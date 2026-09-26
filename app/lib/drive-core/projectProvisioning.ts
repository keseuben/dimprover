import {
  bootstrapDriveProject,
  createDriveFolder,
  listDriveTree,
} from "./databaseRepository";
import { DriveCoreRepositoryError } from "./errors";

export const DRIVE_PROJECT_PROVISIONING_VERSION = "1.2.0";
export const DRIVE_INCOMING_DROP_FOLDER_NAME = "Beérkező Drop";
export const DRIVE_INCOMING_DROP_FOLDER_SORT_ORDER = 70;
export const DRIVE_PILOT_FOLDER_NAME = "PILOT";
export const DRIVE_PILOT_FOLDER_SORT_ORDER = 5;

function pilotModeEnabled() {
  return process.env.DRIVE_PILOT_MODE_ENABLED?.trim().toLowerCase() === "true";
}

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
  pilotFolder: {
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
  const pilot = tree.folders.find((folder) =>
    folder.parentId === null
    && folder.name.localeCompare(DRIVE_PILOT_FOLDER_NAME, "hu-HU", { sensitivity: "base" }) === 0,
  ) || null;
  const pilotRequired = pilotModeEnabled();
  return {
    version: DRIVE_PROJECT_PROVISIONING_VERSION,
    projectId,
    ready: tree.folders.length > 0 && Boolean(incoming) && (!pilotRequired || Boolean(pilot)),
    folderCount: tree.folders.length,
    incomingDropFolder: incoming ? { id: incoming.id, name: incoming.name, path: incoming.path } : null,
    pilotFolder: pilot ? { id: pilot.id, name: pilot.name, path: pilot.path } : null,
  };
}

export async function getProjectDriveProvisioningState(projectId: string) {
  return readProvisioningState(projectId);
}

export async function provisionProjectDrive(projectId: string, actorUserId: string) {
  const bootstrap = await bootstrapDriveProject(projectId, actorUserId);
  let state = await readProvisioningState(projectId);
  let incomingCreated = false;
  let pilotCreated = false;

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

  if (pilotModeEnabled() && !state.pilotFolder) {
    const created = await createDriveFolder(projectId, {
      name: DRIVE_PILOT_FOLDER_NAME,
      parentId: null,
      sortOrder: DRIVE_PILOT_FOLDER_SORT_ORDER,
    }, actorUserId);
    if (!created.ok) {
      state = await readProvisioningState(projectId);
      if (!state.pilotFolder) throw new DriveCoreRepositoryError(created.error, "DRIVE_PROJECT_PROVISIONING_PILOT_FOLDER_FAILED", 503);
    } else {
      pilotCreated = true;
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
    pilotFolder: state.pilotFolder,
    pilotCreated,
    folderCount: state.folderCount,
  };
}
