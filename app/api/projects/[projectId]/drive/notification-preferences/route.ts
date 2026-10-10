import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { validateSameOriginMutation } from "@/app/lib/dimpro-auth/security";
import { listDriveDigestPreferences, updateDriveDigestPreference, type DriveDigestPreference } from "@/app/lib/drive-notifications/preferenceRepository";
import type { DigestCategory } from "@/app/lib/drive-notifications/digestCore";
import type { DigestFrequency } from "@/app/lib/drive-notifications/scheduling";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{projectId:string}>};
const categories=new Set<DigestCategory>(["DOCUMENT_CHANGES","APPROVAL_DECISIONS"]);
const frequencies=new Set<DigestFrequency>(["FOUR_HOURLY","EIGHT_HOURLY","DAILY","WEEKLY","MONTHLY","NONE"]);

export async function GET(request:NextRequest,context:Context){
  const {projectId}=await context.params;
  const access=await requireProjectPermission(request,projectId,"document.read");
  if(!access.ok)return NextResponse.json({ok:false,error:access.error},{status:access.status});
  try{
    const preferences=await listDriveDigestPreferences(projectId,access.actor.userId);
    return NextResponse.json({ok:true,preferences},{headers:{"cache-control":"no-store"}});
  }catch(error){return driveCoreErrorResponse(error);}
}
export async function PUT(request:NextRequest,context:Context){
  if(!validateSameOriginMutation(request.headers))return NextResponse.json({ok:false,error:"ORIGIN_DENIED"},{status:403});
  const {projectId}=await context.params;
  const access=await requireProjectPermission(request,projectId,"document.read");
  if(!access.ok)return NextResponse.json({ok:false,error:access.error},{status:access.status});
  const body=await request.json().catch(()=>null) as Partial<DriveDigestPreference>|null;
  if(!body||!categories.has(body.category as DigestCategory)||typeof body.enabled!=="boolean"
    ||!frequencies.has(body.digestFrequency as DigestFrequency)||typeof body.followedOnly!=="boolean") {
    return NextResponse.json({ok:false,error:"Érvénytelen értesítési beállítások."},{status:400});
  }
  const input:DriveDigestPreference={category:body.category as DigestCategory,enabled:body.enabled,
    digestFrequency:body.digestFrequency as DigestFrequency,followedOnly:body.followedOnly};
  try{
    await updateDriveDigestPreference(projectId,access.actor.userId,input);
    return NextResponse.json({ok:true,preferences:await listDriveDigestPreferences(projectId,access.actor.userId)},
      {headers:{"cache-control":"no-store"}});
  }catch(error){return driveCoreErrorResponse(error);}
}
