export type DriveFolderStatus = "ACTIVE" | "ARCHIVED";

export type DriveUploadKind = "NEW_DOCUMENT" | "NEW_VERSION";
export type DriveUploadStatus = "INITIATED" | "FINALIZED" | "ABORTED" | "EXPIRED" | "FAILED";
export type DriveChecksumAlgorithm = "SHA-256";
export type DriveChecksumState = "PENDING" | "VERIFIED" | "FAILED";
export type DriveChecksumVerification = {
  algorithm: DriveChecksumAlgorithm;
  state: DriveChecksumState;
  sha256: string | null;
  verifiedAt: string | null;
};

export type DriveReviewAction = "APPROVE" | "REJECT";
export type DriveCleanupStatus = "PENDING" | "COMPLETED" | "FAILED";

export type DriveObjectCleanupTask = {
  id: string;
  projectId: string;
  versionId: string;
  storageProvider: "S3";
  storageBucket: string;
  storageKey: string;
  reason: string;
  status: DriveCleanupStatus;
  attempts: number;
  lastError: string | null;
  requestedBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type DriveUploadSession = {
  id: string;
  projectId: string;
  folderId: string | null;
  documentId: string | null;
  uploadKind: DriveUploadKind;
  documentName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  expectedCurrentVersion: number;
  source: DriveDocumentSource;
  clientId: string | null;
  storageProvider: "S3";
  storageBucket: string;
  storageKey: string;
  finalVersionStatus: "AVAILABLE" | "QUARANTINED";
  status: DriveUploadStatus;
  expiresAt: string;
  finalizedDocumentId: string | null;
  finalizedVersionId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  metadata: Record<string, unknown>;
};
export type DriveDocumentStatus = "ACTIVE" | "ARCHIVED" | "DELETED";
export type DriveDocumentSource = "WEB" | "DESKTOP" | "DROP" | "SYSTEM";
export type DriveVersionStatus = "METADATA_ONLY" | "STAGED" | "AVAILABLE" | "QUARANTINED" | "REJECTED";
export type DriveStorageProvider = "METADATA_ONLY" | "LOCAL_PREVIEW" | "S3";

export type DriveFolder = {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  path: string;
  sortOrder: number;
  status: DriveFolderStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type DriveDocumentVersion = {
  id: string;
  projectId: string;
  documentId: string;
  versionNumber: number;
  revisionCode: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  storageProvider: DriveStorageProvider;
  storageBucket: string | null;
  storageKey: string | null;
  status: DriveVersionStatus;
  changeNote: string;
  createdBy: string;
  createdAt: string;
};

export type DriveDocument = {
  id: string;
  projectId: string;
  folderId: string;
  name: string;
  extension: string;
  mimeType: string;
  description: string;
  status: DriveDocumentStatus;
  source: DriveDocumentSource;
  currentVersionNumber: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  currentVersion: DriveDocumentVersion | null;
};

export type DriveChangeEntityType =
  | "folder"
  | "document"
  | "document_version"
  | "sync"
  | "metadata"
  | "note"
  | "qr"
  | "box"
  | "box_item"
  | "saved_view"
  | "compare_job"
  | "ai_job";

export type DriveChangeEvent = {
  sequence: number;
  id: string;
  projectId: string;
  eventType: string;
  entityType: DriveChangeEntityType;
  entityId: string;
  payload: Record<string, unknown>;
  actorUserId: string;
  createdAt: string;
};

export type DriveSyncCursor = {
  id: string;
  projectId: string;
  clientId: string;
  machineName: string | null;
  cursorValue: number;
  lastSyncAt: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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
