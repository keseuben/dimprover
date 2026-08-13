import { NextRequest,NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getVGuardReviewReadiness } from "@/app/lib/dev-center/ai-worker/vguard-review-readiness";
export const dynamic="force-dynamic";export const runtime="nodejs";
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){if(!(await isDevCenterAuthorized(request.headers,true)))return NextResponse.json({ok:false,error:"Nincs jogosultság."},{status:401});try{const {id}=await context.params;const result=await getVGuardReviewReadiness(id);return NextResponse.json(result,{status:result.ok?200:404,headers:{"cache-control":"no-store"}})}catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"A V.Guard review readiness nem ellenőrizhető."},{status:500})}}
