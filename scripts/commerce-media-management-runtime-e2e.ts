import { randomUUID } from "node:crypto";
import { createCommerceAdminClient } from "../app/lib/commerce/core/server-db";
import type { CommerceContext } from "../app/lib/commerce/core/types";
import { archiveCommerceMediaOverlay, createCommerceMediaOverlay, listCommerceProductMedia, setCommerceProductMediaOrder, updateCommerceMediaOverlay } from "../app/lib/commerce/media/repository";

async function main(){
 const client=createCommerceAdminClient();
 const orgResult=await client.from("dimpro_organizations").select("id,display_name,legal_name").eq("status","active").limit(1).maybeSingle();
 if(orgResult.error||!orgResult.data) throw new Error("MEDIA_MGMT_RUNTIME_ORG_MISSING");
 const orgId=String(orgResult.data.id),productId=randomUUID(),a=randomUUID(),b=randomUUID();
 const context:CommerceContext={userId:randomUUID(),organizationId:orgId,organizationName:String(orgResult.data.display_name||orgResult.data.legal_name||"QA"),roleCode:"ADMIN",permissions:["commerce.context.read","commerce.product.read","commerce.media.read","commerce.media.write"]};
 let overlayId="";
 try{
  const product=await client.from("commerce_products").insert({id:productId,organization_id:orgId,name:"Media management runtime QA",slug:`media-management-runtime-${productId.slice(0,8)}`,status:"ACTIVE"}).select("id").single(); if(product.error)throw product.error;
  const assets=await client.from("commerce_media_assets").insert([{id:a,organization_id:orgId,storage_key:`commerce/${orgId}/media/${a}/web.jpg`,mime_type:"image/jpeg",size_bytes:100,visibility:"INTERNAL_ONLY",processing_status:"READY",retain_original:false},{id:b,organization_id:orgId,storage_key:`commerce/${orgId}/media/${b}/web.jpg`,mime_type:"image/jpeg",size_bytes:120,visibility:"INTERNAL_ONLY",processing_status:"READY",retain_original:false}]).select("id"); if(assets.error)throw assets.error;
  const links=await client.from("commerce_media_links").insert([{organization_id:orgId,asset_id:a,link_type:"PRODUCT",linked_entity_id:productId,sort_order:0,is_primary:true},{organization_id:orgId,asset_id:b,link_type:"PRODUCT",linked_entity_id:productId,sort_order:1,is_primary:false}]); if(links.error)throw links.error;
  console.log("PASS 01 media management runtime fixture created");
  let list=await listCommerceProductMedia(context,productId); if(list.length!==2||list[0]?.assetId!==a||!list[0]?.primary)throw new Error("MEDIA_MGMT_RUNTIME_INITIAL_LIST"); console.log("PASS 02 product media list preserves initial order and primary");
  const order=await setCommerceProductMediaOrder(context,productId,{assetIds:[b,a],primaryAssetId:b}); if(String(order.primaryAssetId)!==b)throw new Error("MEDIA_MGMT_RUNTIME_ORDER_RPC"); console.log("PASS 03 product media ordering RPC applied");
  list=await listCommerceProductMedia(context,productId); if(list[0]?.assetId!==b||list[0]?.sortOrder!==0||!list[0]?.primary||list[1]?.assetId!==a)throw new Error("MEDIA_MGMT_RUNTIME_REORDER_LIST"); console.log("PASS 04 reordered list and primary are visible");
  const overlay=await createCommerceMediaOverlay(context,b,{type:"STAMP",payload:{text:"SÉRÜLT"},sortOrder:0,active:true}); overlayId=String(overlay.id); if(!overlayId||overlay.type!=="STAMP")throw new Error("MEDIA_MGMT_RUNTIME_OVERLAY_CREATE"); console.log("PASS 05 non-destructive overlay created");
  const updated=await updateCommerceMediaOverlay(context,b,overlayId,{type:"TEXT",payload:{text:"ELLENŐRIZVE"},sortOrder:1,active:true}); if(updated.type!=="TEXT"||updated.sortOrder!==1)throw new Error("MEDIA_MGMT_RUNTIME_OVERLAY_UPDATE"); console.log("PASS 06 overlay updated in asset scope");
  list=await listCommerceProductMedia(context,productId); if(list[0]?.overlays.length!==1||list[0]?.overlays[0]?.type!=="TEXT")throw new Error("MEDIA_MGMT_RUNTIME_OVERLAY_LIST"); console.log("PASS 07 overlay appears in product media list");
  const archived=await archiveCommerceMediaOverlay(context,b,overlayId); if(!archived.archived)throw new Error("MEDIA_MGMT_RUNTIME_OVERLAY_ARCHIVE"); console.log("PASS 08 overlay soft archive works");
  list=await listCommerceProductMedia(context,productId); if(list[0]?.overlays.length!==0)throw new Error("MEDIA_MGMT_RUNTIME_OVERLAY_ARCHIVED_VISIBLE"); console.log("PASS 09 archived overlay is hidden from active list");
  const audit=await client.from("commerce_audit_events").select("id",{count:"exact",head:true}).eq("organization_id",orgId).eq("action","PRODUCT_MEDIA_ORDER_CHANGED").eq("entity_id",productId); if(audit.error||(audit.count||0)!==1)throw new Error("MEDIA_MGMT_RUNTIME_AUDIT"); console.log("PASS 10 media ordering audit persisted");
  const outbox=await client.from("commerce_outbox_events").select("id",{count:"exact",head:true}).eq("organization_id",orgId).eq("event_type","PRODUCT_MEDIA_CHANGED").eq("aggregate_id",productId); if(outbox.error||(outbox.count||0)!==1)throw new Error("MEDIA_MGMT_RUNTIME_OUTBOX"); console.log("PASS 11 media ordering outbox persisted");
 } finally {
  await client.from("commerce_media_overlays").delete().eq("organization_id",orgId).in("asset_id",[a,b]);
  await client.from("commerce_media_links").delete().eq("organization_id",orgId).eq("linked_entity_id",productId);
  await client.from("commerce_media_assets").delete().eq("organization_id",orgId).in("id",[a,b]);
  await client.from("commerce_audit_events").delete().eq("organization_id",orgId).eq("entity_id",productId);
  await client.from("commerce_outbox_events").delete().eq("organization_id",orgId).eq("aggregate_id",productId);
  await client.from("commerce_products").delete().eq("organization_id",orgId).eq("id",productId);
  const remaining=await client.from("commerce_products").select("id",{count:"exact",head:true}).eq("organization_id",orgId).eq("id",productId); if(remaining.error||(remaining.count||0)!==0)throw new Error("MEDIA_MGMT_RUNTIME_CLEANUP");
  console.log("PASS 12 media management runtime fixture cleanup");
 }
 console.log("RESULT 12/12 PASS");
}
main().catch((error)=>{console.error(error);process.exit(1);});
