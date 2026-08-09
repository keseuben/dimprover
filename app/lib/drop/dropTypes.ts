export const DROP_PACKAGE_MODES = ["image", "file", "zip", "mixed"] as const;
export type DropPackageMode = (typeof DROP_PACKAGE_MODES)[number];

export const DROP_PACKAGE_STATUSES = [
  "draft",
  "preparing",
  "active",
  "upload_closed",
  "expiring",
  "reporting",
  "deleting",
  "expired",
  "deleted",
  "failed",
] as const;
export type DropPackageStatus = (typeof DROP_PACKAGE_STATUSES)[number];

export const DROP_ACCESS_PURPOSES = ["upload", "view", "download", "report"] as const;
export type DropAccessPurpose = (typeof DROP_ACCESS_PURPOSES)[number];

export type DropAccessPolicy = "token_pin" | "token_only" | "account";
export type DropRecipientRole = "uploader" | "invitee" | "viewer" | "commenter";

export type DropFeatureFlags = {
  dropModuleVisible: boolean;
  packageEngineEnabled: boolean;
  accessGateEnabled: boolean;
  emailNotificationsEnabled: boolean;
  spacesEnabled: boolean;
  spacePackageCreationEnabled: boolean;
  storageCoreEnabled: boolean;
  quarantineUploadEnabled: boolean;
  resumableUploadEnabled: boolean;
  imageDropEnabled: boolean;
  fileDropEnabled: boolean;
  zipUploadEnabled: boolean;
  mixedPackageEnabled: boolean;
  commentsEnabled: boolean;
  pdfReportEnabled: boolean;
  driveArchiveEnabled: boolean;
  driveDesktopEnabled: boolean;
  aiImageCheckEnabled: boolean;
  issueRegisterLinkEnabled: boolean;
  autoGroupingEnabled: boolean;
  submissionGateEnabled: boolean;
  sendEnabled: boolean;
  hexUploadEnabled: boolean;
};

export type DropFeatureKey = Exclude<keyof DropFeatureFlags, "dropModuleVisible">;
export type DropRuntimeStage = "shell" | "private-pilot" | "production";

export type DropRecipientInput = {
  name: string;
  email: string;
  company?: string;
  role?: DropRecipientRole;
  receiveInvitation?: boolean;
  receiveActivityNotifications?: boolean;
  receiveFinalReport?: boolean;
};

export type DropGroupInput = {
  name: string;
  code?: string;
  description?: string;
  sortOrder?: number;
  fileNamePrefix?: string;
  sequenceStart?: number;
};

export type DropCreatePackageInput = {
  mode: DropPackageMode;
  title: string;
  description: string;
  projectId?: string;
  projectName?: string;
  organizationId?: string;
  uploaderName: string;
  uploaderEmail: string;
  retentionDays: number;
  pin?: string;
  recipients: DropRecipientInput[];
  groups: DropGroupInput[];
  maxFileCount?: number;
  maxFileSizeBytes?: number;
  maxTotalSizeBytes?: number;
  spaceContext?: {
    spaceId: string;
    createdByMembershipId: string;
    visibility: "space_members" | "selected_members" | "project_members" | "private";
    selectedMembershipIds: string[];
  };
};

export type DropCapabilityToken = {
  purpose: DropAccessPurpose;
  rawToken: string;
  tokenHash: string;
  tokenHint: string;
  expiresAt: string;
};

export type DropCapabilityLinks = Record<DropAccessPurpose, string>;
export type DropRawTokens = Record<DropAccessPurpose, string>;

export type DropPackageRecord = {
  id: string;
  public_code: string;
  mode: DropPackageMode;
  title: string;
  description: string;
  project_id: string | null;
  project_name_snapshot: string | null;
  owner_user_id: string | null;
  organization_id: string | null;
  created_by_user_id: string | null;
  uploader_name: string;
  uploader_email: string;
  status: DropPackageStatus;
  access_policy: DropAccessPolicy;
  upload_opens_at: string | null;
  upload_closes_at: string | null;
  expires_at: string;
  grace_expires_at: string;
  retention_days: number;
  pin_hash: string | null;
  pin_salt: string | null;
  max_file_count: number;
  max_file_size_bytes: number;
  max_total_size_bytes: number;
  current_file_count: number;
  current_total_size_bytes: number;
  space_id?: string | null;
  created_by_membership_id?: string | null;
  visibility?: "space_members" | "selected_members" | "project_members" | "private";
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  expired_at: string | null;
  deleted_at: string | null;
  notify_on_first_open?: boolean;
  notify_on_download?: boolean;
  notify_on_comment?: boolean;
  notify_on_upload_complete?: boolean;
  send_final_report_to_uploader?: boolean;
  send_final_report_to_invitees?: boolean;
  zip_status?: string;
  final_report_status?: string;
  delete_status?: string;
};

