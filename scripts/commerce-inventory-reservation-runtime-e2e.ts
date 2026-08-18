import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createCommerceAdminClient } from "../app/lib/commerce/core/server-db";
import type { CommerceContext } from "../app/lib/commerce/core/types";
import {
  applyCommerceInventoryReservationAction,
  applyCommerceStockMovement,
  createCommerceInventoryReservation,
  listCommerceInventory,
  listCommerceInventoryReservations,
} from "../app/lib/commerce/inventory/repository";

async function main() {
  const client=createCommerceAdminClient();
  const orgResult=await client.from("dimpro_organizations").select("id,display_name,legal_name").eq("status","active").limit(1).maybeSingle();
  if(orgResult.error||!orgResult.data) throw new Error("RES_RUNTIME_ORG_MISSING");
  const orgId=String(orgResult.data.id);
  const warehouseId=randomUUID(), sourceId=randomUUID(), productId=randomUUID(), variantId=randomUUID(), referenceId=randomUUID();
  let reservationId="";
  const createKey=`res-runtime-create-${productId.slice(0,8)}`;
  const expiresAt=new Date(Date.now()+60*60*1000).toISOString();
  const context:CommerceContext={
    userId:randomUUID(),organizationId:orgId,organizationName:String(orgResult.data.display_name||orgResult.data.legal_name||"QA"),roleCode:"ADMIN",
    permissions:["commerce.context.read","commerce.product.read","commerce.product.write","commerce.inventory.read","commerce.inventory.move","commerce.inventory.adjust"],
  };
  try {
    const wh=await client.from("commerce_warehouses").insert({id:warehouseId,organization_id:orgId,code:`RESRT-${warehouseId.slice(0,6)}`,name:"Reservation runtime QA",active:true}).select("id").single();
    if(wh.error) throw wh.error;
    const src=await client.from("commerce_inventory_sources").insert({id:sourceId,organization_id:orgId,warehouse_id:warehouseId,source_type:"INTERNAL",code:`RESRT-${sourceId.slice(0,6)}`,name:"Reservation runtime QA",active:true}).select("id").single();
    if(src.error) throw src.error;
    const product=await client.from("commerce_products").insert({id:productId,organization_id:orgId,name:"Reservation runtime QA",slug:`reservation-runtime-${productId.slice(0,8)}`,status:"ACTIVE"}).select("id").single();
    if(product.error) throw product.error;
    const variant=await client.from("commerce_product_variants").insert({id:variantId,organization_id:orgId,product_id:productId,name:"Reservation runtime QA",unit:"DB",status:"ACTIVE"}).select("id").single();
    if(variant.error) throw variant.error;
    console.log("PASS 01 reservation runtime fixture created");

    await applyCommerceStockMovement(context,{sourceId,variantId,type:"RECEIPT",physicalDelta:"10",reservedDelta:"0",incomingDelta:"0",stockStatus:"SELLABLE",idempotencyKey:`res-runtime-receipt-${productId.slice(0,8)}`});
    console.log("PASS 02 receipt baseline created through inventory ledger");

    const created=await createCommerceInventoryReservation(context,{sourceId,variantId,quantity:"4",stockStatus:"SELLABLE",idempotencyKey:createKey,referenceType:"ORDER",referenceId,expiresAt});
    reservationId=String(created.reservationId||"");
    if(!reservationId||String(created.status)!=="ACTIVE"||String(created.remainingQuantity)!=="4.000000") throw new Error(`RES_RUNTIME_CREATE_${JSON.stringify(created)}`);
    console.log("PASS 03 active reservation created through repository RPC");

    const duplicate=await createCommerceInventoryReservation(context,{sourceId,variantId,quantity:"4",stockStatus:"SELLABLE",idempotencyKey:createKey,referenceType:"ORDER",referenceId,expiresAt});
    if(duplicate.duplicate!==true||String(duplicate.reservationId)!==reservationId) throw new Error("RES_RUNTIME_CREATE_IDEMPOTENCY");
    console.log("PASS 04 reservation create idempotency works");

    let balances=await listCommerceInventory(context,{variantId,sourceId,stockStatus:"SELLABLE"});
    if(balances.length!==1||balances[0]?.physicalQuantity!=="10.000000"||balances[0]?.reservedQuantity!=="4.000000"||balances[0]?.availableQuantity!=="6.000000") throw new Error(`RES_RUNTIME_BALANCE_AFTER_CREATE_${JSON.stringify(balances)}`);
    console.log("PASS 05 reserve changes reserved and available quantities only");

    const listed=await listCommerceInventoryReservations(context,{variantId,sourceId,status:"ACTIVE"});
    if(listed.length!==1||listed[0]?.id!==reservationId) throw new Error("RES_RUNTIME_LIST");
    console.log("PASS 06 tenant-scoped reservation list returns fixture");

    const released=await applyCommerceInventoryReservationAction(context,reservationId,"RELEASE",{quantity:"1",idempotencyKey:`res-runtime-release-${productId.slice(0,8)}`});
    if(String(released.remainingQuantity)!=="3.000000") throw new Error("RES_RUNTIME_RELEASE");
    console.log("PASS 07 partial release works");

    const consumed=await applyCommerceInventoryReservationAction(context,reservationId,"CONSUME",{quantity:"2",idempotencyKey:`res-runtime-consume2-${productId.slice(0,8)}`});
    if(String(consumed.remainingQuantity)!=="1.000000") throw new Error("RES_RUNTIME_CONSUME_PARTIAL");
    console.log("PASS 08 partial consume works");

    const finished=await applyCommerceInventoryReservationAction(context,reservationId,"CONSUME",{quantity:"1",idempotencyKey:`res-runtime-consume1-${productId.slice(0,8)}`});
    if(String(finished.status)!=="CONSUMED"||String(finished.remainingQuantity)!=="0.000000") throw new Error(`RES_RUNTIME_FINISH_${JSON.stringify(finished)}`);
    console.log("PASS 09 final consume closes reservation");

    balances=await listCommerceInventory(context,{variantId,sourceId,stockStatus:"SELLABLE"});
    if(balances[0]?.physicalQuantity!=="7.000000"||balances[0]?.reservedQuantity!=="0.000000"||balances[0]?.availableQuantity!=="7.000000") throw new Error(`RES_RUNTIME_FINAL_BALANCE_${JSON.stringify(balances)}`);
    console.log("PASS 10 final balance physical/reserved/available is correct");
  } finally {
    const sql=`begin;
      delete from public.commerce_inventory_reservation_events where organization_id='${orgId}' and reservation_id in (select id from public.commerce_inventory_reservations where organization_id='${orgId}' and variant_id='${variantId}');
      delete from public.commerce_inventory_reservations where organization_id='${orgId}' and variant_id='${variantId}';
      delete from public.commerce_stock_movements where organization_id='${orgId}' and variant_id='${variantId}';
      delete from public.commerce_inventory_balances where organization_id='${orgId}' and variant_id='${variantId}';
      delete from public.commerce_audit_events where organization_id='${orgId}' and ((entity_type='INVENTORY_RESERVATION' and entity_id='${reservationId||productId}') or metadata->>'variantId'='${variantId}');
      delete from public.commerce_outbox_events where organization_id='${orgId}' and (aggregate_id='${reservationId||productId}' or aggregate_id='${variantId}');
      delete from public.commerce_product_variants where organization_id='${orgId}' and id='${variantId}';
      delete from public.commerce_products where organization_id='${orgId}' and id='${productId}';
      delete from public.commerce_inventory_sources where organization_id='${orgId}' and id='${sourceId}';
      delete from public.commerce_warehouses where organization_id='${orgId}' and id='${warehouseId}';
    commit;`;
    const cleanup=spawnSync("psql",["-w","-h","aws-0-eu-central-1.pooler.supabase.com","-p","5432","-U","postgres.pbgyuznivqvestuksvif","-d","postgres","-X","-v","ON_ERROR_STOP=1","-c",sql],{encoding:"utf8"});
    if(cleanup.status!==0) throw new Error(`RES_RUNTIME_CLEANUP_${cleanup.stderr}`);
    console.log("PASS 11 reservation runtime fixture cleanup");
  }
  console.log("RESULT 11/11 PASS");
}
main().catch((error)=>{console.error(error);process.exit(1);});
