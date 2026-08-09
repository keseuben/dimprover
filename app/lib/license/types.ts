export type LicenseStatus =
  | "active"
  | "expired"
  | "blocked"
  | "trial"
  | "pending"
  | "archived"
  | "device_limit"
  | "invalid";

export type StoredLicenseStatus = "active" | "blocked" | "trial" | "pending" | "expired" | "archived";

export type LicenseDeviceStatus = "active" | "blocked";

export type BillingInterval = "none" | "monthly" | "yearly" | "manual";
export type BillingStatus = "none" | "active" | "past_due" | "canceled" | "trialing" | "manual";

export type HageAiFeatureId =
  | "daily_plan"
  | "next_step"
  | "task_breakdown"
  | "waiting_email"
  | "meeting_agenda"
  | "weekly_summary"
  | "decision_support"
  | "document_extract";

export type LicenseAiUserAccess = {
  id: string;
  userId: string;
  displayName: string;
  enabled: boolean;
  allowedFeatures: HageAiFeatureId[];
  allowedScopes: Array<"personal" | "hage">;
  maxRequestsPerDay: number;
  maxRequestsPerMonth: number;
  monthlyBudgetHuf: number;
  accessExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
};


export type LicenseAdditionalContact = {
  id: string;
  name: string;
  role?: string;
  email: string;
  phone?: string;
  receiveEmail: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LicenseRecord = {
  id: string;
  licenseKey: string;
  companyId: string;
  companyName: string;
  status: StoredLicenseStatus;
  startsAt: string;
  expiresAt: string;
  maxDevices: number;
  enabledModules: string[];
  aiUsers?: LicenseAiUserAccess[];
  aiMonthlyBudgetHuf?: number;
  aiMaxSingleRequestHuf?: number;
  createdAt: string;
  updatedAt: string;
  adminNote?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  secondaryContactName?: string;
  secondaryContactEmail?: string;
  secondaryContactPhone?: string;
  additionalContacts?: LicenseAdditionalContact[];
  licenseEmailSentAt?: string;
  planCode?: string;
  billingInterval?: BillingInterval;
  billingStatus?: BillingStatus;
  subscriptionQuantity?: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: string;
  autoReleaseInactiveDevices?: boolean;
  inactiveReleaseDays?: number;
};

export type LicenseDeviceRecord = {
  id: string;
  licenseId: string;
  machineIdHash: string;
  appId: string;
  firstActivatedAt: string;
  lastOnlineCheckAt: string;
  offlineGraceUntil: string;
  status: LicenseDeviceStatus;
  userName?: string;
  organizationUnit?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type LicenseStore = {
  licenses: LicenseRecord[];
  devices: LicenseDeviceRecord[];
};

export type LicenseState = {
  licenseKey: string;
  companyId: string;
  companyName: string;
  machineIdHash: string;
  activatedAt: string;
  expiresAt: string;
  lastOnlineCheckAt: string;
  offlineGraceUntil: string;
  enabledModules: string[];
  maxDevices: number;
  status: Exclude<LicenseStatus, "device_limit" | "invalid">;
};

export type LicenseTokenPayload = {
  licenseKey: string;
  companyId: string;
  machineIdHash: string;
  appId: string;
  appVersion: string;
  enabledModules: string[];
  status: Exclude<LicenseStatus, "device_limit" | "invalid">;
  issuedAt: string;
  expiresAt: string;
  offlineGraceUntil: string;
};

export type LicenseSuccessResponse = {
  ok: true;
  status: Exclude<LicenseStatus, "device_limit" | "invalid">;
  token: string;
  licenseState: LicenseState;
};

export type LicenseErrorResponse = {
  ok: false;
  status: LicenseStatus;
  errorCode: string;
  message: string;
  licenseState: null;
};

export type LicenseApiResponse = LicenseSuccessResponse | LicenseErrorResponse;

export type ActivateLicenseRequest = {
  licenseKey: string;
  machineIdHash: string;
  appId: string;
  appVersion: string;
  requestedModules: string[];
};

export type CheckLicenseRequest = {
  licenseKey: string;
  machineIdHash: string;
  appId: string;
  appVersion: string;
  currentToken?: string;
};
