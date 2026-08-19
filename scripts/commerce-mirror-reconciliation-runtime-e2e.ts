import { randomUUID } from "node:crypto";
import { createCommerceAdminClient } from "../app/lib/commerce/core/server-db";
import type { CommerceContext } from "../app/lib/commerce/core/types";
import { getCommerceMirrorAttempt, listCommerceMirrorAttempts, recordCommerceMirrorAttempt } from "../app/lib/commerce/order/mirrorReconciliation";
import { createCommerceOrder, setCommerceOrderStatus } from "../app/lib/commerce/order/repository";
import type { AruterOrder } from "../app/lib/aruter/types";

async function main() {
  const client = createCommerceAdminClient();
  const member = await client.from("dimpro_organization_memberships").select("organization_id,user_id").eq("status","active").limit(1).maybeSingle();
  if (member.error || !member.data) throw new Error("MIRROR_RUNTIME_MEMBERSHIP_MISSING");
  const organizationId=String(member.data.organization_id), userId=String(member.data.user_id), marker=randomUUID().slice(0,8);
  const context:CommerceContext={userId,organizationId,organizationName:"Mirror runtime QA",roleCode:"ADMIN",permissions:["commerce.context.read","commerce.product.read","commerce.product.write","commerce.media.read","commerce.inventory.read","commerce.inventory.move","commerce.inventory.adjust","commerce.order.read","commerce.order.write","commerce.order.pay","commerce.order.issue","commerce.order.reconcile"]};
  const legacyOrder:AruterOrder={id:`mirror-e2e-${marker}`,orderNumber:`MIR-${marker}`,template:"egyedi",status:"sent_to_cashier",customerName:"Mirror QA",customerType:"walk_in",recorderName:"OutminAI QA",items:[{id:`item-${marker}`,productId:`legacy-${marker}`,productName:"Mirror legacy item",sku:`MIR-${marker}`,unit:"db",quantity:2,priceNet:1200,vatRate:27,storageZone:"QA"}],createdAt:new Date().toISOString(),sentToCashierAt:new Date().toISOString()};
  let commerceOrderId="", attemptId="";
  try {
    const pending=await recordCommerceMirrorAttempt(context,legacyOrder,{state:"PENDING",unresolvedItemCount:1});
    attemptId=String(pending.attemptId||""); if(!attemptId||Number(pending.attemptCount)!==1||pending.state!=="PENDING")throw new Error("MIRROR_RUNTIME_PENDING");
    console.log("PASS 01 PENDING mirror attempt is persisted with attempt count 1");

    const failed=await recordCommerceMirrorAttempt(context,legacyOrder,{state:"FAILED",unresolvedItemCount:1,errorCode:"QA_EXPECTED_FAILURE",errorMessage:"QA expected failure"});
    if(failed.state!=="FAILED"||Number(failed.attemptCount)!==1||!failed.nextRetryAt)throw new Error("MIRROR_RUNTIME_FAILED");
    console.log("PASS 02 FAILED state keeps attempt count and schedules retry");

    const failedList=await listCommerceMirrorAttempts(context,{state:"FAILED",limit:20});
    if(!failedList.some(item=>item.id===attemptId&&item.legacyOrderId===legacyOrder.id))throw new Error("MIRROR_RUNTIME_FAILED_LIST");
    console.log("PASS 03 FAILED attempt appears in tenant-scoped reconciliation list");

    const secondPending=await recordCommerceMirrorAttempt(context,legacyOrder,{state:"PENDING",unresolvedItemCount:1});
    if(Number(secondPending.attemptCount)!==2||secondPending.state!=="PENDING")throw new Error("MIRROR_RUNTIME_RETRY_COUNT");
    console.log("PASS 04 retry PENDING increments attempt count to 2");

    const created=await createCommerceOrder(context,{orderNumber:legacyOrder.orderNumber,sourceChannel:"EXTERNAL_MARKETPLACE",externalReference:`legacy-aruter:${legacyOrder.id}`,status:"SENT_TO_CASHIER",customerName:legacyOrder.customerName,customerType:"WALK_IN",recorderName:legacyOrder.recorderName,idempotencyKey:`legacy-aruter-create:${legacyOrder.id}`,items:[{productName:"Mirror legacy item",sku:`MIR-${marker}`,unit:"DB",quantity:"2",priceNet:"1200",vatRateBasisPoints:2700,storageZone:"QA"}]});
    commerceOrderId=String(created.orderId||"");if(!commerceOrderId)throw new Error("MIRROR_RUNTIME_ORDER_CREATE");
    console.log("PASS 05 Commerce order is created with stable legacy idempotency key");

    const succeeded=await recordCommerceMirrorAttempt(context,legacyOrder,{state:"SUCCEEDED",commerceOrderId,mappedItemCount:0,unresolvedItemCount:1});
    if(succeeded.state!=="SUCCEEDED"||String(succeeded.commerceOrderId)!==commerceOrderId||Number(succeeded.attemptCount)!==2)throw new Error("MIRROR_RUNTIME_SUCCEEDED");
    console.log("PASS 06 SUCCEEDED state links the Commerce order and keeps retry count 2");

    const detail=await getCommerceMirrorAttempt(context,attemptId);
    if(detail.state!=="SUCCEEDED"||detail.lastErrorCode!==null||detail.nextRetryAt!==null||detail.commerceOrderId!==commerceOrderId)throw new Error("MIRROR_RUNTIME_DETAIL");
    console.log("PASS 07 successful reconciliation clears failure/backoff fields");

    const successList=await listCommerceMirrorAttempts(context,{state:"SUCCEEDED",limit:20});
    if(!successList.some(item=>item.id===attemptId))throw new Error("MIRROR_RUNTIME_SUCCESS_LIST");
    console.log("PASS 08 SUCCEEDED attempt appears in reconciliation list");

    const otherContext:CommerceContext={...context,organizationId:randomUUID(),organizationName:"Other tenant"};
    const crossTenant=await listCommerceMirrorAttempts(otherContext,{limit:20});
    if(crossTenant.some(item=>item.id===attemptId))throw new Error("MIRROR_RUNTIME_CROSS_TENANT");
    console.log("PASS 09 repository organization filter prevents cross-tenant result leakage");

    const audit=await client.from("commerce_audit_events").select("action").eq("organization_id",organizationId).eq("entity_type","ORDER_MIRROR").contains("metadata",{legacyOrderId:legacyOrder.id});
    if(audit.error||!audit.data?.some(row=>row.action==="LEGACY_ORDER_MIRROR_FAILED")||!audit.data?.some(row=>row.action==="LEGACY_ORDER_MIRROR_SUCCEEDED"))throw new Error("MIRROR_RUNTIME_AUDIT");
    console.log("PASS 10 FAILED and SUCCEEDED mirror events are audited");

    const outbox=await client.from("commerce_outbox_events").select("event_type,idempotency_key").eq("organization_id",organizationId).eq("aggregate_type","ORDER_MIRROR").eq("aggregate_id",attemptId);
    if(outbox.error||!outbox.data?.some(row=>row.event_type==="LEGACY_ORDER_MIRROR_FAILED")||!outbox.data?.some(row=>row.event_type==="LEGACY_ORDER_MIRROR_SUCCEEDED"))throw new Error("MIRROR_RUNTIME_OUTBOX");
    console.log("PASS 11 FAILED and SUCCEEDED mirror events are written to transactional outbox");

    const verify=await client.rpc("commerce_order_mirror_record",{p_organization_id:organizationId,p_actor_user_id:userId,p_legacy_order_id:legacyOrder.id,p_order_number:legacyOrder.orderNumber,p_legacy_status:legacyOrder.status,p_legacy_order_payload:legacyOrder,p_state:"SUCCEEDED",p_commerce_order_id:commerceOrderId,p_mapped_item_count:0,p_unresolved_item_count:1,p_error_code:null,p_error_message:null});
    if(verify.error||Number((verify.data as Record<string,unknown>).attemptCount)!==2)throw new Error("MIRROR_RUNTIME_FINAL_REPLAY");
    console.log("PASS 12 final state replay is idempotent for attempt count");
  } finally {
    if(commerceOrderId){try{await setCommerceOrderStatus(context,commerceOrderId,{status:"CANCELLED",idempotencyKey:`mirror-e2e-cleanup:${commerceOrderId}`});}catch{} }
    if(attemptId){const archived=await client.from("commerce_order_mirror_attempts").update({archived_at:new Date().toISOString()}).eq("organization_id",organizationId).eq("id",attemptId);if(archived.error)throw archived.error;}
  }
  const active=await listCommerceMirrorAttempts(context,{limit:200});if(active.some(item=>item.id===attemptId))throw new Error("MIRROR_RUNTIME_CLEANUP_ACTIVE");
  console.log("PASS 13 QA mirror attempt archived after runtime test");
  console.log("RESULT 13/13 PASS");
}
void main().catch(error=>{console.error(error);process.exit(1);});
