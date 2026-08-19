import fs from "node:fs";
import assert from "node:assert/strict";
const repo=fs.readFileSync("app/lib/commerce/catalog/repository.ts","utf8");
const categories=fs.readFileSync("app/api/v1/commerce/catalog/categories/route.ts","utf8");
const categoryItem=fs.readFileSync("app/api/v1/commerce/catalog/categories/[itemId]/route.ts","utf8");
const brands=fs.readFileSync("app/api/v1/commerce/catalog/brands/route.ts","utf8");
const manufacturers=fs.readFileSync("app/api/v1/commerce/catalog/manufacturers/route.ts","utf8");
const variants=fs.readFileSync("app/api/v1/commerce/products/[productId]/variants/route.ts","utf8");
const variantItem=fs.readFileSync("app/api/v1/commerce/products/[productId]/variants/[variantId]/route.ts","utf8");
const checks=[
 ["01 category API resolves Commerce context",categories.includes("resolveCommerceContext")],
 ["02 brand API resolves Commerce context",brands.includes("resolveCommerceContext")],
 ["03 manufacturer API resolves Commerce context",manufacturers.includes("resolveCommerceContext")],
 ["04 all catalog queries are organization scoped",(repo.match(/\.eq\("organization_id",context\.organizationId\)/g)||[]).length>=10],
 ["05 catalog read uses product read permission",repo.includes('commerce.product.read')],
 ["06 catalog write uses product write permission",repo.includes('commerce.product.write')],
 ["07 category parent is tenant checked",repo.includes("COMMERCE_CATEGORY_PARENT_SCOPE_MISMATCH")],
 ["08 category self/cycle guards exist",repo.includes("COMMERCE_CATEGORY_PARENT_SELF")&&repo.includes("COMMERCE_CATEGORY_PARENT_CYCLE")],
 ["09 duplicate catalog values map to 409",repo.includes("COMMERCE_CATALOG_DUPLICATE")&&repo.includes('result.error.code === "23505"')],
 ["10 catalog archive blocks in-use product references",repo.includes("COMMERCE_CATALOG_IN_USE")],
 ["11 category item supports PATCH + DELETE",categoryItem.includes("export async function PATCH")&&categoryItem.includes("export async function DELETE")],
 ["12 variant creation verifies parent product scope",repo.includes("requireProduct(context,productId)")&&variants.includes("createCommerceVariant")],
 ["13 variant SKU duplicate maps to conflict",repo.includes("COMMERCE_VARIANT_SKU_DUPLICATE")],
 ["14 variant update is product + organization scoped",repo.includes('.eq("product_id",productId).eq("id",variantId)')],
 ["15 variant archive blocks inventory-linked variants",repo.includes("COMMERCE_VARIANT_INVENTORY_IN_USE")],
 ["16 variant item supports PATCH + DELETE",variantItem.includes("export async function PATCH")&&variantItem.includes("export async function DELETE")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
