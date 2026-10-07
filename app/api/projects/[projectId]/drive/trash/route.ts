import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { listDriveTrash } from "@/app/lib/drive-core/store";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext={params:Promise<{projectId:string}>};
export const dynamic="force-dynamic"; export const runtime="nodejs";
export async function GET(request:NextRequest,context:RouteContext){
  const {projectId}=await context.params;
  const access=await requireProjectPermission(request,projectId,"folder.restore");
  if(!access.ok)return NextResponse.json({ok:false,error:access.error},{status:access.status});
  try{const items=await listDriveTrash(projectId);return NextResponse.json({ok:true,items,permissions:access.access.permissions},{headers:{"cache-control":"no-store"}})}catch(error){return driveCoreErrorResponse(error)}
}
