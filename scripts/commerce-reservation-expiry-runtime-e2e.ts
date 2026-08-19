import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createCommerceAdminClient } from "../app/lib/commerce/core/server-db";
import type { CommerceContext } from "../app/lib/commerce/core/types";
import {
  applyCommerceInventoryReservationAction,
  applyCommerceStockMovement,
  createCommerceInventoryReservation,
  expireDueCommerceInventoryReservations,
  listCommerceInventory,
  listCommerceInventoryReservations,
} from "../app/lib/commerce/inventory/repository";

async function main() {
  const client=createCommerceAdminClient();
  const orgResult=await client.from("dimpro_organizations").select("id,display_name,legal_name").eq("status","active").limit(1).maybeSingle();
  if(orgResult.error||!orgResult.data) throw new Error("EXPIRY_RUNTIME_ORG_MISSING");
  const orgId=String(orgResult.data.id);
  const warehouseId=randomUUID(),sourceId=randomUUID(),productId=randomUUID(),variantId=randomUUID();
  let dueId="",futureId="";
  const context:CommerceContext={userId:randomUUID(),organizationId:orgId,organizationName:String(orgResult.data.display_name||orgResult.data.legal_name||"QA"),roleCode:"ADMIN",permissions:["commerce.context.read","commerce.product.read","commerce.product.write","commerce.inventory.read","commerce.inventory.move","commerce.inventory.adjust"]};
  try {
    const wh=await client.from("commerce_warehouses").insert({id:warehouseId,organization_id:orgId,code:`EXPRT-${warehouseId.slice(0,6)}`,name:"Expiry runtime QA",active:true}).select("id").single(); if(wh.error)throw wh.error;
    const src=await client.from("commerce_inventory_sources").insert({id:sourceId,organization_id:orgId,warehouse_id:warehouseId,source_type:"INTERNAL",code:`EXPRT-${sourceId.slice(0,6)}`,name:"Expiry runtime QA",active:true}).select("id").single(); if(src.error)throw src.error;
    const product=await client.from("commerce_products").insert({id:productId,organization_id:orgId,name:"Expiry runtime QA",slug:`expiry-runtime-${productId.slice(0,8)}`,status:"ACTIVE"}).select("id").single(); if(product.error)throw product.error;
    const variant=await client.from("commerce_product_variants").insert({id:variantId,organization_id:orgId,product_id:productId,name:"Expiry runtime QA",unit:"DB",status:"ACTIVE"}).select("id").single(); if(variant.error)throw variant.error;
    console.log("PASS 01 expiry runtime fixture created");

    await applyCommerceStockMovement(context,{sourceId,variantId,type:"RECEIPT",physicalDelta:"10",reservedDelta:"0",incomingDelta:"0",stockStatus:"SELLABLE",idempotencyKey:`expiry-receipt-${productId.slice(0,8)}`});
    console.log("PASS 02 physical stock 10 seeded through immutable ledger");

    const due=await createCommerceInventoryReservation(context,{sourceId,variantId,quantity:"4",stockStatus:"SELLABLE",idempotencyKey:`expiry-due-${productId.slice(0,8)}`,referenceType:"QA",referenceId:randomUUID(),expiresAt:new Date(Date.now()+700).toISOString()});
    dueId=String(due.reservationId);
    const future=await createCommerceInventoryReservation(context,{sourceId,variantId,quantity:"2",stockStatus:"SELLABLE",idempotencyKey:`expiry-future-${productId.slice(0,8)}`,referenceType:"QA",referenceId:randomUUID(),expiresAt:new Date(Date.now()+60*60*1000).toISOString()});
    futureId=String(future.reservationId);
    console.log("PASS 03 due and future reservations created");

    let balance=(await listCommerceInventory(context,{variantId,sourceId,stockStatus:"SELLABLE"}))[0];
    if(Number(balance?.physicalQuantity)!==10||Number(balance?.reservedQuantity)!==6||Number(balance?.availableQuantity)!==4)throw new Error("EXPIRY_RUNTIME_INITIAL_BALANCE");
    console.log("PASS 04 both reservations reduce available stock only");

    await new Promise(resolve=>setTimeout(resolve,1100));
    const cleanup=await expireDueCommerceInventoryReservations(context,{limit:10});
    if(Number(cleanup.processedCount)!==1||Number(cleanup.releasedQuantity)!==4||!Array.isArray(cleanup.reservationIds)||cleanup.reservationIds[0]!==dueId)throw new Error(`EXPIRY_RUNTIME_CLEANUP_${JSON.stringify(cleanup)}`);
    console.log("PASS 05 cleanup expires exactly the due reservation");

    const expired=(await listCommerceInventoryReservations(context,{variantId,sourceId,status:"EXPIRED"})).find(item=>item.id===dueId);
    if(!expired||Number(expired.remainingQuantity)!==0||Number(expired.releasedQuantity)!==4)throw new Error("EXPIRY_RUNTIME_STATE");
    console.log("PASS 06 expired reservation is terminal with zero remaining quantity");

    const active=(await listCommerceInventoryReservations(context,{variantId,sourceId,status:"ACTIVE"})).find(item=>item.id===futureId);
    if(!active||Number(active.remainingQuantity)!==2)throw new Error("EXPIRY_RUNTIME_FUTURE_CHANGED");
    console.log("PASS 07 non-expired reservation remains ACTIVE");

    balance=(await listCommerceInventory(context,{variantId,sourceId,stockStatus:"SELLABLE"}))[0];
    if(Number(balance?.physicalQuantity)!==10||Number(balance?.reservedQuantity)!==2||Number(balance?.availableQuantity)!==8)throw new Error(`EXPIRY_RUNTIME_BALANCE_${JSON.stringify(balance)}`);
    console.log("PASS 08 expiry releases reserved quantity without changing physical stock");

    const again=await expireDueCommerceInventoryReservations(context,{limit:10});
    if(Number(again.processedCount)!==0||Number(again.releasedQuantity)!==0)throw new Error("EXPIRY_RUNTIME_NOT_IDEMPOTENT");
    console.log("PASS 09 cleanup replay is idempotent");

    const event=await client.from("commerce_inventory_reservation_events").select("action,quantity,stock_movement_id").eq("organization_id",orgId).eq("reservation_id",dueId).eq("action","EXPIRE").maybeSingle();
    if(event.error||!event.data||Number(event.data.quantity)!==4||!event.data.stock_movement_id)throw new Error("EXPIRY_RUNTIME_EVENT");
    console.log("PASS 10 EXPIRE event references stock movement");

    const audit=await client.from("commerce_audit_events").select("id",{count:"exact",head:true}).eq("organization_id",orgId).eq("action","INVENTORY_RESERVATION_EXPIRED").eq("entity_id",dueId);
    const outbox=await client.from("commerce_outbox_events").select("id",{count:"exact",head:true}).eq("organization_id",orgId).eq("event_type","INVENTORY_RESERVATION_EXPIRED").eq("aggregate_id",dueId);
    if(audit.error||outbox.error||(audit.count||0)!==1||(outbox.count||0)!==1)throw new Error("EXPIRY_RUNTIME_AUDIT_OUTBOX");
    console.log("PASS 11 expiry writes one audit and one outbox event");

    await applyCommerceInventoryReservationAction(context,futureId,"RELEASE",{quantity:"2",idempotencyKey:`expiry-future-release-${productId.slice(0,8)}`});
    await applyCommerceStockMovement(context,{sourceId,variantId,type:"ADJUSTMENT",physicalDelta:"-10",reservedDelta:"0",incomingDelta:"0",stockStatus:"SELLABLE",idempotencyKey:`expiry-neutralize-${productId.slice(0,8)}`});
    balance=(await listCommerceInventory(context,{variantId,sourceId,stockStatus:"SELLABLE"}))[0];
    if(Number(balance?.physicalQuantity)!==0||Number(balance?.reservedQuantity)!==0)throw new Error("EXPIRY_RUNTIME_NEUTRALIZE");
    console.log("PASS 12 QA inventory neutralized to zero");
  } finally {
    const sql=`begin;
      update public.commerce_inventory_reservations set archived_at=now() where organization_id='${orgId}' and variant_id='${variantId}' and archived_at is null;
      update public.commerce_product_variants set archived_at=now(),status='ARCHIVED' where organization_id='${orgId}' and id='${variantId}';
      update public.commerce_products set archived_at=now(),status='ARCHIVED' where organization_id='${orgId}' and id='${productId}';
      update public.commerce_inventory_sources set archived_at=now(),active=false where organization_id='${orgId}' and id='${sourceId}';
      update public.commerce_warehouses set archived_at=now(),active=false where organization_id='${orgId}' and id='${warehouseId}';
    commit;`;
    const cleanup=spawnSync("psql",["-w","-h","aws-0-eu-central-1.pooler.supabase.com","-p","5432","-U","postgres.pbgyuznivqvestuksvif","-d","postgres","-X","-v","ON_ERROR_STOP=1","-c",sql],{encoding:"utf8"});
    if(cleanup.status!==0)throw new Error(`EXPIRY_RUNTIME_FIXTURE_ARCHIVE_${cleanup.stderr}`);
    console.log("PASS 13 QA fixtures archived");
  }
  console.log("RESULT 13/13 PASS");
}
main().catch(error=>{console.error(error);process.exit(1);});
