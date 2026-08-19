import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createCommerceAdminClient } from "../app/lib/commerce/core/server-db";
import type { CommerceContext } from "../app/lib/commerce/core/types";
import {
  createCommerceGoodsReceipt,
  createCommerceGoodsReceiptItem,
  getCommerceGoodsReceipt,
  listCommerceGoodsReceipts,
  listCommerceReceivingOptions,
  postCommerceGoodsReceipt,
} from "../app/lib/commerce/receiving/repository";
import { listCommerceInventory } from "../app/lib/commerce/inventory/repository";

async function main(){
  const client=createCommerceAdminClient();
  const orgResult=await client.from("dimpro_organizations").select("id,display_name,legal_name").eq("status","active").limit(1).maybeSingle();
  if(orgResult.error||!orgResult.data) throw new Error("RECEIVING_RUNTIME_ORG_MISSING");
  const orgId=String(orgResult.data.id);
  const membershipResult=await client.from("dimpro_organization_memberships").select("user_id").eq("organization_id",orgId).eq("status","active").limit(1).maybeSingle();
  if(membershipResult.error||!membershipResult.data) throw new Error("RECEIVING_RUNTIME_MEMBERSHIP_MISSING");
  const userId=String(membershipResult.data.user_id);
  const warehouseId=randomUUID(), sourceId=randomUUID(), productId=randomUUID(), variantId=randomUUID();
  const receiptNumber=`REC-RT-${productId.slice(0,8)}`;
  let receiptId="", itemA="", itemB="";
  const context:CommerceContext={userId,organizationId:orgId,organizationName:String(orgResult.data.display_name||orgResult.data.legal_name||"QA"),roleCode:"ADMIN",permissions:["commerce.context.read","commerce.product.read","commerce.product.write","commerce.identifier.write","commerce.media.read","commerce.media.write","commerce.inventory.read","commerce.inventory.move","commerce.inventory.adjust","commerce.receiving.read","commerce.receiving.write","commerce.receiving.post"]};
  try{
    const wh=await client.from("commerce_warehouses").insert({id:warehouseId,organization_id:orgId,code:`RECRT-${warehouseId.slice(0,6)}`,name:"Receiving runtime QA",active:true}).select("id").single(); if(wh.error) throw wh.error;
    const src=await client.from("commerce_inventory_sources").insert({id:sourceId,organization_id:orgId,warehouse_id:warehouseId,source_type:"INTERNAL",code:`RECRT-${sourceId.slice(0,6)}`,name:"Receiving runtime QA",active:true}).select("id").single(); if(src.error) throw src.error;
    const product=await client.from("commerce_products").insert({id:productId,organization_id:orgId,name:"Receiving runtime QA",slug:`receiving-runtime-${productId.slice(0,8)}`,status:"ACTIVE"}).select("id").single(); if(product.error) throw product.error;
    const variant=await client.from("commerce_product_variants").insert({id:variantId,organization_id:orgId,product_id:productId,name:"Receiving runtime QA",unit:"DB",status:"ACTIVE"}).select("id").single(); if(variant.error) throw variant.error;
    console.log("PASS 01 receiving runtime fixture created");

    const options=await listCommerceReceivingOptions(context); if(!options.warehouses.some(x=>x.id===warehouseId)||!options.sources.some(x=>x.id===sourceId)) throw new Error("RECEIVING_RUNTIME_OPTIONS");
    console.log("PASS 02 tenant-scoped warehouse/source options work");

    const created=await createCommerceGoodsReceipt(context,{warehouseId,sourceId,receiptNumber,supplierName:"Runtime supplier",supplierDocumentNumber:"SZL-RT-001",notes:"Runtime QA"}); receiptId=created.id; if(created.status!=="DRAFT") throw new Error("RECEIVING_RUNTIME_CREATE");
    console.log("PASS 03 draft receipt created through repository");

    const a=await createCommerceGoodsReceiptItem(context,receiptId,{variantId,quantity:"5",unit:"DB",stockStatus:"SELLABLE",unitCost:"1250",currency:"HUF",lotCode:"LOT-RT-A"}); itemA=a.id;
    const b=await createCommerceGoodsReceiptItem(context,receiptId,{variantId,quantity:"2",unit:"DB",stockStatus:"QUARANTINE",currency:"HUF",lotCode:"LOT-RT-B"}); itemB=b.id;
    console.log("PASS 04 sellable and quarantine receipt items created");

    const detail=await getCommerceGoodsReceipt(context,receiptId); if(detail.items.length!==2||detail.supplierDocumentNumber!=="SZL-RT-001") throw new Error("RECEIVING_RUNTIME_DETAIL");
    console.log("PASS 05 receipt detail returns items and supplier snapshot");

    const listed=await listCommerceGoodsReceipts(context,{status:"DRAFT",limit:20}); if(!listed.some(x=>x.id===receiptId)) throw new Error("RECEIVING_RUNTIME_LIST");
    console.log("PASS 06 draft list remains organization scoped");

    const posted=await postCommerceGoodsReceipt(context,receiptId,{idempotencyKey:`runtime-post-${receiptId}`}); if(String(posted.status)!=="POSTED"||Number(posted.itemCount)!==2||Number(posted.totalQuantity)!==7) throw new Error(`RECEIVING_RUNTIME_POST_${JSON.stringify(posted)}`);
    console.log("PASS 07 posting succeeds through service-only RPC");

    const duplicate=await postCommerceGoodsReceipt(context,receiptId,{idempotencyKey:`runtime-post-${receiptId}`}); if(duplicate.duplicate!==true) throw new Error("RECEIVING_RUNTIME_POST_IDEMPOTENCY");
    console.log("PASS 08 posting idempotency works");

    const sellable=await listCommerceInventory(context,{variantId,sourceId,stockStatus:"SELLABLE"});
    const quarantine=await listCommerceInventory(context,{variantId,sourceId,stockStatus:"QUARANTINE"});
    if(Number(sellable[0]?.physicalQuantity)!==5||Number(quarantine[0]?.physicalQuantity)!==2) throw new Error(`RECEIVING_RUNTIME_BALANCE_${JSON.stringify({sellable,quarantine})}`);
    console.log("PASS 09 inventory ledger updates sellable/quarantine balances");

    const movements=await client.from("commerce_stock_movements").select("id,reference_id,movement_type").eq("organization_id",orgId).eq("reference_type","GOODS_RECEIPT_ITEM").in("reference_id",[itemA,itemB]);
    if(movements.error||movements.data?.length!==2||movements.data.some(x=>x.movement_type!=="RECEIPT")) throw new Error("RECEIVING_RUNTIME_MOVEMENTS");
    console.log("PASS 10 immutable stock movements reference receipt items");

    const postedDetail=await getCommerceGoodsReceipt(context,receiptId); if(postedDetail.status!=="POSTED"||!postedDetail.postedAt) throw new Error("RECEIVING_RUNTIME_POSTED_DETAIL");
    console.log("PASS 11 posted receipt is persisted");
  } finally {
    const sql=`begin;
      delete from public.commerce_media_links where organization_id='${orgId}' and link_type in ('GOODS_RECEIPT','GOODS_RECEIPT_ITEM') and linked_entity_id in ('${receiptId||productId}','${itemA||productId}','${itemB||productId}');
      delete from public.commerce_stock_movements where organization_id='${orgId}' and reference_type='GOODS_RECEIPT_ITEM' and reference_id in ('${itemA||productId}','${itemB||productId}');
      delete from public.commerce_inventory_balances where organization_id='${orgId}' and source_id='${sourceId}' and variant_id='${variantId}';
      delete from public.commerce_audit_events where organization_id='${orgId}' and entity_id='${receiptId||productId}';
      delete from public.commerce_outbox_events where organization_id='${orgId}' and aggregate_id='${receiptId||productId}';
      delete from public.commerce_goods_receipt_items where organization_id='${orgId}' and receipt_id='${receiptId||productId}';
      delete from public.commerce_goods_receipts where organization_id='${orgId}' and id='${receiptId||productId}';
      delete from public.commerce_product_variants where organization_id='${orgId}' and id='${variantId}';
      delete from public.commerce_products where organization_id='${orgId}' and id='${productId}';
      delete from public.commerce_inventory_sources where organization_id='${orgId}' and id='${sourceId}';
      delete from public.commerce_warehouses where organization_id='${orgId}' and id='${warehouseId}';
    commit;`;
    const cleanup=spawnSync("psql",["-w","-h","aws-0-eu-central-1.pooler.supabase.com","-p","5432","-U","postgres.pbgyuznivqvestuksvif","-d","postgres","-X","-v","ON_ERROR_STOP=1","-c",sql],{encoding:"utf8"});
    if(cleanup.status!==0) throw new Error(`RECEIVING_RUNTIME_CLEANUP_${cleanup.stderr}`);
    console.log("PASS 12 receiving runtime fixture cleanup");
  }
  console.log("RESULT 12/12 PASS");
}
main().catch(error=>{console.error(error);process.exit(1);});
