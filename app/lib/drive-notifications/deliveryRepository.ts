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

// Creating a delivery must go through the guarded drive_digest_register_journal_page
// DB transaction (cursor CAS, consent check and dedupe). No direct INSERT API here.

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
