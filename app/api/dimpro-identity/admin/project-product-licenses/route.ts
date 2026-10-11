import { denyUnauthorizedLicenseMutation } from "@/app/lib/license/licenseEnvironmentPolicy";
import {type NextRequest, NextResponse} from "next/server";
import {isLicenseAdminAuthorized} from "@/app/lib/license/admin-auth";
import {resolveProjectCoreAuth} from "@/app/lib/project-core/auth";
import {authQuery} from "@/app/lib/dimpro-auth/db";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store"};
// Explicit release guard: source contains tested issuance RPCs, but no DEV/PROD
// operator may write licenses until schema, admin SSO and billing are reviewed.
const PROJECT_LICENSE_ADMIN_WRITES_RELEASED:boolean=false;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isApprovedDevHost(request:NextRequest) {
 const host=request.nextUrl.hostname.toLowerCase();
 return ["dev.dimpro.hu","drive.dev.dimpro.hu","auth.dev.dimpro.hu","localhost","127.0.0.1"].includes(host);
}
function reply(body:object,status=200){return NextResponse.json(body,{status,headers});}
async function authorize(request:NextRequest){
 if(!isApprovedDevHost(request))return {ok:false as const,status:404,error:"NOT_AVAILABLE"};
 if(!(await isLicenseAdminAuthorized(request.headers)))
   return {ok:false as const,status:401,error:"LICENSE_ADMIN_KEY_REQUIRED"};
 return {ok:true as const};
}

type ProjectRow={id:string;external_project_id:string|null;name:string;status:string};
type PayerRow={id:string;name:string};
type LicenseRow={
 id:string;auth_project_id:string;product_code:string;license_code:string;plan_code:string;
 status:string;payer_type:string;storage_quota_bytes:string;
 max_project_members:number|null;starts_at:string|null;expires_at:string|null;
 revision:number;project_name:string;external_project_id:string|null;
};
export async function GET(request:NextRequest){
 const auth=await authorize(request);
 if(!auth.ok)return reply({ok:false,error:auth.error},auth.status);
 try{
  const [projects,organizations,users,licenses]=await Promise.all([
    authQuery<ProjectRow>("SELECT id,external_project_id,name,status FROM public.auth_projects WHERE status='ACTIVE' AND external_project_id IS NOT NULL ORDER BY name LIMIT 200"),
    authQuery<PayerRow>("SELECT id,name FROM public.auth_organizations WHERE status='ACTIVE' ORDER BY name LIMIT 200"),
    authQuery<{id:string;display_name:string|null;email_normalized:string}>(
      "SELECT id,display_name,email_normalized FROM public.auth_users WHERE status='ACTIVE' AND login_enabled=true ORDER BY created_at DESC LIMIT 200"),
    authQuery<LicenseRow>(
      "SELECT l.id,l.auth_project_id,l.product_code,l.license_code,l.plan_code,l.status,l.payer_type,"+
      " l.storage_quota_bytes::text,l.max_project_members,l.starts_at,l.expires_at,l.revision,"+
      " p.name AS project_name,p.external_project_id"+
      " FROM public.auth_project_product_licenses l JOIN public.auth_projects p ON p.id=l.auth_project_id"+
      " ORDER BY l.created_at DESC LIMIT 300"),
  ]);
  return reply({ok:true,projects:projects.rows,organizations:organizations.rows,
    users:users.rows.map(row=>({id:row.id,name:row.display_name||row.email_normalized})),
    licenses:licenses.rows,issuanceEnabled:PROJECT_LICENSE_ADMIN_WRITES_RELEASED,
    note:"DRIVE és PROJECT_GATE licencek közös AUTH-rekordban. A forráskód kiadási kapuja jelenleg tiltja az írást."});
 }catch{return reply({ok:false,error:"CENTRAL_LICENSE_OVERVIEW_UNAVAILABLE"},503);}
}

