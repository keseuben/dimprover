import { randomUUID } from "node:crypto";
import { createCommerceAdminClient } from "../app/lib/commerce/core/server-db";
import type { CommerceContext } from "../app/lib/commerce/core/types";
import { applyCommerceStockMovement, listCommerceInventory } from "../app/lib/commerce/inventory/repository";
import { createCommerceOrder, getCommerceOrder, listCommerceOrders, reserveCommerceOrderInventory, setCommerceOrderStatus } from "../app/lib/commerce/order/repository";

async function main(){
  const client=createCommerceAdminClient();
  const member=await client.from("dimpro_organization_memberships").select("organization_id,user_id").eq("status","active").limit(1).maybeSingle();
  if(member.error||!member.data)throw new Error("BRIDGE_RUNTIME_MEMBERSHIP_MISSING");
  const orgId=String(member.data.organization_id),userId=String(member.data.user_id),marker=randomUUID().slice(0,8);
  const warehouseId=randomUUID(),sourceId=randomUUID(),productId=randomUUID(),variantId=randomUUID();
  let orderId="",blockedOrderId="";
  const context:CommerceContext={userId,organizationId:orgId,organizationName:"Bridge runtime QA",roleCode:"ADMIN",permissions:["commerce.context.read","commerce.product.read","commerce.product.write","commerce.media.read","commerce.inventory.read","commerce.inventory.move","commerce.inventory.adjust","commerce.order.read","commerce.order.write","commerce.order.pay","commerce.order.issue"]};

  async function terminalizeOrder(id:string){
    if(!id)return;
    const order=await getCommerceOrder(context,id);
    if(order.status==="SENT_TO_CASHIER"){
      await setCommerceOrderStatus(context,id,{status:"CANCELLED",idempotencyKey:`obrt-cleanup-cancel-${id}`});
      return;
    }
    if(order.status==="PAID"){
      const mappedUnreserved=order.items.some(item=>item.variantId&&item.inventoryStatus!=="RESERVED");
      if(mappedUnreserved)await reserveCommerceOrderInventory(context,id,{sourceId,idempotencyKey:`obrt-cleanup-reserve-${id}`});
      await setCommerceOrderStatus(context,id,{status:"ISSUED",issuerName:"QA cleanup",idempotencyKey:`obrt-cleanup-issued-${id}`});
    }
  }

  try{
    const wh=await client.from("commerce_warehouses").insert({id:warehouseId,organization_id:orgId,code:`OBRT-${marker}`,name:"Order bridge runtime",active:true});if(wh.error)throw wh.error;
    const src=await client.from("commerce_inventory_sources").insert({id:sourceId,organization_id:orgId,warehouse_id:warehouseId,source_type:"INTERNAL",code:`OBRT-${marker}`,name:"Order bridge runtime",active:true});if(src.error)throw src.error;
    const product=await client.from("commerce_products").insert({id:productId,organization_id:orgId,name:"Bridge runtime product",slug:`bridge-runtime-${marker}`,status:"ACTIVE"});if(product.error)throw product.error;
    const variant=await client.from("commerce_product_variants").insert({id:variantId,organization_id:orgId,product_id:productId,name:"Bridge runtime variant",sku:`OBRT-${marker}`,unit:"DB",status:"ACTIVE"});if(variant.error)throw variant.error;
    console.log("PASS 01 bridge runtime fixture created");

    await applyCommerceStockMovement(context,{sourceId,variantId,type:"RECEIPT",physicalDelta:"10",reservedDelta:"0",incomingDelta:"0",stockStatus:"SELLABLE",idempotencyKey:`obrt-seed-${marker}`});
    console.log("PASS 02 physical stock 10 seeded through immutable ledger");

    const created=await createCommerceOrder(context,{orderNumber:`OBRT-1-${marker}`,sourceChannel:"EXTERNAL_MARKETPLACE",externalReference:`obrt-ext-${marker}`,status:"SENT_TO_CASHIER",customerName:"Bridge runtime vevő",customerType:"LOYAL_CUSTOMER",idempotencyKey:`obrt-create-1-${marker}`,items:[{productId,variantId,productName:"Mapped runtime",sku:`OBRT-${marker}`,unit:"DB",quantity:"4",priceNet:"1000",vatRateBasisPoints:2700},{productName:"Legacy runtime",sku:"LEGACY-X",unit:"DB",quantity:"1",priceNet:"500",vatRateBasisPoints:2700}]});
    orderId=String(created.orderId);const expiry=new Date(Date.now()+2*60*60*1000).toISOString();
    const reserved=await reserveCommerceOrderInventory(context,orderId,{sourceId,expiresAt:expiry,idempotencyKey:`obrt-reserve-1-${marker}`});
    if(Number(reserved.mappedItemCount)!==1||Number(reserved.reservedItemCount)!==1||Number(reserved.unresolvedItemCount)!==1)throw new Error("BRIDGE_RUNTIME_RESERVE_COUNTS");
    console.log("PASS 03 mixed mapped/unresolved order reserves mapped item only");

    const duplicate=await reserveCommerceOrderInventory(context,orderId,{sourceId,expiresAt:expiry,idempotencyKey:`obrt-reserve-1-${marker}`});if(duplicate.duplicate!==true)throw new Error("BRIDGE_RUNTIME_RESERVE_IDEMPOTENCY");
    console.log("PASS 04 reserve replay is idempotent");

    let balances=await listCommerceInventory(context,{variantId,sourceId,stockStatus:"SELLABLE"});if(Number(balances[0]?.physicalQuantity)!==10||Number(balances[0]?.reservedQuantity)!==4||Number(balances[0]?.availableQuantity)!==6)throw new Error("BRIDGE_RUNTIME_RESERVED_BALANCE");
    console.log("PASS 05 reserved balance is 10 physical / 4 reserved / 6 available");

    await setCommerceOrderStatus(context,orderId,{status:"PAID",paymentMethod:"CARD",cashierName:"Runtime pénztáros",idempotencyKey:`obrt-paid-1-${marker}`});
    balances=await listCommerceInventory(context,{variantId,sourceId,stockStatus:"SELLABLE"});if(Number(balances[0]?.reservedQuantity)!==4||Number(balances[0]?.physicalQuantity)!==10)throw new Error("BRIDGE_RUNTIME_PAID_BALANCE");
    console.log("PASS 06 PAID keeps reservation and physical stock unchanged");

    await setCommerceOrderStatus(context,orderId,{status:"ISSUED",issuerName:"Runtime kiadó",idempotencyKey:`obrt-issued-1-${marker}`});
    balances=await listCommerceInventory(context,{variantId,sourceId,stockStatus:"SELLABLE"});if(Number(balances[0]?.physicalQuantity)!==6||Number(balances[0]?.reservedQuantity)!==0||Number(balances[0]?.availableQuantity)!==6)throw new Error("BRIDGE_RUNTIME_ISSUED_BALANCE");
    console.log("PASS 07 ISSUED consumes reservation and physical stock");

    const detail=await getCommerceOrder(context,orderId);if(detail.items.find(item=>item.variantId===variantId)?.inventoryStatus!=="CONSUMED"||detail.items.find(item=>!item.variantId)?.inventoryStatus!=="UNRESOLVED")throw new Error("BRIDGE_RUNTIME_ITEM_STATUS");
    console.log("PASS 08 mapped item is CONSUMED while legacy item remains UNRESOLVED");

    const blockedCreated=await createCommerceOrder(context,{orderNumber:`OBRT-2-${marker}`,sourceChannel:"INTERNAL_COUNTER",status:"SENT_TO_CASHIER",customerName:"Blocked runtime",customerType:"WALK_IN",idempotencyKey:`obrt-create-2-${marker}`,items:[{productId,variantId,productName:"Not reserved",unit:"DB",quantity:"1",priceNet:"1000",vatRateBasisPoints:2700}]});blockedOrderId=String(blockedCreated.orderId);
    await setCommerceOrderStatus(context,blockedOrderId,{status:"PAID",paymentMethod:"CASH",cashierName:"Runtime",idempotencyKey:`obrt-paid-2-${marker}`});
    let blocked=false;try{await setCommerceOrderStatus(context,blockedOrderId,{status:"ISSUED",issuerName:"Runtime",idempotencyKey:`obrt-issued-2-${marker}`});}catch(error){blocked=error instanceof Error&&"code" in error&&(error as {code?:string}).code==="COMMERCE_ORDER_RESERVATION_REQUIRED";}if(!blocked)throw new Error("BRIDGE_RUNTIME_UNRESERVED_ISSUE_NOT_BLOCKED");
    console.log("PASS 09 mapped PAID order cannot be issued without reservation");

    const invEvents=await client.from("commerce_order_inventory_events").select("id").eq("organization_id",orgId).eq("order_id",orderId);if(invEvents.error||invEvents.data?.length!==1)throw new Error("BRIDGE_RUNTIME_INVENTORY_EVENTS");
    console.log("PASS 10 order inventory event ledger records reservation");
  }finally{
    await terminalizeOrder(blockedOrderId);
    await terminalizeOrder(orderId);
    const balances=await listCommerceInventory(context,{variantId,sourceId,stockStatus:"SELLABLE"}).catch(()=>[]);
    const physical=Number(balances[0]?.physicalQuantity||0),reserved=Number(balances[0]?.reservedQuantity||0);
    if(reserved!==0)throw new Error(`BRIDGE_RUNTIME_CLEANUP_RESERVED_${reserved}`);
    if(physical>0)await applyCommerceStockMovement(context,{sourceId,variantId,type:"ADJUSTMENT",physicalDelta:String(-physical),reservedDelta:"0",incomingDelta:"0",stockStatus:"SELLABLE",idempotencyKey:`obrt-cleanup-zero-${marker}`});
    const finalBalance=await listCommerceInventory(context,{variantId,sourceId,stockStatus:"SELLABLE"}).catch(()=>[]);
    if(Number(finalBalance[0]?.physicalQuantity||0)!==0||Number(finalBalance[0]?.reservedQuantity||0)!==0)throw new Error("BRIDGE_RUNTIME_CLEANUP_BALANCE_DIRTY");
    const now=new Date().toISOString();
    const archived=await Promise.all([client.from("commerce_product_variants").update({status:"ARCHIVED",archived_at:now}).eq("organization_id",orgId).eq("id",variantId),client.from("commerce_products").update({status:"ARCHIVED",archived_at:now}).eq("organization_id",orgId).eq("id",productId),client.from("commerce_inventory_sources").update({active:false,archived_at:now}).eq("organization_id",orgId).eq("id",sourceId),client.from("commerce_warehouses").update({active:false,archived_at:now}).eq("organization_id",orgId).eq("id",warehouseId)]);
    if(archived.some(result=>result.error))throw new Error("BRIDGE_RUNTIME_CLEANUP_ARCHIVE_FAILED");
    const queue=await listCommerceOrders(context,{cashierQueue:true,limit:200});if(queue.some(order=>order.id===orderId||order.id===blockedOrderId))throw new Error("BRIDGE_RUNTIME_CLEANUP_QUEUE_DIRTY");
    console.log("PASS 11 QA orders moved to terminal state");
    console.log("PASS 12 QA inventory neutralized to zero");
    console.log("PASS 13 QA product/source/warehouse archived");
    console.log("PASS 14 QA fixtures absent from active cashier queue");
  }
  console.log("RESULT 14/14 PASS");
}
void main().catch(error=>{console.error(error);process.exit(1);});
