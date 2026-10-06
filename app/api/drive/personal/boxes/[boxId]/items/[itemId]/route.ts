import { type NextRequest, NextResponse } from "next/server";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import { personalBoxErrorResponse } from "@/app/lib/content-core/personalBoxApi";
import { removePersonalDriveBoxItem } from "@/app/lib/content-core/personalBoxes";
type C={params:Promise<{boxId:string;itemId:string}>}; export const dynamic="force-dynamic"; export const runtime="nodejs";
export async function DELETE(request:NextRequest,context:C){const access=await resolvePersonalDriveContentActor(request);if(!access.ok)return access.response;const{boxId,itemId}=await context.params;try{return NextResponse.json(await removePersonalDriveBoxItem(access.contentUserId,boxId,itemId,access.contentUserId),{headers:{"cache-control":"no-store"}})}catch(error){return personalBoxErrorResponse(error,"PERSONAL_BOX_REMOVE_ITEM_FAILED")}}
