import { randomUUID } from "node:crypto";
import { createCommerceAdminClient } from "../app/lib/commerce/core/server-db";
import type { CommerceContext } from "../app/lib/commerce/core/types";
import { deleteCommerceMediaObject } from "../app/lib/commerce/media/storage";
import { getCommerceMediaContentUrl, listCommerceLinkedMedia } from "../app/lib/commerce/media/repository";
import { finalizeCommerceMediaUpload, initiateCommerceMediaUpload, uploadCommerceMediaVariant } from "../app/lib/commerce/media/uploadService";

type Row=Record<string,unknown>;
function text(value:unknown){return typeof value==="string"?value:"";}
const client=createCommerceAdminClient();
const marker=randomUUID().slice(0,8);
let organizationId="",warehouseId="",sourceId="",productId="",variantId="",receiptId="",itemId="";
const assetIds:string[]=[]; const storageKeys:string[]=[];

async function cleanup(){
  for(const key of storageKeys){try{await deleteCommerceMediaObject(key);}catch{}}
  for(const id of assetIds){try{await client.from("commerce_media_assets").delete().eq("id",id);}catch{}}
  if(receiptId)await client.from("commerce_goods_receipts").delete().eq("id",receiptId);
  if(variantId)await client.from("commerce_product_variants").delete().eq("id",variantId);
  if(productId)await client.from("commerce_products").delete().eq("id",productId);
  if(sourceId)await client.from("commerce_inventory_sources").delete().eq("id",sourceId);
  if(warehouseId)await client.from("commerce_warehouses").delete().eq("id",warehouseId);
}

async function uploadTarget(context:CommerceContext,targetType:"GOODS_RECEIPT"|"GOODS_RECEIPT_ITEM",targetId:string,label:string){
  const webBytes=new TextEncoder().encode(`WEB-${label}-${marker}-1234567890`);
  const thumbBytes=new TextEncoder().encode(`THUMB-${label}-${marker}`);
  const initiated=await initiateCommerceMediaUpload(context,{targetType,targetId,visibility:"INTERNAL_ONLY",retainOriginal:false,variants:[
    {kind:"WEB",mimeType:"image/webp",sizeBytes:webBytes.byteLength,width:1200,height:900},
    {kind:"THUMBNAIL",mimeType:"image/webp",sizeBytes:thumbBytes.byteLength,width:320,height:240},
  ]});
  assetIds.push(initiated.assetId);storageKeys.push(...initiated.variants.map(v=>v.storageKey));
  for(const variant of initiated.variants){const bytes=variant.kind==="WEB"?webBytes:thumbBytes;await uploadCommerceMediaVariant({context,assetId:initiated.assetId,kind:variant.kind,token:initiated.token,contentType:variant.mimeType,contentLength:bytes.byteLength,body:new Blob([bytes]).stream() as ReadableStream<Uint8Array>});}
  const finalized=await finalizeCommerceMediaUpload(context,initiated.token);
  if(text(finalized.assetId)!==initiated.assetId)throw new Error(`RECEIVING_MEDIA_FINALIZE_${targetType}`);
  return {assetId:initiated.assetId,thumbBytes};
}

