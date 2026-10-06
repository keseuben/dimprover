import { type NextRequest, NextResponse } from "next/server";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import { personalBoxErrorResponse } from "@/app/lib/content-core/personalBoxApi";
import { addPersonalDriveBoxItem } from "@/app/lib/content-core/personalBoxes";
type C={params:Promise<{boxId:string}>}; export const dynamic="force-dynamic"; export const runtime="nodejs";
export async function POST(request:NextRequest,context:C){const access=await resolvePersonalDriveContentActor(request);if(!access.ok)return access.response;const{boxId}=await context.params;const input=await request.json().catch(()=>null) as Record<string,unknown>|null;if(!input)return NextResponse.json({ok:false,error:"Érvénytelen JSON kérés."},{status:400});try{const result=await addPersonalDriveBoxItem(access.contentUserId,boxId,input,access.contentUserId);return NextResponse.json(result,{status:result.idempotent?200:201,headers:{"cache-control":"no-store"}})}catch(error){return personalBoxErrorResponse(error,"PERSONAL_BOX_ADD_ITEM_FAILED")}}
