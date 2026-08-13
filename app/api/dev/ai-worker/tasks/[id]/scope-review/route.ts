import { NextRequest, NextResponse } from "next/server";
import { getDevCenterMutationSubject } from "@/app/lib/dev-center/auth";
import { resolveExternalAiScopeReview } from "@/app/lib/dev-center/ai-worker/v1";
export const dynamic="force-dynamic";export const runtime="nodejs";
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
 if(!(await getDevCenterMutationSubject(request.headers,false)))return NextResponse.json({ok:false,error:"Nincs jogosultság."},{status:401});
 try{const {id}=await context.params;const body=await request.json().catch(()=>({})) as {action?:string};const result=await resolveExternalAiScopeReview(id,String(body.action||""));return NextResponse.json(result,{status:result.ok?200:400,headers:{"cache-control":"no-store"}})}catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"A scope review sikertelen."},{status:500})}
}
