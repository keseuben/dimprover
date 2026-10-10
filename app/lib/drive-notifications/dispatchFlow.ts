import type { DeliveryTicket } from "./deliveryRepository";
import type { VerifiedDigestMessage, VerifiedDigestPlan } from "./liveDelivery";

type ClaimedDelivery = { token: string; ticket: DeliveryTicket };
type SendAcceptance = { messageId: string };
type FinishOutcome = "FAILED" | "AMBIGUOUS" | "SUPPRESSED";
export type DigestDispatchResult =
  | {status:"NOT_CLAIMED"}
  | {status:"SUPPRESSED";reason:string}
  | {status:"FAILED_BEFORE_SMTP";reason:string}
  | {status:"SMTP_AMBIGUOUS";reason:string}
  | {status:"SMTP_ACCEPTED";messageId:string};

type Dependencies = {
  claim: (deliveryId:string)=>Promise<ClaimedDelivery|null>;
  prepare: (ticket:DeliveryTicket)=>Promise<VerifiedDigestPlan>;
  send: (message:VerifiedDigestMessage)=>Promise<SendAcceptance>;
  confirm: (id:string,token:string,messageId:string,emailHash:string)=>Promise<boolean>;
  finish: (id:string,token:string,outcome:FinishOutcome,reason:string)=>Promise<boolean>;
};

/**
 * Explicit worker primitive, NOT wired to a timer, HTTP route, or production runtime.
 * SMTP-ambiguous and post-SMTP-ack errors never enter the auto-retryable FAILED state.
 * Individual recipient per message; no BCC or cross-role address lists.
 */
export async function dispatchClaimedDigest(deliveryId:string,deps:Dependencies):Promise<DigestDispatchResult>{
  const claim=await deps.claim(deliveryId);
  if(!claim)return {status:"NOT_CLAIMED"};
  const {token,ticket}=claim;

  let verified:VerifiedDigestPlan;
  try {
    verified=await deps.prepare(ticket);
  }catch{
    await deps.finish(deliveryId,token,"FAILED","PRESEND_VERIFICATION_FAILED");
    return {status:"FAILED_BEFORE_SMTP",reason:"PRESEND_VERIFICATION_FAILED"};
  }
  if(verified.status==="SUPPRESSED"){
    await deps.finish(deliveryId,token,"SUPPRESSED",verified.reason);
    return {status:"SUPPRESSED",reason:verified.reason};
  }

  // From this point onward, every exception is potentially post-SMTP and AMBIGUOUS.
  // Deliberately do not automatically retry, even when a transporter throws.
  let acknowledgement:SendAcceptance;
  try {
    acknowledgement=await deps.send(verified.message);
    if(!acknowledgement.messageId || acknowledgement.messageId.length<3){
      throw new Error("SMTP_MESSAGE_ID_MISSING");
    }
  }catch{
    await deps.finish(deliveryId,token,"AMBIGUOUS","SMTP_OUTCOME_UNKNOWN").catch(()=>false);
    return {status:"SMTP_AMBIGUOUS",reason:"SMTP_OUTCOME_UNKNOWN"};
  }
  try {
    const recorded=await deps.confirm(deliveryId,token,acknowledgement.messageId,verified.message.emailHash);
    if(!recorded)throw new Error("SMTP_ACK_RECORD_NOT_CONFIRMED");
    return {status:"SMTP_ACCEPTED",messageId:acknowledgement.messageId};
  }catch{
    // Could already be SENT in DB if the confirmation response was lost.
    await deps.finish(deliveryId,token,"AMBIGUOUS","SMTP_ACCEPTED_LEDGER_UNCONFIRMED").catch(()=>false);
    return {status:"SMTP_AMBIGUOUS",reason:"SMTP_ACCEPTED_LEDGER_UNCONFIRMED"};
  }
}
