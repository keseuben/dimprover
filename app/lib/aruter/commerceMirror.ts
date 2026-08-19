import "server-only";

import type { AruterOrder } from "./types";
import { resolveCommerceContext } from "../commerce/core/server-context";
import type { CommerceContext } from "../commerce/core/types";
import { getCommerceMirrorAttempt, recordCommerceMirrorAttempt } from "../commerce/order/mirrorReconciliation";
import { legacyAruterOrderRequiredTransitions, resolveLegacyAruterOrderForCommerce } from "../commerce/order/legacyBridge";
import { CommerceOrderError, createCommerceOrder, reserveCommerceOrderInventory, setCommerceOrderStatus } from "../commerce/order/repository";

type MirrorResult =
  | { enabled: false; mirrored: false; reason: "DISABLED" }
  | { enabled: true; mirrored: true; commerceOrderId: string; mappedItemCount: number; unresolvedItemCount: number; healthPersisted: boolean }
  | { enabled: true; mirrored: false; reason: "FAILED"; errorCode: string; healthPersisted: boolean };

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

function safeErrorMessage(error: unknown) {
  if (error instanceof CommerceOrderError) return error.message.slice(0, 500);
  return "Ismeretlen Commerce mirror hiba.";
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

async function persistMirrorState(
  context: CommerceContext,
  order: AruterOrder,
  input: Parameters<typeof recordCommerceMirrorAttempt>[2],
) {
  try {
    await recordCommerceMirrorAttempt(context, order, input);
    return true;
  } catch (error) {
    logMirror("HEALTH_RECORD_FAILED", order, { organizationId: context.organizationId, errorCode: errorCode(error) });
    return false;
  }
}

export async function mirrorAruterOrderWithCommerceContext(context: CommerceContext, order: AruterOrder): Promise<Exclude<MirrorResult, { enabled: false }>> {
  let commerceOrderId: string | null = null;
  let mappedItemCount = 0;
  let unresolvedItemCount = order.items.length;
  await persistMirrorState(context, order, { state: "PENDING", mappedItemCount, unresolvedItemCount });

  try {
    const fulfillmentSourceId = configuredSourceId();
    const resolved = await resolveLegacyAruterOrderForCommerce(context, order, { resolveInventory: Boolean(fulfillmentSourceId) });
    mappedItemCount = resolved.mappedItemCount;
    unresolvedItemCount = resolved.unresolvedItemCount;
    const created = await createCommerceOrder(context, resolved.payload);
    commerceOrderId = String(created.orderId || "");
    if (!commerceOrderId) throw new CommerceOrderError("A Commerce mirror rendelésazonosító hiányzik.", "COMMERCE_LEGACY_MIRROR_ORDER_ID_MISSING", 503);

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

    const healthPersisted = await persistMirrorState(context, order, {
      state: "SUCCEEDED",
      commerceOrderId,
      mappedItemCount,
      unresolvedItemCount,
    });
    logMirror("MIRRORED", order, {
      organizationId: context.organizationId,
      commerceOrderId,
      mappedItemCount,
      unresolvedItemCount,
      fulfillmentSourceConfigured: Boolean(fulfillmentSourceId),
      healthPersisted,
    });
    return { enabled: true, mirrored: true, commerceOrderId, mappedItemCount, unresolvedItemCount, healthPersisted };
  } catch (error) {
    const code = errorCode(error);
    const healthPersisted = await persistMirrorState(context, order, {
      state: "FAILED",
      commerceOrderId,
      mappedItemCount,
      unresolvedItemCount,
      errorCode: code,
      errorMessage: safeErrorMessage(error),
    });
    logMirror("FAILED_FAIL_OPEN", order, { organizationId: context.organizationId, commerceOrderId, errorCode: code, healthPersisted });
    return { enabled: true, mirrored: false, reason: "FAILED", errorCode: code, healthPersisted };
  }
}

export async function mirrorAruterOrderToCommerceFailOpen(request: Request, order: AruterOrder): Promise<MirrorResult> {
  if (!enabled()) return { enabled: false, mirrored: false, reason: "DISABLED" };

  try {
    const context = await resolveCommerceContext(requestedOrganizationId(request));
    return await mirrorAruterOrderWithCommerceContext(context, order);
  } catch (error) {
    const code = errorCode(error);
    logMirror("FAILED_FAIL_OPEN", order, { errorCode: code, contextResolved: false });
    return { enabled: true, mirrored: false, reason: "FAILED", errorCode: code, healthPersisted: false };
  }
}

export async function retryAruterOrderCommerceMirror(context: CommerceContext, attemptId: string) {
  const attempt = await getCommerceMirrorAttempt(context, attemptId);
  if (attempt.state === "SUCCEEDED") {
    throw new CommerceOrderError("A rendelés tükrözése már sikeresen lezárult.", "COMMERCE_MIRROR_ALREADY_SUCCEEDED", 409);
  }
  if (attempt.state === "PENDING" && attempt.lastAttemptAt) {
    const ageMs = Date.now() - Date.parse(attempt.lastAttemptAt);
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 120_000) {
      throw new CommerceOrderError("A rendelés tükrözése még folyamatban van.", "COMMERCE_MIRROR_ATTEMPT_IN_PROGRESS", 409);
    }
  }
  return mirrorAruterOrderWithCommerceContext(context, attempt.legacyOrderPayload);
}
