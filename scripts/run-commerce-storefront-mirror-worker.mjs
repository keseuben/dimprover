#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const createJiti = require("jiti");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverOnlyShim = path.join(root, "scripts", "server-only-worker-noop.cjs");
const jiti = createJiti(fileURLToPath(import.meta.url), {
  interopDefault: true,
  alias: { "server-only": serverOnlyShim },
});

const { resolveCommerceServiceActorContext } = jiti("../app/lib/commerce/core/service-context.ts");
const { listDueCommerceMirrorAttempts } = jiti("../app/lib/commerce/order/mirrorReconciliation.ts");
const { retryDueAruterOrderCommerceMirrors } = jiti("../app/lib/aruter/commerceMirror.ts");

const checkOnly = process.argv.includes("--check");
const enabled = process.env.DIMPRO_COMMERCE_STOREFRONT_MIRROR_WORKER_ENABLED?.trim() === "1";
const organizationId = process.env.ARUTER_STOREFRONT_COMMERCE_ORGANIZATION_ID?.trim() || "";
const actorUserId = process.env.DIMPRO_COMMERCE_STOREFRONT_MIRROR_WORKER_ACTOR_USER_ID?.trim() || "";
const fulfillmentSourceId = process.env.ARUTER_COMMERCE_FULFILLMENT_SOURCE_ID?.trim() || "";
const requestedLimit = Number(process.env.DIMPRO_COMMERCE_STOREFRONT_MIRROR_WORKER_LIMIT || "10");
const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(25, Math.floor(requestedLimit))) : 10;

const requiredPermissions = [
  "commerce.context.read",
  "commerce.product.read",
  "commerce.order.read",
  "commerce.order.write",
  "commerce.order.pay",
  "commerce.order.issue",
  "commerce.order.reconcile",
];
if (fulfillmentSourceId) requiredPermissions.push("commerce.inventory.move");

function safeCode(error) {
  return error && typeof error === "object" && typeof error.code === "string"
    ? error.code
    : error instanceof Error ? error.name : "UNKNOWN";
}

async function main() {
  if (!enabled) {
    console.log(JSON.stringify({ ok: true, enabled: false, checkOnly, processed: false, reason: "DISABLED" }));
    return;
  }

  const context = await resolveCommerceServiceActorContext({
    organizationId,
    userId: actorUserId,
    requiredPermissions,
    requiredRoleCodes: ["COMMERCE_MIRROR_WORKER"],
    requireNonInteractiveActor: true,
  });
  const due = await listDueCommerceMirrorAttempts(context, { limit });

  if (checkOnly) {
    console.log(JSON.stringify({
      ok: true,
      enabled: true,
      checkOnly: true,
      organizationId: context.organizationId,
      actorUserId: context.userId,
      roleCode: context.roleCode,
      dueCount: due.length,
      limit,
      fulfillmentSourceConfigured: Boolean(fulfillmentSourceId),
    }));
    return;
  }

  if (!due.length) {
    console.log(JSON.stringify({ ok: true, enabled: true, checkOnly: false, requested: 0, succeeded: 0, failed: 0, results: [] }));
    return;
  }

  const result = await retryDueAruterOrderCommerceMirrors(context, { limit });
  console.log(JSON.stringify({ ok: result.failed === 0, enabled: true, checkOnly: false, ...result }));
  if (result.failed > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, enabled, checkOnly, code: safeCode(error), message: error instanceof Error ? error.message.slice(0, 500) : "Ismeretlen worker hiba." }));
  process.exitCode = 1;
});
