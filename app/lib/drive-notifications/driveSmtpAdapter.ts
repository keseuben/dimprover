import "server-only";
import { sendDimproMail } from "@/app/lib/license/mail-profiles";
import { claimDigestSlot, confirmSmtpAcceptance, finishWithoutAcceptance } from "./deliveryRepository";
import { prepareVerifiedDigest } from "./liveDelivery";
import { dispatchClaimedDigest } from "./dispatchFlow";

export async function dispatchDriveDigestForControlledWorker(deliveryId:string) {
  // Explicit feature gates. No invocation from a scheduler, API route, or release build.
  // Production remains hard denied in this development release.
  if (process.env.DIMPRO_DRIVE_DIGEST_SEND_ENABLED !== "true"
    || process.env.DIMPRO_DRIVE_DIGEST_EXECUTION_ENV !== "DEV") {
    return {status:"DISABLED"} as const;
  }
  return dispatchClaimedDigest(deliveryId,{
    claim:claimDigestSlot,
    prepare:prepareVerifiedDigest,
    send:async(message)=>{
      const result=await sendDimproMail({
        profileId:"drive",
        to:[message.to],
        subject:message.subject,
        text:message.text,
        html:message.html,
        attachments:[{
          filename:"DIMPRO_Drive_ertesitesi_osszesito.xlsx",
          content:message.xlsx,
          contentType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }],
      });
      return {messageId:result.messageId};
    },
    confirm:confirmSmtpAcceptance,
    finish:finishWithoutAcceptance,
  });
}
