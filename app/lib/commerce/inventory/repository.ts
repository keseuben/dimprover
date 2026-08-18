import type { PostgrestError } from "@supabase/supabase-js";
import { compareDecimal, normalizeDecimal } from "../core/decimal";
import { hasCommercePermission } from "../core/permissions";
import { createCommerceAdminClient } from "../core/server-db";
import type { CommerceContext } from "../core/types";
import type { StockMovementType, StockStatus } from "./types";

type Row = Record<string, unknown>;

export class CommerceInventoryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly causeCode?: string,
  ) { super(message); }
}

const STOCK_STATUSES = new Set<StockStatus>(["SELLABLE","RESERVED","QUARANTINE","DAMAGED","OUTLET","BLOCKED","IN_TRANSIT","RETURNED","SCRAP"]);
const MOVEMENT_TYPES = new Set<StockMovementType>(["RECEIPT","SALE","RESERVATION_COMMIT","RESERVATION_RELEASE","TRANSFER_OUT","TRANSFER_IN","ADJUSTMENT","RETURN"]);

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function nullableText(value: unknown) { const valueText = text(value); return valueText || null; }
function dbError(message: string, error: PostgrestError | null, status = 503): never {
  throw new CommerceInventoryError(message, "COMMERCE_INVENTORY_DATABASE_ERROR", status, error?.code);
}
function requireRead(context: CommerceContext) {
  if (!hasCommercePermission(context.permissions, "commerce.inventory.read")) throw new CommerceInventoryError("Nincs készletolvasási jogosultság.", "COMMERCE_PERMISSION_DENIED", 403);
}
function requireMovement(context: CommerceContext, type: StockMovementType) {
  if (!hasCommercePermission(context.permissions, "commerce.inventory.move")) throw new CommerceInventoryError("Nincs készletmozgási jogosultság.", "COMMERCE_PERMISSION_DENIED", 403);
  if (type === "ADJUSTMENT" && !hasCommercePermission(context.permissions, "commerce.inventory.adjust")) throw new CommerceInventoryError("Készletkorrekcióhoz magasabb jogosultság szükséges.", "COMMERCE_INVENTORY_ADJUST_PERMISSION_DENIED", 403);
}

