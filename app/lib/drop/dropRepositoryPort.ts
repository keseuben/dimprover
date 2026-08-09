import type {
  DropAccessPurpose,
  DropAccessTokenRecord,
  DropPackageRecord,
} from "./dropTypes";
import {
  countRecentFailedDropAttempts,
  findDropAccessToken,
  findDropPackageByPublicCode,
  issueDropAccessToken,
  markDropAccessTokenUsed,
  recordDropAccessAttempt,
  writeDropEvent,
} from "./dropRepository";

export type DropAccessAttemptInput = {
  packageId?: string | null;
  accessTokenId?: string | null;
  attemptType: "pin" | "token";
  purpose?: DropAccessPurpose | null;
  ipHash: string;
  tokenFingerprint?: string | null;
  success: boolean;
  failureCode?: string | null;
  userAgentSummary?: string | null;
};

export type DropAttemptCountFilters = {
  ipHash: string;
  packageId?: string | null;
  tokenFingerprint?: string | null;
  attemptType?: "pin" | "token";
  windowMinutes: number;
};

export type DropEventInput = {
  packageId: string;
  eventType: string;
  severity?: "info" | "warning" | "error" | "critical";
  ipHash?: string | null;
  userAgentSummary?: string | null;
  payload?: Record<string, unknown>;
};

export type DropAccessTokenLookup = {
  token: DropAccessTokenRecord;
  package: DropPackageRecord;
};

export interface DropRepositoryPort {
  findPackageByPublicCode(publicCode: string): Promise<DropPackageRecord | null>;
  issueAccessToken(
    packageId: string,
    purpose: DropAccessPurpose,
    expiresAt: string,
    source: "package_creation" | "pin_gate" | "admin_reissue",
  ): Promise<{
    capability: {
      purpose: DropAccessPurpose;
      rawToken: string;
      tokenHash: string;
      tokenHint: string;
      expiresAt: string;
    };
    record: DropAccessTokenRecord;
  }>;
  findAccessToken(rawToken: string): Promise<DropAccessTokenLookup | null>;
  markAccessTokenUsed(token: DropAccessTokenRecord): Promise<void>;
  recordAccessAttempt(input: DropAccessAttemptInput): Promise<void>;
  countRecentFailedAttempts(filters: DropAttemptCountFilters): Promise<number>;
  writeEvent(input: DropEventInput): Promise<void>;
}

export const supabaseDropRepository: DropRepositoryPort = {
  findPackageByPublicCode: findDropPackageByPublicCode,
  issueAccessToken: issueDropAccessToken,
  findAccessToken: findDropAccessToken,
  markAccessTokenUsed: markDropAccessTokenUsed,
  recordAccessAttempt: recordDropAccessAttempt,
  countRecentFailedAttempts: countRecentFailedDropAttempts,
  writeEvent: writeDropEvent,
};
