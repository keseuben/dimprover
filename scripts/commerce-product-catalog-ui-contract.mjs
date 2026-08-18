import fs from "node:fs";
import assert from "node:assert/strict";
const ui=fs.readFileSync("components/aruter/CommerceProductsAdmin.tsx","utf8");
const checks=[
 ["01 product form loads categories",ui.includes('/api/v1/commerce/catalog/categories?active=true')],
 ["02 product form loads brands",ui.includes('/api/v1/commerce/catalog/brands?active=true')],
 ["03 product form loads manufacturers",ui.includes('/api/v1/commerce/catalog/manufacturers?active=true')],
 ["04 create payload sends category",ui.includes('categoryId: draft.categoryId || null')],
 ["05 create payload sends brand",ui.includes('brandId: draft.brandId || null')],
 ["06 create payload sends manufacturer",ui.includes('manufacturerId: draft.manufacturerId || null')],
 ["07 master data admin link exists",ui.includes('href="/aruter/admin/torzsadatok"')],
 ["08 inspector shows category",ui.includes('catalogName(categories')],
 ["09 inspector shows brand",ui.includes('catalogName(brands')],
 ["10 inspector shows manufacturer",ui.includes('catalogName(manufacturers')],
 ["11 variant list is visible",ui.includes("Termékváltozatok")&&ui.includes('detail?.variants.map')],
 ["12 variant create uses scoped API",ui.includes('/variants`, {')&&ui.includes('method: "POST"')],
 ["13 variant SKU + unit inputs exist",ui.includes("SKU / cikkszám")&&ui.includes("Változat mentése")],
 ["14 mobile/desktop product list remains",ui.includes("md:hidden")&&ui.includes("hidden overflow-x-auto md:block")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
