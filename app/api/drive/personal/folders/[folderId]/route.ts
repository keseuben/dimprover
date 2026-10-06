import { type NextRequest, NextResponse } from "next/server";
import { hasPersonalDriveAccess } from "@/app/lib/dimpro-auth/repository";
import { getPersonalFolderCoreReadiness, renameUserContentFolder } from "@/app/lib/content-core/repository";
import { resolveProjectCoreAuth } from "@/app/lib/project-core/auth";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

export const dynamic="force-dynamic"; export const runtime="nodejs";
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request:NextRequest,context:{params:Promise<{folderId:string}>}) {
  const auth=await resolveProjectCoreAuth(request);
  if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status,headers:{"cache-control":"no-store"}});
  if(!(await hasPersonalDriveAccess(auth.actor.userId)))return NextResponse.json({ok:false,error:"PERSONAL_DRIVE_FORBIDDEN"},{status:403,headers:{"cache-control":"no-store"}});
  try {
    if(!(await getPersonalFolderCoreReadiness()).ready)return NextResponse.json({ok:false,error:"PERSONAL_FOLDER_CORE_NOT_READY"},{status:503,headers:{"cache-control":"no-store"}});
    const {folderId}=await context.params;if(!UUID_RE.test(folderId))return NextResponse.json({ok:false,error:"PERSONAL_FOLDER_ID_INVALID"},{status:400,headers:{"cache-control":"no-store"}});
    const body=await request.json().catch(()=>({})) as {name?:unknown};
    const folder=await renameUserContentFolder({userId:auth.actor.userId,folderId,name:body.name});
    return NextResponse.json({ok:true,folder:{id:folder.id,parentId:folder.parent_id,name:folder.name,sortOrder:folder.sort_order,updatedAt:folder.updated_at}},{headers:{"cache-control":"no-store"}});
  } catch(error) {
    const status=error instanceof DimproIdentityError?error.status:500;const code=error instanceof DimproIdentityError?error.code:"PERSONAL_FOLDER_RENAME_FAILED";
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"A mappa nem nevezhető át.",code},{status,headers:{"cache-control":"no-store"}});
  }
}
