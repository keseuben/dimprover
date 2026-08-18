import fs from "node:fs";
import assert from "node:assert/strict";
const ui=fs.readFileSync("components/aruter/CommerceProductsAdmin.tsx","utf8");
const route=fs.readFileSync("app/api/v1/commerce/products/[productId]/route.ts","utf8");
const repo=fs.readFileSync("app/lib/commerce/product/repository.ts","utf8");
const checks=[
 ["01 inspector edit action exists",ui.includes("Szerkesztés")&&ui.includes("beginEdit")],
 ["02 edit form supports product name",ui.includes("Termék neve *")&&ui.includes("editDraft.name")],
 ["03 edit form supports type/model",ui.includes("editDraft.typeModel")],
 ["04 edit form supports category",ui.includes("editDraft.categoryId")],
 ["05 edit form supports brand",ui.includes("editDraft.brandId")],
 ["06 edit form supports manufacturer",ui.includes("editDraft.manufacturerId")],
 ["07 edit form supports active/draft/inactive status",ui.includes('<option value="ACTIVE">Aktív</option>')&&ui.includes('<option value="DRAFT">Vázlat</option>')&&ui.includes('<option value="INACTIVE">Inaktív</option>')],
 ["08 edit save uses product PATCH",ui.includes('method: "PATCH"')&&ui.includes('/api/v1/commerce/products/${selectedId}')],
 ["09 PATCH API resolves Commerce context",route.includes("resolveCommerceContext")&&route.includes("export async function PATCH")],
 ["10 product update remains tenant scoped",repo.includes('.update(patch).eq("organization_id", context.organizationId).eq("id", productId)')],
 ["11 category/brand/manufacturer references are scoped",repo.includes("verifyScopedReference")&&repo.includes('"commerce_categories"')&&repo.includes('"commerce_brands"')&&repo.includes('"commerce_manufacturers"')],
 ["12 save reloads product list",ui.includes("await loadProducts(query)")&&ui.includes("setEditMode(false)")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
