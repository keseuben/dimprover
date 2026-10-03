export const DRIVE_DEVELOPMENT_VERSION = "0.9.8";
export const DRIVE_DEVELOPMENT_LABEL = `V${DRIVE_DEVELOPMENT_VERSION}`;
export const DRIVE_ENVIRONMENT_LABEL = "DEV";
export const DRIVE_VERSION_DISPLAY = `DRIVE ${DRIVE_DEVELOPMENT_LABEL} ${DRIVE_ENVIRONMENT_LABEL}`;

export type DriveNavigationTarget = "documents" | "favorites" | "incoming" | "boxes";
export type DriveNavigationRequest = {
  id: number;
  target: DriveNavigationTarget;
  folderId?: string;
};
