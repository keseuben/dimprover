import { authQuery, withAuthTransaction } from "./db";
import { getDimproAuthConfig } from "./config";
import {
  DIMPRO_AUTH_PURPOSE_DRIVE_REGISTRATION,
  hashDimproAuthOtp,
  verifyDimproAuthOtpHash,
} from "./security";
import { DimproAuthError } from "./types";

type BeginRow = { registration_id: string; challenge_id: string; user_id: string; registration_status: string };
type RegistrationRow = { id: string; user_id: string; email_normalized: string; challenge_id: string | null; status: string };
type ChallengeRow = { id: string; user_id: string | null; email_normalized: string; purpose: string; code_hash: Buffer; expires_at: Date | string; attempts: number; max_attempts: number; consumed_at: Date | string | null; invalidated_at: Date | string | null };

function mapBeginError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("AUTH_DRIVE_ALREADY_ENABLED")) throw new DimproAuthError(message,"AUTH_DRIVE_ALREADY_ENABLED",409,"Ehhez az e-mail-címhez már aktív Saját DIMPRO Drive tartozik.");
  if (message.includes("AUTH_OTP_COOLDOWN")) throw new DimproAuthError(message,"AUTH_OTP_COOLDOWN",429,"Várj röviden az új kód kérése előtt.");
  if (message.includes("AUTH_OTP_RATE_LIMIT")) throw new DimproAuthError(message,"AUTH_OTP_RATE_LIMIT",429,"Túl sok kódkérés történt. Próbáld újra később.");
  if (message.includes("AUTH_DRIVE_REGISTRATION_ACCOUNT_BLOCKED")) throw new DimproAuthError(message,"AUTH_DRIVE_REGISTRATION_UNAVAILABLE",403,"Ehhez az e-mail-címhez jelenleg nem indítható Saját Drive igénylés.");
  throw error;
}

export async function beginDriveRegistration(input: {
  email: string; displayName: string; organizationName: string; code: string;
  ip: string | null; userAgent: string; correlationId: string;
}) {
  const config=getDimproAuthConfig();
  const expiresAt=new Date(Date.now()+config.otpTtlSeconds*1000);
  try {
    const result=await authQuery<BeginRow>(
      `SELECT * FROM auth_begin_drive_registration($1,$2,$3,$4,$5,$6,$7::inet,$8,$9)`,
      [input.email,input.email,input.displayName,input.organizationName,hashDimproAuthOtp(input.email,DIMPRO_AUTH_PURPOSE_DRIVE_REGISTRATION,input.code),expiresAt,input.ip,input.userAgent,input.correlationId],
    );
    const row=result.rows[0];
    if(!row) throw new Error("AUTH_DRIVE_REGISTRATION_BEGIN_EMPTY");
    return { registrationId: row.registration_id, challengeId: row.challenge_id, userId: row.user_id, status: row.registration_status, expiresAt };
  } catch(error) { mapBeginError(error); }
}

export async function verifyDriveRegistration(input: { registrationId: string; email: string; code: string; ip: string | null; userAgent: string; correlationId: string }) {
  return withAuthTransaction(async(client)=>{
    const registrationResult=await client.query<RegistrationRow>(
      `SELECT id,user_id,email_normalized,challenge_id,status FROM auth_drive_registration_requests WHERE id=$1 AND email_normalized=$2 LIMIT 1`,
      [input.registrationId,input.email],
    );
    const registration=registrationResult.rows[0];
    if(!registration || registration.status!=="PENDING_EMAIL" || !registration.challenge_id) throw new DimproAuthError("Registration is not pending.","AUTH_DRIVE_REGISTRATION_NOT_PENDING",400,"A regisztrációs kérés nem aktív vagy már feldolgozták.");
    const challengeResult=await client.query<ChallengeRow>(
      `SELECT id,user_id,email_normalized,purpose,code_hash,expires_at,attempts,max_attempts,consumed_at,invalidated_at FROM auth_email_challenges WHERE id=$1 LIMIT 1 FOR UPDATE`,
      [registration.challenge_id],
    );
    const challenge=challengeResult.rows[0];
    if(!challenge || challenge.purpose!==DIMPRO_AUTH_PURPOSE_DRIVE_REGISTRATION || challenge.email_normalized!==input.email || challenge.consumed_at || challenge.invalidated_at || new Date(challenge.expires_at).getTime()<=Date.now()) {
      throw new DimproAuthError("Registration OTP invalid or expired.","AUTH_OTP_INVALID",400,"A regisztrációs kód hibás vagy lejárt.",{commitTransaction:true});
    }
    if(challenge.attempts>=challenge.max_attempts) throw new DimproAuthError("Registration OTP attempts exceeded.","AUTH_OTP_ATTEMPTS_EXCEEDED",429,"A kódhoz tartozó próbálkozási keret elfogyott. Kérj új kódot.",{commitTransaction:true});
    const valid=verifyDimproAuthOtpHash(challenge.code_hash,input.email,challenge.purpose,input.code);
    if(!valid){
      const attempts=challenge.attempts+1;
      await client.query(`UPDATE auth_email_challenges SET attempts=$2 WHERE id=$1`,[challenge.id,attempts]);
      throw new DimproAuthError("Registration OTP mismatch.",attempts>=challenge.max_attempts?"AUTH_OTP_ATTEMPTS_EXCEEDED":"AUTH_OTP_INVALID",attempts>=challenge.max_attempts?429:400,attempts>=challenge.max_attempts?"A kódhoz tartozó próbálkozási keret elfogyott. Kérj új kódot.":"A regisztrációs kód hibás vagy lejárt.",{commitTransaction:true});
    }
    await client.query(`UPDATE auth_email_challenges SET consumed_at=now() WHERE id=$1`,[challenge.id]);
    const confirmed=await client.query<{registration_id:string;user_id:string;email_normalized:string;registration_status:string}>(
      `SELECT * FROM auth_confirm_drive_registration($1,$2)`,[registration.id,challenge.id],
    );
    const row=confirmed.rows[0];
    if(!row) throw new Error("AUTH_DRIVE_REGISTRATION_CONFIRM_EMPTY");
    return { registrationId: row.registration_id, userId: row.user_id, email: row.email_normalized, status: row.registration_status };
  });
}
