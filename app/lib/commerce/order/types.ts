import type { CommerceEntityId, CommerceLifecycle, CommerceUtcTimestamp, OrganizationScoped } from "../core/types";
import type { DecimalString } from "../core/decimal";

export type CommerceOrderStatus = "DRAFT" | "SENT_TO_CASHIER" | "PAID" | "ISSUED" | "CANCELLED";
export type CommerceOrderSourceChannel = "EXTERNAL_MARKETPLACE" | "INTERNAL_COUNTER" | "POS" | "B2B" | "IMPORT";
export type CommerceOrderCustomerType = "WALK_IN" | "LOYAL_CUSTOMER" | "CONTRACTOR" | "GUEST" | "B2B";
export type CommerceOrderPaymentMethod = "CASH" | "CARD" | "TRANSFER" | "LATER";
export type CommerceOrderUnit = "DB" | "KG" | "G" | "M" | "M2" | "M3" | "FM" | "L" | "CSOMAG" | "PAR" | "KESZLET" | "RAKLAP" | "ZSAK" | "LADA";
export type CommerceOrderInventoryStatus = "UNRESOLVED" | "RESOLVED" | "RESERVED" | "RELEASED" | "CONSUMED";

export type CommerceOrder = OrganizationScoped & CommerceLifecycle & {
  id: CommerceEntityId;
  orderNumber: string;
  sourceChannel: CommerceOrderSourceChannel;
  externalReference?: string | null;
  status: CommerceOrderStatus;
  customerName: string;
  customerType: CommerceOrderCustomerType;
  recorderName?: string | null;
  cashierName?: string | null;
  issuerName?: string | null;
  paymentMethod?: CommerceOrderPaymentMethod | null;
  pickupAt?: CommerceUtcTimestamp | null;
  note?: string | null;
  sentToCashierAt?: CommerceUtcTimestamp | null;
  paidAt?: CommerceUtcTimestamp | null;
  issuedAt?: CommerceUtcTimestamp | null;
  createdByUserId?: CommerceEntityId | null;
};

export type CommerceOrderItem = OrganizationScoped & CommerceLifecycle & {
  id: CommerceEntityId;
  orderId: CommerceEntityId;
  productId?: CommerceEntityId | null;
  variantId?: CommerceEntityId | null;
  reservationId?: CommerceEntityId | null;
  inventoryStatus: CommerceOrderInventoryStatus;
  productName: string;
  sku?: string | null;
  unit: CommerceOrderUnit;
  quantity: DecimalString;
  priceNetMinor: string;
  vatRateBasisPoints: number;
  storageZone?: string | null;
};

export type CommerceOrderDetail = CommerceOrder & { items: CommerceOrderItem[] };
