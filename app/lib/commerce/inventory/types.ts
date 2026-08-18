import type { DecimalString } from "../core/decimal";
import type { CommerceEntityId, CommerceLifecycle, CommerceUtcTimestamp, OrganizationScoped } from "../core/types";

export type InventorySourceType = "INTERNAL" | "EXTERNAL";
export type ExternalInventorySyncStatus = "LIVE" | "FRESH" | "STALE" | "ERROR" | "OFFLINE";
export type StockStatus = "SELLABLE" | "RESERVED" | "QUARANTINE" | "DAMAGED" | "OUTLET" | "BLOCKED" | "IN_TRANSIT" | "RETURNED" | "SCRAP";
export type StockMovementType = "RECEIPT" | "SALE" | "RESERVATION_COMMIT" | "RESERVATION_RELEASE" | "TRANSFER_OUT" | "TRANSFER_IN" | "ADJUSTMENT" | "RETURN";

export type Warehouse = OrganizationScoped & CommerceLifecycle & {
  id: CommerceEntityId;
  code: string;
  name: string;
  active: boolean;
};

export type InventorySource = OrganizationScoped & CommerceLifecycle & {
  id: CommerceEntityId;
  type: InventorySourceType;
  code: string;
  name: string;
  warehouseId?: CommerceEntityId | null;
  externalSystem?: string | null;
  active: boolean;
};

export type InventoryBalance = OrganizationScoped & CommerceLifecycle & {
  id: CommerceEntityId;
  sourceId: CommerceEntityId;
  warehouseId?: CommerceEntityId | null;
  variantId: CommerceEntityId;
  stockStatus: StockStatus;
  physicalQuantity: DecimalString;
  reservedQuantity: DecimalString;
  availableQuantity: DecimalString;
  incomingQuantity: DecimalString;
  lastMovementAt?: CommerceUtcTimestamp | null;
};

export type ExternalInventorySnapshot = OrganizationScoped & {
  id: CommerceEntityId;
  sourceId: CommerceEntityId;
  variantId: CommerceEntityId;
  externalProductId: string;
  quantity: DecimalString;
  lastSyncAt: CommerceUtcTimestamp;
  syncStatus: ExternalInventorySyncStatus;
};

export type StockMovement = OrganizationScoped & {
  id: CommerceEntityId;
  sourceId: CommerceEntityId;
  warehouseId?: CommerceEntityId | null;
  variantId: CommerceEntityId;
  stockStatus: StockStatus;
  type: StockMovementType;
  physicalDelta: DecimalString;
  reservedDelta: DecimalString;
  incomingDelta: DecimalString;
  idempotencyKey: string;
  referenceType?: string | null;
  referenceId?: CommerceEntityId | null;
  occurredAt: CommerceUtcTimestamp;
  createdAt: CommerceUtcTimestamp;
};
