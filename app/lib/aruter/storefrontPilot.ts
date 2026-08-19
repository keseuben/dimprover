import "server-only";

import type { AruterPublicProduct } from "./publicOfferData";
import type { AruterPublicReservation, CreateAruterPublicReservationInput } from "./publicReservation";
import { getAruterRepository } from "./repositoryFactory";
import type { AruterOrder, AruterProduct, AruterTemplate, AruterUnit } from "./types";
import { mirrorAruterOrderToCommerceFailOpen } from "./commerceMirror";

const TEMPLATE_VALUES = new Set<AruterTemplate>(["kertészet", "tüzép", "húsbolt", "egyedi"]);
const UNIT_VALUES = new Set<AruterUnit>(["db", "kg", "m", "m2", "m3", "raklap", "csomag", "zsák", "láda"]);

export type StorefrontPilotCatalog = {
  pilotEnabled: boolean;
  orderBridgeEnabled: boolean;
  businessSlug: string;
  products: AruterPublicProduct[];
};

export type StorefrontBridgeResult =
  | { enabled: false; bridged: false; reason: "DISABLED" }
  | { enabled: true; bridged: true; orderId: string; orderNumber: string; reused: boolean }
  | { enabled: true; bridged: false; reason: "FAILED"; code: string };

export function isStorefrontPilotEnabled() {
  return process.env.ARUTER_STOREFRONT_PILOT_ENABLED?.trim() === "1";
}

export function isStorefrontOrderBridgeEnabled() {
  return process.env.ARUTER_STOREFRONT_ORDER_BRIDGE_ENABLED?.trim() === "1";
}

function configuredTemplate(businessSlug: string): AruterTemplate | null {
  const explicit = process.env.ARUTER_STOREFRONT_PILOT_TEMPLATE?.trim() as AruterTemplate | undefined;
  if (explicit && TEMPLATE_VALUES.has(explicit)) return explicit;
  if (businessSlug === "kovacs-kerteszet") return "kertészet";
  return null;
}

async function repositoryProducts() {
  const result = await Promise.resolve(getAruterRepository().listProducts());
  return Array.isArray(result) ? result : [];
}

function grossPrice(product: AruterProduct) {
  const value = product.priceNet * (1 + product.vatRate / 100);
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function imageTone(product: AruterProduct): AruterPublicProduct["imageTone"] {
  const haystack = `${product.name} ${product.category}`.toLocaleLowerCase("hu-HU");
  if (haystack.includes("mulcs")) return "mulch";
  if (haystack.includes("föld")) return "soil";
  if (haystack.includes("levend")) return "lavender";
  if (haystack.includes("cserép") || haystack.includes("kasp")) return "pot";
  if (haystack.includes("tuja") || haystack.includes("ciprus") || product.template === "kertészet") return "evergreen";
  return "flower";
}

function publicProduct(product: AruterProduct): AruterPublicProduct {
  return {
    id: product.id,
    slug: product.sku.toLocaleLowerCase("hu-HU").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    name: product.name,
    description: product.description || product.category,
    category: product.category,
    price: grossPrice(product),
    unit: product.unit,
    stockStatus: product.stockQuantity <= 0 ? "out_of_stock" : product.stockQuantity < 10 ? "limited" : "in_stock",
    imageTone: imageTone(product),
  };
}

export async function getStorefrontPilotCatalog(businessSlugInput: string): Promise<StorefrontPilotCatalog> {
  const businessSlug = businessSlugInput.trim();
  if (!isStorefrontPilotEnabled()) {
    return { pilotEnabled: false, orderBridgeEnabled: isStorefrontOrderBridgeEnabled(), businessSlug, products: [] };
  }
  const template = configuredTemplate(businessSlug);
  const products = (await repositoryProducts())
    .filter((product) => product.isActive)
    .filter((product) => !template || product.template === template)
    .filter((product) => product.isPublicOffer !== false)
    .slice(0, 100)
    .map(publicProduct);
  return { pilotEnabled: true, orderBridgeEnabled: isStorefrontOrderBridgeEnabled(), businessSlug, products };
}

export async function normalizeStorefrontReservationInput(
  input: Partial<CreateAruterPublicReservationInput>,
): Promise<{ ok: true; input: Partial<CreateAruterPublicReservationInput> } | { ok: false; error: string }> {
  if (!isStorefrontPilotEnabled()) return { ok: true, input };
  const businessSlug = input.businessSlug?.trim() || "";
  const template = configuredTemplate(businessSlug);
  if (!businessSlug || !template) return { ok: false, error: "Ehhez az üzlethez a Storefront Pilot nincs konfigurálva." };
  const productId = input.product?.id?.trim() || "";
  const product = (await repositoryProducts()).find((item) => item.id === productId && item.isActive && item.template === template && item.isPublicOffer !== false);
  if (!product) return { ok: false, error: "A kiválasztott termék nem érhető el a nyilvános ajánlatban." };
  const quantity = Number(input.quantity || 0);
  if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: "A mennyiség legyen pozitív szám." };
  if (quantity > product.stockQuantity) return { ok: false, error: "A kért mennyiség meghaladja a jelenlegi készletet." };
  return {
    ok: true,
    input: {
      ...input,
      businessSlug,
      quantity,
      product: {
        id: product.id,
        name: product.name,
        description: product.description || product.category,
        price: grossPrice(product),
        unit: product.unit,
      },
    },
  };
}

