import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { restoreDriveTrashItem } from "@/app/lib/drive-core/store";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext={params:Promise<{projectId:string}>};
export const dynamic="force-dynamic"; export const runtime="nodejs";
export async function POST(request:NextRequest,context:RouteContext){
  const {projectId}=await context.params; const access=await requireProjectPermission(request,projectId,"folder.restore");
  if(!access.ok)return NextResponse.json({ok:false,error:access.error},{status:access.status});
  let body:Record<string,unknown>; try{body=await request.json()}catch{return NextResponse.json({ok:false,error:"Érvénytelen JSON kérés."},{status:400})}
  const type=body.type==="FOLDER"?"FOLDER":body.type==="DOCUMENT"?"DOCUMENT":null; const id=typeof body.id==="string"?body.id.trim():"";
  if(!type||!id)return NextResponse.json({ok:false,error:"A Lomtár elem típusa és azonosítója kötelező."},{status:400});
  try{const result=await restoreDriveTrashItem({projectId,type,id,actorUserId:access.actor.userId});return NextResponse.json({ok:true,result},{headers:{"cache-control":"no-store"}})}catch(error){return driveCoreErrorResponse(error)}
}
