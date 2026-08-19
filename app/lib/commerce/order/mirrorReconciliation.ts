import type { PostgrestError } from "@supabase/supabase-js";
import type { AruterOrder } from "../../aruter/types";
import { hasCommercePermission } from "../core/permissions";
import { createCommerceAdminClient } from "../core/server-db";
import type { CommerceContext } from "../core/types";
import { CommerceOrderError } from "./repository";

export type CommerceMirrorAttemptState = "PENDING" | "SUCCEEDED" | "FAILED";
export type CommerceMirrorAttempt = {
  id: string;
  organizationId: string;
  legacyOrderId: string;
  orderNumber: string;
  legacyStatus: AruterOrder["status"];
  commerceOrderId: string | null;
  state: CommerceMirrorAttemptState;
  attemptCount: number;
  mappedItemCount: number;
  unresolvedItemCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  legacyOrderPayload: AruterOrder;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  succeededAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = Record<string, unknown>;
function text(value: unknown) { return typeof value === "string" ? value.trim() : value == null ? "" : String(value); }
function nullableText(value: unknown) { const valueText = text(value); return valueText || null; }
function dbError(message: string, error: PostgrestError | null): never { throw new CommerceOrderError(message, "COMMERCE_MIRROR_DATABASE_ERROR", 503, error?.code); }
function requireReconcile(context: CommerceContext) {
  if (!hasCommercePermission(context.permissions, "commerce.order.reconcile")) {
    throw new CommerceOrderError("Nincs rendelés-tükrözési egyeztetési jogosultság.", "COMMERCE_PERMISSION_DENIED", 403);
  }
}

function parseLegacyOrder(value: unknown): AruterOrder {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CommerceOrderError("A tárolt legacy rendelés hibás.", "COMMERCE_MIRROR_PAYLOAD_INVALID", 500);
  const order = value as Partial<AruterOrder>;
  if (!order.id || !order.orderNumber || !order.status || !Array.isArray(order.items)) throw new CommerceOrderError("A tárolt legacy rendelés hiányos.", "COMMERCE_MIRROR_PAYLOAD_INVALID", 500);
  return order as AruterOrder;
}

function mapAttempt(row: Row): CommerceMirrorAttempt {
  return {
    id: text(row.id), organizationId: text(row.organization_id), legacyOrderId: text(row.legacy_order_id), orderNumber: text(row.order_number),
    legacyStatus: text(row.legacy_status) as AruterOrder["status"], commerceOrderId: nullableText(row.commerce_order_id),
    state: text(row.state) as CommerceMirrorAttemptState, attemptCount: Number(row.attempt_count || 0), mappedItemCount: Number(row.mapped_item_count || 0),
    unresolvedItemCount: Number(row.unresolved_item_count || 0), lastErrorCode: nullableText(row.last_error_code), lastErrorMessage: nullableText(row.last_error_message),
    legacyOrderPayload: parseLegacyOrder(row.legacy_order_payload), lastAttemptAt: nullableText(row.last_attempt_at), nextRetryAt: nullableText(row.next_retry_at),
    succeededAt: nullableText(row.succeeded_at), createdAt: text(row.created_at), updatedAt: text(row.updated_at),
  };
}

export async function enqueueCommerceMirrorAttemptForOrganization(organizationIdInput: unknown, order: AruterOrder) {
  const organizationId = text(organizationIdInput);
  if (!organizationId) throw new CommerceOrderError("A Storefront Commerce szervezet azonosítója hiányzik.", "COMMERCE_STOREFRONT_QUEUE_ORGANIZATION_REQUIRED", 503);
  const client = createCommerceAdminClient();
  const result = await client.rpc("commerce_order_mirror_enqueue", {
    p_organization_id: organizationId,
    p_legacy_order_id: order.id,
    p_order_number: order.orderNumber,
    p_legacy_status: order.status,
    p_legacy_order_payload: order,
  });
  if (result.error) dbError("A Storefront rendelés Commerce sorba állítása sikertelen.", result.error);
  return result.data as Row;
}

export async function recordCommerceMirrorAttempt(
  context: CommerceContext,
  order: AruterOrder,
  input: { state: CommerceMirrorAttemptState; commerceOrderId?: string | null; mappedItemCount?: number; unresolvedItemCount?: number; errorCode?: string | null; errorMessage?: string | null },
) {
  const client = createCommerceAdminClient();
  const result = await client.rpc("commerce_order_mirror_record", {
    p_organization_id: context.organizationId,
    p_actor_user_id: context.userId,
    p_legacy_order_id: order.id,
    p_order_number: order.orderNumber,
    p_legacy_status: order.status,
    p_legacy_order_payload: order,
    p_state: input.state,
    p_commerce_order_id: input.commerceOrderId || null,
    p_mapped_item_count: Math.max(0, Math.floor(input.mappedItemCount || 0)),
    p_unresolved_item_count: Math.max(0, Math.floor(input.unresolvedItemCount || 0)),
    p_error_code: input.errorCode || null,
    p_error_message: input.errorMessage || null,
  });
  if (result.error) dbError("A rendelés-tükrözési állapot nem menthető.", result.error);
  return result.data as Row;
}

export async function listCommerceMirrorAttempts(context: CommerceContext, input: { state?: unknown; limit?: number } = {}) {
  requireReconcile(context);
  const client = createCommerceAdminClient();
  let query = client.from("commerce_order_mirror_attempts").select("*").eq("organization_id", context.organizationId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(Math.max(1, Math.min(200, Math.floor(input.limit || 50))));
  const state = text(input.state).toUpperCase();
  if (state) {
    if (!["PENDING", "SUCCEEDED", "FAILED"].includes(state)) throw new CommerceOrderError("Ismeretlen mirror állapot.", "COMMERCE_MIRROR_STATE_INVALID", 400);
    query = query.eq("state", state);
  }
  const result = await query;
  if (result.error) dbError("A rendelés-tükrözési állapotok nem olvashatók.", result.error);
  return ((result.data || []) as Row[]).map(mapAttempt);
}

export async function listDueCommerceMirrorAttempts(context: CommerceContext, input: { limit?: number } = {}) {
  requireReconcile(context);
  const client = createCommerceAdminClient();
  const now = new Date().toISOString();
  const result = await client
    .from("commerce_order_mirror_attempts")
    .select("*")
    .eq("organization_id", context.organizationId)
    .in("state", ["PENDING", "FAILED"])
    .is("deleted_at", null)
    .lte("next_retry_at", now)
    .order("next_retry_at", { ascending: true })
    .order("updated_at", { ascending: true })
    .limit(Math.max(1, Math.min(25, Math.floor(input.limit || 10))));
  if (result.error) dbError("Az esedékes rendelés-tükrözések nem olvashatók.", result.error);
  return ((result.data || []) as Row[]).map(mapAttempt);
}

export async function getCommerceMirrorAttempt(context: CommerceContext, attemptIdInput: unknown) {
  requireReconcile(context);
  const attemptId = text(attemptIdInput);
  if (!attemptId) throw new CommerceOrderError("A mirror attempt azonosító kötelező.", "COMMERCE_MIRROR_ATTEMPT_ID_REQUIRED", 400);
  const client = createCommerceAdminClient();
  const result = await client.from("commerce_order_mirror_attempts").select("*").eq("organization_id", context.organizationId).eq("id", attemptId).is("deleted_at", null).maybeSingle();
  if (result.error) dbError("A rendelés-tükrözési állapot nem olvasható.", result.error);
  if (!result.data) throw new CommerceOrderError("A mirror attempt nem található.", "COMMERCE_MIRROR_ATTEMPT_NOT_FOUND", 404);
  return mapAttempt(result.data as Row);
}