function marker(reservationId: string) {
  return `[PUBLIC_RESERVATION:${reservationId}]`;
}

async function findOrderForReservation(reservationId: string): Promise<AruterOrder | null> {
  const orders = await Promise.resolve(getAruterRepository().listOrders());
  if (!Array.isArray(orders)) return null;
  const token = marker(reservationId);
  return orders.find((order) => order.note?.includes(token)) || null;
}

function errorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") return String((error as { code: string }).code);
  return error instanceof Error && error.name ? error.name : "UNKNOWN";
}

function logBridge(event: string, reservation: AruterPublicReservation, details: Record<string, unknown> = {}) {
  console.info("[ARUTER_STOREFRONT_BRIDGE]", JSON.stringify({ event, reservationId: reservation.id, businessSlug: reservation.businessSlug, ...details }));
}

export async function bridgePublicReservationToCashierFailOpen(
  request: Request,
  reservation: AruterPublicReservation,
): Promise<StorefrontBridgeResult> {
  if (!isStorefrontOrderBridgeEnabled()) return { enabled: false, bridged: false, reason: "DISABLED" };
  try {
    const existing = await findOrderForReservation(reservation.id);
    if (existing) {
      await mirrorAruterOrderToCommerceFailOpen(request, existing);
      logBridge("REUSED", reservation, { orderId: existing.id, orderNumber: existing.orderNumber });
      return { enabled: true, bridged: true, orderId: existing.id, orderNumber: existing.orderNumber, reused: true };
    }

    const template = configuredTemplate(reservation.businessSlug);
    if (!template) throw new Error("STOREFRONT_TEMPLATE_NOT_CONFIGURED");
    const product = (await repositoryProducts()).find((item) => item.id === reservation.productId && item.isActive && item.template === template && item.isPublicOffer !== false);
    if (!product) throw new Error("STOREFRONT_PRODUCT_NOT_FOUND");
    if (!UNIT_VALUES.has(product.unit)) throw new Error("STOREFRONT_UNIT_NOT_SUPPORTED");

    const token = marker(reservation.id);
    const noteParts = [token, `Átvétel: ${reservation.pickupSlotLabel}`, reservation.note].filter(Boolean);
    const created = await Promise.resolve(getAruterRepository().createOrder({
      template: product.template,
      customerName: reservation.customerName,
      customerType: "walk_in",
      recorderName: "Nyilvános Árutér",
      note: noteParts.join(" · "),
      items: [{
        id: `public-res-item-${reservation.id}`,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unit: product.unit,
        quantity: reservation.quantity,
        priceNet: product.priceNet,
        vatRate: product.vatRate,
        storageZone: product.storageZone,
      }],
    }));
    if (!created.ok || !created.data) throw new Error("STOREFRONT_ORDER_CREATE_FAILED");
    await mirrorAruterOrderToCommerceFailOpen(request, created.data);
    logBridge("CREATED", reservation, { orderId: created.data.id, orderNumber: created.data.orderNumber });
    return { enabled: true, bridged: true, orderId: created.data.id, orderNumber: created.data.orderNumber, reused: false };
  } catch (error) {
    const code = errorCode(error);
    logBridge("FAILED_FAIL_OPEN", reservation, { code });
    return { enabled: true, bridged: false, reason: "FAILED", code };
  }
}

export async function syncPublicReservationCancellationFailOpen(
  request: Request,
  reservation: AruterPublicReservation,
): Promise<StorefrontBridgeResult> {
  if (!isStorefrontOrderBridgeEnabled()) return { enabled: false, bridged: false, reason: "DISABLED" };
  if (reservation.status !== "cancelled") return { enabled: true, bridged: false, reason: "FAILED", code: "NO_ORDER_STATUS_CHANGE_REQUIRED" };
  try {
    const existing = await findOrderForReservation(reservation.id);
    if (!existing) return { enabled: true, bridged: false, reason: "FAILED", code: "STOREFRONT_ORDER_NOT_FOUND" };
    if (existing.status === "paid" || existing.status === "issued") {
      logBridge("CANCEL_SKIPPED_TERMINAL", reservation, { orderId: existing.id, orderStatus: existing.status });
      return { enabled: true, bridged: false, reason: "FAILED", code: "STOREFRONT_ORDER_ALREADY_TERMINAL" };
    }
    const updated = await Promise.resolve(getAruterRepository().updateOrderStatus(existing.id, "cancelled"));
    if (!updated.ok || !updated.data) throw new Error("STOREFRONT_ORDER_CANCEL_FAILED");
    await mirrorAruterOrderToCommerceFailOpen(request, updated.data);
    logBridge("CANCELLED", reservation, { orderId: updated.data.id, orderNumber: updated.data.orderNumber });
    return { enabled: true, bridged: true, orderId: updated.data.id, orderNumber: updated.data.orderNumber, reused: true };
  } catch (error) {
    const code = errorCode(error);
    logBridge("CANCEL_FAILED_FAIL_OPEN", reservation, { code });
    return { enabled: true, bridged: false, reason: "FAILED", code };
  }
}
