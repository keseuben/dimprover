/** Personal paid-license register interpretation, NEVER an effective entitlement. */
export type UserLicenseProductCode="DRIVE"|"DIMPRO_ONE";
export type UserCommercialRecordStatus=
  | "SOURCE_NOT_CONFIGURED"|"NOT_ASSIGNED"|"DRAFT"|"PENDING_APPROVAL"
  | "NOT_STARTED"|"ACTIVE_RECORD_ONLY"|"EXPIRED"|"SUSPENDED"|"CANCELLED"
  | "INCONSISTENT_RECORD";

export type UserCommercialRow={
  product_code:string;
  status:string;
  plan_code:string;
  storage_quota_bytes:string;
  starts_at:Date|string|null;
  expires_at:Date|string|null;
  approved_at:Date|string|null;
  approved_by_user_id:string|null;
};
export type UserCommercialReadiness={
  productCode:UserLicenseProductCode;
  status:UserCommercialRecordStatus;
  planCode:string|null;
  proposedQuotaBytes:number|null;
  // Licensing is not access. The existing 50 GiB personal storage default
  // cannot be overwritten by a draft, pending, or unlinked paid license.
  effectiveQuotaChanged:false;
  canGrantAccess:false;
  effectiveEntitlementActive:false;
  enforcementReleased:false;
};

export const USER_LICENSE_PRODUCTS=["DRIVE","DIMPRO_ONE"] as const;
function time(value:Date|string|null):number|null{
  if(value===null)return null;
  const valueMs=new Date(value).getTime();
  return Number.isFinite(valueMs)?valueMs:null;
}
export function classifyUserCommercialRecord(
  row:UserCommercialRow|null,now:number,
):UserCommercialRecordStatus{
  if(!row)return "NOT_ASSIGNED";
  if(!Number.isFinite(now))return "INCONSISTENT_RECORD";
  if(row.status==="DRAFT")return "DRAFT";
  if(row.status==="PENDING_APPROVAL")return "PENDING_APPROVAL";
  if(row.status==="SUSPENDED")return "SUSPENDED";
  if(row.status==="EXPIRED")return "EXPIRED";
  if(row.status==="CANCELLED")return "CANCELLED";
  if(row.status!=="ACTIVE")return "INCONSISTENT_RECORD";
  const starts=time(row.starts_at);
  const expires=time(row.expires_at);
  const approved=time(row.approved_at);
  const quota=Number(row.storage_quota_bytes);
  if(starts===null||expires===null||expires<=starts||
    approved===null||approved>now||!row.approved_by_user_id||
    !Number.isSafeInteger(quota)||
    (row.product_code==="DRIVE"&&quota<=0)||
    (row.product_code==="DIMPRO_ONE"&&quota!==0)||
    !USER_LICENSE_PRODUCTS.some(code=>code===row.product_code))return "INCONSISTENT_RECORD";
  if(starts>now)return "NOT_STARTED";
  if(expires<now)return "EXPIRED";
  return "ACTIVE_RECORD_ONLY";
}

export function resolveUserCommercialReadiness(
  records:readonly UserCommercialRow[],
  options:{now:number;sourceAvailable:boolean},
):UserCommercialReadiness[]{
  return USER_LICENSE_PRODUCTS.map(productCode=>{
    const row=records.find(item=>item.product_code===productCode)??null;
    const status:UserCommercialRecordStatus=options.sourceAvailable
      ?classifyUserCommercialRecord(row,options.now):"SOURCE_NOT_CONFIGURED";
    const quota=row===null?null:Number(row.storage_quota_bytes);
    return {
      productCode,status,planCode:row?.plan_code??null,
      proposedQuotaBytes:quota!==null&&Number.isSafeInteger(quota)&&quota>=0?quota:null,
      effectiveQuotaChanged:false,canGrantAccess:false,
      effectiveEntitlementActive:false,enforcementReleased:false,
    };
  });
}
