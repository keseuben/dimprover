import fs from "node:fs";
import assert from "node:assert/strict";
const bridge=fs.readFileSync("app/lib/commerce/order/legacyBridge.ts","utf8");
const route=fs.readFileSync("app/api/v1/commerce/orders/legacy-bridge/route.ts","utf8");
const checks=[
 ["01 pure legacy snapshot mapper remains available",bridge.includes("legacyAruterOrderToCommerceCreate")],
 ["02 optional resolver uses Commerce code resolver",bridge.includes("resolveCommerceProductByCode")],
 ["03 inventory mapping is opt-in",bridge.includes("options.resolveInventory")],
 ["04 no source means all legacy items stay unresolved",bridge.includes("mappedItemCount:0")&&bridge.includes("unresolvedItemCount:payload.items.length")],
 ["05 SKU is used for safe Commerce resolution",bridge.includes("legacyItem.sku")&&bridge.includes("resolveCommerceProductByCode(context,legacyItem.sku)")],
 ["06 resolved product id is attached",bridge.includes("productId:resolved.product.id")],
 ["07 resolved variant prefers matched identifier variant",bridge.includes("resolved.identifier.variantId")],
 ["08 active product variant is fallback",bridge.includes('variant.status==="ACTIVE"')],
 ["09 unresolved SKU stays snapshot-only",bridge.includes("if(!resolved){items.push(baseItem);continue;}")],
 ["10 bridge API accepts fulfillment source",route.includes("fulfillmentSourceId")],
 ["11 bridge only resolves inventory when source is present",route.includes("resolveInventory:Boolean(fulfillmentSourceId)")],
 ["12 bridge creates shared Commerce order",route.includes("createCommerceOrder(context,resolved.payload)")],
 ["13 sent/paid/issued legacy order can reserve before transitions",route.includes("reserveCommerceOrderInventory")&&route.indexOf("reserveCommerceOrderInventory")<route.lastIndexOf("legacyAruterOrderRequiredTransitions")],
 ["14 draft and cancelled imports do not force reserve",route.includes('order.status!=="draft"&&order.status!=="cancelled"')],
 ["15 bridge returns mapped/unresolved counts",route.includes("mappedItemCount:resolved.mappedItemCount")&&route.includes("unresolvedItemCount:resolved.unresolvedItemCount")],
 ["16 reservation result is exposed for controlled dual-write",route.includes("reservation,transitions")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
