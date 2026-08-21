import assert from "node:assert/strict";
import { getDimproIdentitySupabaseClient, getDimproSendContextByEntitlementId } from "../app/lib/identity-core/repository";
import { upsertFieldCaptureServerSession } from "../app/lib/field-capture/serverRepository";
import { claimFieldCaptureReportEmailDelivery, markFieldCaptureReportEmailDeliveryFailed, markFieldCaptureReportEmailDeliverySent } from "../app/lib/field-capture/reportEmailDelivery";
const entitlementId=process.env.TEREP_TEST_ENTITLEMENT_ID?.trim()||"1419cf53-f49a-4818-a0c2-b87c0850a2e4";
const marker=`f6-delivery-${Date.now()}`;
const db=getDimproIdentitySupabaseClient();
let sessionId="";
async function cleanup(){if(sessionId) await db.from("field_capture_sessions").delete().eq("id",sessionId); const remaining=sessionId?await db.from("field_capture_sessions").select("id",{head:true,count:"exact"}).eq("id",sessionId):{count:0,error:null}; console.log(`F6_DELIVERY_CLEANUP remaining=${remaining.count||0}`);}
async function main(){
 const context=await getDimproSendContextByEntitlementId(entitlementId);
 const session=await upsertFieldCaptureServerSession({clientSessionId:marker,userId:context.user.id,entitlementId,projectCoreId:null,defaults:{qa:"f6-delivery"}}); sessionId=session.id;
 const key=`terep-report-runtime-${marker}`.slice(0,120); const hash="a".repeat(64);
 const first=await claimFieldCaptureReportEmailDelivery({sessionId,actorUserId:context.user.id,idempotencyKey:key,payloadSha256:hash,recipientCount:1,attachmentName:"qa.pdf"}); assert.equal(first.state,"CLAIMED"); assert.equal(first.attemptCount,1); console.log("PASS 1 first delivery claim");
 let inflight=false; try{await claimFieldCaptureReportEmailDelivery({sessionId,actorUserId:context.user.id,idempotencyKey:key,payloadSha256:hash,recipientCount:1,attachmentName:"qa.pdf"});}catch(error){inflight=error instanceof Error&&"code" in error&&(error as {code?:string}).code==="FIELD_CAPTURE_REPORT_EMAIL_DELIVERY_IN_PROGRESS";} assert.ok(inflight); console.log("PASS 2 in-flight duplicate blocked");
 await markFieldCaptureReportEmailDeliveryFailed({deliveryId:first.deliveryId,errorCode:"QA_FAIL"});
 const retry=await claimFieldCaptureReportEmailDelivery({sessionId,actorUserId:context.user.id,idempotencyKey:key,payloadSha256:hash,recipientCount:1,attachmentName:"qa.pdf"}); assert.equal(retry.state,"CLAIMED"); assert.equal(retry.attemptCount,2); console.log("PASS 3 failed delivery retry claim");
 await markFieldCaptureReportEmailDeliverySent({deliveryId:retry.deliveryId,messageId:"qa-message-id"});
 const duplicate=await claimFieldCaptureReportEmailDelivery({sessionId,actorUserId:context.user.id,idempotencyKey:key,payloadSha256:hash,recipientCount:1,attachmentName:"qa.pdf"}); assert.equal(duplicate.state,"SENT"); assert.equal(duplicate.messageId,"qa-message-id"); console.log("PASS 4 sent duplicate becomes idempotent skip");
 let mismatch=false; try{await claimFieldCaptureReportEmailDelivery({sessionId,actorUserId:context.user.id,idempotencyKey:key,payloadSha256:"b".repeat(64),recipientCount:1,attachmentName:"qa.pdf"});}catch(error){mismatch=error instanceof Error&&"code" in error&&(error as {code?:string}).code==="FIELD_CAPTURE_REPORT_EMAIL_IDEMPOTENCY_PAYLOAD_MISMATCH";} assert.ok(mismatch); console.log("PASS 5 same key changed payload rejected");
 const rows=await db.from("field_capture_report_email_deliveries").select("status,attempt_count,idempotency_key_hash,payload_sha256,recipient_count,message_id,last_error_code").eq("session_id",sessionId); if(rows.error) throw rows.error; assert.equal(rows.data?.length,1); assert.equal(rows.data?.[0].status,"SENT"); assert.equal(rows.data?.[0].attempt_count,2); assert.equal(String(rows.data?.[0].idempotency_key_hash).length,64); console.log("PASS 6 ledger stores one hashed idempotent delivery");
 console.log("FIELD_CAPTURE_F6_EMAIL_DELIVERY_RUNTIME_E2E 6/6 PASS");
}
main().then(cleanup).catch(async e=>{console.error(e);await cleanup();process.exit(1)});
