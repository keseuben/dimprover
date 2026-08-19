import fs from "node:fs";
import assert from "node:assert/strict";
const ui=fs.readFileSync("components/aruter/CommerceMirrorReconciliationAdmin.tsx","utf8");
const page=fs.readFileSync("app/aruter/admin/egyeztetes/page.tsx","utf8");
const cashier=fs.readFileSync("components/aruter/CommerceCashierAdmin.tsx","utf8");
const checks=[
 ["01 reconciliation admin page exists",page.includes("CommerceMirrorReconciliationAdmin")],
 ["02 page title identifies order reconciliation",page.includes("Rendelés-egyeztetés")],
 ["03 UI loads reconciliation API",ui.includes("/api/v1/commerce/mirror/reconciliation?limit=200")],
 ["04 UI shows global mirror safety explanation",ui.includes("Biztonságos legacy → Commerce átmenet")],
 ["05 UI shows FAILED summary",ui.includes('state: "FAILED"')&&ui.includes("Egyeztetendő")],
 ["06 UI shows PENDING summary",ui.includes('state: "PENDING"')&&ui.includes("Folyamatban")],
 ["07 UI shows SUCCEEDED summary",ui.includes('state: "SUCCEEDED"')&&ui.includes("Sikeres")],
 ["08 user can filter all three states",ui.includes('["ALL","FAILED","PENDING","SUCCEEDED"]')],
 ["09 legacy status is visible",ui.includes("legacyLabel(selected.legacyStatus)")],
 ["10 mapped and unresolved item counts are visible",ui.includes("mappedItemCount")&&ui.includes("unresolvedItemCount")],
 ["11 last error code/message is visible",ui.includes("lastErrorCode")&&ui.includes("lastErrorMessage")],
 ["12 retry action calls dedicated endpoint",ui.includes("/retry")&&ui.includes('method: "POST"')],
 ["13 successful attempt hides retry and shows success card",ui.includes('selected.state!=="SUCCEEDED"')&&ui.includes("Sikeresen egyeztetve")],
 ["14 UI links back to cashier",ui.includes('href="/aruter/admin/penztar"')],
 ["15 cashier exposes reconciliation link only with permission",cashier.includes('permissions.includes("commerce.order.reconcile")')&&cashier.includes('href="/aruter/admin/egyeztetes"')],
 ["16 loading and busy states have spinner feedback",ui.includes("Loader2")&&ui.includes("animate-spin")],
 ["17 API errors remain visible to user",ui.includes("Egyeztetési állapot")&&ui.includes("setError")],
 ["18 retry success produces explicit notice",ui.includes("Sikeres újrapróbálás")&&ui.includes("setNotice")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
