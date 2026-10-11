/**
 * Pure interpretation of commercial project rows.
 * A commercial record can never authorize runtime app/document access.
 */
export type ProjectCommercialStatus =
  | "SOURCE_NOT_CONFIGURED"
  | "NOT_ASSIGNED"
  | "FUTURE_PRODUCT"
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "NOT_STARTED"
  | "ACTIVE_RECORD_ONLY"
  | "EXPIRED"
  | "SUSPENDED"
  | "CANCELLED"
  | "INCONSISTENT_RECORD";

export type CommercialProjectRow = {
  product_code: string;
  status: string;
  plan_code: string | null;
  storage_quota_bytes: string | null;
  max_project_members: number | null;
  starts_at: string | Date | null;
  expires_at: string | Date | null;
  approved_at: string | Date | null;
  approved_by_user_id: string | null;
};

export type ProjectCommercialReadiness = {
  productCode: "DRIVE" | "PROJECT_GATE" | "DIMPRO_BUILD" | "DIMPROVER";
  recordStatus: ProjectCommercialStatus;
  planCode: string | null;
  quotaBytes: number | null;
  proposedMaxMembers: number | null;
  enforcementActive: false;
  canGrantAccess: false;
  canChangeQuota: false;
};

export const PROJECT_READINESS_PRODUCTS = [
  "DRIVE","PROJECT_GATE","DIMPRO_BUILD","DIMPROVER",
] as const;

function isoTime(value:string|Date|null):number|null{
  if(value===null)return null;
  const parsed=new Date(value).getTime();
  return Number.isFinite(parsed)?parsed:null;
}

export function interpretProjectCommercialStatus(row:CommercialProjectRow|null,now:number):ProjectCommercialStatus{
  if(!row)return "NOT_ASSIGNED";
  if(!Number.isFinite(now))return "INCONSISTENT_RECORD";
  if(row.status==="DRAFT")return "DRAFT";
  if(row.status==="PENDING_APPROVAL")return "PENDING_APPROVAL";
  if(row.status==="SUSPENDED")return "SUSPENDED";
  if(row.status==="CANCELLED")return "CANCELLED";
  if(row.status==="EXPIRED")return "EXPIRED";
  if(row.status!=="ACTIVE")return "INCONSISTENT_RECORD";
  const started=isoTime(row.starts_at),expires=isoTime(row.expires_at);
  const approved=isoTime(row.approved_at);
  // Never infer a perpetual paid license or trust malformed date values.
  if(!row.approved_by_user_id||approved===null||approved>now||
     started===null||expires===null||expires<=started)
    return "INCONSISTENT_RECORD";
  if(started>now)return "NOT_STARTED";
  if(expires!==null&&expires<now)return "EXPIRED";
  const quota=row.storage_quota_bytes===null?null:Number(row.storage_quota_bytes);
  if(row.product_code==="DRIVE"&&
    (quota===null||!Number.isSafeInteger(quota)||quota<=0))return "INCONSISTENT_RECORD";
  if(row.product_code==="PROJECT_GATE"&&quota!==0)return "INCONSISTENT_RECORD";
  return "ACTIVE_RECORD_ONLY";
}

export function resolveProjectCommercialReadiness(
  rows:readonly CommercialProjectRow[],
  options:{now:number;sourceAvailable:boolean},
):ProjectCommercialReadiness[]{
  return PROJECT_READINESS_PRODUCTS.map(productCode=>{
    const isImplemented=productCode==="DRIVE"||productCode==="PROJECT_GATE";
    const row=isImplemented?rows.find(entry=>entry.product_code===productCode)??null:null;
    const status:ProjectCommercialStatus=!isImplemented?"FUTURE_PRODUCT":
      !options.sourceAvailable?"SOURCE_NOT_CONFIGURED":
      interpretProjectCommercialStatus(row,options.now);
    const quota=row?.storage_quota_bytes===null||row?.storage_quota_bytes===undefined
      ?null:Number(row.storage_quota_bytes);
    return {
      productCode,recordStatus:status,
      planCode:row?.plan_code??null,
      quotaBytes:row&&Number.isSafeInteger(quota)&&quota!==null?quota:null,
      proposedMaxMembers:row?.max_project_members??null,
      enforcementActive:false,
      canGrantAccess:false,
      canChangeQuota:false,
    };
  });
}
