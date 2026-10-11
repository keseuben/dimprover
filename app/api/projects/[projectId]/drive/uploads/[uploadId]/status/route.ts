import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { getDriveObjectUploadStatus } from "@/app/lib/drive-core/storageService";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = {params:Promise<{projectId:string;uploadId:string}>};
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only reconciliation: never POST complete or POST a new upload. */
export async function GET(request:NextRequest,context:RouteContext) {
  const {projectId,uploadId}=await context.params;
  const auth=await requireProjectPermission(request,projectId,"document.write");
  if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
  try {
    const result=await getDriveObjectUploadStatus({
      projectId,uploadId,actorUserId:auth.actor.userId,access:auth.access,
    });
    return NextResponse.json(result,{headers:{"cache-control":"private, no-store"}});
  }catch(error){return driveCoreErrorResponse(error);}
}
