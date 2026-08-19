import "server-only";

import { createHash } from "node:crypto";
import { getAruterRepository } from "./repositoryFactory";
import type { AruterOrder, AruterProduct, AruterUnit } from "./types";
import {
  getStorefrontRepositoryProducts,
  queueStorefrontCommerceMirrorFailOpen,
  resolveStorefrontTemplate,
} from "./storefrontPilot";

const UNIT_VALUES = new Set<AruterUnit>(["db", "kg", "m", "m2", "m3", "raklap", "csomag", "zsák", "láda"]);
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

export type StorefrontCheckoutRequestItem = {
  productId: string;
  quantity: number;
};

export type StorefrontCheckoutInput = {
  businessSlug: string;
  items: StorefrontCheckoutRequestItem[];
  pickupSlotId: string;
  pickupSlotLabel: string;
  customerName: string;
  phone: string;
  email?: string;
  note?: string;
  acceptedPrivacy: boolean;
};

export type StorefrontCheckoutResult = {
  orderId: string;
  orderNumber: string;
  lineCount: number;
  itemQuantity: number;
  grossTotal: number;
  reused: boolean;
  commerceQueued: boolean;
};

type CheckoutError = { ok: false; status: number; code: string; error: string };
type CheckoutSuccess = { ok: true; data: StorefrontCheckoutResult };

export function isStorefrontMultiItemCheckoutEnabled() {
  return process.env.ARUTER_STOREFRONT_MULTI_ITEM_CHECKOUT_ENABLED?.trim() === "1";
}

function checkoutMarker(businessSlug: string, idempotencyKey: string) {
  const digest = createHash("sha256").update(`${businessSlug}|${idempotencyKey}`).digest("hex").slice(0, 24);
  return `[PUBLIC_CHECKOUT:${digest}]`;
}

function checkoutPayloadMarker(input: Partial<StorefrontCheckoutInput>, requested: Map<string, number>) {
  const canonical = JSON.stringify({
    businessSlug: input.businessSlug?.trim() || "",
    items: [...requested.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([productId, quantity]) => ({ productId, quantity })),
    pickupSlotId: input.pickupSlotId?.trim() || "",
    pickupSlotLabel: input.pickupSlotLabel?.trim() || "",
    customerName: input.customerName?.trim() || "",
    phone: input.phone?.trim() || "",
    email: input.email?.trim() || "",
    note: input.note?.trim() || "",
    acceptedPrivacy: Boolean(input.acceptedPrivacy),
  });
  const digest = createHash("sha256").update(canonical).digest("hex").slice(0, 24);
  return `[CHECKOUT_PAYLOAD:${digest}]`;
}

function fail(status: number, code: string, error: string): CheckoutError {
  return { ok: false, status, code, error };
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function aggregateItems(items: StorefrontCheckoutRequestItem[]) {
  const quantities = new Map<string, number>();
  for (const item of items) {
    const productId = typeof item?.productId === "string" ? item.productId.trim() : "";
    const quantity = Number(item?.quantity);
    if (!productId || !Number.isFinite(quantity) || quantity <= 0) return null;
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }
  return quantities;
}

async function existingCheckoutOrder(marker: string): Promise<AruterOrder | null> {
  const orders = await Promise.resolve(getAruterRepository().listOrders());
  if (!Array.isArray(orders)) return null;
  return orders.find((order) => order.note?.includes(marker)) || null;
}

function orderItem(product: AruterProduct, quantity: number, marker: string) {
  return {
    id: `public-checkout-${marker.replace(/[^a-z0-9]/gi, "").slice(-24)}-${product.id}`,
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    unit: product.unit,
    quantity,
    priceNet: product.priceNet,
    vatRate: product.vatRate,
    storageZone: product.storageZone,
  };
}

function summarize(order: AruterOrder, reused: boolean, commerceQueued: boolean): StorefrontCheckoutResult {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    lineCount: order.items.length,
    itemQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
    grossTotal: money(order.items.reduce((sum, item) => sum + item.quantity * item.priceNet * (1 + item.vatRate / 100), 0)),
    reused,
    commerceQueued,
  };
}

