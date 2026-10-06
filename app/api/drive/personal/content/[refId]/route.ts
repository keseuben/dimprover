import { type NextRequest, NextResponse } from "next/server";
import { getPersonalFolderCoreReadiness, moveUserContentRef } from "@/app/lib/content-core/repository";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

export const dynamic="force-dynamic"; export const runtime="nodejs";
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request:NextRequest,context:{params:Promise<{refId:string}>}) {
  const access=await resolvePersonalDriveContentActor(request);
  if(!access.ok)return access.response;
  try {
    if(!(await getPersonalFolderCoreReadiness()).ready)return NextResponse.json({ok:false,error:"PERSONAL_FOLDER_CORE_NOT_READY"},{status:503,headers:{"cache-control":"no-store"}});
    const {refId}=await context.params;if(!UUID_RE.test(refId))return NextResponse.json({ok:false,error:"PERSONAL_DRIVE_REF_INVALID"},{status:400,headers:{"cache-control":"no-store"}});
    const body=await request.json().catch(()=>({})) as {folderId?:unknown};
    const folderId=body.folderId===null||body.folderId===""?null:typeof body.folderId==="string"&&UUID_RE.test(body.folderId)?body.folderId:null;
    if(body.folderId!==null&&body.folderId!==""&&!folderId)return NextResponse.json({ok:false,error:"PERSONAL_FOLDER_ID_INVALID"},{status:400,headers:{"cache-control":"no-store"}});
    const ref=await moveUserContentRef({userId:access.contentUserId,refId,folderId});
    return NextResponse.json({ok:true,ref:{id:ref.id,folderId:ref.folder_id,updatedAt:ref.updated_at}},{headers:{"cache-control":"no-store"}});
  } catch(error) {
    const status=error instanceof DimproIdentityError?error.status:500;const code=error instanceof DimproIdentityError?error.code:"PERSONAL_FILE_MOVE_FAILED";
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"A fájl nem helyezhető át.",code},{status,headers:{"cache-control":"no-store"}});
  }
}
