import {NextRequest,NextResponse} from "next/server";
import {resolveCentralDimproAuthEnvironmentFromHost} from "@/app/lib/dimpro-auth/client-config";
import {authorizeDriveRegistrationOperator,isDriveOperatorMailEnabled} from "@/app/lib/dimpro-auth/drive-registration-operator";
import {authQuery} from "@/app/lib/dimpro-auth/db";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"no-store"};

type RequestRow={
 id:string;email_normalized:string;display_name:string|null;
 organization_name:string|null;requested_at:Date|string;email_verified_at:Date|string|null;
 status:string;notification_status:string|null;notification_attempted_at:Date|string|null;
 notification_sent_at:Date|string|null;
};

export async function GET(request:NextRequest) {
  // Sensitive applicant records only through a dedicated operator-only secret.
  // No browser cookie, registration OTP or ordinary user login grants access.
  if(resolveCentralDimproAuthEnvironmentFromHost(request.headers.get("host"))!=="DEV")
    return NextResponse.json({ok:false,error:"NOT_FOUND"},{status:404,headers});
  if(!authorizeDriveRegistrationOperator(request.headers))
    return NextResponse.json({ok:false,error:"OPERATOR_NOT_AUTHORIZED"},{status:401,headers});
  try{
    const rows=await authQuery<RequestRow>(`
      SELECT r.id,r.email_normalized,r.display_name,r.organization_name,r.requested_at,
        r.email_verified_at,r.status,n.status AS notification_status,
        n.attempted_at AS notification_attempted_at,n.sent_at AS notification_sent_at
      FROM public.auth_drive_registration_requests r
      LEFT JOIN public.auth_drive_registration_operator_notices n ON n.registration_id=r.id
      WHERE r.status IN ('PENDING_EMAIL','EMAIL_VERIFIED','APPROVED','REJECTED')
      ORDER BY r.requested_at DESC LIMIT 100`);
    return NextResponse.json({ok:true,items:rows.rows,operatorEmailEnabled:isDriveOperatorMailEnabled(),
      note:"EMAIL_VERIFIED = igazolt igénylés; nem jelent jogosultságot vagy tárhelyet."},{headers});
  }catch{
    return NextResponse.json({ok:false,error:"OPERATOR_QUEUE_UNAVAILABLE"},{status:503,headers});
  }
}