export async function createStorefrontMultiItemCheckout(
  input: Partial<StorefrontCheckoutInput>,
  idempotencyKeyInput: string,
): Promise<CheckoutSuccess | CheckoutError> {
  if (!isStorefrontMultiItemCheckoutEnabled()) return fail(404, "STOREFRONT_MULTI_ITEM_CHECKOUT_DISABLED", "A többtételes checkout még nincs engedélyezve.");
  const idempotencyKey = idempotencyKeyInput.trim();
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) return fail(400, "STOREFRONT_CHECKOUT_IDEMPOTENCY_INVALID", "Érvényes, legalább 16 karakteres Idempotency-Key szükséges.");

  const businessSlug = input.businessSlug?.trim() || "";
  const template = resolveStorefrontTemplate(businessSlug);
  if (!businessSlug || !template) return fail(400, "STOREFRONT_CHECKOUT_BUSINESS_NOT_CONFIGURED", "Ehhez az üzlethez a checkout nincs konfigurálva.");
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) return fail(400, "STOREFRONT_CHECKOUT_ITEMS_INVALID", "A kosár 1–50 tételsort tartalmazhat.");
  if (!input.pickupSlotId?.trim() || !input.pickupSlotLabel?.trim()) return fail(400, "STOREFRONT_CHECKOUT_PICKUP_REQUIRED", "Válassz átvételi idősávot.");
  if (!input.customerName?.trim() || input.customerName.trim().length < 2) return fail(400, "STOREFRONT_CHECKOUT_CUSTOMER_REQUIRED", "Add meg a neved.");
  if (!input.phone?.trim() || input.phone.trim().length < 6) return fail(400, "STOREFRONT_CHECKOUT_PHONE_REQUIRED", "Add meg a telefonszámod.");
  if (!input.acceptedPrivacy) return fail(400, "STOREFRONT_CHECKOUT_PRIVACY_REQUIRED", "Az adatkezelési elfogadás szükséges.");

  const requested = aggregateItems(input.items as StorefrontCheckoutRequestItem[]);
  if (!requested || requested.size < 1 || requested.size > 25) return fail(400, "STOREFRONT_CHECKOUT_ITEMS_INVALID", "A kosár legfeljebb 25 különböző terméket tartalmazhat pozitív mennyiséggel.");

  const products = await getStorefrontRepositoryProducts();
  const authoritative = new Map(
    products
      .filter((product) => product.isActive && product.template === template && product.isPublicOffer !== false)
      .map((product) => [product.id, product]),
  );
  const lines: Array<{ product: AruterProduct; quantity: number }> = [];
  for (const [productId, quantity] of requested.entries()) {
    const product = authoritative.get(productId);
    if (!product || !UNIT_VALUES.has(product.unit)) return fail(400, "STOREFRONT_CHECKOUT_PRODUCT_NOT_AVAILABLE", `A termék nem foglalható: ${productId}`);
    if (quantity > product.stockQuantity) return fail(409, "STOREFRONT_CHECKOUT_STOCK_EXCEEDED", `A kért mennyiség meghaladja a készletet: ${product.name}`);
    lines.push({ product, quantity });
  }

  const marker = checkoutMarker(businessSlug, idempotencyKey);
  const payloadMarker = checkoutPayloadMarker(input, requested);
  const existing = await existingCheckoutOrder(marker);
  if (existing) {
    if (!existing.note?.includes(payloadMarker)) return fail(409, "STOREFRONT_CHECKOUT_IDEMPOTENCY_PAYLOAD_MISMATCH", "Az Idempotency-Key már egy eltérő checkout kéréshez tartozik.");
    const queue = await queueStorefrontCommerceMirrorFailOpen(businessSlug, existing);
    return { ok: true, data: summarize(existing, true, queue.queued) };
  }

  const noteParts = [
    marker,
    payloadMarker,
    `Átvétel: ${input.pickupSlotLabel.trim()}`,
    `Telefon: ${input.phone.trim()}`,
    input.email?.trim() ? `E-mail: ${input.email.trim()}` : null,
    input.note?.trim() || null,
  ].filter(Boolean);
  const created = await Promise.resolve(getAruterRepository().createOrder({
    template,
    customerName: input.customerName.trim(),
    customerType: "walk_in",
    recorderName: "Nyilvános Árutér · többtételes checkout",
    note: noteParts.join(" · "),
    items: lines.map(({ product, quantity }) => orderItem(product, quantity, marker)),
  }));
  if (!created.ok || !created.data) return fail(503, "STOREFRONT_CHECKOUT_ORDER_CREATE_FAILED", created.error || "A rendelés létrehozása nem sikerült.");

  const queue = await queueStorefrontCommerceMirrorFailOpen(businessSlug, created.data);
  return { ok: true, data: summarize(created.data, false, queue.queued) };
}