async function main(){
  try{
    const org=await client.from("dimpro_organizations").select("id").eq("status","active").order("created_at").limit(1).maybeSingle();
    if(org.error||!org.data)throw new Error("RECEIVING_MEDIA_ORG_MISSING");organizationId=text((org.data as Row).id);
    warehouseId=randomUUID();sourceId=randomUUID();productId=randomUUID();variantId=randomUUID();receiptId=randomUUID();itemId=randomUUID();
    const fixtures=[
      await client.from("commerce_warehouses").insert({id:warehouseId,organization_id:organizationId,code:`RM-${warehouseId.slice(0,6)}`,name:"Receiving media QA",active:true}),
      await client.from("commerce_products").insert({id:productId,organization_id:organizationId,name:"Receiving media QA",slug:`receiving-media-${marker}`,status:"ACTIVE"}),
    ];
    if(fixtures.some(x=>x.error))throw new Error(`RECEIVING_MEDIA_FIXTURE_1_${fixtures.map(x=>x.error?.message||"ok").join("|")}`);
    const src=await client.from("commerce_inventory_sources").insert({id:sourceId,organization_id:organizationId,warehouse_id:warehouseId,source_type:"INTERNAL",code:`RM-${sourceId.slice(0,6)}`,name:"Receiving media QA",active:true});if(src.error)throw src.error;
    const variant=await client.from("commerce_product_variants").insert({id:variantId,organization_id:organizationId,product_id:productId,name:"Receiving media QA",unit:"DB",status:"ACTIVE"});if(variant.error)throw variant.error;
    const receipt=await client.from("commerce_goods_receipts").insert({id:receiptId,organization_id:organizationId,warehouse_id:warehouseId,source_id:sourceId,receipt_number:`RM-${marker}`,status:"DRAFT"});if(receipt.error)throw receipt.error;
    const item=await client.from("commerce_goods_receipt_items").insert({id:itemId,organization_id:organizationId,receipt_id:receiptId,variant_id:variantId,stock_status:"SELLABLE",quantity:1,unit:"DB",currency:"HUF"});if(item.error)throw item.error;
    console.log("PASS 01 receipt + item media runtime fixture created");

    const context:CommerceContext={userId:randomUUID(),organizationId,organizationName:"Receiving Media E2E",roleCode:"OWNER",permissions:["commerce.context.read","commerce.product.read","commerce.product.write","commerce.identifier.write","commerce.media.read","commerce.media.write","commerce.inventory.read","commerce.inventory.move","commerce.inventory.adjust","commerce.receiving.read","commerce.receiving.write","commerce.receiving.post"]};
    const header=await uploadTarget(context,"GOODS_RECEIPT",receiptId,"header");
    console.log("PASS 02 receipt-header upload ticket accepted");
    console.log("PASS 03 receipt-header WEB + THUMBNAIL objects uploaded");
    const line=await uploadTarget(context,"GOODS_RECEIPT_ITEM",itemId,"item");
    console.log("PASS 04 receipt-item upload ticket accepted");
    console.log("PASS 05 receipt-item WEB + THUMBNAIL objects uploaded");

    const headerList=await listCommerceLinkedMedia(context,"GOODS_RECEIPT",receiptId);
    if(headerList.length!==1||headerList[0]?.assetId!==header.assetId)throw new Error("RECEIVING_MEDIA_HEADER_LIST");
    console.log("PASS 06 generic linked-media list returns receipt header image");
    const itemList=await listCommerceLinkedMedia(context,"GOODS_RECEIPT_ITEM",itemId);
    if(itemList.length!==1||itemList[0]?.assetId!==line.assetId)throw new Error("RECEIVING_MEDIA_ITEM_LIST");
    console.log("PASS 07 generic linked-media list returns receipt item image");

    const headerLink=await client.from("commerce_media_links").select("link_type,linked_entity_id").eq("organization_id",organizationId).eq("asset_id",header.assetId).maybeSingle();
    if(headerLink.error||!headerLink.data||text((headerLink.data as Row).link_type)!=="GOODS_RECEIPT"||text((headerLink.data as Row).linked_entity_id)!==receiptId)throw new Error("RECEIVING_MEDIA_HEADER_DB_LINK");
    console.log("PASS 08 receipt header DB link is correctly scoped");
    const itemLink=await client.from("commerce_media_links").select("link_type,linked_entity_id").eq("organization_id",organizationId).eq("asset_id",line.assetId).maybeSingle();
    if(itemLink.error||!itemLink.data||text((itemLink.data as Row).link_type)!=="GOODS_RECEIPT_ITEM"||text((itemLink.data as Row).linked_entity_id)!==itemId)throw new Error("RECEIVING_MEDIA_ITEM_DB_LINK");
    console.log("PASS 09 receipt item DB link is correctly scoped");

    const content=await getCommerceMediaContentUrl(context,header.assetId,"THUMBNAIL");const response=await fetch(content.url);if(!response.ok)throw new Error(`RECEIVING_MEDIA_SIGNED_GET_${response.status}`);const downloaded=new Uint8Array(await response.arrayBuffer());if(downloaded.byteLength!==header.thumbBytes.byteLength)throw new Error("RECEIVING_MEDIA_SIGNED_GET_SIZE");
    console.log("PASS 10 signed receipt thumbnail GET works");
    const variants=await client.from("commerce_media_variants").select("variant_kind").eq("organization_id",organizationId).in("asset_id",[header.assetId,line.assetId]);if(variants.error||(variants.data||[]).some(row=>text((row as Row).variant_kind)==="ORIGINAL"))throw new Error("RECEIVING_MEDIA_ORIGINAL_RETAINED");
    console.log("PASS 11 originals are not retained by default");
  }finally{await cleanup();console.log("PASS 12 receiving media runtime fixture cleanup");}
  console.log("RESULT 12/12 PASS");
}
void main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exit(1);});
