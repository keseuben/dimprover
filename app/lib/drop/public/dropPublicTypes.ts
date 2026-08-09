export type DropPublicWorkflowType = "send" | "submission_gate";
export type DropPackageWorkflowType = "package_drop" | DropPublicWorkflowType;
export type DropPublicStatus = "active" | "revoked" | "expired";
export type DropSubmissionGateType = "personal" | "project" | "organization";
export type DropDownloadProtection = "link" | "link_pin";
export type DropSendRecipientMode = "locked_default" | "approved_list" | "free_entry";

export type DropPublicRecipient = {
  id: string;
  name: string;
  email: string;
  label?: string;
  company?: string;
  projectRole?: string;
};

export type DropPublicLimits = {
  maxFileCount: number;
  maxFileSizeBytes: number;
  maxTotalSizeBytes: number;
};

// Legacy DROP 1.0.0 entitlement profile. Kept only for backward-compatible
// administration/migration; new Send authorization is canonical Identity Core data.
export type DropSendEntitlementProfile = {
  sendCodeId: string;
  licenseId: string;
  licenseKeyHint: string;
  userFullName: string;
  userEmail: string;
  organizationName?: string | null;
  phone?: string | null;
  recipientMode: DropSendRecipientMode;
  defaultRecipient?: DropPublicRecipient | null;
  approvedRecipients: DropPublicRecipient[];
  canUseStandardSend: boolean;
  canUseQuickImageSend: boolean;
  canUseImageGroups: boolean;
  canUseFileComments: boolean;
  canUseProjectDrop: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DropSendCodeRecord = {
  id: string;
  label: string;
  codeHash: string;
  codeSalt: string;
  codeHint: string;
  status: DropPublicStatus;
  expiresAt: string;
  maxPackagesPerDay: number;
  maxBytesPerDay: number;
  maxRecipients: number;
  defaultRetentionDays: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  revokedAt?: string | null;
};

export type DropSendCodeSafeRecord = Omit<DropSendCodeRecord, "codeHash" | "codeSalt"> & {
  entitlement?: DropSendEntitlementProfile | null;
};

export type DropSubmissionGateRecord = {
  id: string;
  slug: string;
  type: DropSubmissionGateType;
  title: string;
  description: string;
  status: DropPublicStatus;
  recipients: DropPublicRecipient[];
  projectId?: string | null;
  projectName?: string | null;
  targetFolder?: string | null;
  limits: DropPublicLimits;
  retentionDays: number;
  requireSenderEmail: boolean;
  allowPackageComment: boolean;
  allowFileComments: boolean;
  downloadProtection: DropDownloadProtection;
  expiresAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  revokedAt?: string | null;
};

export type DropPublicSessionRecord = {
  id: string;
  tokenHash: string;
  workflowType: DropPublicWorkflowType;
  sendCodeId?: string | null;
  dimproSendEntitlementId?: string | null;
  gateId?: string | null;
  ipHash: string;
  userAgentSummary: string;
  expiresAt: string;
  packageId?: string | null;
  createdAt: string;
  updatedAt: string;
  usedAt?: string | null;
};

export type DropPackageWorkflowRecord = {
  packageId: string;
  workflowType: DropPackageWorkflowType;
  subject: string;
  senderMessage: string;
  packageNote: string;
  requireDownloadPin: boolean;
  sendCodeId?: string | null;
  dimproSendEntitlementId?: string | null;
  gateId?: string | null;
  gateType?: DropSubmissionGateType | null;
  projectId?: string | null;
  projectName?: string | null;
  dimproProjectId?: string | null;
  projectPublicCode?: string | null;
  targetFolder?: string | null;
  selectedRecipientIds?: string[];
  recipientEmails?: string[];
  showRecipientsOnDownload?: boolean;
  exportGroupsAsFolders?: boolean;
  appendGroupNameToFilename?: boolean;
  finalizedAt?: string | null;
  identityAccountedAt?: string | null;
  notificationStatus?: "not_requested" | "pending" | "sent" | "partial" | "failed";
  notificationDetail?: string | null;
  downloadLinkHint?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DropPublicUsageRecord = {
  id: string;
  sendCodeId: string;
  packageId: string;
  reservedBytes: number;
  createdAt: string;
};

export type DropPublicState = {
  version: "DROP_PUBLIC_V094";
  sendCodes: DropSendCodeRecord[];
  gates: DropSubmissionGateRecord[];
  sessions: DropPublicSessionRecord[];
  packageWorkflows: DropPackageWorkflowRecord[];
  usage: DropPublicUsageRecord[];
  updatedAt: string;
};
