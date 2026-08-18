import fs from "node:fs";
import assert from "node:assert/strict";
const ui=fs.readFileSync("components/aruter/CommerceReceivingAdmin.tsx","utf8");
const products=fs.readFileSync("components/aruter/CommerceProductsAdmin.tsx","utf8");
const options=fs.readFileSync("app/api/v1/commerce/receiving/options/route.ts","utf8");
const checks=[
 ["01 receiving admin route linked from products",products.includes('href="/aruter/admin/bevetelezes"')],
 ["02 receiving UI loads receipt list",ui.includes('/api/v1/commerce/receiving?limit=100')],
 ["03 receiving UI loads warehouse/source options",ui.includes('/api/v1/commerce/receiving/options')&&options.includes("resolveCommerceContext")],
 ["04 receiving UI loads active products",ui.includes('/api/v1/commerce/products?status=ACTIVE&limit=200')],
 ["05 new receipt supports supplier snapshot",ui.includes("Beszállító")&&ui.includes("Szállítólevél / bizonylat")],
 ["06 new receipt requires warehouse and source",ui.includes("Raktár *")&&ui.includes("Készletforrás *")],
 ["07 item add supports quantity",ui.includes("Mennyiség")&&ui.includes("Tétel hozzáadása")],
 ["08 item add supports stock status",ui.includes("Eladható")&&ui.includes("Karantén")&&ui.includes("Sérült")&&ui.includes("Outlet")],
 ["09 item add supports LOT and expiry",ui.includes("LOT / tétel")&&ui.includes('type="date"')],
 ["10 item add supports unit cost",ui.includes("Nettó egységköltség (Ft)")],
 ["11 draft item can be deleted",ui.includes('method:"DELETE"')&&ui.includes("removeItem")],
 ["12 posting uses idempotency key",ui.includes('"idempotency-key":key')&&ui.includes("ui-receipt-post-")],
 ["13 posting action is explicit",ui.includes("Bevételezés könyvelése")],
 ["14 posted receipt shows immutable result state",ui.includes("Könyvelt bevételezés")&&ui.includes("StockMovement")],
 ["15 right inspector layout is preserved",ui.includes("xl:grid-cols-[minmax(0,1fr)_430px]")&&ui.includes("xl:sticky")],
 ["16 empty state is user readable",ui.includes("Még nincs bevételezés")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
