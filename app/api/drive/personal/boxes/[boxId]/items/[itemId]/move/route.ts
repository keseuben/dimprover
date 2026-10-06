import { type NextRequest, NextResponse } from "next/server";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import { personalBoxErrorResponse } from "@/app/lib/content-core/personalBoxApi";
import { movePersonalDriveBoxItem } from "@/app/lib/content-core/personalBoxes";
type C={params:Promise<{boxId:string;itemId:string}>}; export const dynamic="force-dynamic"; export const runtime="nodejs";
export async function POST(request:NextRequest,context:C){const access=await resolvePersonalDriveContentActor(request);if(!access.ok)return access.response;const{boxId,itemId}=await context.params;const input=await request.json().catch(()=>({})) as Record<string,unknown>;try{return NextResponse.json(await movePersonalDriveBoxItem(access.contentUserId,boxId,itemId,input,access.contentUserId),{headers:{"cache-control":"no-store"}})}catch(error){return personalBoxErrorResponse(error,"PERSONAL_BOX_MOVE_ITEM_FAILED")}}
