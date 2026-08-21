import "server-only";

import { createCommerceAdminClient } from "../commerce/core/server-db";
import { getAruterRepository } from "./repositoryFactory";
import type { AruterRepositoryResult } from "./repositoryTypes";
import type { AruterOrder, AruterOrderStatus } from "./types";

const ORGANIZATION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUSINESS_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

export type StorefrontOrderMode = "repository" | "database";
export type StorefrontOrderSourceKind = "MULTI_ITEM_CHECKOUT" | "PUBLIC_RESERVATION";
export type StorefrontOrderCreateResult = AruterRepositoryResult<AruterOrder> & { reused?: boolean };
export type ConfiguredStorefrontOrder = { businessSlug: string; order: AruterOrder };

type Row = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
}

export function getStorefrontOrderMode(): StorefrontOrderMode {
  return process.env.ARUTER_STOREFRONT_ORDER_MODE?.trim() === "database" ? "database" : "repository";
}

export function isStorefrontOrderDatabaseMode() {
  return getStorefrontOrderMode() === "database";
}

export function resolveStorefrontOrderPersistenceScope(businessSlugInput: string) {
  const businessSlug = businessSlugInput.trim();
  const configuredSlug = process.env.ARUTER_STOREFRONT_COMMERCE_BUSINESS_SLUG?.trim() || "";
  const organizationId = process.env.ARUTER_STOREFRONT_COMMERCE_ORGANIZATION_ID?.trim() || "";
  if (!BUSINESS_SLUG_PATTERN.test(businessSlug) || businessSlug !== configuredSlug) return null;
  if (!ORGANIZATION_PATTERN.test(organizationId)) return null;
  return { businessSlug, organizationId };
}

function configuredScope() {
  const businessSlug = process.env.ARUTER_STOREFRONT_COMMERCE_BUSINESS_SLUG?.trim() || "";
  return resolveStorefrontOrderPersistenceScope(businessSlug);
}

function parseOrderPayload(value: unknown): AruterOrder | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const order = value as Partial<AruterOrder>;
  if (!text(order.id) || !text(order.orderNumber) || !text(order.status) || !Array.isArray(order.items) || !text(order.createdAt)) return null;
  return order as AruterOrder;
}

function databaseFailure(error: { message?: string; code?: string } | null | undefined, fallback: string): AruterRepositoryResult<AruterOrder> {
  const raw = text(error?.message);
  const code = raw.match(/COMMERCE_[A-Z0-9_]+/)?.[0];
  return { ok: false, error: code || fallback };
}

export async function findStorefrontOrderByTransactionKey(
  businessSlug: string,
  transactionKey: string,
): Promise<AruterOrder | null> {
  if (!isStorefrontOrderDatabaseMode()) {
    const orders = await Promise.resolve(getAruterRepository().listOrders());
    if (!Array.isArray(orders)) return null;
    return orders.find((order) => order.note?.includes(transactionKey)) || null;
  }

  const scope = resolveStorefrontOrderPersistenceScope(businessSlug);
  if (!scope) return null;
  const client = createCommerceAdminClient();
  const result = await client
    .from("commerce_storefront_orders")
    .select("order_payload")
    .eq("organization_id", scope.organizationId)
    .eq("business_slug", scope.businessSlug)
    .eq("transaction_key", transactionKey)
    .is("deleted_at", null)
    .maybeSingle();
  if (result.error) throw new Error(`STOREFRONT_ORDER_DATABASE_READ_FAILED:${result.error.code || "UNKNOWN"}`);
  return result.data ? parseOrderPayload((result.data as Row).order_payload) : null;
}