export type DropRecipientRecord = {
  id: string;
  package_id: string;
  name: string;
  email: string;
  company: string | null;
  role: DropRecipientRole;
  receive_invitation: boolean;
  receive_activity_notifications: boolean;
  receive_final_report: boolean;
  invitation_sent_at: string | null;
  first_opened_at: string | null;
  last_opened_at: string | null;
  first_downloaded_at: string | null;
  last_downloaded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DropAccessTokenRecord = {
  id: string;
  package_id: string;
  purpose: DropAccessPurpose;
  token_hash: string;
  token_hint: string;
  status: "active" | "revoked" | "expired";
  expires_at: string;
  max_uses: number | null;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
};

export type DropPackageListItem = Pick<
  DropPackageRecord,
  | "id"
  | "public_code"
  | "mode"
  | "title"
  | "description"
  | "project_name_snapshot"
  | "uploader_name"
  | "uploader_email"
  | "status"
  | "expires_at"
  | "retention_days"
  | "created_at"
> & {
  recipientCount: number;
  groupCount: number;
  accessTokens: Array<Pick<DropAccessTokenRecord, "id" | "purpose" | "status" | "expires_at" | "use_count" | "token_hint">>;
};

export type DropCreatedPackage = {
  package: DropPackageRecord;
  pin: string;
  rawTokens: DropRawTokens;
  links: DropCapabilityLinks;
};

export type DropAccessGrant = {
  packageId: string;
  publicCode: string;
  title: string;
  mode: DropPackageMode;
  purpose: DropAccessPurpose;
  tokenHint: string;
  expiresAt: string;
  packageExpiresAt: string;
  redirectPath: string;
};


export type DropFileSecurityStatus = "pending" | "basic_passed" | "scanner_required" | "clean" | "infected" | "rejected";
export type DropFileUploadStatus = "queued" | "uploading" | "uploaded" | "processing" | "ready" | "failed" | "deleted";

export type DropFileRecord = {
  id: string;
  package_id: string;
  group_id: string | null;
  original_name: string;
  display_name: string;
  generated_name: string;
  extension: string;
  mime_type: string;
  detected_mime_type: string | null;
  size_original_bytes: number;
  size_stored_bytes: number;
  storage_provider: string;
  storage_bucket: string;
  storage_key: string;
  sha256: string | null;
  integrity_type?: "FILE_SHA256" | "PART_MANIFEST_SHA256";
  integrity_manifest_sha256?: string | null;
  object_etag?: string | null;
  object_verified_at?: string | null;
  upload_status: DropFileUploadStatus;
  processing_status: string;
  virus_scan_status: string;
  zip_scan_status: string;
  is_image: boolean;
  is_zip: boolean;
  uploaded_by_name: string | null;
  uploaded_by_email: string | null;
  uploaded_by_membership_id?: string | null;
  security_status?: DropFileSecurityStatus;
  quarantine_reason?: string | null;
  ready_at?: string | null;
  scan_attempts?: number;
  scan_started_at?: string | null;
  scan_completed_at?: string | null;
  scan_worker_id?: string | null;
  scan_engine?: string | null;
  scan_engine_version?: string | null;
  scan_signature_version?: string | null;
  scan_signature_name?: string | null;
  scan_error?: string | null;
  download_ready_at?: string | null;
  download_count?: number;
  last_downloaded_at?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type DropUploadSessionRecord = {
  id: string;
  package_id: string;
  file_id: string | null;
  client_upload_id: string;
  status: string;
  total_bytes: number;
  uploaded_bytes: number;
  chunk_size_bytes: number;
  total_parts: number;
  completed_parts: number;
  expires_at: string;
  created_by_membership_id?: string | null;
  authorization_mode?: "space_session" | "capability_token" | "admin";
  storage_provider?: string;
  storage_bucket?: string;
  storage_key?: string;
  storage_multipart_id?: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
  reservation_released?: boolean;
  received_sha256?: string | null;
  integrity_type?: "FILE_SHA256" | "PART_MANIFEST_SHA256";
  integrity_manifest_sha256?: string | null;
  object_etag?: string | null;
  object_verified_at?: string | null;
  received_mime_type?: string | null;
  received_at?: string | null;
  finalized_at?: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type DropUploadInitResult = {
  file: {
    id: string;
    packageId: string;
    displayName: string;
    sizeBytes: number;
    uploadStatus: DropFileUploadStatus;
  };
  session: {
    id: string;
    status: string;
    totalBytes: number;
    uploadedBytes?: number;
    chunkSizeBytes?: number;
    totalParts?: number;
    completedParts?: number;
    expiresAt: string;
  };
  protocol?: "single" | "multipart";
  storageProvider?: "local-private" | "s3-compatible";
  completedPartNumbers?: number[];
  uploadToken: string;
  uploadUrl: string;
  partUrlTemplate?: string;
  partSignUrlTemplate?: string;
  partConfirmUrlTemplate?: string;
  stateUrl?: string;
  completeUrl: string;
  abortUrl: string;
  expiresAt: string;
  maxBytes: number;
  quarantineOnly: true;
};
