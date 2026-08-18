import "server-only";

import type { AruterOrder } from "./types";
import { resolveCommerceContext } from "../commerce/core/server-context";
import { legacyAruterOrderRequiredTransitions, resolveLegacyAruterOrderForCommerce } from "../commerce/order/legacyBridge";
import { createCommerceOrder, reserveCommerceOrderInventory, setCommerceOrderStatus } from "../commerce/order/repository";

type MirrorResult =
  | { enabled: false; mirrored: false; reason: "DISABLED" }
  | { enabled: true; mirrored: true; commerceOrderId: string; mappedItemCount: number; unresolvedItemCount: number }
  | { enabled: true; mirrored: false; reason: "FAILED"; errorCode: string };

function enabled() {
  return process.env.ARUTER_COMMERCE_ORDER_MIRROR_ENABLED?.trim() === "1";
}

function requestedOrganizationId(request: Request) {
  const header = request.headers.get("x-dimpro-organization-id")?.trim();
  if (header) return header;
  try {
    return new URL(request.url).searchParams.get("organizationId")?.trim() || null;
  } catch {
    return null;
  }
}

function configuredSourceId() {
  return process.env.ARUTER_COMMERCE_FULFILLMENT_SOURCE_ID?.trim() || null;
}

function errorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return error instanceof Error && error.name ? error.name : "UNKNOWN";
}

function logMirror(event: string, order: AruterOrder, details: Record<string, unknown>) {
  console.info("[ARUTER_COMMERCE_MIRROR]", JSON.stringify({
    event,
    legacyOrderId: order.id,
    orderNumber: order.orderNumber,
    legacyStatus: order.status,
    ...details,
  }));
}

export async function mirrorAruterOrderToCommerceFailOpen(request: Request, order: AruterOrder): Promise<MirrorResult> {
  if (!enabled()) return { enabled: false, mirrored: false, reason: "DISABLED" };

  try {
    const context = await resolveCommerceContext(requestedOrganizationId(request));
    const fulfillmentSourceId = configuredSourceId();
    const resolved = await resolveLegacyAruterOrderForCommerce(context, order, { resolveInventory: Boolean(fulfillmentSourceId) });
    const created = await createCommerceOrder(context, resolved.payload);
    const commerceOrderId = String(created.orderId || "");
    if (!commerceOrderId) throw new Error("COMMERCE_LEGACY_MIRROR_ORDER_ID_MISSING");

    if (fulfillmentSourceId && order.status !== "draft" && order.status !== "cancelled") {
      await reserveCommerceOrderInventory(context, commerceOrderId, {
        sourceId: fulfillmentSourceId,
        idempotencyKey: `legacy-aruter-reserve:${order.id}`,
      });
    }

    for (const transition of legacyAruterOrderRequiredTransitions(order)) {
      await setCommerceOrderStatus(context, commerceOrderId, {
        ...transition,
        idempotencyKey: `legacy-aruter-status:${order.id}:${transition.status.toLowerCase()}`,
      });
    }

    logMirror("MIRRORED", order, {
      organizationId: context.organizationId,
      commerceOrderId,
      mappedItemCount: resolved.mappedItemCount,
      unresolvedItemCount: resolved.unresolvedItemCount,
      fulfillmentSourceConfigured: Boolean(fulfillmentSourceId),
    });

    return {
      enabled: true,
      mirrored: true,
      commerceOrderId,
      mappedItemCount: resolved.mappedItemCount,
      unresolvedItemCount: resolved.unresolvedItemCount,
    };
  } catch (error) {
    const code = errorCode(error);
    logMirror("FAILED_FAIL_OPEN", order, { errorCode: code });
    return { enabled: true, mirrored: false, reason: "FAILED", errorCode: code };
  }
}
