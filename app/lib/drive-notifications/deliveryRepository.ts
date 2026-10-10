import "server-only";
import { randomUUID } from "node:crypto";
import { getDatabaseClient } from "@/app/lib/drive-core/databaseRepository";
import type { DigestCategory } from "./digestCore";
import type { DigestFrequency } from "./scheduling";

export type DeliveryTicket = {
  id: string; projectId: string; userId: string;
  category: DigestCategory; eventIds: string[]; digestFrequency: DigestFrequency;
  cursorFrom: number; cursorTo: number; attemptCount: number;
};
type RpcResult<T> = { data: T | null; error: { code?:string } | null };

function assertReady<T>(result: RpcResult<T>, operation: string): T | null {
  if (result.error) throw new Error("DRIVE_DIGEST_" + operation + "_DATABASE_UNAVAILABLE");
  return result.data;
}

export async function reserveDigestSlot(input: {
  projectId: string; userId: string; category: DigestCategory;
  scheduledSlot: string; eventIds: string[]; cursorFrom: number; cursorTo: number; digestFrequency: DigestFrequency;
}): Promise<{ queued: boolean; id: string | null }> {
  if(!input.eventIds.length || input.eventIds.length>250
     || input.eventIds.some((id)=>!id||id.length>160)
     || !Number.isSafeInteger(input.cursorFrom) || !Number.isSafeInteger(input.cursorTo)
     || input.cursorTo<input.cursorFrom || input.scheduledSlot.length>90) {
    throw new Error("DRIVE_DIGEST_INVALID_RESERVATION");
  }
  const {data,error}=await getDatabaseClient().from("drive_core_digest_deliveries")
    .insert({
      project_id:input.projectId,user_id:input.userId,category:input.category,
      scheduled_slot:input.scheduledSlot,status:"PENDING",event_ids:input.eventIds,
      digest_frequency:input.digestFrequency,
      cursor_from:input.cursorFrom,cursor_to:input.cursorTo,
    }).select("id").single();
  if(error?.code==="23505")return {queued:false,id:null}; // preserve SENT / existing slot
  if(error)throw new Error("DRIVE_DIGEST_QUEUE_UNAVAILABLE");
  return {queued:true,id:data?.id||null};
}

export async function claimDigestSlot(deliveryId:string):Promise<{token:string;ticket:DeliveryTicket}|null>{
  const token=randomUUID();
  const result=await getDatabaseClient().rpc("drive_digest_claim_delivery",{
    p_delivery_id:deliveryId,p_worker_token:token,
  });
  const ticket=assertReady(result,"CLAIM") as DeliveryTicket|null;
  return ticket?{token,ticket}:null;
}

export async function confirmSmtpAcceptance(
  deliveryId:string,workerToken:string,messageId:string,emailHash:string,
):Promise<boolean>{
  const result=await getDatabaseClient().rpc("drive_digest_ack_smtp_acceptance",{
    p_delivery_id:deliveryId,p_worker_token:workerToken,
    p_message_id:messageId,p_recipient_email_sha256:emailHash,
  });
  return Boolean(assertReady(result,"ACCEPTANCE"));
}

export async function finishWithoutAcceptance(
  deliveryId:string,workerToken:string,
  outcome:"FAILED"|"AMBIGUOUS"|"SUPPRESSED",errorCode:string,
):Promise<boolean>{
  const result=await getDatabaseClient().rpc("drive_digest_finish_without_acceptance",{
    p_delivery_id:deliveryId,p_worker_token:workerToken,
    p_outcome:outcome,p_error_code:errorCode,
  });
  return Boolean(assertReady(result,"FINISH"));
}
