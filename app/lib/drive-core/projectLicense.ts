import { authQuery } from "@/app/lib/dimpro-auth/db";
import {projectLicenseStatus,type ProjectDriveLicenseStatus} from "./projectLicenseCore";

type ProjectLicenseRow = {
  license_code: string;
  plan_code: string;
  status: string;
  payer_type: "USER" | "ORGANIZATION";
  storage_quota_bytes: string;
  max_project_members: number | null;
  starts_at: Date | string | null;
  expires_at: Date | string | null;
};

export type ProjectLicenseSummary = {
  status: ProjectDriveLicenseStatus;
  licenseCode: string | null;
  planCode: string | null;
  quotaBytes: number | null;
  maxProjectMembers: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  // Not disclosed to ordinary members, even when they can read documents.
  payerType?: "USER" | "ORGANIZATION";
  enforcementActive: false;
  note: string;
};

/** Call only after requireProjectPermission(project.read). Read-only, no ACL bypass.
 * No source migration means no trustworthy paid license, never an inferred ACTIVE.
 */
export async function getProjectProductLicense(
  projectId: string,
  canManageBilling: boolean,
  productCode: "DRIVE" | "PROJECT_GATE" = "DRIVE",
): Promise<ProjectLicenseSummary> {
  let result;
  try {
    result = await authQuery<ProjectLicenseRow>(
      "SELECT l.license_code,l.plan_code,l.status,l.payer_type," +
      " l.storage_quota_bytes::text AS storage_quota_bytes,l.max_project_members,l.starts_at,l.expires_at" +
      " FROM public.auth_project_product_licenses l" +
      " JOIN public.auth_projects ap ON ap.id=l.auth_project_id" +
      " WHERE ap.external_project_id=$1 AND l.product_code=$2 LIMIT 1",
      [projectId,productCode],
    );
  } catch(error) {
    if((error as {code?:string})?.code==="42P01") {
      return {status:"NOT_CONFIGURED",licenseCode:null,planCode:null,
        quotaBytes:null,maxProjectMembers:null,startsAt:null,expiresAt:null,
        enforcementActive:false,
        note:"A projektlicenc központi adatbázismodulja még nincs aktiválva."};
    }
    throw error;
  }
  const row=result.rows[0];
  if(!row) return {status:"NOT_ASSIGNED",licenseCode:null,planCode:null,
    quotaBytes:null,maxProjectMembers:null,startsAt:null,expiresAt:null,
    enforcementActive:false,
    note:"Ehhez a projekthez még nincs hitelesített terméklicenc hozzárendelve."};
  return {
    status:projectLicenseStatus(row.status,row.expires_at,Date.now()),
    licenseCode:canManageBilling?row.license_code:null,
    planCode:row.plan_code,
    quotaBytes:Number(row.storage_quota_bytes),
    maxProjectMembers:row.max_project_members,
    startsAt:row.starts_at?new Date(row.starts_at).toISOString():null,
    expiresAt:row.expires_at?new Date(row.expires_at).toISOString():null,
    ...(canManageBilling?{payerType:row.payer_type}:{}),
    enforcementActive:false,
    note:"A projektlicenc adatai tájékoztató jellegűek. A licencalapú tárhely- és jogosultságkorlátok még nincsenek élesítve.",
  };
}
