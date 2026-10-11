import {type NextRequest,NextResponse} from "next/server";
import {resolveProjectCoreAuth} from "@/app/lib/project-core/auth";
import {readOwnUserCommercialReadiness} from "@/app/lib/license/userCommercialReadiness";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const privateHeaders={"cache-control":"private, no-store"};
/** No userId, email, or project parameter: self only. */
export async function GET(request:NextRequest){
  const auth=await resolveProjectCoreAuth(request);
  if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},
    {status:auth.status,headers:privateHeaders});
  try{
    const products=await readOwnUserCommercialReadiness(auth.actor.userId);
    return NextResponse.json({
      ok:true,scope:"USER",source:"CENTRAL_AUTH_USER_LICENSE_READ_ONLY",
      commercialRecordsOnly:true,
      effectiveEntitlementReleased:false,
      legacyPersonalAccessUnchanged:true,
      products,
    },{headers:privateHeaders});
  }catch{
    return NextResponse.json({ok:false,error:"A személyes licencadatok jelenleg nem érhetők el."},
      {status:503,headers:privateHeaders});
  }
}
