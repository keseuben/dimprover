import { randomUUID } from "node:crypto";
import { createCommerceAdminClient } from "../app/lib/commerce/core/server-db";
import { resolveCommercePermissions } from "../app/lib/commerce/core/permissions";
import type { CommerceContext } from "../app/lib/commerce/core/types";
import {
  archiveCommerceCatalogItem,
  archiveCommerceVariant,
  CommerceCatalogError,
  createCommerceCatalogItem,
  createCommerceVariant,
  listCommerceCatalog,
  updateCommerceCatalogItem,
  updateCommerceVariant,
} from "../app/lib/commerce/catalog/repository";

async function main() {
  const client = createCommerceAdminClient();
  const orgResult = await client.from("dimpro_organizations").select("id,display_name,legal_name").eq("status","active").order("created_at",{ascending:true}).limit(1).maybeSingle();
  if (orgResult.error || !orgResult.data) throw new Error(`QA_ORG_MISSING:${orgResult.error?.message||"none"}`);
  const orgId = String(orgResult.data.id);
  const context: CommerceContext = {
    userId: randomUUID(), organizationId: orgId, organizationName: String(orgResult.data.display_name||orgResult.data.legal_name||"QA"), roleCode: "ADMIN",
    permissions: resolveCommercePermissions("ADMIN"), storefrontId: null, warehouseId: null,
  };
  const suffix = randomUUID().slice(0,8);
  const prefix = `OUTMIN-QA-${suffix}`;
  let productId: string | null = null;
  let rootId: string | null = null;
  let childId: string | null = null;
  let brandId: string | null = null;
  let manufacturerId: string | null = null;
  try {
    const root = await createCommerceCatalogItem(context,"categories",{name:`${prefix}-Root`,active:true});
    rootId = root.id;
    console.log("PASS 01 root category create");
    const child = await createCommerceCatalogItem(context,"categories",{name:`${prefix}-Child`,parentId:root.id,active:true});
    childId = child.id;
    console.log("PASS 02 child category tenant-scoped parent create");
    const brand = await createCommerceCatalogItem(context,"brands",{name:`${prefix}-Brand`,active:true});
    brandId = brand.id;
    const manufacturer = await createCommerceCatalogItem(context,"manufacturers",{name:`${prefix}-Manufacturer`,active:true});
    manufacturerId = manufacturer.id;
    console.log("PASS 03 brand + manufacturer create");

    const categories = await listCommerceCatalog(context,"categories",{query:prefix,active:true});
    if (categories.length !== 2) throw new Error(`QA_CATEGORY_LIST_COUNT:${categories.length}`);
    console.log("PASS 04 catalog list/query");

    let cycleRejected = false;
    try { await updateCommerceCatalogItem(context,"categories",root.id,{parentId:child.id}); }
    catch (error) { cycleRejected = error instanceof CommerceCatalogError && error.code === "COMMERCE_CATEGORY_PARENT_CYCLE"; }
    if (!cycleRejected) throw new Error("QA_CATEGORY_CYCLE_NOT_REJECTED");
    console.log("PASS 05 deep category cycle guard");

    let duplicateRejected = false;
    try { await createCommerceCatalogItem(context,"brands",{name:`${prefix}-Brand`,active:true}); }
    catch (error) { duplicateRejected = error instanceof CommerceCatalogError && error.code === "COMMERCE_CATALOG_DUPLICATE"; }
    if (!duplicateRejected) throw new Error("QA_DUPLICATE_BRAND_NOT_REJECTED");
    console.log("PASS 06 duplicate master data conflict");

    const productInsert = await client.from("commerce_products").insert({
      organization_id:orgId, category_id:child.id, brand_id:brand.id, manufacturer_id:manufacturer.id,
      name:`${prefix}-Product`, slug:`${prefix.toLowerCase()}-product`, status:"ACTIVE",
    }).select("id").single();
    if (productInsert.error) throw new Error(`QA_PRODUCT_INSERT:${productInsert.error.message}`);
    productId = String(productInsert.data.id);
    console.log("PASS 07 product reference baseline");

    let inUseRejected = false;
    try { await archiveCommerceCatalogItem(context,"brands",brand.id); }
    catch (error) { inUseRejected = error instanceof CommerceCatalogError && error.code === "COMMERCE_CATALOG_IN_USE"; }
    if (!inUseRejected) throw new Error("QA_IN_USE_MASTER_ARCHIVE_NOT_REJECTED");
    console.log("PASS 08 in-use master archive guard");

    const variant = await createCommerceVariant(context,productId,{name:"Normál",sku:`${prefix}-SKU-1`,unit:"DB",status:"ACTIVE",attributes:{size:"standard"}});
    console.log("PASS 09 variant create");
    const updated = await updateCommerceVariant(context,productId,variant.id,{name:"Normál módosított",sku:`${prefix}-SKU-2`,unit:"CSOMAG",attributes:{size:"updated"}});
    if (updated.name !== "Normál módosított" || updated.unit !== "CSOMAG" || updated.sku !== `${prefix}-SKU-2`) throw new Error("QA_VARIANT_UPDATE_MISMATCH");
    console.log("PASS 10 variant update");
    const archivedVariant = await archiveCommerceVariant(context,productId,variant.id);
    if (!archivedVariant.archived) throw new Error("QA_VARIANT_ARCHIVE_FAILED");
    console.log("PASS 11 variant archive");

    const deleteProduct = await client.from("commerce_products").delete().eq("organization_id",orgId).eq("id",productId);
    if (deleteProduct.error) throw new Error(`QA_PRODUCT_DELETE:${deleteProduct.error.message}`);
    productId = null;
    await archiveCommerceCatalogItem(context,"categories",child.id);
    childId = null;
    await archiveCommerceCatalogItem(context,"categories",root.id);
    rootId = null;
    await archiveCommerceCatalogItem(context,"brands",brand.id);
    brandId = null;
    await archiveCommerceCatalogItem(context,"manufacturers",manufacturer.id);
    manufacturerId = null;
    console.log("PASS 12 dependency-safe master archive");
    console.log("RESULT 12/12 PASS");
  } finally {
    if (productId) await client.from("commerce_products").delete().eq("organization_id",orgId).eq("id",productId);
    for (const id of [childId,rootId].filter(Boolean) as string[]) await client.from("commerce_categories").delete().eq("organization_id",orgId).eq("id",id);
    if (brandId) await client.from("commerce_brands").delete().eq("organization_id",orgId).eq("id",brandId);
    if (manufacturerId) await client.from("commerce_manufacturers").delete().eq("organization_id",orgId).eq("id",manufacturerId);
    await client.from("commerce_products").delete().eq("organization_id",orgId).ilike("name",`${prefix}%`);
    await client.from("commerce_categories").delete().eq("organization_id",orgId).ilike("name",`${prefix}%`);
    await client.from("commerce_brands").delete().eq("organization_id",orgId).ilike("name",`${prefix}%`);
    await client.from("commerce_manufacturers").delete().eq("organization_id",orgId).ilike("name",`${prefix}%`);
  }
}

main().catch((error)=>{console.error(error);process.exit(1);});
