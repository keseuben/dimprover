import { type NextRequest, NextResponse } from "next/server";
import { createUserContentFolder, getPersonalFolderCoreReadiness, listUserContentFolders } from "@/app/lib/content-core/repository";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";


export async function GET(request: NextRequest) {
  const access = await resolvePersonalDriveContentActor(request);
  if (!access.ok) return access.response;
  try {
    const readiness = await getPersonalFolderCoreReadiness();
    if (!readiness.ready) return NextResponse.json({ ok: true, ready: false, folders: [] }, { headers: { "cache-control": "no-store" } });
    const folders = await listUserContentFolders({ userId: access.contentUserId });
    return NextResponse.json({ ok: true, ready: true, folders: folders.map((folder) => ({ id: folder.id, parentId: folder.parent_id, name: folder.name, sortOrder: folder.sort_order, createdAt: folder.created_at, updatedAt: folder.updated_at })) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status=error instanceof DimproIdentityError?error.status:500; const code=error instanceof DimproIdentityError?error.code:"PERSONAL_FOLDER_LIST_FAILED";
    return NextResponse.json({ ok:false, error:error instanceof Error?error.message:"A Saját Drive mappái nem tölthetők be.", code }, { status, headers:{"cache-control":"no-store"} });
  }
}

export async function POST(request: NextRequest) {
  const access = await resolvePersonalDriveContentActor(request);
  if (!access.ok) return access.response;
  try {
    const readiness = await getPersonalFolderCoreReadiness();
    if (!readiness.ready) return NextResponse.json({ ok:false, error:"PERSONAL_FOLDER_CORE_NOT_READY" }, { status:503, headers:{"cache-control":"no-store"} });
    const body=await request.json().catch(()=>({})) as { name?: unknown; parentId?: unknown };
    const parentId=typeof body.parentId==="string"&&body.parentId.trim()?body.parentId.trim():null;
    const folder=await createUserContentFolder({ userId:access.contentUserId, actorUserId:access.contentUserId, parentId, name:body.name });
    return NextResponse.json({ ok:true, folder:{ id:folder.id,parentId:folder.parent_id,name:folder.name,sortOrder:folder.sort_order,createdAt:folder.created_at,updatedAt:folder.updated_at } }, { status:201, headers:{"cache-control":"no-store"} });
  } catch (error) {
    const status=error instanceof DimproIdentityError?error.status:500; const code=error instanceof DimproIdentityError?error.code:"PERSONAL_FOLDER_CREATE_FAILED";
    return NextResponse.json({ ok:false, error:error instanceof Error?error.message:"A mappa nem hozható létre.", code }, { status, headers:{"cache-control":"no-store"} });
  }
}
