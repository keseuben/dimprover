export type DimproIdentitySchemaHealth = {
  ready: boolean;
  enabled: boolean;
  marker: {
    component: string;
    schemaVersion: string;
    migrationCount: number;
    bootstrapId: string;
    metadata: Record<string, unknown>;
    updatedAt: string;
  } | null;
  checks: Record<string, boolean>;
  errors: Array<{ source: string; code: string | null; message: string }>;
};

export type DimproSendUser = {
  id: string;
  publicCode: string;
  fullName: string;
  email: string;
  organizationName: string | null;
};

export type DimproSendEntitlement = {
  id: string;
  canUseStandardSend: boolean;
  canUseQuickImageSend: boolean;
  canUseImageGroups: boolean;
  canUseFileComments: boolean;
  canUseProjectDrop: boolean;
  canUseQuickVoiceNote: boolean;
  maxQuickVoiceSecondsPerNote: number;
  recipientMode: "locked_default" | "approved_list" | "free_entry";
  maxRecipients: number;
  maxSavedContacts: number;
  uploadRulesAcceptanceCount: number;
  uploadRulesVersion: string | null;
  uploadRulesLastAcceptedAt: string | null;
  maxPackageSizeBytes: number;
  monthlySendLimit: number | null;
  currentMonthSendCount: number;
};

export type DimproSendRecipient = {
  id: string;
  name: string;
  email: string;
  organizationName: string | null;
  label: string | null;
  locked: boolean;
};

export type DimproSendProject = {
  id: string;
  publicCode: string;
  name: string;
  canUploadToDrop: boolean;
};

export type DimproSendVerificationSuccess = {
  ok: true;
  user: DimproSendUser;
  entitlement: DimproSendEntitlement;
  defaultRecipient: DimproSendRecipient | null;
  projects: DimproSendProject[];
};

export type DimproSendVerificationFailure = {
  ok: false;
  error: string;
};

export type DimproSendVerificationResult =
  | DimproSendVerificationSuccess
  | DimproSendVerificationFailure;

export type DimproProjectCodeVerificationSuccess = {
  ok: true;
  project: {
    id: string;
    publicCode: string;
    name: string;
  };
  destination: {
    type: "project_drop_inbox";
    label: string;
    driveFolderId: string | null;
    preserveGroups: boolean;
    requireVirusScan: boolean;
    notifyProjectAdmins: boolean;
  };
};

export type DimproProjectCodeVerificationResult =
  | DimproProjectCodeVerificationSuccess
  | DimproSendVerificationFailure;

export type DimproSendSessionClaims = {
  version: 1;
  audience: "dimpro-send";
  entitlementId: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

export class DimproIdentityError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "DimproIdentityError";
    this.code = code;
    this.status = status;
  }
}