export async function createStorefrontOrder(
  businessSlug: string,
  sourceKind: StorefrontOrderSourceKind,
  transactionKey: string,
  payloadFingerprint: string,
  input: Pick<AruterOrder, "template" | "customerName" | "customerType" | "recorderName" | "items"> & Partial<Pick<AruterOrder, "note" | "pickupTime">>,
): Promise<StorefrontOrderCreateResult> {
  if (!isStorefrontOrderDatabaseMode()) {
    const created = await Promise.resolve(getAruterRepository().createOrder(input));
    return { ...created, reused: false };
  }

  const scope = resolveStorefrontOrderPersistenceScope(businessSlug);
  if (!scope) return { ok: false, error: "STOREFRONT_ORDER_DATABASE_SCOPE_NOT_CONFIGURED" };
  const client = createCommerceAdminClient();
  const result = await client.rpc("commerce_storefront_order_create", {
    p_organization_id: scope.organizationId,
    p_business_slug: scope.businessSlug,
    p_source_kind: sourceKind,
    p_transaction_key: transactionKey,
    p_payload_fingerprint: payloadFingerprint,
    p_order_payload: input,
  });
  if (result.error) return databaseFailure(result.error, "STOREFRONT_ORDER_DATABASE_CREATE_FAILED");
  const row = (result.data || {}) as Row;
  const order = parseOrderPayload(row.order);
  if (!order) return { ok: false, error: "STOREFRONT_ORDER_DATABASE_PAYLOAD_INVALID" };
  return { ok: true, data: order, reused: Boolean(row.duplicate) };
}

export async function findConfiguredStorefrontOrderById(orderIdInput: string): Promise<ConfiguredStorefrontOrder | null> {
  if (!isStorefrontOrderDatabaseMode()) return null;
  const orderId = orderIdInput.trim();
  const scope = configuredScope();
  if (!scope || !orderId) return null;
  const client = createCommerceAdminClient();
  const result = await client
    .from("commerce_storefront_orders")
    .select("business_slug,order_payload")
    .eq("organization_id", scope.organizationId)
    .eq("business_slug", scope.businessSlug)
    .eq("legacy_order_id", orderId)
    .is("deleted_at", null)
    .maybeSingle();
  if (result.error) throw new Error(`STOREFRONT_ORDER_DATABASE_READ_FAILED:${result.error.code || "UNKNOWN"}`);
  if (!result.data) return null;
  const order = parseOrderPayload((result.data as Row).order_payload);
  return order ? { businessSlug: text((result.data as Row).business_slug), order } : null;
}

export async function updateStorefrontOrderStatus(
  businessSlug: string,
  orderId: string,
  status: AruterOrderStatus,
): Promise<AruterRepositoryResult<AruterOrder>> {
  if (!isStorefrontOrderDatabaseMode()) {
    return Promise.resolve(getAruterRepository().updateOrderStatus(orderId, status));
  }
  const scope = resolveStorefrontOrderPersistenceScope(businessSlug);
  if (!scope) return { ok: false, error: "STOREFRONT_ORDER_DATABASE_SCOPE_NOT_CONFIGURED" };
  const client = createCommerceAdminClient();
  const result = await client.rpc("commerce_storefront_order_set_status", {
    p_organization_id: scope.organizationId,
    p_legacy_order_id: orderId,
    p_status: status,
  });
  if (result.error) return databaseFailure(result.error, "STOREFRONT_ORDER_DATABASE_STATUS_FAILED");
  const order = parseOrderPayload(((result.data || {}) as Row).order);
  return order ? { ok: true, data: order } : { ok: false, error: "STOREFRONT_ORDER_DATABASE_PAYLOAD_INVALID" };
}

export async function listConfiguredStorefrontOrders(): Promise<AruterOrder[]> {
  if (!isStorefrontOrderDatabaseMode()) return [];
  const scope = configuredScope();
  if (!scope) return [];
  const client = createCommerceAdminClient();
  const result = await client
    .from("commerce_storefront_orders")
    .select("order_payload")
    .eq("organization_id", scope.organizationId)
    .eq("business_slug", scope.businessSlug)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (result.error) throw new Error(`STOREFRONT_ORDER_DATABASE_LIST_FAILED:${result.error.code || "UNKNOWN"}`);
  return ((result.data || []) as Row[]).map((row) => parseOrderPayload(row.order_payload)).filter((order): order is AruterOrder => Boolean(order));
}