export async function listCommerceInventory(context: CommerceContext, input: { variantId?: string; sourceId?: string; warehouseId?: string; stockStatus?: string } = {}) {
  requireRead(context);
  const client = createCommerceAdminClient();
  let query = client.from("commerce_inventory_balances")
    .select("id,organization_id,source_id,warehouse_id,variant_id,stock_status,physical_quantity,reserved_quantity,available_quantity,incoming_quantity,last_movement_at,created_at,updated_at")
    .eq("organization_id", context.organizationId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (text(input.variantId)) query = query.eq("variant_id", text(input.variantId));
  if (text(input.sourceId)) query = query.eq("source_id", text(input.sourceId));
  if (text(input.warehouseId)) query = query.eq("warehouse_id", text(input.warehouseId));
  const status = text(input.stockStatus).toUpperCase();
  if (status) {
    if (!STOCK_STATUSES.has(status as StockStatus)) throw new CommerceInventoryError("Ismeretlen készletállapot.", "COMMERCE_STOCK_STATUS_INVALID", 400);
    query = query.eq("stock_status", status);
  }
  const result = await query;
  if (result.error) dbError("A készlet lekérése sikertelen.", result.error);
  return ((result.data || []) as Row[]).map((row) => ({
    id: text(row.id), organizationId: text(row.organization_id), sourceId: text(row.source_id), warehouseId: nullableText(row.warehouse_id),
    variantId: text(row.variant_id), stockStatus: text(row.stock_status) as StockStatus,
    physicalQuantity: text(row.physical_quantity), reservedQuantity: text(row.reserved_quantity), availableQuantity: text(row.available_quantity), incomingQuantity: text(row.incoming_quantity),
    lastMovementAt: nullableText(row.last_movement_at), createdAt: text(row.created_at), updatedAt: text(row.updated_at),
  }));
}

export async function applyCommerceStockMovement(context: CommerceContext, input: Record<string, unknown>) {
  const type = text(input.type).toUpperCase() as StockMovementType;
  if (!MOVEMENT_TYPES.has(type)) throw new CommerceInventoryError("Ismeretlen készletmozgás típus.", "COMMERCE_MOVEMENT_TYPE_INVALID", 400);
  requireMovement(context, type);
  const sourceId = text(input.sourceId);
  const variantId = text(input.variantId);
  const idempotencyKey = text(input.idempotencyKey);
  const stockStatus = (text(input.stockStatus).toUpperCase() || "SELLABLE") as StockStatus;
  if (!sourceId || !variantId) throw new CommerceInventoryError("A készletforrás és termékváltozat kötelező.", "COMMERCE_MOVEMENT_TARGET_REQUIRED", 400);
  if (!idempotencyKey || idempotencyKey.length > 180) throw new CommerceInventoryError("Érvényes idempotency kulcs kötelező.", "COMMERCE_IDEMPOTENCY_KEY_REQUIRED", 400);
  if (!STOCK_STATUSES.has(stockStatus)) throw new CommerceInventoryError("Ismeretlen készletállapot.", "COMMERCE_STOCK_STATUS_INVALID", 400);
  let physicalDelta: string;
  let reservedDelta: string;
  let incomingDelta: string;
  try {
    physicalDelta = normalizeDecimal(text(input.physicalDelta) || "0");
    reservedDelta = normalizeDecimal(text(input.reservedDelta) || "0");
    incomingDelta = normalizeDecimal(text(input.incomingDelta) || "0");
  } catch {
    throw new CommerceInventoryError("A készletmozgás mennyisége legfeljebb 6 tizedesjegyű szám lehet.", "COMMERCE_MOVEMENT_QUANTITY_INVALID", 400);
  }
  if ([physicalDelta,reservedDelta,incomingDelta].every((value) => compareDecimal(value, "0") === 0)) throw new CommerceInventoryError("Nulla készletmozgás nem rögzíthető.", "COMMERCE_MOVEMENT_ZERO_DELTA", 400);
  const client = createCommerceAdminClient();
  const result = await client.rpc("commerce_inventory_apply_movement", {
    p_organization_id: context.organizationId,
    p_source_id: sourceId,
    p_variant_id: variantId,
    p_stock_status: stockStatus,
    p_movement_type: type,
    p_physical_delta: physicalDelta,
    p_reserved_delta: reservedDelta,
    p_incoming_delta: incomingDelta,
    p_idempotency_key: idempotencyKey,
    p_reference_type: nullableText(input.referenceType),
    p_reference_id: nullableText(input.referenceId),
    p_occurred_at: nullableText(input.occurredAt),
  });
  if (result.error) {
    const message = result.error.message || "";
    const mapping: Array<[string, number]> = [
      ["COMMERCE_IDEMPOTENCY_PAYLOAD_MISMATCH",409], ["COMMERCE_IDEMPOTENCY_KEY_REQUIRED",400], ["COMMERCE_MOVEMENT_ZERO_DELTA",400],
      ["COMMERCE_INTERNAL_SOURCE_NOT_FOUND",404], ["COMMERCE_VARIANT_SCOPE_MISMATCH",400], ["COMMERCE_STOCK_STATUS_INVALID",400],
      ["COMMERCE_MOVEMENT_TYPE_INVALID",400], ["COMMERCE_PHYSICAL_NEGATIVE",409], ["COMMERCE_RESERVED_NEGATIVE",409],
      ["COMMERCE_INCOMING_NEGATIVE",409], ["COMMERCE_RESERVED_EXCEEDS_PHYSICAL",409],
    ];
    const known = mapping.find(([code]) => message.includes(code));
    if (known) throw new CommerceInventoryError("A készletmozgás üzleti szabály miatt nem alkalmazható.", known[0], known[1], result.error.code);
    dbError("A készletmozgás alkalmazása sikertelen.", result.error);
  }
  if (!result.data || typeof result.data !== "object" || Array.isArray(result.data)) throw new CommerceInventoryError("A készletmozgás válasza érvénytelen.", "COMMERCE_MOVEMENT_RESPONSE_INVALID", 500);
  return result.data as Row;
}
