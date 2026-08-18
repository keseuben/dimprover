import { randomUUID } from "node:crypto";
import { createCommerceAdminClient } from "../app/lib/commerce/core/server-db";
import type { CommerceContext } from "../app/lib/commerce/core/types";
import { deleteCommerceMediaObject } from "../app/lib/commerce/media/storage";
import { getCommerceMediaContentUrl } from "../app/lib/commerce/media/repository";
import { finalizeCommerceMediaUpload, initiateCommerceMediaUpload, uploadCommerceMediaVariant } from "../app/lib/commerce/media/uploadService";

type Row = Record<string, unknown>;
function text(value: unknown) { return typeof value === "string" ? value : ""; }

const client=createCommerceAdminClient();
const marker=randomUUID().slice(0,8);
let productId="";
let assetId="";
let storageKeys:string[]=[];

async function cleanup() {
  for (const key of storageKeys) {
    try { await deleteCommerceMediaObject(key); } catch {}
  }
  if (assetId) await client.from("commerce_media_assets").delete().eq("id",assetId);
  if (productId) await client.from("commerce_products").delete().eq("id",productId);
}

async function main() {
try {
  const orgResult=await client.from("dimpro_organizations").select("id").eq("status","active").order("created_at").limit(1).maybeSingle();
  if (orgResult.error || !orgResult.data) throw new Error(`MEDIA_E2E_ORG: ${orgResult.error?.message||"missing"}`);
  const organizationId=text((orgResult.data as Row).id);
  const created=await client.rpc("commerce_product_create_atomic",{
    p_organization_id:organizationId,
    p_name:`Media runtime QA ${marker}`,
    p_slug:`media-runtime-qa-${marker}`,
    p_description:"OutminAI runtime media E2E",
    p_type_model:"QA",
    p_category_id:null,p_brand_id:null,p_manufacturer_id:null,p_status:"ACTIVE",
    p_default_variant:{name:`Media runtime QA ${marker}`,unit:"DB"},
    p_identifiers:[],
  });
  if (created.error || !created.data) throw new Error(`MEDIA_E2E_PRODUCT: ${created.error?.message||"missing"}`);
  productId=text((created.data as Row).productId);
  const context:CommerceContext={
    userId:randomUUID(),organizationId,organizationName:"Media E2E",roleCode:"OWNER",
    permissions:["commerce.context.read","commerce.product.read","commerce.product.write","commerce.identifier.write","commerce.media.read","commerce.media.write","commerce.inventory.read","commerce.inventory.move","commerce.inventory.adjust"],
    storefrontId:null,warehouseId:null,
  };
  const webBytes=new TextEncoder().encode(`WEB-${marker}-1234567890`);
  const thumbBytes=new TextEncoder().encode(`THUMB-${marker}`);
  const initiated=await initiateCommerceMediaUpload(context,{
    targetType:"PRODUCT",targetId:productId,visibility:"PUBLIC",retainOriginal:false,
    variants:[
      {kind:"WEB",mimeType:"image/webp",sizeBytes:webBytes.byteLength,width:1600,height:1200},
      {kind:"THUMBNAIL",mimeType:"image/webp",sizeBytes:thumbBytes.byteLength,width:512,height:384},
    ],
  });
  assetId=initiated.assetId;
  storageKeys=initiated.variants.map((variant)=>variant.storageKey);
  for (const variant of initiated.variants) {
    const bytes=variant.kind==="WEB"?webBytes:thumbBytes;
    const stream=new Blob([bytes]).stream() as ReadableStream<Uint8Array>;
    await uploadCommerceMediaVariant({
      context,assetId,kind:variant.kind,token:initiated.token,contentType:variant.mimeType,contentLength:bytes.byteLength,body:stream,
    });
  }
  console.log("PASS 01 initiate + same-origin server upload ticket");
  console.log("PASS 02 WEB object uploaded through Commerce storage service");
  console.log("PASS 03 THUMBNAIL object uploaded through Commerce storage service");
  const finalized=await finalizeCommerceMediaUpload(context,initiated.token);
  if (text(finalized.assetId)!==assetId || finalized.alreadyFinalized!==false) throw new Error("MEDIA_E2E_FINALIZE_INVALID");
  console.log("PASS 04 atomic media finalize");
  const finalizedAgain=await finalizeCommerceMediaUpload(context,initiated.token);
  if (finalizedAgain.alreadyFinalized!==true) throw new Error("MEDIA_E2E_FINALIZE_IDEMPOTENCY");
  console.log("PASS 05 finalize is idempotent");
  const [asset,variants,links]=await Promise.all([
    client.from("commerce_media_assets").select("id,processing_status,retain_original").eq("organization_id",organizationId).eq("id",assetId).maybeSingle(),
    client.from("commerce_media_variants").select("variant_kind,storage_key,size_bytes").eq("organization_id",organizationId).eq("asset_id",assetId),
    client.from("commerce_media_links").select("link_type,linked_entity_id,is_primary").eq("organization_id",organizationId).eq("asset_id",assetId),
  ]);
  if (asset.error||!asset.data||text((asset.data as Row).processing_status)!=="READY"||(asset.data as Row).retain_original!==false) throw new Error("MEDIA_E2E_ASSET_DB");
  if (variants.error||(variants.data||[]).length!==2) throw new Error("MEDIA_E2E_VARIANTS_DB");
  if (links.error||(links.data||[]).length!==1||text(((links.data||[])[0] as Row).linked_entity_id)!==productId) throw new Error("MEDIA_E2E_LINK_DB");
  console.log("PASS 06 asset + variants + product link persisted");
  const content=await getCommerceMediaContentUrl(context,assetId,"THUMBNAIL");
  const response=await fetch(content.url);
  if (!response.ok) throw new Error(`MEDIA_E2E_SIGNED_GET_${response.status}`);
  const downloaded=new Uint8Array(await response.arrayBuffer());
  if (downloaded.byteLength!==thumbBytes.byteLength) throw new Error("MEDIA_E2E_SIGNED_GET_SIZE");
  console.log("PASS 07 signed thumbnail GET works");
  const noOriginal=(variants.data||[]).every((row)=>text((row as Row).variant_kind)!=="ORIGINAL");
  if(!noOriginal)throw new Error("MEDIA_E2E_ORIGINAL_RETAINED");
  console.log("PASS 08 original not retained by default");
  console.log("RESULT 8/8 PASS");
} finally {
  await cleanup();
}
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
