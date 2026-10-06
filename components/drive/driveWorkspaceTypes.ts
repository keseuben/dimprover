import type { DrivePermission } from "./driveTypes";

export type DriveWorkspaceType = "PERSONAL" | "PROJECT";

export type DriveWorkspaceOption = {
  id: string;
  label: string;
  code?: string | null;
  kind: DriveWorkspaceType;
};

export type DriveWorkspaceRecord = {
  id: string;
  type: DriveWorkspaceType;
  name: string;
  code: string | null;
  ownerUserId: string | null;
  projectId: string | null;
  status: string;
  access: string;
  storageScope: "USER_ROOT" | "PROJECT";
  browsing: "LIMITED_ROOT" | "FULL";
  capabilities: {
    userRootContent: boolean;
    folderTree: boolean;
    projectFeatures: boolean;
  };
  permissions?: DrivePermission[];
};

export type DriveWorkspacesPayload = {
  ok?: boolean;
  error?: string;
  personalDrive?: boolean;
  user?: { id: string; email: string | null };
  workspaces?: DriveWorkspaceRecord[];
};
