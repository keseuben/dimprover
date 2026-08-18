import { randomUUID } from "node:crypto";
import { createCommerceAdminClient } from "../app/lib/commerce/core/server-db";
import type { CommerceContext } from "../app/lib/commerce/core/types";
import { createCommerceOrder, getCommerceOrder, listCommerceOrders, setCommerceOrderStatus } from "../app/lib/commerce/order/repository";

async function main(){
  const client=createCommerceAdminClient();
  const membership=await client.from("dimpro_organization_memberships").select("organization_id,user_id").eq("status","active").limit(1).maybeSingle();
  if(membership.error||!membership.data)throw new Error("ORDER_RUNTIME_MEMBERSHIP_MISSING");
  const orgId=String(membership.data.organization_id),userId=String(membership.data.user_id),marker=randomUUID().slice(0,8);
  let orderId="";
  const context:CommerceContext={userId,organizationId:orgId,organizationName:"Order runtime QA",roleCode:"ADMIN",permissions:["commerce.context.read","commerce.product.read","commerce.media.read","commerce.inventory.read","commerce.order.read","commerce.order.write","commerce.order.pay","commerce.order.issue"]};
  const payload={orderNumber:`ORDER-RT-${marker}`,sourceChannel:"EXTERNAL_MARKETPLACE",externalReference:`legacy-aruter:runtime-${marker}`,status:"SENT_TO_CASHIER",customerName:"Runtime külső vevő",customerType:"LOYAL_CUSTOMER",recorderName:"Külső Árutér",note:"Runtime cashier bridge",idempotencyKey:`order-runtime-create-${marker}`,items:[{productName:"Legacy alma",sku:"LEG-ALMA",unit:"KG",quantity:"2.5",priceNetMinor:"590",vatRateBasisPoints:2700,storageZone:"A-01"},{productName:"Legacy láda",sku:"LEG-LADA",unit:"LADA",quantity:"1",priceNetMinor:"2500",vatRateBasisPoints:2700,storageZone:"B-02"}]};
  try{
    const created=await createCommerceOrder(context,payload);orderId=String(created.orderId||"");
    if(!orderId||String(created.status)!=="SENT_TO_CASHIER"||Number(created.itemCount)!==2)throw new Error("ORDER_RUNTIME_CREATE");
    console.log("PASS 01 external marketplace order created as SENT_TO_CASHIER");
    const duplicate=await createCommerceOrder(context,payload);
    if(duplicate.duplicate!==true||String(duplicate.orderId)!==orderId)throw new Error("ORDER_RUNTIME_CREATE_IDEMPOTENCY");
    console.log("PASS 02 exact create replay is idempotent");
    let mismatchRejected=false;
    try{await createCommerceOrder(context,{...payload,items:[{...payload.items[0],quantity:"99"}]});}catch(error){mismatchRejected=error instanceof Error&&"code" in error&&(error as {code?:string}).code==="COMMERCE_ORDER_IDEMPOTENCY_PAYLOAD_MISMATCH";}
    if(!mismatchRejected)throw new Error("ORDER_RUNTIME_PAYLOAD_MISMATCH_NOT_REJECTED");
    console.log("PASS 03 changed payload with same key is rejected");
    const queue=await listCommerceOrders(context,{cashierQueue:true,limit:100});
    if(!queue.some(order=>order.id===orderId&&order.status==="SENT_TO_CASHIER"))throw new Error("ORDER_RUNTIME_CASHIER_QUEUE");
    console.log("PASS 04 central cashier queue sees external marketplace order");
    const detail=await getCommerceOrder(context,orderId);
    if(detail.items.length!==2||detail.items.some(item=>item.inventoryStatus!=="UNRESOLVED"))throw new Error("ORDER_RUNTIME_DETAIL");
    console.log("PASS 05 legacy cart item snapshots remain visible without Commerce mapping");
    const paidKey=`order-runtime-paid-${marker}`;
    const paid=await setCommerceOrderStatus(context,orderId,{status:"PAID",paymentMethod:"CARD",cashierName:"Runtime Pénztáros",idempotencyKey:paidKey});
    if(String(paid.status)!=="PAID")throw new Error("ORDER_RUNTIME_PAID");
    console.log("PASS 06 cashier marks order PAID");
    const paidDuplicate=await setCommerceOrderStatus(context,orderId,{status:"PAID",paymentMethod:"CARD",cashierName:"Runtime Pénztáros",idempotencyKey:paidKey});
    if(paidDuplicate.duplicate!==true)throw new Error("ORDER_RUNTIME_PAID_IDEMPOTENCY");
    console.log("PASS 07 PAID transition is idempotent");
    const paidQueue=await listCommerceOrders(context,{cashierQueue:true,limit:100});
    if(!paidQueue.some(order=>order.id===orderId&&order.status==="PAID"))throw new Error("ORDER_RUNTIME_PAID_QUEUE");
    console.log("PASS 08 paid order stays visible in central cashier queue");
    const issued=await setCommerceOrderStatus(context,orderId,{status:"ISSUED",issuerName:"Runtime Kiadó",idempotencyKey:`order-runtime-issued-${marker}`});
    if(String(issued.status)!=="ISSUED")throw new Error("ORDER_RUNTIME_ISSUED");
    console.log("PASS 09 warehouse marks order ISSUED");
    const finalDetail=await getCommerceOrder(context,orderId);
    if(finalDetail.status!=="ISSUED"||finalDetail.paymentMethod!=="CARD"||finalDetail.cashierName!=="Runtime Pénztáros"||finalDetail.issuerName!=="Runtime Kiadó"||!finalDetail.paidAt||!finalDetail.issuedAt)throw new Error("ORDER_RUNTIME_FINAL_DETAIL");
    console.log("PASS 10 payment/cashier/issuer timestamps persist");
    const finalQueue=await listCommerceOrders(context,{cashierQueue:true,limit:100});
    if(finalQueue.some(order=>order.id===orderId))throw new Error("ORDER_RUNTIME_ISSUED_STILL_IN_QUEUE");
    console.log("PASS 11 issued order leaves active cashier queue");
    const events=await client.from("commerce_order_status_events").select("to_status").eq("organization_id",orgId).eq("order_id",orderId).order("occurred_at",{ascending:true});
    if(events.error||events.data?.length!==3||events.data.map(row=>row.to_status).join(",")!=="SENT_TO_CASHIER,PAID,ISSUED")throw new Error("ORDER_RUNTIME_EVENTS");
    console.log("PASS 12 append-only status ledger records sent/paid/issued");
    const [audit,outbox]=await Promise.all([client.from("commerce_audit_events").select("id").eq("organization_id",orgId).eq("entity_type","ORDER").eq("entity_id",orderId),client.from("commerce_outbox_events").select("id").eq("organization_id",orgId).eq("aggregate_type","ORDER").eq("aggregate_id",orderId)]);
    if(audit.error||outbox.error||audit.data?.length!==3||outbox.data?.length!==3)throw new Error("ORDER_RUNTIME_AUDIT_OUTBOX");
    console.log("PASS 13 create + status changes emit audit/outbox events");
  }finally{
    if(orderId){await client.from("commerce_audit_events").delete().eq("organization_id",orgId).eq("entity_type","ORDER").eq("entity_id",orderId);await client.from("commerce_outbox_events").delete().eq("organization_id",orgId).eq("aggregate_type","ORDER").eq("aggregate_id",orderId);await client.from("commerce_orders").delete().eq("organization_id",orgId).eq("id",orderId);}
    console.log("PASS 14 order runtime fixture cleanup");
  }
  console.log("RESULT 14/14 PASS");
}
void main().catch(error=>{console.error(error);process.exit(1);});
