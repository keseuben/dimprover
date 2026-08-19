import fs from "node:fs";
import assert from "node:assert/strict";

const files = {
  store: fs.readFileSync("app/lib/aruter/store.ts", "utf8"),
  types: fs.readFileSync("app/lib/aruter/types.ts", "utf8"),
  rolePages: fs.readFileSync("components/aruter/AruterRolePages.tsx", "utf8"),
  landing: fs.readFileSync("app/aruter/page.tsx", "utf8"),
  cashier: fs.readFileSync("app/aruter/penztar/page.tsx", "utf8"),
};
const checks = [
  ["legacy Árutér landing preserved", files.landing.includes("AruterLandingPage")],
  ["legacy cashier route preserved", files.cashier.includes("AruterCashierPage")],
  ["cart can still be sent to cashier", files.store.includes("sendCartToCashier")],
  ["cashier status remains sent_to_cashier", files.types.includes('"sent_to_cashier"')],
  ["paid status remains", files.types.includes('"paid"')],
  ["issued status remains", files.types.includes('"issued"')],
  ["cashier page still reads orders", files.rolePages.includes("AruterCashierPage") && files.rolePages.includes("orders")],
  ["cashier still marks paid", files.rolePages.includes("markOrderPaid")],
  ["cashier still marks issued", files.rolePages.includes("markOrderIssued")],
  ["collector UI still exposes Pénztárra action", files.rolePages.includes("Pénztárra")],
];
let pass = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (ok) pass += 1;
}
console.log(`RESULT ${pass}/${checks.length} PASS`);
assert.equal(pass, checks.length);
