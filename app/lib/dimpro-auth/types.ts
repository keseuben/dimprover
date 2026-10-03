export type DimproAuthUserLevel = "SIMPLE" | "STAFF" | "PROJECT_MANAGER" | "ORG_ADMIN" | "SUPERADMIN";
export type DimproAuthUserStatus = "ACTIVE" | "SUSPENDED" | "DISABLED";

export type DimproAuthUser = {
  id: string;
  email: string;
  displayName: string | null;
  status: DimproAuthUserStatus;
  securityLevel: DimproAuthUserLevel;
  emailVerifiedAt: string | null;
};

export type DimproAuthSession = {
  id: string;
  user: DimproAuthUser;
  createdAt: string;
  lastSeenAt: string;
  absoluteExpiresAt: string;
  inactivityExpiresAt: string;
};

export class DimproAuthError extends Error {
  readonly code: string;
  readonly status: number;
  readonly publicMessage: string;
  readonly commitTransaction: boolean;

  constructor(
    message: string,
    code: string,
    status = 400,
    publicMessage = "A hitelesítési művelet nem sikerült.",
    options: { commitTransaction?: boolean } = {},
  ) {
    super(message);
    this.name = "DimproAuthError";
    this.code = code;
    this.status = status;
    this.publicMessage = publicMessage;
    this.commitTransaction = options.commitTransaction === true;
  }
}
