import type { CommerceEntityId, CommerceLifecycle, CommerceUtcTimestamp, OrganizationScoped } from "../core/types";

export type CurrencyCode = "HUF" | "EUR" | "USD";
export type PriceStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export type Price = OrganizationScoped & CommerceLifecycle & {
  id: CommerceEntityId;
  variantId: CommerceEntityId;
  currency: CurrencyCode;
  amountMinor: string;
  vatRateBasisPoints: number;
  validFrom?: CommerceUtcTimestamp | null;
  validUntil?: CommerceUtcTimestamp | null;
  status: PriceStatus;
};
