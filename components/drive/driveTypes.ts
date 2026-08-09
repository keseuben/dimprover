export type DrivePermission =
  | "project.read"
  | "project.update"
  | "project.manage_members"
  | "project.manage_lifecycle"
  | "document.read"
  | "document.write"
  | "document.approve"
  | "calendar.read"
  | "calendar.write"
  | "dialog.read"
  | "dialog.write"
  | "approval.read"
  | "approval.write"
  | "approval.respond"
  | "diary.read"
  | "diary.write"
  | "diary.close"
  | "audit.read"
  | "export.create";

export type DriveProject = {
  id: string;
  code: string;
  name: string;
  description?: string;
  status: string;
  currentPhase?: string;
  progressPercent?: number;
  permissions: DrivePermission[];
};

export type DriveFolder = {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
  sortOrder: number;
};

export type DriveVersion = {
  id: string;
  versionNumber: number;
  revisionCode: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  storageProvider?: string;
  storageKey?: string | null;
  status: string;
  changeNote?: string;
  createdBy?: string;
  createdAt: string;
};

export type DriveDocument = {
  id: string;
  folderId: string;
  name: string;
  extension: string;
  mimeType: string;
  description: string;
  source: string;
  currentVersionNumber: number;
  updatedAt: string;
  currentVersion: DriveVersion | null;
};

export type DriveTree = {
  projectId: string;
  folders: DriveFolder[];
  documents: DriveDocument[];
  summary: {
    folderCount: number;
    documentCount: number;
    versionCount: number;
    metadataOnlyCount: number;
    totalSizeBytes: number;
    latestCursor: number;
  };
};

export type DriveEngineeringMetadata = {
  id: string;
  projectId: string;
  documentId: string;
  planNo: string;
  discipline: string;
  documentType: string;
  revision: string;
  issueStatus: string;
  approvalStatus: string;
  building: string;
  level: string;
  zone: string;
  extra: Record<string, unknown>;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type DriveFileNote = {
  id: string;
  projectId: string;
  documentId: string;
  versionId: string | null;
  note: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type DriveQrCode = {
  id: string;
  projectId: string;
  documentId: string;
  versionId: string | null;
  publicKey: string;
  status: "ACTIVE" | "REVOKED";
  createdBy: string;
  createdAt: string;
  revokedBy: string | null;
  revokedAt: string | null;
};

export type DriveDocumentDetails = {
  projectId: string;
  document: Omit<DriveDocument, "currentVersion"> & {
    projectId: string;
    status: string;
    createdBy: string;
    createdAt: string;
    currentVersionNumber: number;
  };
  versions: DriveVersion[];
  metadata: DriveEngineeringMetadata | null;
  notes: DriveFileNote[];
  qrCodes: DriveQrCode[];
};

export type DriveLayoutMode = "three" | "two" | "one" | "split";
export type DriveViewMode = "simple" | "engineering";

export type DriveHealth = {
  ok?: boolean;
  error?: string;
  database?: { ready: boolean };
  storage?: {
    realObjectWriteEnabled: boolean;
    realObjectDownloadEnabled: boolean;
    maxUploadMb: number;
    warning: string;
  };
  workspace?: {
    version: string;
    databaseReady: boolean;
    nextStep: string;
  };
};
