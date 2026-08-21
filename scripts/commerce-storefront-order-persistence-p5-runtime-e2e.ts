import { randomUUID } from "node:crypto";
import { createCommerceAdminClient } from "../app/lib/commerce/core/server-db";
import {
  createStorefrontOrder,
  findConfiguredStorefrontOrderById,
  findStorefrontOrderByTransactionKey,
  getStorefrontOrderMode,
  listConfiguredStorefrontOrders,
  updateStorefrontOrderStatus,
} from "../app/lib/aruter/storefrontOrderRepository";

function assertTrue(condition: unknown, code: string, detail = ""): asserts condition {
  if (!condition) throw new Error(`${code}${detail ? `: ${detail}` : ""}`);
}

async function main() {
  const previousMode = process.env.ARUTER_STOREFRONT_ORDER_MODE;
  const organizationId = process.env.ARUTER_STOREFRONT_COMMERCE_ORGANIZATION_ID?.trim() || "";
  const businessSlug = process.env.ARUTER_STOREFRONT_COMMERCE_BUSINESS_SLUG?.trim() || "";
  assertTrue(organizationId, "P5_ORGANIZATION_REQUIRED");
  assertTrue(businessSlug, "P5_BUSINESS_REQUIRED");

  const admin = createCommerceAdminClient();
  const marker = `[P5_RUNTIME:${randomUUID()}]`;
  const fingerprint = `[P5_PAYLOAD:${randomUUID()}]`;
  let legacyOrderId = "";

  try {
    assertTrue(process.env.ARUTER_REPOSITORY_MODE?.trim() === "mock", "P5_GLOBAL_REPOSITORY_MUST_STAY_MOCK");
    console.log("PASS 01 global Árutér repository remains mock");

    process.env.ARUTER_STOREFRONT_ORDER_MODE = "database";
    assertTrue(getStorefrontOrderMode() === "database", "P5_ORDER_MODE");
    console.log("PASS 02 Storefront order shell independently selects database mode");

    const created = await createStorefrontOrder(
      businessSlug,
      "MULTI_ITEM_CHECKOUT",
      marker,
      fingerprint,
      {
        template: "kertészet",
        customerName: "DIMARO P5 runtime QA",
        customerType: "walk_in",
        recorderName: "P5 runtime QA",
        note: `${marker} · ${fingerprint}`,
        items: [{
          id: `p5-runtime-${randomUUID()}`,
          productId: "prod-001",
          productName: "Smaragd tuja 120–140 cm",
          sku: "KERT-TUJA-120",
          unit: "db",
          quantity: 1,
          priceNet: 5490,
          vatRate: 27,
          storageZone: "KOVACS-KERT-PILOT-INTERNAL",
        }],
      },
    );
    assertTrue(created.ok && created.data && !created.reused, "P5_CREATE", created.error || "");
    legacyOrderId = created.data.id;
    assertTrue(created.data.status === "sent_to_cashier", "P5_CREATE_STATUS");
    assertTrue(created.data.orderNumber.startsWith("AR-") && created.data.orderNumber.includes("-SF-"), "P5_ORDER_NUMBER");
    console.log("PASS 03 persistent Storefront order is created with durable order number");

    const row = await admin.from("commerce_storefront_orders")
      .select("organization_id,business_slug,source_kind,transaction_key,payload_fingerprint,legacy_order_id,order_number,status")
      .eq("organization_id", organizationId)
      .eq("legacy_order_id", legacyOrderId)
      .is("deleted_at", null)
      .single();
    assertTrue(!row.error && row.data, "P5_DB_ROW", row.error?.message || "");
    assertTrue(row.data.business_slug === businessSlug && row.data.source_kind === "MULTI_ITEM_CHECKOUT", "P5_DB_SCOPE");
    assertTrue(row.data.transaction_key === marker && row.data.payload_fingerprint === fingerprint, "P5_DB_IDEMPOTENCY");
    console.log("PASS 04 persistent row keeps trusted scope and idempotency fingerprint");

    const found = await findStorefrontOrderByTransactionKey(businessSlug, marker);
    assertTrue(found?.id === legacyOrderId, "P5_FIND_TRANSACTION");
    console.log("PASS 05 transaction-key lookup survives outside in-memory repository");

    const replay = await createStorefrontOrder(
      businessSlug,
      "MULTI_ITEM_CHECKOUT",
      marker,
      fingerprint,
      {
        template: "kertészet",
        customerName: "DIMPRO P5 runtime QA",
        customerType: "walk_in",
        recorderName: "P5 runtime QA",
        note: `${marker} · ${fingerprint}`,
        items: [{
          id: "ignored-on-replay",
          productId: "prod-001",
          productName: "Smaragd tuja 120–140 cm",
          sku: "KERT-TUJA-120",
          unit: "db",
          quantity: 1,
          priceNet: 5490,
          vatRate: 27,
          storageZone: "KOVACS-KERT-PILOT-INTERNAL",
        }],
      },
    );
    assertTrue(replay.ok && replay.data?.id === legacyOrderId && replay.reused === true, "P5_REPLAY");
    console.log("PASS 06 identical idempotent replay reuses the same persistent order");

    const mismatch = await createStorefrontOrder(
      businessSlug,
      "MULTI_ITEM_CHECKOUT",
      marker,
      `${fingerprint}-changed`,
      {
        template: "kertészet",
        customerName: "DIMPRO P5 runtime QA",
        customerType: "walk_in",
        recorderName: "P5 runtime QA",
        note: marker,
        items: [{
          id: "mismatch",
          productId: "prod-001",
          productName: "Smaragd tuja 120–140 cm",
          sku: "KERT-TUJA-120",
          unit: "db",
          quantity: 1,
          priceNet: 5490,
          vatRate: 27,
          storageZone: "KOVACS-KERT-PILOT-INTERNAL",
        }],
      },
    );
    assertTrue(!mismatch.ok && mismatch.error === "COMMERCE_STOREFRONT_ORDER_IDEMPOTENCY_PAYLOAD_MISMATCH", "P5_MISMATCH", mismatch.error || "");
    console.log("PASS 07 changed payload under same transaction key is rejected");

    const byId = await findConfiguredStorefrontOrderById(legacyOrderId);
    assertTrue(byId?.businessSlug === businessSlug && byId.order.id === legacyOrderId, "P5_FIND_ID");
    console.log("PASS 08 configured persistent order is addressable by legacy order id");

    const paid = await updateStorefrontOrderStatus(businessSlug, legacyOrderId, "paid");
    assertTrue(paid.ok && paid.data?.status === "paid" && paid.data.paidAt, "P5_PAID", paid.error || "");
    console.log("PASS 09 persistent Storefront order transitions SENT_TO_CAShIER → PAID");

    const invalidCancel = await updateStorefrontOrderStatus(businessSlug, legacyOrderId, "cancelled");
    assertTrue(!invalidCancel.ok && invalidCancel.error === "COMMERCE_STOREFRONT_ORDER_STATUS_TRANSITION_INVALID", "P5_INVALID_TRANSITION", invalidCancel.error || "");
    console.log("PASS 10 invalid PAID → CANCELLED transition is rejected");

    const issued = await updateStorefrontOrderStatus(businessSlug, legacyOrderId, "issued");
    assertTrue(issued.ok && issued.data?.status === "issued" && issued.data.issuedAt, "P5_ISSUED", issued.error || "");
    console.log("PASS 11 persistent Storefront order transitions PAID → ISSUED");

    const listed = await listConfiguredStorefrontOrders();
    assertTrue(listed.some((order) => order.id === legacyOrderId && order.status === "issued"), "P5_LIST");
    console.log("PASS 12 persistent Storefront order appears in configured order listing");

    const foreign = await findStorefrontOrderByTransactionKey("not-configured-storefront", marker);
    assertTrue(foreign === null, "P5_FOREIGN_SCOPE");
    console.log("PASS 13 unconfigured business slug cannot read persistent order");

    const meta = await admin.from("commerce_schema_meta")
      .select("schema_version,migration_count,bootstrap_id")
      .eq("component", "commerce-core")
      .single();
    assertTrue(!meta.error && meta.data?.schema_version === "0.1.16" && Number(meta.data?.migration_count) === 17, "P5_SCHEMA_META", JSON.stringify(meta.data));
    console.log("PASS 14 Commerce schema meta is P5 0.1.16 / 17");

    console.log("RESULT 14/14 PASS");
  } finally {
    if (legacyOrderId) {
      const cleanup = await admin.from("commerce_storefront_orders")
        .update({ deleted_at: new Date().toISOString() })
        .eq("organization_id", organizationId)
        .eq("legacy_order_id", legacyOrderId)
        .is("deleted_at", null);
      if (cleanup.error) console.error("P5_CLEANUP_FAILED", cleanup.error.message);
    }
    if (previousMode === undefined) delete process.env.ARUTER_STOREFRONT_ORDER_MODE;
    else process.env.ARUTER_STOREFRONT_ORDER_MODE = previousMode;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
