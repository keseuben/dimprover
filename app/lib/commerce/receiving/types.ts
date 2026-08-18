import type { DecimalString } from "../core/decimal";
import type { CommerceEntityId, CommerceLifecycle, CommerceUtcTimestamp, OrganizationScoped } from "../core/types";
import type { UnitOfMeasure } from "../product/types";
import type { StockStatus } from "../inventory/types";

export type GoodsReceiptStatus = "DRAFT" | "POSTED" | "CANCELLED";
export type GoodsReceiptStockStatus = Extract<StockStatus, "SELLABLE" | "QUARANTINE" | "DAMAGED" | "OUTLET">;
export type ReceivingCurrency = "HUF" | "EUR" | "USD";

export type GoodsReceipt = OrganizationScoped & CommerceLifecycle & {
  id: CommerceEntityId;
  warehouseId: CommerceEntityId;
  sourceId: CommerceEntityId;
  receiptNumber: string;
  supplierName?: string | null;
  supplierDocumentNumber?: string | null;
  status: GoodsReceiptStatus;
  receivedAt: CommerceUtcTimestamp;
  postedAt?: CommerceUtcTimestamp | null;
  notes?: string | null;
  createdByUserId?: CommerceEntityId | null;
};

export type GoodsReceiptItem = OrganizationScoped & CommerceLifecycle & {
  id: CommerceEntityId;
  receiptId: CommerceEntityId;
  variantId: CommerceEntityId;
  stockStatus: GoodsReceiptStockStatus;
  quantity: DecimalString;
  unit: UnitOfMeasure;
  unitCostMinor?: string | null;
  currency: ReceivingCurrency;
  lotCode?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
};
