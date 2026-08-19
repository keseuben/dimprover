import { randomUUID } from "node:crypto";
import type { AruterOrder } from "../app/lib/aruter/types";
import { mirrorAruterOrderWithCommerceContext } from "../app/lib/aruter/commerceMirror";
import { createCommerceAdminClient } from "../app/lib/commerce/core/server-db";
import type { CommerceContext } from "../app/lib/commerce/core/types";
import { getCommerceMirrorAttempt, listCommerceMirrorAttempts } from "../app/lib/commerce/order/mirrorReconciliation";
import { getCommerceOrder, listCommerceOrders } from "../app/lib/commerce/order/repository";

async function main() {
  delete process.env.ARUTER_COMMERCE_FULFILLMENT_SOURCE_ID;
  const client=createCommerceAdminClient();
  const member=await client.from("dimpro_organization_memberships").select("organization_id,user_id").eq("status","active").limit(1).maybeSingle();
  if(member.error||!member.data)throw new Error("LEGACY_MIRROR_RUNTIME_MEMBERSHIP_MISSING");
  const organizationId=String(member.data.organization_id),userId=String(member.data.user_id),marker=randomUUID().slice(0,8);
  const context:CommerceContext={userId,organizationId,organizationName:"Legacy mirror runtime QA",roleCode:"ADMIN",permissions:["commerce.context.read","commerce.product.read","commerce.product.write","commerce.media.read","commerce.inventory.read","commerce.inventory.move","commerce.inventory.adjust","commerce.order.read","commerce.order.write","commerce.order.pay","commerce.order.issue","commerce.order.reconcile"]};
  const order:AruterOrder={id:`legacy-mirror-${marker}`,orderNumber:`LMR-${marker}`,template:"egyedi",status:"sent_to_cashier",customerName:"Legacy Mirror QA",customerType:"walk_in",recorderName:"OutminAI QA",items:[{id:`item-${marker}`,productId:`legacy-product-${marker}`,productName:"Nem azonosított legacy tétel",sku:`UNMAPPED-${marker}`,unit:"db",quantity:2,priceNet:1800,vatRate:27,storageZone:"QA"}],createdAt:new Date().toISOString(),sentToCashierAt:new Date().toISOString()};
  let commerceOrderId="",attemptId="";
  try {
    const sent=await mirrorAruterOrderWithCommerceContext(context,order);
    if(!sent.mirrored||sent.unresolvedItemCount!==1||sent.mappedItemCount!==0)throw new Error("LEGACY_MIRROR_RUNTIME_SENT");
    commerceOrderId=sent.commerceOrderId;
    console.log("PASS 01 sent_to_cashier legacy order mirrors with unresolved item visible");

    let detail=await getCommerceOrder(context,commerceOrderId);
    if(detail.status!=="SENT_TO_CASHIER"||detail.items.length!==1||detail.items[0]?.inventoryStatus!=="UNRESOLVED")throw new Error("LEGACY_MIRROR_RUNTIME_SENT_DETAIL");
    console.log("PASS 02 Commerce cashier order is SENT_TO_CASHIER and item stays UNRESOLVED");

    order.status="paid";order.paymentMethod="card";order.cashierName="QA pénztáros";order.paidAt=new Date().toISOString();
    const paid=await mirrorAruterOrderWithCommerceContext(context,order);
    if(!paid.mirrored||paid.commerceOrderId!==commerceOrderId)throw new Error("LEGACY_MIRROR_RUNTIME_PAID_ID");
    detail=await getCommerceOrder(context,commerceOrderId);
    if(detail.status!=="PAID"||detail.paymentMethod!=="CARD")throw new Error("LEGACY_MIRROR_RUNTIME_PAID");
    console.log("PASS 03 paid legacy update reuses same Commerce order and records CARD payment");

    order.status="issued";order.issuerName="QA kiadó";order.issuedAt=new Date().toISOString();
    const issued=await mirrorAruterOrderWithCommerceContext(context,order);
    if(!issued.mirrored||issued.commerceOrderId!==commerceOrderId)throw new Error("LEGACY_MIRROR_RUNTIME_ISSUED_ID");
    detail=await getCommerceOrder(context,commerceOrderId);
    if(detail.status!=="ISSUED"||detail.issuerName!=="QA kiadó"||detail.items[0]?.inventoryStatus!=="UNRESOLVED")throw new Error("LEGACY_MIRROR_RUNTIME_ISSUED");
    console.log("PASS 04 issued legacy update reuses same Commerce order without blocking unresolved item");

    const duplicateCount=await client.from("commerce_orders").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("external_reference",`legacy-aruter:${order.id}`).is("archived_at",null);
    if(duplicateCount.error||duplicateCount.count!==1)throw new Error(`LEGACY_MIRROR_RUNTIME_DUPLICATE_${duplicateCount.count}`);
    console.log("PASS 05 three mirror lifecycle calls create exactly one active Commerce order");

    const attempts=await listCommerceMirrorAttempts(context,{limit:200});
    const attempt=attempts.find(item=>item.legacyOrderId===order.id);if(!attempt)throw new Error("LEGACY_MIRROR_RUNTIME_ATTEMPT_MISSING");attemptId=attempt.id;
    if(attempt.state!=="SUCCEEDED"||attempt.commerceOrderId!==commerceOrderId||attempt.attemptCount!==3)throw new Error("LEGACY_MIRROR_RUNTIME_ATTEMPT_STATE");
    console.log("PASS 06 reconciliation state is SUCCEEDED with attempt count 3");

    const stored=await getCommerceMirrorAttempt(context,attemptId);
    if(stored.legacyStatus!=="issued"||stored.legacyOrderPayload.status!=="issued"||stored.unresolvedItemCount!==1)throw new Error("LEGACY_MIRROR_RUNTIME_SNAPSHOT");
    console.log("PASS 07 reconciliation keeps latest issued legacy snapshot and unresolved count");

    const events=await client.from("commerce_order_status_events").select("to_status").eq("organization_id",organizationId).eq("order_id",commerceOrderId);
    if(events.error||!events.data?.some(row=>row.to_status==="PAID")||!events.data?.some(row=>row.to_status==="ISSUED"))throw new Error("LEGACY_MIRROR_RUNTIME_EVENTS");
    console.log("PASS 08 PAID and ISSUED status events are persisted");

    const audit=await client.from("commerce_audit_events").select("action").eq("organization_id",organizationId).eq("entity_type","ORDER_MIRROR").contains("metadata",{legacyOrderId:order.id});
    if(audit.error||audit.data?.filter(row=>row.action==="LEGACY_ORDER_MIRROR_SUCCEEDED").length<3)throw new Error("LEGACY_MIRROR_RUNTIME_AUDIT");
    console.log("PASS 09 every successful lifecycle mirror is audited");

    const outbox=await client.from("commerce_outbox_events").select("event_type").eq("organization_id",organizationId).eq("aggregate_type","ORDER_MIRROR").eq("aggregate_id",attemptId);
    if(outbox.error||outbox.data?.filter(row=>row.event_type==="LEGACY_ORDER_MIRROR_SUCCEEDED").length<3)throw new Error("LEGACY_MIRROR_RUNTIME_OUTBOX");
    console.log("PASS 10 lifecycle mirror success is represented in transactional outbox");

    const queue=await listCommerceOrders(context,{cashierQueue:true,limit:200});
    if(queue.some(item=>item.id===commerceOrderId))throw new Error("LEGACY_MIRROR_RUNTIME_TERMINAL_QUEUE");
    console.log("PASS 11 ISSUED mirror order leaves the active cashier queue");

    const invalidContext:CommerceContext={...context,organizationId:randomUUID(),organizationName:"Invalid mirror tenant"};
    const failed=await mirrorAruterOrderWithCommerceContext(invalidContext,{...order,id:`fail-${order.id}`,orderNumber:`FAIL-${order.orderNumber}`});
    if(failed.mirrored||!("reason" in failed)||failed.reason!=="FAILED"||failed.healthPersisted!==false)throw new Error("LEGACY_MIRROR_RUNTIME_FAIL_OPEN");
    console.log("PASS 12 Commerce failure returns structured fail-open result without throwing");
  } finally {
    const now=new Date().toISOString();
    if(attemptId){const a=await client.from("commerce_order_mirror_attempts").update({archived_at:now}).eq("organization_id",organizationId).eq("id",attemptId);if(a.error)throw a.error;}
    if(commerceOrderId){const o=await client.from("commerce_orders").update({archived_at:now}).eq("organization_id",organizationId).eq("id",commerceOrderId);if(o.error)throw o.error;}
  }
  const activeAttempts=await listCommerceMirrorAttempts(context,{limit:200});if(activeAttempts.some(item=>item.id===attemptId))throw new Error("LEGACY_MIRROR_RUNTIME_CLEANUP_ATTEMPT");
  console.log("PASS 13 QA reconciliation attempt archived after test");
  const activeOrders=await client.from("commerce_orders").select("id").eq("organization_id",organizationId).eq("id",commerceOrderId).is("archived_at",null);if(activeOrders.error||activeOrders.data?.length)throw new Error("LEGACY_MIRROR_RUNTIME_CLEANUP_ORDER");
  console.log("PASS 14 QA Commerce order archived after test");
  console.log("RESULT 14/14 PASS");
}
void main().catch(error=>{console.error(error);process.exit(1);});
