import { randomUUID } from "node:crypto";
import { createCommerceAdminClient } from "../app/lib/commerce/core/server-db";
import type { CommerceContext } from "../app/lib/commerce/core/types";
import { listCommercePrices, setCommerceActivePrice } from "../app/lib/commerce/pricing/repository";

async function main() {
  const client = createCommerceAdminClient();
  const orgResult = await client.from("dimpro_organizations").select("id,display_name,legal_name").eq("status","active").limit(1).maybeSingle();
  if (orgResult.error || !orgResult.data) throw new Error("PRICING_RUNTIME_ORG_MISSING");
  const orgId = String(orgResult.data.id);
  const productId = randomUUID();
  const variantId = randomUUID();
  const slug = `pricing-runtime-${productId.slice(0,8)}`;
  const context: CommerceContext = {
    userId: randomUUID(), organizationId: orgId,
    organizationName: String(orgResult.data.display_name || orgResult.data.legal_name || "QA"),
    roleCode: "ADMIN",
    permissions: ["commerce.context.read","commerce.product.read","commerce.product.write"],
  };
  try {
    const product = await client.from("commerce_products").insert({ id:productId, organization_id:orgId, name:"Pricing runtime QA", slug, status:"ACTIVE" }).select("id").single();
    if (product.error) throw product.error;
    const variant = await client.from("commerce_product_variants").insert({ id:variantId, organization_id:orgId, product_id:productId, name:"Pricing runtime QA", unit:"DB", status:"ACTIVE" }).select("id").single();
    if (variant.error) throw variant.error;
    console.log("PASS 01 pricing runtime fixture created");

    const first = await setCommerceActivePrice(context,{ variantId, currency:"HUF", amount:"1000.125", vatRateBasisPoints:2700 });
    if (String(first.amount) !== "1000.125") throw new Error("PRICING_RUNTIME_FIRST_PRICE");
    console.log("PASS 02 first active price saved through repository RPC");

    await new Promise((resolve)=>setTimeout(resolve,20));
    const second = await setCommerceActivePrice(context,{ variantId, currency:"HUF", amount:"1250.5", vatRateBasisPoints:2700 });
    if (String(second.amount) !== "1250.5" || Number(second.previousDeactivated) !== 1) throw new Error("PRICING_RUNTIME_SECOND_PRICE");
    console.log("PASS 03 second price deactivates previous");

    const history = await listCommercePrices(context,{ variantId, currency:"HUF", limit:10 });
    if (history.length !== 2) throw new Error(`PRICING_RUNTIME_HISTORY_COUNT_${history.length}`);
    const active = history.filter((item)=>item.status === "ACTIVE");
    const inactive = history.filter((item)=>item.status === "INACTIVE");
    if (active.length !== 1 || inactive.length !== 1 || active[0]?.amount !== "1250.5" || inactive[0]?.amount !== "1000.125") throw new Error("PRICING_RUNTIME_HISTORY_STATE");
    console.log("PASS 04 pricing history preserves one inactive + one active price");

    const direct = await client.from("commerce_prices").update({ amount:9999 }).eq("organization_id",orgId).eq("variant_id",variantId);
    if (!direct.error) throw new Error("PRICING_RUNTIME_DIRECT_UPDATE_NOT_DENIED");
    console.log("PASS 05 direct service price mutation is denied");

    const audit = await client.from("commerce_audit_events").select("id",{count:"exact",head:true}).eq("organization_id",orgId).eq("action","PRICE_SET_ACTIVE").filter("metadata->>variantId","eq",variantId);
    if (audit.error || (audit.count||0) !== 2) throw new Error("PRICING_RUNTIME_AUDIT");
    console.log("PASS 06 pricing audit events persisted");

    const outbox = await client.from("commerce_outbox_events").select("id",{count:"exact",head:true}).eq("organization_id",orgId).eq("event_type","PRICE_CHANGED").eq("aggregate_id",variantId);
    if (outbox.error || (outbox.count||0) !== 2) throw new Error("PRICING_RUNTIME_OUTBOX");
    console.log("PASS 07 pricing outbox events persisted");
  } finally {
    const cleanup = await client.from("commerce_products").delete().eq("organization_id",orgId).eq("id",productId);
    if (cleanup.error) throw cleanup.error;
    const remaining = await client.from("commerce_products").select("id",{count:"exact",head:true}).eq("organization_id",orgId).eq("id",productId);
    if (remaining.error || (remaining.count||0) !== 0) throw new Error("PRICING_RUNTIME_CLEANUP");
    console.log("PASS 08 pricing runtime fixture cleanup");
  }
  console.log("RESULT 8/8 PASS");
}

main().catch((error)=>{console.error(error);process.exit(1);});
