import type { DropEventInput } from "./dropRepositoryPort";
import type {
  DropAccessPurpose,
  DropAccessTokenRecord,
  DropPackageRecord,
  DropPackageStatus,
} from "./dropTypes";

export type DropPackageStatusPatch = {
  status: DropPackageStatus;
  updated_at: string;
  closed_at?: string | null;
  expired_at?: string | null;
  deleted_at?: string | null;
};

export type DropAtomicStatusTransitionInput = {
  packageId: string;
  expectedStatus: DropPackageStatus;
  targetStatus: DropPackageStatus;
  patch: DropPackageStatusPatch;
  eventPayload: Record<string, unknown>;
};

export interface DropAdminRepositoryPort {
  transitionStatusAtomic?(input: DropAtomicStatusTransitionInput): Promise<{
    package: DropPackageRecord;
    revokedTokenCount: number;
  }>;
  reissueTokenAtomic?(input: {
    packageId: string;
    purpose: DropAccessPurpose;
    expiresAt: string;
    eventPayload: Record<string, unknown>;
  }): Promise<{
    capability: {
      purpose: DropAccessPurpose;
      rawToken: string;
      tokenHash: string;
      tokenHint: string;
      expiresAt: string;
    };
    record: DropAccessTokenRecord;
    revokedTokenCount: number;
  }>;
  revokeTokenAtomic?(input: {
    packageId: string;
    tokenId: string;
    eventPayload: Record<string, unknown>;
  }): Promise<boolean>;
  findPackageById(packageId: string): Promise<DropPackageRecord | null>;
  updatePackageStatus(
    packageId: string,
    expectedStatus: DropPackageStatus,
    patch: DropPackageStatusPatch,
  ): Promise<DropPackageRecord>;
  revokeActiveTokens(packageId: string, purpose?: DropAccessPurpose): Promise<number>;
  revokeToken(packageId: string, tokenId: string): Promise<boolean>;
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
  writeEvent(input: DropEventInput): Promise<void>;
}
