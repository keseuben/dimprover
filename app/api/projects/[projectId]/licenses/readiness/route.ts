import {type NextRequest,NextResponse} from "next/server";
import {requireProjectPermission} from "@/app/lib/project-core/auth";
import {readProjectCommercialReadiness} from "@/app/lib/license/projectCommercialReadiness";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const privateHeaders={"cache-control":"private, no-store"};
type Context={params:Promise<{projectId:string}>};

export async function GET(request:NextRequest,context:Context){
  const {projectId}=await context.params;
  const access=await requireProjectPermission(request,projectId,"project.read");
  if(!access.ok)return NextResponse.json({ok:false,error:access.error},
    {status:access.status,headers:privateHeaders});
  try {
    const products=await readProjectCommercialReadiness(projectId);
    return NextResponse.json({
      ok:true,projectId,source:"CENTRAL_AUTH_PROJECT_LICENSE_READ_ONLY",
      commercialRecordsOnly:true,
      entitlementEnforcementReleased:false,
      effectiveAccessNotEvaluated:true,
      products,
    },{headers:privateHeaders});
  }catch{
    return NextResponse.json({ok:false,error:"A központi terméklicenc-nyilvántartás nem érhető el."},
      {status:503,headers:privateHeaders});
  }
}
