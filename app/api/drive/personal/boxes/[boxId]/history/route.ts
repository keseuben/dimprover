import { type NextRequest, NextResponse } from "next/server";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import { personalBoxErrorResponse } from "@/app/lib/content-core/personalBoxApi";
import { listPersonalDriveBoxHistory } from "@/app/lib/content-core/personalBoxes";
type C={params:Promise<{boxId:string}>}; export const dynamic="force-dynamic"; export const runtime="nodejs";
export async function GET(request:NextRequest,context:C){const access=await resolvePersonalDriveContentActor(request);if(!access.ok)return access.response;const{boxId}=await context.params;try{const events=await listPersonalDriveBoxHistory(access.contentUserId,boxId,100);return NextResponse.json({ok:true,boxId,count:events.length,events},{headers:{"cache-control":"no-store"}})}catch(error){return personalBoxErrorResponse(error,"PERSONAL_BOX_HISTORY_FAILED")}}
