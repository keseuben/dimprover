import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

function required(name) {
  const value = process.env[name]?.trim();
  assert.ok(value, `${name} hiányzik`);
  return value;
}

const SUPABASE_URL = required("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");
const ORGANIZATION_ID = required("ARUTER_STOREFRONT_COMMERCE_ORGANIZATION_ID");
const WORKER_ACTOR_ID = required("DIMPRO_COMMERCE_STOREFRONT_MIRROR_WORKER_ACTOR_USER_ID");
const BASE = required("STOREFRONT_P2_E2E_BASE").replace(/\/$/, "");
const HOST = process.env.STOREFRONT_P2_E2E_HOST?.trim() || "aruter.dev.dimpro.hu";
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const marker = randomUUID();
const idempotencyKey = `p2-pilot-checkout-${marker}`;
const quantityBySku = new Map([["KERT-TUJA-120", 1], ["KERT-MULCS-50", 1]]);
const checks = [];
let legacyOrderId = "";
let attemptId = "";
let commerceOrderId = "";
let sourceId = "";
let issued = false;
let restored = false;
const variants = new Map();
const initialBalances = new Map();

function pass(name, condition, detail = "") {
  assert.ok(condition, `${name}${detail ? `: ${detail}` : ""}`);
  checks.push(name);
  console.log(`PASS ${String(checks.length).padStart(2, "0")} ${name}`);
}

async function api(path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      host: HOST,
      "x-forwarded-host": HOST,
      ...headers,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const raw = await response.text();
  let json = null;
  try { json = JSON.parse(raw); } catch {}
  return { status: response.status, raw, json };
}

async function waitFor(label, probe, { timeoutMs = 20000, intervalMs = 200 } = {}) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    last = await probe();
    if (last?.ok) return last.value;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(`${label} timeout: ${JSON.stringify(last)}`);
}

function runWorker() {
  return spawnSync(process.execPath, ["-r", "./scripts/load-next-env.cjs", "./scripts/run-commerce-storefront-mirror-worker.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      DIMPRO_COMMERCE_STOREFRONT_MIRROR_WORKER_ENABLED: "1",
      ARUTER_STOREFRONT_COMMERCE_ORGANIZATION_ID: ORGANIZATION_ID,
      DIMPRO_COMMERCE_STOREFRONT_MIRROR_WORKER_ACTOR_USER_ID: WORKER_ACTOR_ID,
      DIMPRO_COMMERCE_STOREFRONT_MIRROR_WORKER_LIMIT: "10",
      ARUTER_COMMERCE_FULFILLMENT_SOURCE_ID: "",
      ARUTER_COMMERCE_AUTO_FULFILLMENT_RESOLVE_ENABLED: "0",
    },
  });
}

