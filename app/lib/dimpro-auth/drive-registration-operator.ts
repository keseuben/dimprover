import { timingSafeEqual } from "node:crypto";
import { authQuery } from "./db";
import { sendDimproMail } from "@/app/lib/license/mail-profiles";
import { recordAuthAuditEvent } from "./repository";

// SAFETY RELEASE GATE: no real outbound notifications until explicit release approval.
const DRIVE_OPERATOR_MAIL_RELEASED: boolean = false;

function escapeHtml(value: string) {
  return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#39;");
}

export function registrationOperatorRecipients(raw:string|undefined): string[] {
  const addresses=(raw||"").split(",").map(email=>email.trim().toLowerCase()).filter(Boolean);
  if (addresses.length===0 || addresses.length>3 || addresses.some(email=>
    !/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email) || email.length>254
  )) return [];
  return [...new Set(addresses)];
}

export function isDriveOperatorMailEnabled() {
  return DRIVE_OPERATOR_MAIL_RELEASED
    && process.env.DIMPRO_AUTH_DRIVE_OPERATOR_NOTIFY_ENABLED==="true"
    && registrationOperatorRecipients(process.env.DIMPRO_AUTH_DRIVE_OPERATOR_TO).length>0;
}

export function authorizeDriveRegistrationOperator(headers:Headers):boolean {
  // Dedicated secret, not a user session or an accessible public admin endpoint.
  const expected=process.env.DIMPRO_AUTH_OPERATOR_ADMIN_KEY?.trim()||"";
  const bearer=headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()||"";
  const expectedBuffer=Buffer.from(expected,"utf8");
  const actualBuffer=Buffer.from(bearer,"utf8");
  if(expectedBuffer.length<32 || actualBuffer.length!==expectedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer,actualBuffer);
}

type Claimed={
 notice_registration_id:string; notice_claim_token:string;
 applicant_email:string; applicant_name:string; applicant_organization:string; verified_at:Date|string;
};

export function driveRegistrationOperatorMessage(input:{
  name:string;email:string;organization:string;registrationId:string;verifiedAt:string;
}){
  const subject="DIMPRO Drive – új, e-mailben igazolt igénylés";
  const details=[
    ["Név",input.name||"—"],["E-mail-cím",input.email],
    ["Szervezet",input.organization||"—"],
    ["Igénylés azonosítója",input.registrationId],
    ["E-mail igazolás",input.verifiedAt],
  ];
  const text=["Új DIMPRO Drive igénylés vár üzemeltetői elbírálásra.",
    "A regisztrációs e-mail-címet a felhasználó OTP kóddal igazolta.",
    "",...details.map(([name,value])=>name+": "+value),"",
    "A Saját Drive nem lett automatikusan aktiválva. A jogosultságot és licencet külön szükséges ellenőrizni."].join("\n");
  const table=details.map(([label,value])=>"<tr><th style=\"padding:9px;text-align:left;background:#e6f4f3;border:1px solid #c7e6e4\">"
    +escapeHtml(label)+"</th><td style=\"padding:9px;border:1px solid #c7e6e4\">"+escapeHtml(value)+"</td></tr>").join("");
  const html="<!doctype html><html lang=\"hu\"><body style=\"font-family:Arial,sans-serif;color:#17354a;background:#f5fafb;padding:24px\">"
    +"<main style=\"max-width:620px;margin:auto;background:white;border:1px solid #cbdee7;padding:24px\">"
    +"<h2>DIMPRO Drive – új igénylés</h2>"
    +"<p>A kérelmező e-mail-címe sikeresen igazolva. A kérelem elbírálásra vár.</p>"
    +"<table style=\"border-collapse:collapse;width:100%\">"+table+"</table>"
    +"<p>A tárhely, a licenc és a belépési jogosultság nem lett automatikusan megadva.</p></main></body></html>";
  return {subject,text,html};
}

export async function deliverDriveRegistrationOperatorNotice(registrationId:string):Promise<
 "DISABLED"|"UNAVAILABLE"|"NOT_PENDING"|"SENT"|"AMBIGUOUS"> {
  if(!isDriveOperatorMailEnabled()) return "DISABLED";
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(registrationId))
    return "UNAVAILABLE";
  const recipients=registrationOperatorRecipients(process.env.DIMPRO_AUTH_DRIVE_OPERATOR_TO);
  const claimed=await authQuery<Claimed>(
    "SELECT * FROM public.auth_claim_drive_registration_operator_notice($1::uuid)",[registrationId]);
  const row=claimed.rows[0];
  if(!row) return "NOT_PENDING";
  const message=driveRegistrationOperatorMessage({
    name:row.applicant_name,email:row.applicant_email,organization:row.applicant_organization,
    registrationId:row.notice_registration_id,verifiedAt:new Date(row.verified_at).toISOString(),
  });
  let outcome: "SENT"|"AMBIGUOUS"="AMBIGUOUS";
  try{
    await sendDimproMail({profileId:"admin",to:recipients,...message});
    outcome="SENT";
  }catch{
    // Unknown SMTP acceptance. Never resend automatically after an attempted delivery.
    outcome="AMBIGUOUS";
  }
  const updated=await authQuery<{auth_complete_drive_registration_operator_notice:boolean}>(
    "SELECT public.auth_complete_drive_registration_operator_notice($1::uuid,$2::uuid,$3)",
    [row.notice_registration_id,row.notice_claim_token,outcome]);
  if(!updated.rows[0]?.auth_complete_drive_registration_operator_notice){
    return "AMBIGUOUS"; // fail-closed: processing may have been accepted externally
  }
  await recordAuthAuditEvent({
    eventType:"DRIVE_REGISTRATION_OPERATOR_NOTIFICATION",userId:null,email:row.applicant_email,
    method:"ADMIN_EMAIL",result:outcome,correlationId:row.notice_registration_id,
    metadata:{registrationId:row.notice_registration_id,recipientCount:recipients.length}
  }).catch(()=>undefined);
  return outcome;
}
