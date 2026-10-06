import { type NextRequest, NextResponse } from "next/server";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import { personalBoxErrorResponse } from "@/app/lib/content-core/personalBoxApi";
import { setPersonalDriveBoxLifecycle } from "@/app/lib/content-core/personalBoxes";
import type { DriveBoxLifecycleStatus } from "@/components/drive/driveTypes";
type C={params:Promise<{boxId:string}>}; export const dynamic="force-dynamic"; export const runtime="nodejs"; const allowed=new Set<DriveBoxLifecycleStatus>(["DRAFT","READY","SENT","ARCHIVED"]);
export async function POST(request:NextRequest,context:C){const access=await resolvePersonalDriveContentActor(request);if(!access.ok)return access.response;const{boxId}=await context.params;const input=await request.json().catch(()=>null) as {nextStatus?:string}|null;const next=String(input?.nextStatus||"").trim().toUpperCase() as DriveBoxLifecycleStatus;if(!allowed.has(next))return NextResponse.json({ok:false,error:"Érvénytelen CsomagBOX állapot."},{status:400});try{return NextResponse.json(await setPersonalDriveBoxLifecycle(access.contentUserId,boxId,next,access.contentUserId),{headers:{"cache-control":"no-store"}})}catch(error){return personalBoxErrorResponse(error,"PERSONAL_BOX_LIFECYCLE_FAILED")}}
