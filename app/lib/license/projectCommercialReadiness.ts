import {authQuery} from "@/app/lib/dimpro-auth/db";
import {
  resolveProjectCommercialReadiness,
  type CommercialProjectRow,
  type ProjectCommercialReadiness,
} from "./projectCommercialReadinessCore";

/**
 * Must be called only after requireProjectPermission("project.read").
 * Queries the requested Project Core ID, never project names or email aliases.
 * Financial payer identifiers, license codes and audit history are not fetched.
 */
export async function readProjectCommercialReadiness(
  projectId:string,
  now=Date.now(),
):Promise<ProjectCommercialReadiness[]>{
  if(!projectId||projectId.length>200)throw new Error("INVALID_PROJECT_ID");
  try {
    const result=await authQuery<CommercialProjectRow>(
      "SELECT l.product_code,l.status,l.plan_code,"+
      " l.storage_quota_bytes::text AS storage_quota_bytes,l.max_project_members,"+
      " l.starts_at,l.expires_at,l.approved_at,l.approved_by_user_id"+
      " FROM public.auth_project_product_licenses l"+
      " JOIN public.auth_projects ap ON ap.id=l.auth_project_id"+
      " WHERE ap.external_project_id=$1 AND ap.status='ACTIVE'"+
      " AND l.product_code IN ('DRIVE','PROJECT_GATE')",
      [projectId],
    );
    return resolveProjectCommercialReadiness(result.rows,{now,sourceAvailable:true});
  }catch(error){
    // Schema 014-017 has not been applied yet: do not infer paid entitlements.
    if((error as {code?:string})?.code==="42P01")
      return resolveProjectCommercialReadiness([],{now,sourceAvailable:false});
    throw error;
  }
}