async function loadAttempt() {
  if (!legacyOrderId) return null;
  const result = await admin.from("commerce_order_mirror_attempts").select("*")
    .eq("organization_id", ORGANIZATION_ID).eq("legacy_order_id", legacyOrderId).is("deleted_at", null).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function processPending(expectedStatus) {
  const pending = await waitFor(`queue ${expectedStatus}`, async () => {
    const row = await loadAttempt();
    return { ok: row?.state === "PENDING" && row?.legacy_status === expectedStatus, value: row };
  });
  attemptId = String(pending.id);
  const worker = runWorker();
  if (worker.status !== 0) {
    throw new Error(`worker failed ${worker.status}: ${(worker.stderr || "").slice(-1200)}`);
  }
  return waitFor(`worker ${expectedStatus}`, async () => {
    const row = await loadAttempt();
    return { ok: row?.state === "SUCCEEDED" && row?.legacy_status === expectedStatus, value: row };
  });
}

async function balanceFor(variantId) {
  const result = await admin.from("commerce_inventory_balances")
    .select("physical_quantity,reserved_quantity,available_quantity")
    .eq("organization_id", ORGANIZATION_ID).eq("source_id", sourceId).eq("variant_id", variantId)
    .eq("stock_status", "SELLABLE").is("deleted_at", null).single();
  if (result.error) throw result.error;
  return {
    physical: Number(result.data.physical_quantity),
    reserved: Number(result.data.reserved_quantity),
    available: Number(result.data.available_quantity),
  };
}

async function restoreIssuedStock() {
  if (!issued || restored || !sourceId) return;
  for (const [sku, variantId] of variants) {
    const quantity = quantityBySku.get(sku) || 0;
    if (!quantity) continue;
    const result = await admin.rpc("commerce_inventory_apply_movement", {
      p_organization_id: ORGANIZATION_ID,
      p_source_id: sourceId,
      p_variant_id: variantId,
      p_stock_status: "SELLABLE",
      p_movement_type: "ADJUSTMENT",
      p_physical_delta: quantity,
      p_reserved_delta: 0,
      p_incoming_delta: 0,
      p_idempotency_key: `p2-e2e-restore:${marker}:${sku}`,
      p_reference_type: "P2_E2E_RESTORE",
      p_reference_id: null,
      p_occurred_at: new Date().toISOString(),
    });
    if (result.error) throw result.error;
  }
  restored = true;
}

try {
  const meta = await admin.from("commerce_schema_meta").select("schema_version,migration_count")
    .eq("component", "commerce-core").single();
  if (meta.error) throw meta.error;
  pass("Commerce schema is P2 0.1.15 / 16", meta.data.schema_version === "0.1.15" && Number(meta.data.migration_count) === 16, JSON.stringify(meta.data));

  const storefront = await admin.from("commerce_storefronts")
    .select("id,default_fulfillment_source_id,status").eq("organization_id", ORGANIZATION_ID)
    .eq("slug", "kovacs-kerteszet").is("deleted_at", null).single();
  if (storefront.error) throw storefront.error;
  sourceId = String(storefront.data.default_fulfillment_source_id || "");
  pass("pilot Storefront has active default fulfillment source", storefront.data.status === "ACTIVE" && Boolean(sourceId));

  const mappings = await admin.from("commerce_storefront_product_mappings")
    .select("external_product_id,external_sku,variant_id,product_id,fulfillment_source_id,active")
    .eq("organization_id", ORGANIZATION_ID).eq("storefront_id", storefront.data.id)
    .in("external_product_id", ["prod-001", "prod-002"]).is("deleted_at", null);
  if (mappings.error) throw mappings.error;
  pass("both pilot products are mapped", mappings.data.length === 2 && mappings.data.every(row => row.active && row.fulfillment_source_id === sourceId), JSON.stringify(mappings.data));
  for (const row of mappings.data) variants.set(String(row.external_sku), String(row.variant_id));
  pass("pilot mappings expose expected SKUs", variants.has("KERT-TUJA-120") && variants.has("KERT-MULCS-50"));

  for (const [sku, variantId] of variants) initialBalances.set(sku, await balanceFor(variantId));
  pass("pilot balances have enough available stock", [...initialBalances].every(([sku, b]) => b.available >= (quantityBySku.get(sku) || 0)), JSON.stringify(Object.fromEntries(initialBalances)));

  const due = await admin.from("commerce_order_mirror_attempts").select("id", { count: "exact", head: true })
    .eq("organization_id", ORGANIZATION_ID).is("deleted_at", null).in("state", ["PENDING", "FAILED"])
    .lte("next_retry_at", new Date().toISOString());
  if (due.error) throw due.error;
  pass("P2 E2E starts without foreign due mirror jobs", Number(due.count || 0) === 0, String(due.count || 0));

  const checkout = await api("/api/aruter/public-checkouts", {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey },
    body: {
      businessSlug: "kovacs-kerteszet",
      items: [{ productId: "prod-001", quantity: 1 }, { productId: "prod-002", quantity: 1 }],
      pickupSlotId: "slot-1500",
      pickupSlotLabel: "15:00",
      customerName: "DIMPRO P2 Pilot E2E",
      phone: "+36 30 000 0000",
      email: "p2-pilot-e2e@example.invalid",
      note: `P2 lifecycle E2E ${marker}`,
      acceptedPrivacy: true,
    },
  });
  pass("public pilot checkout returns 201 and queues Commerce", checkout.status === 201 && checkout.json?.ok === true && checkout.json?.data?.commerceQueued === true, `${checkout.status} ${checkout.raw.slice(0, 600)}`);
  legacyOrderId = String(checkout.json?.data?.orderId || "");
  assert.ok(legacyOrderId, "legacyOrderId hiányzik");

  let attempt = await processPending("sent_to_cashier");
  commerceOrderId = String(attempt.commerce_order_id || "");
  pass("initial mirror succeeds with mapped 2 / unresolved 0", Boolean(commerceOrderId) && Number(attempt.mapped_item_count) === 2 && Number(attempt.unresolved_item_count) === 0, JSON.stringify(attempt));
  pass("queue payload keeps Storefront slug context", attempt.legacy_order_payload?.commerceContext?.storefrontSlug === "kovacs-kerteszet", JSON.stringify(attempt.legacy_order_payload?.commerceContext));

  const order1 = await admin.from("commerce_orders").select("status,fulfillment_source_id")
    .eq("organization_id", ORGANIZATION_ID).eq("id", commerceOrderId).single();
  if (order1.error) throw order1.error;
  pass("Commerce order is cashier-ready on pilot fulfillment source", order1.data.status === "SENT_TO_CASHIER" && order1.data.fulfillment_source_id === sourceId, JSON.stringify(order1.data));

  const items1 = await admin.from("commerce_order_items").select("sku,unit,inventory_status,reservation_id,variant_id")
    .eq("organization_id", ORGANIZATION_ID).eq("order_id", commerceOrderId).is("deleted_at", null).order("sku");
  if (items1.error) throw items1.error;
  pass("both Commerce lines are RESERVED", items1.data.length === 2 && items1.data.every(row => row.inventory_status === "RESERVED" && row.reservation_id), JSON.stringify(items1.data));
  const units = Object.fromEntries(items1.data.map(row => [row.sku, row.unit]));
  pass("mapped Commerce units are DB and ZSAK", units["KERT-TUJA-120"] === "DB" && units["KERT-MULCS-50"] === "ZSAK", JSON.stringify(units));

  for (const [sku, variantId] of variants) {
    const initial = initialBalances.get(sku);
    const current = await balanceFor(variantId);
    const q = quantityBySku.get(sku) || 0;
    pass(`${sku} reservation changes only reserved/available`, current.physical === initial.physical && current.reserved === initial.reserved + q && current.available === initial.available - q, JSON.stringify({ initial, current }));
  }

  const paid = await api(`/api/aruter/orders/${legacyOrderId}/status`, { method: "PATCH", body: { status: "paid" } });
  pass("legacy Storefront status PATCH paid succeeds", paid.status === 200 && paid.json?.ok === true, `${paid.status} ${paid.raw.slice(0, 400)}`);
  attempt = await processPending("paid");
  pass("paid update reuses same Commerce order", String(attempt.commerce_order_id) === commerceOrderId);
  const orderPaid = await admin.from("commerce_orders").select("status").eq("id", commerceOrderId).single();
  if (orderPaid.error) throw orderPaid.error;
  pass("Commerce order reaches PAID", orderPaid.data.status === "PAID");

  const issuedPatch = await api(`/api/aruter/orders/${legacyOrderId}/status`, { method: "PATCH", body: { status: "issued" } });
  pass("legacy Storefront status PATCH issued succeeds", issuedPatch.status === 200 && issuedPatch.json?.ok === true, `${issuedPatch.status} ${issuedPatch.raw.slice(0, 400)}`);
  attempt = await processPending("issued");
  pass("issued update reuses same Commerce order", String(attempt.commerce_order_id) === commerceOrderId);
  const orderIssued = await admin.from("commerce_orders").select("status").eq("id", commerceOrderId).single();
  if (orderIssued.error) throw orderIssued.error;
  pass("Commerce order reaches ISSUED", orderIssued.data.status === "ISSUED");

  const itemsIssued = await admin.from("commerce_order_items").select("sku,inventory_status,reservation_id")
    .eq("organization_id", ORGANIZATION_ID).eq("order_id", commerceOrderId).is("deleted_at", null);
  if (itemsIssued.error) throw itemsIssued.error;
  pass("ISSUED consumes both mapped order items", itemsIssued.data.length === 2 && itemsIssued.data.every(row => row.inventory_status === "CONSUMED" && row.reservation_id), JSON.stringify(itemsIssued.data));
  issued = true;

  for (const [sku, variantId] of variants) {
    const initial = initialBalances.get(sku);
    const current = await balanceFor(variantId);
    const q = quantityBySku.get(sku) || 0;
    pass(`${sku} ISSUED consumes physical stock`, current.physical === initial.physical - q && current.reserved === initial.reserved && current.available === initial.available - q, JSON.stringify({ initial, current }));
  }

  await restoreIssuedStock();
  for (const [sku, variantId] of variants) {
    const initial = initialBalances.get(sku);
    const current = await balanceFor(variantId);
    pass(`${sku} compensating ledger movement restores baseline`, current.physical === initial.physical && current.reserved === initial.reserved && current.available === initial.available, JSON.stringify({ initial, current }));
  }

  console.log(`RESULT ${checks.length}/${checks.length} PASS`);
} finally {
  try { await restoreIssuedStock(); } catch (error) { console.error("RESTORE_FAILED", error instanceof Error ? error.message : String(error)); }
  const now = new Date().toISOString();
  if (commerceOrderId) {
    const reservations = await admin.from("commerce_order_items").select("reservation_id").eq("organization_id", ORGANIZATION_ID).eq("order_id", commerceOrderId);
    if (!reservations.error) {
      const ids = reservations.data.map(row => row.reservation_id).filter(Boolean);
      if (ids.length) await admin.from("commerce_inventory_reservations").update({ deleted_at: now }).in("id", ids);
    }
    await admin.from("commerce_order_items").update({ deleted_at: now }).eq("organization_id", ORGANIZATION_ID).eq("order_id", commerceOrderId).is("deleted_at", null);
    await admin.from("commerce_orders").update({ deleted_at: now }).eq("organization_id", ORGANIZATION_ID).eq("id", commerceOrderId).is("deleted_at", null);
  }
  if (attemptId) await admin.from("commerce_order_mirror_attempts").update({ deleted_at: now }).eq("organization_id", ORGANIZATION_ID).eq("id", attemptId).is("deleted_at", null);
}
