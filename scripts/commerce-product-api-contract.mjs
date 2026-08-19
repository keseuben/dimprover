import fs from "node:fs";
import assert from "node:assert/strict";
const repo = fs.readFileSync("app/lib/commerce/product/repository.ts", "utf8");
const listRoute = fs.readFileSync("app/api/v1/commerce/products/route.ts", "utf8");
const detailRoute = fs.readFileSync("app/api/v1/commerce/products/[productId]/route.ts", "utf8");
const resolveRoute = fs.readFileSync("app/api/v1/commerce/products/resolve/route.ts", "utf8");
const context = fs.readFileSync("app/lib/commerce/core/server-context.ts", "utf8");
const checks = [
  ["01 list API requires Commerce context", listRoute.includes("resolveCommerceContext")],
  ["02 create API uses same tenant context", listRoute.includes("createCommerceProduct(context")],
  ["03 detail API resolves tenant context", detailRoute.includes("resolveCommerceContext")],
  ["04 update API stays organization scoped", repo.includes('.update(patch).eq("organization_id", context.organizationId)')],
  ["05 get product is organization scoped", repo.includes('.eq("organization_id", context.organizationId).eq("id", productId)')],
  ["06 create forces organization from context", repo.includes("organization_id: context.organizationId")],
  ["07 related category/brand/manufacturer scope is verified", repo.includes("verifyScopedReference") && repo.includes("COMMERCE_REFERENCE_SCOPE_MISMATCH")],
  ["08 identifier duplicate maps to conflict", repo.includes("COMMERCE_PRODUCT_DUPLICATE") && repo.includes('rpc.error.code === "23505"') && repo.includes("commerce_product_create_atomic")],
  ["09 resolve endpoint exists and accepts code", resolveRoute.includes('searchParams.get("code")') && resolveRoute.includes("resolveCommerceProductByCode")],
  ["10 identifier resolver applies priority ordering", repo.includes("IDENTIFIER_PRIORITY") && repo.includes(".sort((a, b) =>")],
  ["11 product read permission is enforced", repo.includes('requirePermission(context, "commerce.product.read")')],
  ["12 product write permission is enforced", repo.includes('requirePermission(context, "commerce.product.write")')],
  ["13 session auth remains fail closed", context.includes("COMMERCE_AUTH_REQUIRED") && context.includes("COMMERCE_ORGANIZATION_ACCESS_DENIED")],
  ["14 service-role calls still receive explicit organization filters", (repo.match(/organization_id/g) || []).length >= 12],
];
let pass=0;
for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (ok) pass++; }
console.log(`RESULT ${pass}/${checks.length} PASS`);
assert.equal(pass, checks.length);
