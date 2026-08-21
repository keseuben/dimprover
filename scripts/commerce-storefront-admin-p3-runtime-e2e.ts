import { createCommerceAdminClient } from "../app/lib/commerce/core/server-db";
import { resolveCommercePermissions } from "../app/lib/commerce/core/permissions";
import type { CommerceContext } from "../app/lib/commerce/core/types";
import {
  CommerceStorefrontError,
  getCommerceStorefrontAdminState,
  updateCommerceStorefrontDefaultFulfillmentSource,
} from "../app/lib/commerce/storefront/repository";

async function main() {
  const organizationId = process.env.ARUTER_STOREFRONT_COMMERCE_ORGANIZATION_ID?.trim() || "";
  if (!organizationId) throw new Error("P3_RUNTIME_ORGANIZATION_REQUIRED");
  const client = createCommerceAdminClient();
  const membership = await client.from("dimpro_organization_memberships")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membership.error || !membership.data) throw new Error("P3_RUNTIME_MEMBERSHIP_MISSING");
  const context: CommerceContext = {
    userId: String(membership.data.user_id),
    organizationId,
    organizationName: "Commerce P3 runtime QA",
    roleCode: "ADMIN",
    permissions: resolveCommercePermissions("ADMIN"),
    storefrontId: null,
    warehouseId: null,
  };

  const state = await getCommerceStorefrontAdminState(context, { storefrontSlug: "kovacs-kerteszet" });
  if (state.storefront.slug !== "kovacs-kerteszet" || state.storefront.status !== "ACTIVE") throw new Error("P3_RUNTIME_STOREFRONT");
  console.log("PASS 01 active pilot Storefront is readable through admin repository");
  if (state.sources.length < 1 || !state.storefront.defaultFulfillmentSourceId) throw new Error("P3_RUNTIME_SOURCE");
  console.log("PASS 02 active INTERNAL fulfillment source is exposed");
  if (state.products.length < 2) throw new Error("P3_RUNTIME_PRODUCTS");
  console.log("PASS 03 active Commerce products are exposed");
  const variants = state.products.flatMap((product) => product.variants);
  const units = new Set(variants.map((variant) => variant.unit));
  if (!units.has("DB") || !units.has("ZSAK")) throw new Error("P3_RUNTIME_UNITS");
  console.log("PASS 04 pilot DB and ZSAK variants are exposed");
  if (state.mappings.length !== 2 || state.mappings.some((mapping) => !mapping.active)) throw new Error("P3_RUNTIME_MAPPINGS");
  console.log("PASS 05 both pilot mappings are editable admin state");
  const sourceId = state.storefront.defaultFulfillmentSourceId;
  const saved = await updateCommerceStorefrontDefaultFulfillmentSource(context, { storefrontSlug: "kovacs-kerteszet", defaultFulfillmentSourceId: sourceId });
  if (saved.defaultFulfillmentSourceId !== sourceId) throw new Error("P3_RUNTIME_IDEMPOTENT_SAVE");
  console.log("PASS 06 default fulfillment source idempotent save works");
  const after = await getCommerceStorefrontAdminState(context, { storefrontSlug: "kovacs-kerteszet" });
  if (after.storefront.defaultFulfillmentSourceId !== sourceId) throw new Error("P3_RUNTIME_SAVE_VERIFY");
  console.log("PASS 07 saved default fulfillment source is immediately readable");
  let invalidRejected = false;
  try {
    await updateCommerceStorefrontDefaultFulfillmentSource(context, { storefrontSlug: "kovacs-kerteszet", defaultFulfillmentSourceId: "00000000-0000-4000-8000-000000000001" });
  } catch (error) {
    invalidRejected = error instanceof CommerceStorefrontError && error.code === "COMMERCE_STOREFRONT_DEFAULT_SOURCE_INVALID";
  }
  if (!invalidRejected) throw new Error("P3_RUNTIME_INVALID_SOURCE_NOT_REJECTED");
  console.log("PASS 08 invalid/nonexistent fulfillment source is rejected safely");
  const finalState = await getCommerceStorefrontAdminState(context, { storefrontSlug: "kovacs-kerteszet" });
  if (finalState.storefront.defaultFulfillmentSourceId !== sourceId) throw new Error("P3_RUNTIME_FINAL_SOURCE_CHANGED");
  console.log("PASS 09 rejection leaves pilot source unchanged");
  console.log("RESULT 9/9 PASS");
}

void main().catch((error) => { console.error(error); process.exit(1); });
