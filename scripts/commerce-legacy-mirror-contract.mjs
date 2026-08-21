import fs from "node:fs";
import assert from "node:assert/strict";
const mirror=fs.readFileSync("app/lib/aruter/commerceMirror.ts","utf8");
const createRoute=fs.readFileSync("app/api/aruter/orders/route.ts","utf8");
const statusRoute=fs.readFileSync("app/api/aruter/orders/[orderId]/status/route.ts","utf8");
const envExample=fs.readFileSync("app/lib/aruter/aruter-env.example","utf8");
const checks=[
 ["01 mirror is feature flagged and disabled by default",mirror.includes("ARUTER_COMMERCE_ORDER_MIRROR_ENABLED")&&mirror.includes('=== "1"')],
 ["02 legacy create happens before Commerce mirror",createRoute.indexOf("const result = await getAruterRepository().createOrder")<createRoute.lastIndexOf("await mirrorAruterOrderToCommerceFailOpen")],
 ["03 legacy create response does not depend on mirror result",createRoute.includes("after(async () =>")&&createRoute.includes("return NextResponse.json(result, { status: 201 })")],
 ["04 legacy status update happens before Commerce mirror",statusRoute.indexOf("const result = await getAruterRepository().updateOrderStatus")<statusRoute.lastIndexOf("await mirrorAruterOrderToCommerceFailOpen")],
 ["05 legacy status response does not depend on mirror result",statusRoute.includes("after(async () =>")&&statusRoute.includes("return NextResponse.json(result)")],
 ["06 mirror catches every Commerce failure",mirror.includes("catch (error)")&&mirror.includes("FAILED_FAIL_OPEN")],
 ["07 mirror failure returns structured fail-open result",mirror.includes('reason: "FAILED"')&&mirror.includes("errorCode")],
 ["08 mirror failure is structured in server log",mirror.includes("[ARUTER_COMMERCE_MIRROR]")&&mirror.includes("JSON.stringify")],
 ["09 tenant context is resolved from request",mirror.includes("resolveCommerceContext(requestedOrganizationId(request))")],
 ["10 Commerce order uses existing legacy resolver",mirror.includes("resolveLegacyAruterOrderForCommerce")],
 ["11 fulfillment source is separately feature configured",mirror.includes("ARUTER_COMMERCE_FULFILLMENT_SOURCE_ID")],
 ["12 inventory resolution activates for explicit source, Storefront mapping or opt-in auto resolve",mirror.includes("resolveInventory: Boolean(explicitSourceId || orderStorefrontSlug || sourceAutoResolve)")],
 ["13 non-draft/non-cancelled mirror may reserve",mirror.includes('order.status !== "draft" && order.status !== "cancelled"')],
 ["14 reserve idempotency is stable per legacy order",mirror.includes("legacy-aruter-reserve:${order.id}")],
 ["15 legacy paid/issued transitions are replayed",mirror.includes("legacyAruterOrderRequiredTransitions(order)")],
 ["16 status transition idempotency is stable",mirror.includes("legacy-aruter-status:${order.id}:${transition.status.toLowerCase()}")],
 ["17 mirror success logs mapped/unresolved counts",mirror.includes("mappedItemCount")&&mirror.includes("unresolvedItemCount")],
 ["18 mirror does not import or mutate legacy repository",!mirror.includes("getAruterRepository")&&!mirror.includes("serverRepository")],
 ["19 legacy create schedules mirror after response lifecycle",createRoute.includes('import { after, NextResponse } from "next/server"')&&createRoute.includes("after(async () =>")&&!createRoute.includes("await mirrorAruterOrderToCommerceFailOpen(request, result.data)")],
 ["20 legacy status schedules mirror after response lifecycle",statusRoute.includes('import { after, NextResponse } from "next/server"')&&statusRoute.includes("after(async () =>")&&!statusRoute.includes("await mirrorAruterOrderToCommerceFailOpen(request, result.data)")],
 ["21 mirror feature flag is documented disabled",envExample.includes("ARUTER_COMMERCE_ORDER_MIRROR_ENABLED=0")],
 ["22 fulfillment source setting is documented optional",envExample.includes("ARUTER_COMMERCE_FULFILLMENT_SOURCE_ID=")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
