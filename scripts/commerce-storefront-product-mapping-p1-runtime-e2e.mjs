#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const createJiti=require("jiti");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const jiti=createJiti(fileURLToPath(import.meta.url),{
  interopDefault:true,
  alias:{"server-only":path.join(root,"scripts/server-only-worker-noop.cjs")},
});
const {
  resolveCommerceStorefrontProductMapping,
  resolveCommerceStorefrontFulfillmentSource,
}=jiti("../app/lib/commerce/storefront/repository.ts");

const organizationId=process.env.P1_E2E_ORGANIZATION_ID?.trim()||"";
const storefrontSlug=process.env.P1_E2E_STOREFRONT_SLUG?.trim()||"";
const externalProductId=process.env.P1_E2E_EXTERNAL_PRODUCT_ID?.trim()||"";
const productId=process.env.P1_E2E_PRODUCT_ID?.trim()||"";
const variantId=process.env.P1_E2E_VARIANT_ID?.trim()||"";
const sourceId=process.env.P1_E2E_SOURCE_ID?.trim()||"";
assert.ok(organizationId&&storefrontSlug&&externalProductId&&productId&&variantId&&sourceId,"P1 E2E fixture env hiányzik");

const context={
  userId:"00000000-0000-4000-8000-000000000001",
  organizationId,
  organizationName:"P1 E2E",
  roleCode:"ADMIN",
  permissions:["commerce.context.read","commerce.product.read","commerce.inventory.read"],
};

const mapping=await resolveCommerceStorefrontProductMapping(context,{storefrontSlug,externalProductId});
assert.ok(mapping,"Storefront mapping nem oldódott fel");
assert.equal(mapping.product.id,productId);
assert.equal(mapping.variant.id,variantId);
assert.equal(mapping.mapping.fulfillmentSourceId,sourceId);
assert.equal(mapping.matchedBy,"EXTERNAL_PRODUCT_ID");

const ready=await resolveCommerceStorefrontFulfillmentSource(context,{
  storefrontSlug,
  preferredSourceIds:[mapping.mapping.fulfillmentSourceId],
  requirements:[{variantId,quantity:"3"}],
  autoSelect:false,
});
assert.equal(ready.sourceId,sourceId);
assert.equal(ready.selectedBy,"MAPPING");
assert.equal(ready.reservationReady,true);
assert.equal(ready.reason,"SELECTED");

const insufficient=await resolveCommerceStorefrontFulfillmentSource(context,{
  storefrontSlug,
  preferredSourceIds:[mapping.mapping.fulfillmentSourceId],
  requirements:[{variantId,quantity:"11"}],
  autoSelect:false,
});
assert.equal(insufficient.sourceId,sourceId);
assert.equal(insufficient.reservationReady,false);
assert.equal(insufficient.reason,"INSUFFICIENT_STOCK");
assert.equal(insufficient.shortages.length,1);

console.log(JSON.stringify({
  ok:true,
  mapping:{matchedBy:mapping.matchedBy,productId:mapping.product.id,variantId:mapping.variant.id,sourceId:mapping.mapping.fulfillmentSourceId},
  ready:{selectedBy:ready.selectedBy,reservationReady:ready.reservationReady},
  insufficient:{reason:insufficient.reason,shortageCount:insufficient.shortages.length},
},null,2));
