import fs from "node:fs";
import assert from "node:assert/strict";

const repo = fs.readFileSync("app/lib/commerce/product/repository.ts", "utf8");
const ui = fs.readFileSync("components/aruter/CommerceProductsAdmin.tsx", "utf8");
const checks = [
  ["01 list summary includes default variant", repo.includes("defaultVariantId") && repo.includes("variantsByProduct")],
  ["02 list summary includes SKU and unit", repo.includes("sku: defaultVariant?.sku") && repo.includes("unit: defaultVariant?.unit")],
  ["03 price query remains organization scoped", repo.includes('from("commerce_prices")') && repo.includes('.eq("organization_id", context.organizationId)')],
  ["04 only active prices are considered", repo.includes('.eq("status", "ACTIVE")')],
  ["05 price validity window is checked", repo.includes("Date.parse(from) > now") && repo.includes("Date.parse(until) < now")],
  ["06 internal stock uses SELLABLE availability", repo.includes('from("commerce_inventory_balances")') && repo.includes('.eq("stock_status", "SELLABLE")')],
  ["07 internal stock is aggregated by product", repo.includes("internalByProduct") && repo.includes("addDecimal")],
  ["08 external snapshots stay separate", repo.includes('from("commerce_external_inventory_snapshots")') && repo.includes("externalByProduct")],
  ["09 external sync status is surfaced", repo.includes("externalSyncStatus") && repo.includes("syncRank")],
  ["10 UI has separate internal and external stock columns", ui.includes("Belső készlet") && ui.includes("Külső készlet")],
  ["11 UI displays active price from summary", ui.includes("formatPrice(product)") && ui.includes("Aktív ár")],
  ["12 UI keeps right-side inspector layout", ui.includes("xl:grid-cols-[minmax(0,1fr)_380px]") && ui.includes("xl:sticky")],
  ["13 mobile product list remains available", ui.includes("md:hidden") && ui.includes("Nincs típus/modell")],
  ["14 new product form supports EAN and SKU", ui.includes("EAN / GTIN") && ui.includes("Cikkszám / SKU")],
];
let pass = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (ok) pass++;
}
console.log(`RESULT ${pass}/${checks.length} PASS`);
assert.equal(pass, checks.length);
