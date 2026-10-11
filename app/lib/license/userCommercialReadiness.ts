import {authQuery} from "@/app/lib/dimpro-auth/db";
import {
  resolveUserCommercialReadiness,
  type UserCommercialReadiness,
  type UserCommercialRow,
} from "./userCommercialReadinessCore";

/** Call only with actor.userId from authenticated central AUTH.
 * No email-based lookup, project membership inference or payer-data return.
 */
export async function readOwnUserCommercialReadiness(
  authenticatedUserId:string,now=Date.now(),
):Promise<UserCommercialReadiness[]>{
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(authenticatedUserId))
    throw new Error("INVALID_AUTH_USER_ID");
  try{
    const records=await authQuery<UserCommercialRow>(
      "SELECT l.product_code,l.status,l.plan_code,"+
      " l.storage_quota_bytes::text AS storage_quota_bytes,"+
      " l.starts_at,l.expires_at,l.approved_at,l.approved_by_user_id"+
      " FROM public.auth_user_product_licenses l"+
      " JOIN public.auth_users u ON u.id=l.owner_user_id"+
      " WHERE l.owner_user_id=$1::uuid AND u.status='ACTIVE'"+
      " AND u.login_enabled=true AND u.email_verified_at IS NOT NULL"+
      " AND l.product_code IN ('DRIVE','DIMPRO_ONE')",
      [authenticatedUserId],
    );
    return resolveUserCommercialReadiness(records.rows,{now,sourceAvailable:true});
  }catch(error){
    if((error as {code?:string})?.code==="42P01")
      return resolveUserCommercialReadiness([],{now,sourceAvailable:false});
    throw error;
  }
}