export async function POST(request:NextRequest){
 const auth=await authorize(request);
 if(!auth.ok)return reply({ok:false,error:auth.error},auth.status);
 const mutationDenied=denyUnauthorizedLicenseMutation();
 if(mutationDenied)return mutationDenied;
 if(!PROJECT_LICENSE_ADMIN_WRITES_RELEASED)
    return reply({ok:false,error:"CENTRAL_LICENSE_ISSUANCE_NOT_RELEASED"},423);
 const session=await resolveProjectCoreAuth(request);
 if(!session.ok)return reply({ok:false,error:session.error},session.status);
 try{
  const payload=await request.json() as Record<string,unknown>;
  const externalProjectId=String(payload.projectId||"").trim();
  const product=String(payload.productCode||"");
  const plan=String(payload.planCode||"");
  const payerType=String(payload.payerType||"");
  const payerId=String(payload.payerId||"");
  const reason=String(payload.reason||"");
  const seats=payload.maxMembers===null?null:Number(payload.maxMembers);
  const bytes=product==="DRIVE"?Number(payload.quotaGiB)*1024**3:0;
  if(!externalProjectId||externalProjectId.length>200||!["DRIVE","PROJECT_GATE"].includes(product)||
    !/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(plan)||
    !["USER","ORGANIZATION"].includes(payerType)||!UUID.test(payerId)||
    reason.trim().length<12||reason.trim().length>500||
    !Number.isSafeInteger(bytes)||bytes<0||
    (product==="DRIVE"&&bytes<=0)||
    (seats!==null&&(!Number.isSafeInteger(seats)||seats<1||seats>100000)))return reply({ok:false,error:"INVALID_LICENSE_REQUEST"},400);
  const issued=await authQuery<{id:string}>(
    "SELECT public.auth_issue_project_product_license_pending($1,$2,$3,$4,$5::uuid,$6::bigint,$7::integer,$8::uuid,$9) AS id",
    [externalProjectId,product,plan,payerType,payerId,bytes,seats,session.actor.userId,reason.trim()]);
  return reply({ok:true,licenseId:issued.rows[0]?.id,status:"PENDING_APPROVAL"},201);
 }catch{return reply({ok:false,error:"LICENSE_ISSUANCE_REJECTED_OR_UNAVAILABLE"},409);}
}

export async function PATCH(request:NextRequest){
 const auth=await authorize(request);
 if(!auth.ok)return reply({ok:false,error:auth.error},auth.status);
 const mutationDenied=denyUnauthorizedLicenseMutation();
 if(mutationDenied)return mutationDenied;
 if(!PROJECT_LICENSE_ADMIN_WRITES_RELEASED)
    return reply({ok:false,error:"CENTRAL_LICENSE_APPROVAL_NOT_RELEASED"},423);
 const session=await resolveProjectCoreAuth(request);
 if(!session.ok)return reply({ok:false,error:session.error},session.status);
 try{
  const payload=await request.json() as Record<string,unknown>;
  const licenseId=String(payload.licenseId||"");
  const reason=String(payload.reason||"");
  const expiresAt=String(payload.expiresAt||"");
  if(!UUID.test(licenseId)||reason.trim().length<12||reason.trim().length>500||
    !Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.now())
     return reply({ok:false,error:"INVALID_APPROVAL_REQUEST"},400);
  const approved=await authQuery<{ok:boolean}>(
    "SELECT public.auth_approve_project_product_license($1::uuid,$2::uuid,$3::timestamptz,$4) AS ok",
    [licenseId,session.actor.userId,new Date(expiresAt).toISOString(),reason.trim()]);
  if(!approved.rows[0]?.ok)return reply({ok:false,error:"LICENSE_NO_LONGER_PENDING"},409);
  return reply({ok:true,status:"ACTIVE",enforcementActive:false});
 }catch{return reply({ok:false,error:"LICENSE_APPROVAL_REJECTED_OR_UNAVAILABLE"},409);}
}
