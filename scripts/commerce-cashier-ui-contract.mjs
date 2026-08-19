import fs from "node:fs";
import assert from "node:assert/strict";
const ui=fs.readFileSync("components/aruter/CommerceCashierAdmin.tsx","utf8");
const page=fs.readFileSync("app/aruter/admin/penztar/page.tsx","utf8");
const products=fs.readFileSync("components/aruter/CommerceProductsAdmin.tsx","utf8");
const checks=[
 ["01 Commerce cashier has independent admin route",page.includes("CommerceCashierAdmin")],
 ["02 products admin links to Commerce cashier",products.includes('href="/aruter/admin/penztar"')],
 ["03 cashier loads shared Commerce cashier queue",ui.includes("/api/v1/commerce/orders?cashierQueue=true&limit=100")],
 ["04 cashier reads actual Commerce permissions",ui.includes("/api/v1/commerce/context")&&ui.includes("context?.permissions")],
 ["05 cashier loads order detail",ui.includes("/api/v1/commerce/orders/${orderId}")],
 ["06 external marketplace orders are visibly identified",ui.includes("Külső Árutér")&&ui.includes('sourceChannel==="EXTERNAL_MARKETPLACE"')],
 ["07 current cart item snapshots are displayed",ui.includes("item.productName")&&ui.includes("item.quantity")&&ui.includes("item.sku")&&ui.includes("item.storageZone")],
 ["08 net and gross totals are visible",ui.includes("Nettó")&&ui.includes("Bruttó")],
 ["09 unresolved legacy item is a warning, not hidden",ui.includes("Nincs készlethez kötve")&&ui.includes("A pénztárban továbbra is látható")],
 ["10 resolved unreserved item is visible",ui.includes("Azonosítva · még nincs foglalva")],
 ["11 reserved/consumed inventory states are visible",ui.includes("Készlet foglalva")&&ui.includes("Készlet kiadva")],
 ["12 manager/admin can select internal fulfillment source",ui.includes("/api/v1/commerce/receiving/options")&&ui.includes("Készletforrás...")],
 ["13 reserve uses Order reserve API",ui.includes("/reserve`)".replace('`)',''))||ui.includes('/reserve`,')],
 ["14 reserve needs order.write + inventory.move",ui.includes('commerce.order.write')&&ui.includes('commerce.inventory.move')],
 ["15 payment action is permission gated",ui.includes('commerce.order.pay')&&ui.includes("Fizetés rögzítése")],
 ["16 payment supports card/cash/transfer/later",ui.includes("Bankkártya")&&ui.includes("Készpénz")&&ui.includes("Átutalás")&&ui.includes("Későbbi fizetés")],
 ["17 paid action uses idempotency-key",ui.includes('"idempotency-key":key')&&ui.includes("cashier-paid-")],
 ["18 issue action is separately permission gated",ui.includes('commerce.order.issue')&&ui.includes("Kiadás rögzítése")],
 ["19 right inspector layout is preserved",ui.includes("xl:grid-cols-[minmax(0,1fr)_440px]")&&ui.includes("xl:sticky")],
 ["20 legacy public cashier route is not referenced/replaced",!page.includes("/aruter/penztar")&&!ui.includes("AruterCashierPage")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
